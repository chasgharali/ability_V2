import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { DateTimePickerComponent } from '@syncfusion/ej2-react-calendars';
import { MultiSelectComponent } from '@syncfusion/ej2-react-dropdowns';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { RichTextEditorComponent as RTE, Toolbar as RTEToolbar, Link as RteLink, Image as RteImage, HtmlEditor, QuickToolbar, Inject as RTEInject } from '@syncfusion/ej2-react-richtexteditor';
import './BoothManagement.css';

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

  const boothQueueLink = `https://abilityjobfair.com/queue/${(boothForm.boothName || 'new-booth').toLowerCase().replace(/\s+/g, '-')}`;

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
      console.log('Create Booth payload', boothForm);
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
              {boothMode === 'list' ? (
                <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('create')}>Create Booth</button>
              ) : (
                <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setBoothMode('list')}>Back to List</button>
              )}
            </div>

            {boothMode === 'list' ? (
              <div className="bm-grid-wrap">
                <GridComponent
                  dataSource={booths}
                  allowPaging={true}
                  pageSettings={{ pageSize: 10 }}
                  allowSorting={true}
                  allowFiltering={true}
                  filterSettings={{ type: 'Menu' }}
                  showColumnMenu={true}
                  showColumnChooser={true}
                  allowResizing={true}
                  allowReordering={true}
                  toolbar={['Search', 'ColumnChooser']}
                  selectionSettings={{ type: 'Multiple' }}
                >
                  <ColumnsDirective>
                    <ColumnDirective type='checkbox' width='40' />
                    <ColumnDirective field='name' headerText='Booth Name' width='220' clipMode='EllipsisWithTooltip' />
                    <ColumnDirective headerText='Logo' width='110' template={(props) => props.logo ? (<img src={props.logo} alt="logo" style={{ height: 28 }} />) : null} />
                    <ColumnDirective field='recruitersCount' headerText='Recruiters' width='120' textAlign='Center' />
                    <ColumnDirective field='events' headerText='Event Title' width='200' template={(p) => (p.events || []).join(', ')} />
                    <ColumnDirective field='eventDate' headerText='Event Date' width='190' template={(p) => p.eventDate ? new Date(p.eventDate).toLocaleString() : ''} />
                    <ColumnDirective field='customInviteText' headerText='Custom URL' width='200' />
                    <ColumnDirective field='expireLinkTime' headerText='Expire Date' width='190' template={(p) => p.expireLinkTime ? new Date(p.expireLinkTime).toLocaleString() : ''} />
                    <ColumnDirective headerText='Action' width='360' allowSorting={false} allowFiltering={false} template={(p) => (
                      <div className='ajf-grid-actions'>
                        <button className='ajf-btn ajf-btn-dark'>Job Seekers Report</button>
                        <button className='ajf-btn ajf-btn-outline'>Placeholder</button>
                        <button className='ajf-btn ajf-btn-dark'>Invite Link</button>
                        <button className='ajf-btn ajf-btn-dark'>Edit</button>
                      </div>
                    )} />
                  </ColumnsDirective>
                  <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>
              </div>
            ) : (
              <form className="account-form" onSubmit={handleCreateBooth} style={{ maxWidth: 720 }}>
                <div className="form-group">
                  <label>Booth Name</label>
                  <input type="text" value={boothForm.boothName} onChange={(e) => setBoothField('boothName', e.target.value)} />
                </div>
                <div className="form-group">
                  <label>Booth Logo</label>
                  <div className="upload-actions" style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                    <label className="dashboard-button" style={{ width: 'auto', cursor: 'pointer' }}>
                      Choose file
                      <input type="file" accept="image/*" onChange={(e) => onPickBoothLogo(e.target.files?.[0])} style={{ display: 'none' }} />
                    </label>
                    {boothForm.boothLogo && <img src={boothForm.boothLogo} alt="Booth logo" style={{ height: 40, border: '1px solid #e5e7eb', borderRadius: 6, background: '#fff', padding: 4 }} />}
                  </div>
                </div>

                <div className="form-group">
                  <label>Waiting Area Content</label>
                  <div className="bm-rte-tabs">
                    <div className="bm-rte-block">
                      <h4>First Placeholder</h4>
                      <RTE value={boothForm.firstHtml} change={(e) => setBoothField('firstHtml', e?.value)}>
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Second Placeholder</h4>
                      <RTE value={boothForm.secondHtml} change={(e) => setBoothField('secondHtml', e?.value)}>
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                    <div className="bm-rte-block">
                      <h4>Third Placeholder</h4>
                      <RTE value={boothForm.thirdHtml} change={(e) => setBoothField('thirdHtml', e?.value)}>
                        <RTEInject services={[HtmlEditor, RTEToolbar, QuickToolbar, RteLink, RteImage]} />
                      </RTE>
                    </div>
                  </div>
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Event Date</label>
                    <DateTimePickerComponent value={boothForm.eventDate ? new Date(boothForm.eventDate) : null} change={(e) => setBoothField('eventDate', e?.value ? new Date(e.value).toISOString() : '')} placeholder="Select date & time" />
                  </div>
                  <div className="form-group">
                    <label>Select Event</label>
                    <MultiSelectComponent className="ajf-input" placeholder="Choose your Event" value={boothForm.eventIds} change={(e) => setBoothField('eventIds', e?.value || [])} dataSource={[{ id: 'evt_demo_1', text: 'Event Demo test' }, { id: 'evt_demo_2', text: 'Demonstration' }]} fields={{ value: 'id', text: 'text' }} mode="Box" />
                  </div>
                </div>

                <div className="form-group">
                  <label>Recruiters Count*</label>
                  <input type="number" min="1" value={boothForm.recruitersCount} onChange={(e) => setBoothField('recruitersCount', Number(e.target.value))} />
                  <span className="muted">Enter the maximum number of interviewers allowed for this booth.</span>
                </div>

                <div className="form-group">
                  <label>Custom invite text</label>
                  <input type="text" value={boothForm.customInviteText} onChange={(e) => setBoothField('customInviteText', e.target.value)} />
                </div>

                <div className="form-row">
                  <div className="form-group">
                    <label>Expire Link Time</label>
                    <DateTimePickerComponent value={boothForm.expireLinkTime ? new Date(boothForm.expireLinkTime) : null} enabled={boothForm.enableExpiry} change={(e) => setBoothField('expireLinkTime', e?.value ? new Date(e.value).toISOString() : '')} placeholder="Select expiry" />
                  </div>
                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <label style={{ margin: 0 }}>Enable Expiry Link Time</label>
                    <input type="checkbox" checked={boothForm.enableExpiry} onChange={(e) => setBoothField('enableExpiry', e.target.checked)} />
                  </div>
                </div>

                <div className="form-group">
                  <label>Company Page</label>
                  <input type="url" placeholder="https://example.com" value={boothForm.companyPage} onChange={(e) => setBoothField('companyPage', e.target.value)} />
                </div>

                <div className="form-group">
                  <label>Job Seeker Queue Link</label>
                  <input type="text" value={boothQueueLink} readOnly />
                </div>

                <button type="submit" className="dashboard-button" disabled={boothSaving}>{boothSaving ? 'Saving…' : 'Create Booth'}</button>
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
