import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select, MultiSelect, DateTimePicker, Checkbox, TextArea } from '../UI/FormComponents';
import Toast from '../UI/Toast';
import { listEvents } from '../../services/events';
import { listBooths, createBooths, deleteBooth, updateBooth, updateBoothRichSections } from '../../services/booths';
import { uploadBoothLogoToS3, uploadImageToS3 } from '../../services/uploads';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import { MdEdit, MdDelete, MdLink, MdBusiness } from 'react-icons/md';

export default function BoothManagement() {
  const navigate = useNavigate();
  // Header uses branding/user from shared AdminHeader

  const [boothMode, setBoothMode] = useState('list'); // 'list' | 'create'
  const [boothSaving, setBoothSaving] = useState(false);
  const [boothForm, setBoothForm] = useState({
    boothName: '',
    boothLogo: '',
    firstHtml: '',
    secondHtml: '',
    thirdHtml: '',
    recruitersCount: 1,
    eventIds: [],
    customInviteText: '',
    expireLinkTime: '',
    enableExpiry: false,
    companyPage: ''
  });
  const [booths, setBooths] = useState([]);
  const [loadingBooths, setLoadingBooths] = useState(false);
  const [previewBooth, setPreviewBooth] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  const [toast, setToast] = useState(null); // { message, type: 'success'|'info'|'error', duration }
  const toastTimer = React.useRef(null);
  const [editingBoothId, setEditingBoothId] = useState(null);
  // RTE image upload helpers
  const rteFirstRef = React.useRef(null);
  const rteSecondRef = React.useRef(null);
  const rteThirdRef = React.useRef(null);
  const hiddenImageInputRef = React.useRef(null);
  const [activeRteRef, setActiveRteRef] = useState(null);

  // Create a short, unique numeric token for the queue URL (6 digits)
  const genToken = () => String(Math.floor(100000 + Math.random() * 900000));
  const [queueToken] = useState(() => genToken());

  // Base URL from current window location (fallback to production domain if unavailable)
  const baseUrl = (typeof window !== 'undefined' && window.location && window.location.origin)
    ? window.location.origin
    : 'https://abilityjobfair.com';

  // Build toolbar per instance to wire custom S3 image upload action
  const buildRteToolbar = (onInsertImage) => ({
    type: 'MultiRow',
    enableFloating: true,
    items: [
      'Bold', 'Italic', 'Underline', 'StrikeThrough',
      'FontName', 'FontSize', 'FontColor', 'BackgroundColor',
      'LowerCase', 'UpperCase', 'Formats',
      'Alignments', 'OrderedList', 'UnorderedList', 'Outdent', 'Indent',
      'CreateLink',
      { tooltipText: 'Insert Image from S3', text: 'Image', prefixIcon: 'e-icons e-image', id: 'ajf-s3-image', click: onInsertImage },
      'ClearFormat', 'Print', 'SourceCode', 'FullScreen', 'Undo', 'Redo'
    ]
  });

  const openImagePickerFor = (rteRef) => {
    setActiveRteRef(rteRef);
    hiddenImageInputRef.current?.click();
  };
  const onHiddenImagePicked = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !activeRteRef?.current) return;
    try {
      setBoothSaving(true);
      const { downloadUrl } = await uploadImageToS3(file);
      // Insert image at cursor
      try {
        activeRteRef.current.executeCommand('insertImage', { url: downloadUrl, altText: file.name });
      } catch {
        activeRteRef.current.executeCommand('insertHTML', `<img src="${downloadUrl}" alt="${file.name}" />`);
      }
      showToast('Image inserted', 'success', 2000);
    } catch (err) {
      console.error('RTE image upload failed', err);
      showToast('Failed to upload image', 'error', 4000);
    } finally {
      setBoothSaving(false);
      setActiveRteRef(null);
    }
  };

  const slugify = (s = '') => {
    const slug = s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
    return slug || 'new-booth';
  };

  // Sanitize Custom Invite (no spaces, only a-z0-9-). If empty, return empty.
  const sanitizeInvite = (s = '') => {
    if (!s || !s.toString().trim()) return '';
    return s
      .toString()
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/[^a-z0-9-]/g, '');
  };

  // Compute live each render to ensure immediate UI updates as the booth name changes
  const boothQueueLink = useMemo(() => {
    const custom = sanitizeInvite(boothForm.customInviteText || '');
    if (custom) return `${baseUrl}/queue/${custom}`;
    const nameSlug = slugify(boothForm.boothName || '');
    return `${baseUrl}/queue/${nameSlug}-${queueToken}`;
  }, [boothForm.boothName, boothForm.customInviteText, queueToken, baseUrl]);

  // Event options for MultiSelect (loaded dynamically)
  const [eventOptions, setEventOptions] = useState([]);
  const [eventLimits, setEventLimits] = useState({}); // { [eventId]: { maxBooths, maxRecruitersPerEvent } }
  const [loadingEvents, setLoadingEvents] = useState(false);

  // Compute current recruiters per event from loaded booths
  const recruitersByEvent = useMemo(() => {
    const map = {};
    for (const b of booths) {
      const eid = b.eventIdRaw;
      if (!eid) continue;
      map[eid] = (map[eid] || 0) + (b.recruitersCount ?? 0);
    }
    return map;
  }, [booths]);

  // Validate recruiters limit per selected event
  const validateRecruiterLimits = () => {
    const exceeded = [];
    for (const eid of boothForm.eventIds || []) {
      const max = eventLimits?.[eid]?.maxRecruitersPerEvent || 0; // 0 => unlimited
      if (!max) continue;
      // existing recruiters for this event, excluding this booth if editing
      let existing = recruitersByEvent[eid] || 0;
      if (editingBoothId) {
        // subtract the editing booth's recruiters if it belongs to this event
        const editing = booths.find(b => b.id === editingBoothId);
        if (editing && editing.eventIdRaw === eid) {
          existing = Math.max(0, existing - (editing.recruitersCount ?? 0));
        }
      }
      const proposedTotal = existing + (boothForm.recruitersCount || 0);
      if (proposedTotal > max) {
        exceeded.push({
          eventId: eid,
          name: eventLimits?.[eid]?.name || eid,
          existing,
          adding: boothForm.recruitersCount || 0,
          max,
        });
      }
    }
    return exceeded;
  };

  const loadEvents = async () => {
    try {
      setLoadingEvents(true);
      const res = await listEvents({ page: 1, limit: 200 });
      const items = res?.events || [];
      const options = items.map(e => {
        const maxBooths = e?.limits?.maxBooths || 0; // 0 means unlimited
        const current = e?.boothCount || 0;
        const reached = maxBooths > 0 && current >= maxBooths;
        return {
          value: e._id,
          label: reached ? `${e.name} • limit reached` : e.name,
          disabled: reached,
        };
      });
      setEventOptions(options);
      // capture limits for validation
      const limitsMap = {};
      for (const e of items) {
        limitsMap[e._id] = {
          maxBooths: e?.limits?.maxBooths || 0,
          maxRecruitersPerEvent: e?.limits?.maxRecruitersPerEvent || 0,
          name: e?.name || 'Event',
        };
      }
      setEventLimits(limitsMap);
    } catch (err) {
      console.error('Failed to load events for booth', err);
      setEventOptions([]);
    } finally {
      setLoadingEvents(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, []);

  // (Focus management moved into reusable Toast component)

  // Data grid columns configuration
  const gridColumns = [
    {
      key: 'name',
      title: 'Booth Name',
      render: (value) => value || 'Unnamed Booth'
    },
    {
      key: 'logo',
      title: 'Logo',
      render: (value) => value ? <img src={value} alt="Booth logo" style={{ height: 28, borderRadius: 4 }} /> : null
    },
    {
      key: 'events',
      title: 'Event Title',
      render: (value) => (value || []).join(', ') || 'No events'
    },
    {
      key: 'recruitersCount',
      title: 'Recruiters',
      render: (v) => v ?? 0
    },
    {
      key: 'customInviteText',
      title: 'Custom Invite Text',
      render: (v, row) => {
        if (row.customInviteSlug) {
          return <span>{row.customInviteSlug}</span>;
        }
        return 'Not set';
      }
    },
    {
      key: 'expireLinkTime',
      title: 'Expire Date',
      render: (v) => {
        if (!v) return 'No expiry';
        try {
          const date = new Date(v);
          if (isNaN(date.getTime())) return 'Invalid date';
          return date.toLocaleString();
        } catch (e) {
          return 'Invalid date';
        }
      }
    },
    {
      key: 'companyPage',
      title: 'Company Page',
      render: (value, row) => {
        if (row.companyPage) {
          return (
            <a className="ajf-btn ajf-btn-outline" href={row.companyPage} target="_blank" rel="noreferrer">
              <MdBusiness style={{ marginRight: '4px' }} />
              Company Page
            </a>
          );
        }
        return <span style={{ color: '#9ca3af', fontStyle: 'italic' }}>Not set</span>;
      }
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (value, row) => (
        <div className="ajf-grid-actions">
          <button className="ajf-btn ajf-btn-dark">Job Seekers Report</button>
          <button className="ajf-btn ajf-btn-outline" onClick={() => setPreviewBooth(row)}>Placeholder</button>
          <button className="ajf-btn ajf-btn-dark" onClick={() => copyInvite(row)}>
            <MdLink style={{ marginRight: '4px' }} />
            Invite Link
          </button>
          <button className="ajf-btn ajf-btn-dark" onClick={() => startEdit(row)}>
            <MdEdit style={{ marginRight: '4px' }} />
            Edit
          </button>
          <button className="ajf-btn ajf-btn-outline" onClick={() => handleDelete(row)}>
            <MdDelete style={{ marginRight: '4px' }} />
            Delete
          </button>
        </div>
      )
    }
  ];

  const setBoothField = (k, v) => setBoothForm(prev => ({ ...prev, [k]: v }));
  const onPickBoothLogo = async (file) => {
    if (!file) return;
    try {
      setBoothSaving(true);
      const { downloadUrl } = await uploadBoothLogoToS3(file);
      setBoothField('boothLogo', downloadUrl);
    } catch (e) {
      console.error('Booth logo upload failed', e);
      alert('Failed to upload booth logo');
    } finally {
      setBoothSaving(false);
    }
  };
  const handleCreateBooth = async (e) => {
    e.preventDefault();
    setBoothSaving(true);
    try {
      // Client-side recruiters limit validation per event
      const exceeded = validateRecruiterLimits();
      if (exceeded.length) {
        const lines = exceeded.map(x => `• ${x.name}: ${x.existing} + ${x.adding} > ${x.max}`).join('\n');
        showToast(`Max number of recruiters reached for selected event(s):\n\n${lines}`, 'error', 7000);
        return; // block submit
      }
      const payload = {
        name: boothForm.boothName,
        description: boothForm.firstHtml || '',
        logoUrl: boothForm.boothLogo || undefined,
        eventIds: boothForm.eventIds,
        companyPage: boothForm.companyPage || undefined,
        recruitersCount: boothForm.recruitersCount || 1,
        expireLinkTime: boothForm.expireLinkTime || undefined,
        customInviteSlug: sanitizeInvite(boothForm.customInviteText || '') || undefined,
        richSections: [
          { title: 'First Placeholder', contentHtml: boothForm.firstHtml || '' },
          { title: 'Second Placeholder', contentHtml: boothForm.secondHtml || '' },
          { title: 'Third Placeholder', contentHtml: boothForm.thirdHtml || '' },
        ],
      };
      if (editingBoothId) {
        // Update base fields
        await updateBooth(editingBoothId, {
          name: payload.name,
          description: payload.description,
          logoUrl: payload.logoUrl,
          companyPage: payload.companyPage,
          recruitersCount: payload.recruitersCount,
          expireLinkTime: payload.expireLinkTime,
          customInviteSlug: payload.customInviteSlug,
        });
        // Update rich sections via dedicated endpoint
        await updateBoothRichSections(editingBoothId, payload.richSections);
        showToast('Booth updated');
      } else {
        const res = await createBooths(payload);
        const createdCount = Array.isArray(res?.created) ? res.created.length : 0;
        const skipped = Array.isArray(res?.skipped) ? res.skipped : [];
        if (skipped.length) {
          console.warn('Some events skipped due to limits:', skipped);
          // Try to resolve event labels from current options
          const skippedList = skipped.map(s => {
            const opt = (eventOptions || []).find(o => o.value === s.eventId);
            const label = opt?.label || s.eventId;
            const reasonRaw = (s.reason || '').toString();
            const isRecruiter = /recruit/i.test(reasonRaw);
            const reasonNormalized = isRecruiter ? 'Recruiter limit reached' : 'Booth limit reached';
            return `• ${label} — ${reasonNormalized}`;
          }).join('\n');
          if (createdCount === 0) {
            showToast(`No booths were created.\n\n${skippedList}`, 'error', 6000);
          } else {
            showToast(`Booth created for some events, but others were skipped due to limits:\n\n${skippedList}`, 'error', 6000);
          }
        } else if (createdCount === 0) {
          // Safety: backend responded but nothing created and no skips array
          showToast('No booths were created.', 'error', 5000);
        } else {
          showToast('Booth created', 'success', 2500);
        }
        await loadBooths();
        // Reload events to update booth counts in dropdown
        await loadEvents();
        // Only go back to list if at least one booth was created
        if (createdCount > 0) {
          setBoothMode('list');
          setEditingBoothId(null);
        }
        if (createdCount === 0) {
          // Stay on form for user to adjust selections
          setEditingBoothId(null);
        }
      }
    } catch (err) {
      if (err?.response?.status === 409) {
        showToast('Custom invite already taken');
      } else {
        console.error('Create booth failed', err);
        showToast('Failed to create booth');
      }
    } finally { setBoothSaving(false); }
  };

  const loadBooths = async () => {
    try {
      setLoadingBooths(true);
      const res = await listBooths({ page: 1, limit: 50 });
      const items = res?.booths || [];
      // Map to grid rows expected by DataGrid
      setBooths(items.map(b => ({
        id: b._id,
        name: b.name,
        logo: b.logoUrl,
        events: [b.eventId?.name || ''],
        eventIdRaw: b.eventId?._id || null,
        richSections: b.richSections || [],
        customInviteSlug: b.customInviteSlug || '',
        companyPage: b.companyPage || '',
        customUrl: b.customInviteSlug ? `${baseUrl}/queue/${b.customInviteSlug}` : '',
        recruitersCount: b.recruitersCount ?? 0,
        expireLinkTime: b.expireLinkTime || null,
      })));
    } catch (e) {
      console.error('Failed to load booths', e);
      setBooths([]);
    } finally { setLoadingBooths(false); }
  };

  useEffect(() => { loadBooths(); }, []);

  // Edit handler (basic prefill)
  const startEdit = (row) => {
    setBoothForm(prev => ({
      ...prev,
      boothName: row.name || '',
      boothLogo: row.logo || '',
      firstHtml: row.richSections?.[0]?.contentHtml || '',
      secondHtml: row.richSections?.[1]?.contentHtml || '',
      thirdHtml: row.richSections?.[2]?.contentHtml || '',
      eventIds: row.eventIdRaw ? [row.eventIdRaw] : boothForm.eventIds,
      companyPage: row.companyPage || '',
      customInviteText: row.customInviteSlug || '',
    }));
    setBoothMode('create');
    setEditingBoothId(row.id);
  };

  // Delete handlers
  const handleDelete = (row) => { setRowPendingDelete(row); setConfirmOpen(true); };
  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    try {
      setBoothSaving(true);
      await deleteBooth(rowPendingDelete.id);
      await loadBooths();
      showToast('Booth deleted');
    } catch (e) {
      console.error('Delete booth failed', e);
      showToast('Failed to delete');
    } finally {
      setBoothSaving(false);
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  };
  const cancelDelete = () => { setConfirmOpen(false); setRowPendingDelete(null); };

  // Invite link copy
  const showToast = (message, type = 'info', duration = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, duration });
    toastTimer.current = setTimeout(() => setToast(null), duration);
  };
  const copyInvite = async (row) => {
    const custom = row.customInviteSlug && sanitizeInvite(row.customInviteSlug);
    const url = custom
      ? `${baseUrl}/queue/${custom}`
      : `${baseUrl}/queue/${slugify(row.name || 'booth')}-${queueToken}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Invite link copied');
    } catch (e) {
      window.prompt('Copy to clipboard: Ctrl+C, Enter', url);
      showToast('Copy failed. Link shown.');
    }
  };

  return (
    <div className="dashboard">
      <AdminHeader />

      <div className="dashboard-layout">
        <AdminSidebar active="booths" />

        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>Booth Management</h2>
              <div className="bm-header-actions">
                {boothMode === 'list' ? (
                  <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('create')}>Create Booth</button>
                ) : (
                  <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('list')}>Back to List</button>
                )}
              </div>
            </div>

            {boothMode === 'list' ? (
              <div className="bm-grid-wrap">
                <DataGrid
                  data={booths}
                  columns={gridColumns}
                  selectable={true}
                  searchable={true}
                  sortable={true}
                  onRowSelect={(selectedRows) => console.log('Selected rows:', selectedRows)}
                  onRowClick={(row) => console.log('Row clicked:', row)}
                  aria-label="Booth management table"
                />
              </div>
            ) : (
              <form className="account-form" onSubmit={handleCreateBooth} style={{ maxWidth: 720 }}>
                <Input
                  label="Booth Name"
                  value={boothForm.boothName}
                  onChange={(e) => setBoothField('boothName', e.target.value)}
                  required
                  placeholder="Enter booth name"
                />

                <div className="form-group">
                  <label className="form-label">Booth Logo</label>
                  <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                      Choose file
                      <input type="file" accept="image/*" onChange={(e) => onPickBoothLogo(e.target.files?.[0])} style={{ display: 'none' }} />
                    </label>
                    {boothForm.boothLogo && <img src={boothForm.boothLogo} alt="Booth logo" style={{ height: 40, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 4 }} />}
                  </div>
                </div>

                <div className="form-group">
                  <label className="form-label">Waiting Area Content</label>
                  <div className="bm-rte-tabs">
                    <div className="bm-rte-block">
                      <h4>First Placeholder</h4>
                      <RTE
                        ref={rteFirstRef}
                        value={boothForm.firstHtml}
                        change={(e) => setBoothField('firstHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteFirstRef))}
                        placeholder="Enter content for first placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Second Placeholder</h4>
                      <RTE
                        ref={rteSecondRef}
                        value={boothForm.secondHtml}
                        change={(e) => setBoothField('secondHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteSecondRef))}
                        placeholder="Enter content for second placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Third Placeholder</h4>
                      <RTE
                        ref={rteThirdRef}
                        value={boothForm.thirdHtml}
                        change={(e) => setBoothField('thirdHtml', e?.value || '')}
                        toolbarSettings={buildRteToolbar(() => openImagePickerFor(rteThirdRef))}
                        placeholder="Enter content for third placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <MultiSelect
                    label="Select Event"
                    value={boothForm.eventIds}
                    onChange={(e) => setBoothField('eventIds', e.target.value)}
                    options={eventOptions}
                    placeholder={loadingEvents ? 'Loading events…' : 'Choose your Event'}
                    name="eventIds"
                  />
                </div>

                <Input
                  label="Recruiters Count"
                  type="number"
                  min="1"
                  value={boothForm.recruitersCount}
                  onChange={(e) => setBoothField('recruitersCount', Number(e.target.value))}
                  required
                  placeholder="Enter number of recruiters"
                />

                <Input
                  label="Custom invite text"
                  value={boothForm.customInviteText}
                  onChange={(e) => setBoothField('customInviteText', e.target.value)}
                  placeholder="Enter custom invite text"
                />

                <div className="form-inline-row" style={{ display: 'flex', gap: '1rem', alignItems: 'flex-end', flexWrap: 'wrap' }}>
                  <div style={{ flex: '1 1 380px', minWidth: 260 }}>
                    <DateTimePicker
                      label="Expire Link Time"
                      value={boothForm.expireLinkTime}
                      onChange={(e) => setBoothField('expireLinkTime', e.target.value)}
                      placeholder="Select expiry"
                      disabled={!boothForm.enableExpiry}
                      name="expireLinkTime"
                    />
                  </div>
                  <div style={{ flex: '0 0 auto', paddingBottom: 6 }}>
                    <Checkbox
                      label="Enable Expiry Link Time"
                      checked={boothForm.enableExpiry}
                      onChange={(e) => setBoothField('enableExpiry', e.target.checked)}
                      name="enableExpiry"
                    />
                  </div>
                </div>

                <Input
                  label="Company Page"
                  type="url"
                  value={boothForm.companyPage}
                  onChange={(e) => setBoothField('companyPage', e.target.value)}
                  placeholder="https://example.com"
                />

                <Input
                  label="Job Seeker Queue Link"
                  value={boothQueueLink}
                  readOnly
                  aria-live="polite"
                  name="jobSeekerQueueLink"
                  placeholder="Auto-generated link"
                />

                <button type="submit" className="dashboard-button" disabled={boothSaving}>
                  {boothSaving ? 'Saving…' : (editingBoothId ? 'Update Booth' : 'Create Booth')}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      <div className="mobile-overlay" aria-hidden="true" />

      {/* Placeholder preview modal */}
      {previewBooth && (
        <div role="dialog" aria-modal="true" className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: 8, padding: 20, width: '90%', maxWidth: 1100, boxShadow: '0 10px 30px rgba(0,0,0,0.2)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Placeholder Preview - {previewBooth.name}</h3>
              <button className="ajf-btn ajf-btn-outline" onClick={() => setPreviewBooth(null)}>Close</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
              {[0, 1, 2].map(i => (
                <div key={i} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: 12, minHeight: 200, overflow: 'auto' }}>
                  <div dangerouslySetInnerHTML={{ __html: previewBooth.richSections?.[i]?.contentHtml || '<em>No content</em>' }} />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Delete confirm modal */}
      {confirmOpen && (
        <div role="dialog" aria-modal="true" aria-labelledby="confirm-title" className="modal-overlay" style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 70 }}>
          <div className="modal-card" style={{ background: '#fff', borderRadius: 8, padding: 20, width: 420, boxShadow: '0 10px 30px rgba(0,0,0,0.2)', border: '1px solid #e5e7eb' }}>
            <h3 id="confirm-title" style={{ marginTop: 0, marginBottom: 8 }}>Delete Booth</h3>
            <p style={{ marginTop: 0, marginBottom: 16 }}>Are you sure you want to delete <strong>{rowPendingDelete?.name}</strong>? This action cannot be undone.</p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button type="button" className="ajf-btn ajf-btn-outline" onClick={cancelDelete} disabled={boothSaving}>Cancel</button>
              <button type="button" className="ajf-btn ajf-btn-dark" onClick={confirmDelete} disabled={boothSaving}>{boothSaving ? 'Deleting…' : 'Delete'}</button>
            </div>
          </div>
        </div>
      )}

      {/* Toast */}
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
          autoFocusClose={toast.type === 'error'}
        />
      )}

      {/* hidden input for S3 image insert */}
      <input type="file" accept="image/*" ref={hiddenImageInputRef} onChange={onHiddenImagePicked} style={{ display: 'none' }} />
    </div>
  );
}
