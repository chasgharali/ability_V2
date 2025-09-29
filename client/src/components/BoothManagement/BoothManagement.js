import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select, MultiSelect, DateTimePicker, Checkbox, TextArea } from '../UI/FormComponents';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';

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
    eventDate: '',
    eventIds: [],
    customInviteText: '',
    expireLinkTime: '',
    enableExpiry: false,
    companyPage: ''
  });
  const [booths] = useState([
    { id: 'bth_1', name: 'ABILITY JOBS', logo: '', recruitersCount: 3, eventDate: '2025-11-11T17:00:00.000Z', events: ['Event Demo test'], customInviteText: 'abilityjobs.dev-invite', expireLinkTime: '', enableExpiry: false, companyPage: 'https://abilityjobs.com' },
    { id: 'bth_2', name: 'Demonstration Co', logo: '', recruitersCount: 5, eventDate: '2025-10-21T15:30:00.000Z', events: ['Demonstration'], customInviteText: '', expireLinkTime: '2025-12-31T23:00:00.000Z', enableExpiry: true, companyPage: 'https://demo.example.com' }
  ]);

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

  const boothQueueLink = useMemo(() => {
    const nameSlug = slugify(boothForm.boothName);
    return `https://abilityjobfair.com/queue/${nameSlug}-${queueToken}`;
  }, [boothForm.boothName, queueToken]);

  // Event options for MultiSelect
  const eventOptions = [
    { value: 'evt_demo_1', label: 'Event Demo test' },
    { value: 'evt_demo_2', label: 'Demonstration' }
  ];

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
      key: 'recruitersCount',
      title: 'Recruiters',
      render: (value) => value || 0
    },
    {
      key: 'events',
      title: 'Event Title',
      render: (value) => (value || []).join(', ') || 'No events'
    },
    {
      key: 'eventDate',
      title: 'Event Date',
      render: (value) => value ? new Date(value).toLocaleString() : 'Not set'
    },
    {
      key: 'customInviteText',
      title: 'Custom URL',
      render: (value) => value || 'Not set'
    },
    {
      key: 'expireLinkTime',
      title: 'Expire Date',
      render: (value) => value ? new Date(value).toLocaleString() : 'No expiry'
    },
    {
      key: 'actions',
      title: 'Actions',
      render: (value, row) => (
        <div className="ajf-grid-actions">
          <button className="ajf-btn ajf-btn-dark">Job Seekers Report</button>
          <button className="ajf-btn ajf-btn-outline">Placeholder</button>
          <button className="ajf-btn ajf-btn-dark">Invite Link</button>
          <button className="ajf-btn ajf-btn-dark">Edit</button>
        </div>
      )
    }
  ];

  const setBoothField = (k, v) => setBoothForm(prev => ({ ...prev, [k]: v }));
  const onPickBoothLogo = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBoothField('boothLogo', reader.result);
    reader.readAsDataURL(file);
  };
  const handleCreateBooth = async (e) => {
    e.preventDefault();
    setBoothSaving(true);
    try {
      // TODO: wire backend
      const payload = {
        ...boothForm,
        queueSlug: `${slugify(boothForm.boothName)}-${queueToken}`,
        queueUrl: boothQueueLink,
      };
      console.log('Create Booth payload', payload);
      setBoothMode('list');
    } finally { setBoothSaving(false); }
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
                  <DateTimePicker
                    label="Event Date"
                    value={boothForm.eventDate}
                    onChange={(e) => setBoothField('eventDate', e.target.value)}
                    placeholder="Select date & time"
                    name="eventDate"
                  />
                  <MultiSelect
                    label="Select Event"
                    value={boothForm.eventIds}
                    onChange={(e) => setBoothField('eventIds', e.target.value)}
                    options={eventOptions}
                    placeholder="Choose your Event"
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
                  {boothSaving ? 'Saving…' : 'Create Booth'}
                </button>
              </form>
            )}
          </div>
        </main>
      </div>

      {/* Mobile overlay */}
      <div className="mobile-overlay" aria-hidden="true" />
    </div>
  );
}
