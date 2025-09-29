import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select, MultiSelect, DateTimePicker, Checkbox, TextArea } from '../UI/FormComponents';
import { listEvents } from '../../services/events';
import { listBooths, createBooths, deleteBooth, updateBooth, updateBoothRichSections } from '../../services/booths';
import { uploadBoothLogoToS3 } from '../../services/uploads';
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
  const [toast, setToast] = useState(null);
  const toastTimer = React.useRef(null);
  const [editingBoothId, setEditingBoothId] = useState(null);

  // Create a short, unique token for the queue URL
  const genToken = () => `${Date.now().toString(36).slice(-5)}${Math.random().toString(36).slice(2, 6)}`;
  const [queueToken] = useState(() => genToken());

  const slugify = (s = '') => s
    .toString()
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    || 'new-booth';

  // Sanitize Custom Invite (no spaces, only a-z0-9-)
  const sanitizeInvite = (s = '') => slugify(s).replace(/[^a-z0-9-]/g, '');

  const boothQueueLink = useMemo(() => {
    const custom = sanitizeInvite(boothForm.customInviteText || '');
    if (custom) return `https://abilityjobfair.com/queue/${custom}`;
    const nameSlug = slugify(boothForm.boothName);
    return `https://abilityjobfair.com/queue/${nameSlug}-${queueToken}`;
  }, [boothForm.customInviteText, boothForm.boothName, queueToken]);

  // Event options for MultiSelect (loaded dynamically)
  const [eventOptions, setEventOptions] = useState([]);
  const [loadingEvents, setLoadingEvents] = useState(false);

  useEffect(() => {
    (async () => {
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
      } catch (err) {
        console.error('Failed to load events for booth', err);
        setEventOptions([]);
      } finally {
        setLoadingEvents(false);
      }
    })();
  }, []);

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
        if (res.skipped && res.skipped.length) {
          console.warn('Some events skipped due to limits:', res.skipped);
        }
        showToast('Booth created');
      }
      await loadBooths();
      setBoothMode('list');
      setEditingBoothId(null);
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
        customUrl: b.customInviteSlug ? `https://abilityjobfair.com/queue/${b.customInviteSlug}` : '',
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
  const showToast = (message) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = setTimeout(() => setToast(null), 2000);
  };
  const copyInvite = async (row) => {
    const custom = row.customInviteSlug && sanitizeInvite(row.customInviteSlug);
    const url = custom
      ? `https://abilityjobfair.com/queue/${custom}`
      : `https://abilityjobfair.com/queue/${slugify(row.name || 'booth')}-${queueToken}`;
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
                        value={boothForm.firstHtml}
                        change={(e) => setBoothField('firstHtml', e?.value || '')}
                        placeholder="Enter content for first placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Second Placeholder</h4>
                      <RTE
                        value={boothForm.secondHtml}
                        change={(e) => setBoothField('secondHtml', e?.value || '')}
                        placeholder="Enter content for second placeholder..."
                      >
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Third Placeholder</h4>
                      <RTE
                        value={boothForm.thirdHtml}
                        change={(e) => setBoothField('thirdHtml', e?.value || '')}
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

                <div className="form-row">
                  <DateTimePicker
                    label="Expire Link Time"
                    value={boothForm.expireLinkTime}
                    onChange={(e) => setBoothField('expireLinkTime', e.target.value)}
                    placeholder="Select expiry"
                    disabled={!boothForm.enableExpiry}
                    name="expireLinkTime"
                  />
                  <Checkbox
                    label="Enable Expiry Link Time"
                    checked={boothForm.enableExpiry}
                    onChange={(e) => setBoothField('enableExpiry', e.target.checked)}
                    name="enableExpiry"
                  />
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
        <div role="status" aria-live="polite" style={{ position: 'fixed', right: 16, bottom: 16, background: '#111', color: '#fff', padding: '10px 14px', borderRadius: 8, boxShadow: '0 6px 20px rgba(0,0,0,0.2)', zIndex: 80 }}>
          {toast}
        </div>
      )}
    </div>
  );
}
