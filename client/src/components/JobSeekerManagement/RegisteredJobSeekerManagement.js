import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import JSZip from 'jszip';
import { useAuth } from '../../contexts/AuthContext';
import { listRegisteredJobSeekers } from '../../services/organizations';
import { listEvents } from '../../services/events';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, ExcelExport } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import '@syncfusion/ej2-base/styles/material.css';
import '@syncfusion/ej2-buttons/styles/material.css';
import '@syncfusion/ej2-inputs/styles/material.css';
import '@syncfusion/ej2-react-dropdowns/styles/material.css';
import {
  JOB_CATEGORY_LIST,
  LANGUAGE_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';

const getLabelFromValue = (value, optionsList) => {
  if (!value) return 'Not provided';
  const option = optionsList.find(opt => opt.value === value);
  return option ? option.name : value;
};

/**
 * OrgAdmin view: shows only job seekers who have registered for this org's events.
 * SuperAdmin sees global JobSeekerManagement instead.
 */
export default function RegisteredJobSeekerManagement() {
  const { user } = useAuth();
  const orgId = user?.organizationId?._id || user?.organizationId;

  const [mode, setMode] = useState('list');
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [sortBy, setSortBy] = useState('registeredAt');
  const [sortDir, setSortDir] = useState('desc');
  const [eventFilter, setEventFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [events, setEvents] = useState([]);
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);
  const [selectedRegistration, setSelectedRegistration] = useState(null);

  const [selectedIds, setSelectedIds] = useState([]);
  const [zipLoading, setZipLoading] = useState(false);
  const selectionUpdateRef = useRef(false);

  const pageSize = 10;
  const gridRef = useRef(null);
  const searchInputRef = useRef(null);

  const loadEventsData = useCallback(async () => {
    try {
      const res = await listEvents({ page: 1, limit: 200 });
      setEvents(res.events || []);
    } catch (e) {
      console.error('Failed to load events', e);
    }
  }, []);

  useEffect(() => {
    loadEventsData();
  }, [loadEventsData]);

  const fetchJobSeekers = useCallback(async () => {
    if (!orgId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await listRegisteredJobSeekers(orgId, {
        page,
        limit: pageSize,
        search: search.trim() || undefined,
        sortBy,
        sortDir,
        eventId: eventFilter || undefined,
        status: statusFilter || undefined
      });
      setJobSeekers(res.jobSeekers || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load registered job seekers');
    } finally {
      setLoading(false);
    }
  }, [orgId, page, search, sortBy, sortDir, eventFilter, statusFilter]);

  useEffect(() => {
    fetchJobSeekers();
  }, [fetchJobSeekers]);

  const triggerSearch = useCallback(() => {
    const q = searchInputRef.current?.value?.trim() || '';
    setSearch(q);
    setPage(1);
  }, []);

  const eventOptions = useMemo(() => {
    const opts = [{ value: '', text: 'All Events' }];
    (events || []).forEach(ev => {
      opts.push({ value: ev._id, text: ev.name });
    });
    return opts;
  }, [events]);

  const statusOptions = useMemo(() => ([
    { value: '', text: 'All Status' },
    { value: 'active', text: 'Active' },
    { value: 'inactive', text: 'Inactive' }
  ]), []);

  const flatDataSource = useMemo(() => {
    return (jobSeekers || [])
      // Hide orphan/empty rows when job seeker data is missing.
      .filter(reg => reg?.jobSeekerId && (reg.jobSeekerId.name || reg.jobSeekerId.email))
      .map(reg => {
        const js = reg.jobSeekerId || {};
        return {
          _id: reg._id,
          name: js.name,
          email: js.email,
          phoneNumber: js.phoneNumber,
          city: js.city,
          state: js.state,
          country: js.country,
          isActive: js.isActive,
          emailVerified: js.emailVerified,
          lastLogin: js.lastLogin,
          createdAt: js.createdAt,
          resumeUrl: js.resumeUrl || null,
          registeredEvent: reg.eventId?.name,
          registeredAt: reg.registeredAt,
          jobSeekerId: js,
          registration: reg
        };
      });
  }, [jobSeekers]);

  // Sync header and content horizontal scrolling so column headers track table scroll.
  useEffect(() => {
    if (mode !== 'list') return;

    let syncActive = false;
    const grid = gridRef.current?.element;
    if (!grid) return;

    const header = grid.querySelector('.e-gridheader');
    const content = grid.querySelector('.e-content');
    if (!header || !content) return;

    const matchTableWidths = () => {
      const contentTable = content.querySelector('table');
      const headerTable = header.querySelector('table');
      const headerContent = header.querySelector('.e-headercontent');
      if (!contentTable || !headerTable) return;

      const contentWidth = contentTable.scrollWidth || contentTable.offsetWidth;
      if (contentWidth > 0) {
        headerTable.style.width = `${contentWidth}px`;
        headerTable.style.minWidth = `${contentWidth}px`;
        if (headerContent) {
          headerContent.style.width = `${contentWidth}px`;
          headerContent.style.minWidth = `${contentWidth}px`;
        }
      }
    };

    const syncContentToHeader = () => {
      if (syncActive) return;
      syncActive = true;
      header.scrollLeft = content.scrollLeft;
      requestAnimationFrame(() => { syncActive = false; });
    };

    const syncHeaderToContent = () => {
      if (syncActive) return;
      syncActive = true;
      content.scrollLeft = header.scrollLeft;
      requestAnimationFrame(() => { syncActive = false; });
    };

    matchTableWidths();
    const t1 = setTimeout(matchTableWidths, 60);
    const t2 = setTimeout(matchTableWidths, 220);
    const t3 = setTimeout(matchTableWidths, 600);

    content.addEventListener('scroll', syncContentToHeader, { passive: true });
    header.addEventListener('scroll', syncHeaderToContent, { passive: true });
    header.scrollLeft = content.scrollLeft;

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      content.removeEventListener('scroll', syncContentToHeader);
      header.removeEventListener('scroll', syncHeaderToContent);
    };
  }, [mode, flatDataSource.length, loading]);

  const handleViewProfile = useCallback((rowData) => {
    if (rowData?.jobSeekerId) {
      setSelectedJobSeeker(rowData.jobSeekerId);
      setSelectedRegistration(rowData.registration);
      setMode('view');
    }
  }, []);

  const handleRowSelection = useCallback(() => {
    if (selectionUpdateRef.current) return;
    selectionUpdateRef.current = true;
    if (gridRef.current) {
      try {
        const records = gridRef.current.getSelectedRecords();
        setSelectedIds(records.map(r => r._id).filter(Boolean));
      } catch (e) {
        console.warn('Selection error:', e);
      }
    }
    requestAnimationFrame(() => { selectionUpdateRef.current = false; });
  }, []);

  const handleClearSelection = useCallback(() => {
    if (gridRef.current) gridRef.current.clearSelection();
    setSelectedIds([]);
  }, []);

  const selectedRows = useMemo(
    () => flatDataSource.filter(row => selectedIds.includes(row._id)),
    [flatDataSource, selectedIds]
  );

  const handleExportSelectedCsv = useCallback(() => {
    const rows = selectedRows.length > 0 ? selectedRows : flatDataSource;
    const headers = ['Name', 'Email', 'Phone', 'City', 'State', 'Country', 'Status', 'Email Verified', 'Registered Event', 'Registered Date', 'Last Login'];
    const data = rows.map(row => [
      row.name || '',
      row.email || '',
      row.phoneNumber || '',
      row.city || '',
      row.state || '',
      row.country || '',
      row.isActive ? 'Active' : 'Inactive',
      row.emailVerified ? 'Yes' : 'No',
      row.registeredEvent || '',
      row.registeredAt ? new Date(row.registeredAt).toLocaleDateString() : '',
      row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'
    ]);
    const csv = [headers.join(','), ...data.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `registered-job-seekers-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }, [selectedRows, flatDataSource]);

  const handleExportResumesZip = useCallback(async () => {
    const rows = selectedRows.length > 0 ? selectedRows : flatDataSource;
    const withResume = rows.filter(r => r.resumeUrl);
    if (withResume.length === 0) {
      alert('No resumes available for the selected job seekers.');
      return;
    }
    setZipLoading(true);
    const getExt = (url) => {
      if (!url) return 'pdf';
      const m = url.match(/\.([a-zA-Z0-9]+)(\?|$)/);
      return m ? m[1].toLowerCase() : 'pdf';
    };
    try {
      const zip = new JSZip();
      const token = localStorage.getItem('token');
      let successCount = 0;
      for (const row of withResume) {
        try {
          const proxyUrl = `/api/uploads/proxy/download?url=${encodeURIComponent(row.resumeUrl)}`;
          const res = await fetch(proxyUrl, { headers: { Authorization: `Bearer ${token}` } });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const blob = await res.blob();
          if (!blob || blob.size === 0) throw new Error('Empty file');
          const safeName = (row.name || row.email || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
          zip.file(`${safeName}.${getExt(row.resumeUrl)}`, blob);
          successCount++;
        } catch (e) {
          console.warn(`Failed to fetch resume for ${row.name || row.email}:`, e);
        }
      }
      if (successCount === 0) {
        alert('No resumes could be downloaded. They may have expired or be unavailable.');
        return;
      }
      const content = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = `resumes-${new Date().toISOString().slice(0, 10)}.zip`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (e) {
      console.error('ZIP export failed:', e);
      alert('Failed to create resume ZIP. Please try again.');
    } finally {
      setZipLoading(false);
    }
  }, [selectedRows, flatDataSource]);

  const gridSelectionSettings = useMemo(() => ({ type: 'Multiple', checkboxOnly: true }), []);

  const handleExcelExport = useCallback(() => {
    if (gridRef.current) {
      gridRef.current.excelExport();
    }
  }, []);

  const gridFilterSettings = useMemo(() => ({
    type: 'Menu',
    showFilterBarStatus: true,
    immediateModeDelay: 0,
    showFilterBarOperator: true,
    enableCaseSensitivity: false
  }), []);

  const gridToolbar = useMemo(() => ['ColumnChooser'], []);

  const statusTemplate = useCallback((props) => {
    const isActive = props.isActive;
    return (
      <span className={`status-badge ${isActive ? 'active' : 'inactive'}`}>
        {isActive ? 'Active' : 'Inactive'}
      </span>
    );
  }, []);

  const emailVerifiedTemplate = useCallback((props) => {
    const verified = props.emailVerified;
    return (
      <span className={`status-badge ${verified ? 'verified' : 'unverified'}`}>
        {verified ? 'Yes' : 'No'}
      </span>
    );
  }, []);

  const dateTemplate = useCallback((props, field) => (
    <div style={{ padding: '8px 0' }}>
      {props[field] ? new Date(props[field]).toLocaleDateString() : '—'}
    </div>
  ), []);

  const registeredAtTemplate = useCallback((props) => dateTemplate(props, 'registeredAt'), [dateTemplate]);
  const lastLoginTemplate = useCallback((props) => dateTemplate(props, 'lastLogin'), [dateTemplate]);

  const actionsTemplate = useCallback((props) => {
    const rowData = props?.data ?? props;
    return (
      <div style={{ padding: '8px 0' }}>
        <ButtonComponent
          cssClass="e-outline e-primary e-small"
          onClick={() => handleViewProfile(rowData)}
        >
          View
        </ButtonComponent>
      </div>
    );
  }, [handleViewProfile]);

  const renderProfile = () => {
    const js = selectedJobSeeker;
    const reg = selectedRegistration;
    if (!js) {
      return (
        <div className="dashboard-content">
          <div className="form-header">
            <ButtonComponent cssClass="e-outline e-primary" onClick={() => { setMode('list'); setSelectedJobSeeker(null); setSelectedRegistration(null); }}>
              ← Back to List
            </ButtonComponent>
            <h2>No Job Seeker Selected</h2>
          </div>
        </div>
      );
    }

    const metadata = js.metadata || {};
    const profile = metadata.profile || {};
    const displayName = js.name || `${js.firstName || ''} ${js.lastName || ''}`.trim() || 'Unknown';

    return (
      <div className="dashboard-content">
        <div className="form-header">
          <ButtonComponent cssClass="e-outline e-primary" onClick={() => { setMode('list'); setSelectedJobSeeker(null); setSelectedRegistration(null); }}>
            ← Back to List
          </ButtonComponent>
          <h2>Job Seeker Profile: {displayName}</h2>
        </div>

        <div className="profile-sections">
          <div className="profile-header">
            <div className="profile-avatar">
              {js.avatarUrl ? (
                <img src={js.avatarUrl} alt={displayName} className="avatar-image" />
              ) : (
                <div className="avatar-placeholder">
                  <span className="avatar-initials">{displayName.slice(0, 2).toUpperCase()}</span>
                </div>
              )}
            </div>
            <div className="profile-info">
              <h2>{displayName}</h2>
              <p className="profile-email">{js.email}</p>
              <p className="profile-location">{js.phoneNumber || 'Not provided'}</p>
              <p className="profile-location">{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'Not provided'}</p>
              {js.resumeUrl && (
                <a href={js.resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-resume">View Resume</a>
              )}
            </div>
          </div>

          <div className="profile-section">
            <h3>Basic Information</h3>
            <div className="profile-grid-basic">
              <div className="profile-field"><label>Name:</label><span>{displayName}</span></div>
              <div className="profile-field"><label>Email:</label><span>{js.email}</span></div>
              <div className="profile-field"><label>Phone:</label><span>{js.phoneNumber || 'Not provided'}</span></div>
              <div className="profile-field"><label>Location:</label><span>{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'Not provided'}</span></div>
              <div className="profile-field status-field">
                <label>Status:</label>
                <span className={`status-badge ${js.isActive ? 'active' : 'inactive'}`}>{js.isActive ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
              <div className="profile-field email-verified-field">
                <label>Email Verified:</label>
                <span className={`status-badge ${js.emailVerified ? 'verified' : 'unverified'}`}>{js.emailVerified ? 'YES' : 'NO'}</span>
              </div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Registration Info</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Registered At:</label><span>{reg?.registeredAt ? new Date(reg.registeredAt).toLocaleDateString() : '—'}</span></div>
              <div className="profile-field"><label>Event:</label><span>{reg?.eventId?.name || '—'}</span></div>
              <div className="profile-field"><label>Event Date:</label><span>{reg?.eventId?.start ? new Date(reg.eventId.start).toLocaleDateString() : '—'}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Professional Summary</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Headline:</label><span>{profile.headline || metadata.professionalHeadline || metadata.headline || 'Not provided'}</span></div>
              <div className="profile-field"><label>Keywords:</label><span>{profile.keywords || metadata.skills || metadata.keywords || 'Not provided'}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Experience & Employment</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Primary Experience:</label><span>{getLabelFromValue(profile.primaryExperience?.[0] || metadata.primaryJobExperience || metadata.primaryExperience?.[0], JOB_CATEGORY_LIST)}</span></div>
              <div className="profile-field"><label>Employment Types:</label><span>{getLabelFromValue(profile.employmentTypes?.[0] || metadata.employmentTypes?.[0], JOB_TYPE_LIST)}</span></div>
              <div className="profile-field"><label>Experience Level:</label><span>{getLabelFromValue(profile.workLevel || metadata.experienceLevel || metadata.workLevel, EXPERIENCE_LEVEL_LIST)}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Education & Qualifications</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Education Level:</label><span>{getLabelFromValue(profile.educationLevel || metadata.education || metadata.educationLevel, EDUCATION_LEVEL_LIST)}</span></div>
              <div className="profile-field"><label>Security Clearance:</label><span>{getLabelFromValue(profile.clearance || metadata.securityClearance || metadata.clearance, SECURITY_CLEARANCE_LIST)}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Additional Information</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Languages:</label><span>{(profile.languages || metadata.languages || js.languages || []).map(l => getLabelFromValue(l, LANGUAGE_LIST)).join(', ') || 'Not provided'}</span></div>
              <div className="profile-field"><label>Work Authorization:</label><span>{profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || 'Not provided'}</span></div>
              <div className="profile-field"><label>Veteran Status:</label><span>{getLabelFromValue(profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus, MILITARY_EXPERIENCE_LIST)}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Accessibility Needs</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Screen Magnifier:</label><span>{js.usesScreenMagnifier ? 'Yes' : 'No'}</span></div>
              <div className="profile-field"><label>Screen Reader:</label><span>{js.usesScreenReader ? 'Yes' : 'No'}</span></div>
              <div className="profile-field"><label>ASL Interpreter:</label><span>{js.needsASL ? 'Yes' : 'No'}</span></div>
              <div className="profile-field"><label>Captions:</label><span>{js.needsCaptions ? 'Yes' : 'No'}</span></div>
              <div className="profile-field"><label>Other:</label><span>{js.needsOther ? 'Yes' : 'No'}</span></div>
            </div>
          </div>

          <div className="profile-section">
            <h3>Account Details</h3>
            <div className="profile-grid">
              <div className="profile-field"><label>Created:</label><span>{js.createdAt ? new Date(js.createdAt).toLocaleDateString() : '—'}</span></div>
              <div className="profile-field"><label>Last Login:</label><span>{js.lastLogin ? new Date(js.lastLogin).toLocaleDateString() : 'Never'}</span></div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  const pageContent = !orgId ? (
    <div className="dashboard-content" style={{ padding: 24 }}>
      <h2>Registered Job Seekers</h2>
      <p>Your account is not associated with an organization. Please contact a Super Admin.</p>
    </div>
  ) : mode === 'view' ? (
    renderProfile()
  ) : (
    <div className="dashboard-content">
      <div className="page-header">
        <div>
          <h1>Registered Job Seekers</h1>
          <p>Showing job seekers who have registered for your organization&apos;s events</p>
        </div>
      </div>

      <div className="jsm-filters-row" style={{ marginBottom: 12, paddingLeft: '20px', paddingRight: '20px', display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: '200px', flexShrink: 0 }}>
          <DropDownListComponent
            id="rjsm-status-filter"
            dataSource={statusOptions}
            fields={{ value: 'value', text: 'text' }}
            value={statusFilter}
            change={(e) => {
              setStatusFilter(e.value || '');
              setPage(1);
            }}
            placeholder="All Status"
            cssClass="status-filter-dropdown"
            popupHeight="300px"
            width="100%"
          />
        </div>
        <div style={{ width: '250px', flexShrink: 0 }}>
          <DropDownListComponent
            id="rjsm-event-filter"
            dataSource={eventOptions}
            fields={{ value: 'value', text: 'text' }}
            value={eventFilter}
            change={(e) => {
              setEventFilter(e.value || '');
              setPage(1);
            }}
            placeholder="All Events"
            cssClass="event-filter-dropdown"
            popupHeight="300px"
            width="100%"
          />
        </div>
        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', marginLeft: 'auto' }}>
          <ButtonComponent cssClass="e-outline e-primary e-small" onClick={handleExcelExport} disabled={loading || flatDataSource.length === 0} style={{ minWidth: '110px', height: '44px' }}>
            Export Excel
          </ButtonComponent>
          <ButtonComponent cssClass="e-outline e-primary e-small" onClick={handleExportSelectedCsv} disabled={loading || flatDataSource.length === 0} style={{ minWidth: '100px', height: '44px' }}>
            Export CSV
          </ButtonComponent>
          <ButtonComponent
            cssClass="e-outline e-primary e-small"
            onClick={handleExportResumesZip}
            disabled={loading || flatDataSource.length === 0 || zipLoading}
            style={{ minWidth: '130px', height: '44px' }}
          >
            {zipLoading ? 'Zipping...' : 'Export Resumes'}
          </ButtonComponent>
          <input
            ref={searchInputRef}
            type="text"
            onKeyDown={(e) => e.key === 'Enter' && triggerSearch()}
            placeholder="Search by name or email..."
            className="jsm-search-input-native"
            style={{ width: '300px', padding: '10px 12px', fontSize: '14px', border: '1px solid #d1d5db', borderRadius: '6px', outline: 'none' }}
          />
          <ButtonComponent cssClass="e-primary e-small" onClick={triggerSearch} disabled={loading} style={{ minWidth: '80px', height: '44px' }}>
            {loading ? 'Searching...' : 'Search'}
          </ButtonComponent>
          {(search || eventFilter || statusFilter) && (
            <ButtonComponent
              cssClass="e-outline e-primary e-small"
              onClick={() => {
                if (searchInputRef.current) searchInputRef.current.value = '';
                setSearch('');
                setEventFilter('');
                setStatusFilter('');
                setPage(1);
              }}
              style={{ minWidth: '70px', height: '44px' }}
            >
              Clear
            </ButtonComponent>
          )}
        </div>
      </div>

      {error && (
        <div style={{ background: '#fee', color: '#c00', padding: '10px 16px', borderRadius: 6, margin: '0 20px 16px' }} role="alert">
          {error}
        </div>
      )}

      <div className="stats-row">
        <div className="stat-card"><h4>Total</h4><span className="stat-number">{total}</span></div>
      </div>

      {selectedIds.length > 0 && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '10px 20px', background: '#e3f2fd', borderRadius: '6px', margin: '0 0 8px', fontSize: '14px', color: '#1565c0' }}>
          <span><strong>{selectedIds.length}</strong> selected</span>
          <ButtonComponent cssClass="e-outline e-small" onClick={handleClearSelection} style={{ height: '32px' }}>
            Clear Selection
          </ButtonComponent>
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
        <div className="bm-grid-wrap data-grid-container" style={{ position: 'relative', overflowX: 'auto' }}>
          {loading && (
            <div className="jsm-grid-loading-overlay">
              <div className="jsm-loading-container">
                <div className="jsm-loading-spinner" aria-label="Loading" role="status" />
                <div className="jsm-loading-text">Loading registered job seekers...</div>
              </div>
            </div>
          )}
          <GridComponent
            ref={gridRef}
            cssClass="registered-js-grid"
            dataSource={flatDataSource}
            height="450"
            allowPaging={false}
            allowSorting={true}
            allowFiltering={true}
            filterSettings={gridFilterSettings}
            showColumnMenu={true}
            showColumnChooser={true}
            allowResizing={true}
            allowReordering={true}
            toolbar={gridToolbar}
            selectionSettings={gridSelectionSettings}
            rowSelected={handleRowSelection}
            rowDeselected={handleRowSelection}
            enableHover={true}
          >
            <ColumnsDirective>
              <ColumnDirective type="checkbox" width="50" allowSorting={false} allowFiltering={false} showInColumnChooser={false} />
              <ColumnDirective field="_id" headerText="" width="0" visible={false} isPrimaryKey />
              <ColumnDirective field="name" headerText="Name" width="180" allowFiltering={true} />
              <ColumnDirective field="email" headerText="Email" width="220" allowFiltering={true} />
              <ColumnDirective field="phoneNumber" headerText="Phone" width="140" allowFiltering={true} />
              <ColumnDirective field="city" headerText="City" width="120" allowFiltering={true} />
              <ColumnDirective field="state" headerText="State" width="100" allowFiltering={true} />
              <ColumnDirective field="country" headerText="Country" width="120" allowFiltering={true} />
              <ColumnDirective field="isActive" headerText="Status" width="100" textAlign="Center" template={statusTemplate} />
              <ColumnDirective field="emailVerified" headerText="Email Verified" width="120" textAlign="Center" template={emailVerifiedTemplate} />
              <ColumnDirective field="registeredEvent" headerText="Registered Event" width="200" allowFiltering={true} />
              <ColumnDirective field="registeredAt" headerText="Registered Date" width="140" template={registeredAtTemplate} />
              <ColumnDirective field="lastLogin" headerText="Last Login" width="140" template={lastLoginTemplate} />
              <ColumnDirective headerText="Actions" width="100" allowSorting={false} allowFiltering={false} template={actionsTemplate} />
            </ColumnsDirective>
            <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu, ExcelExport]} />
          </GridComponent>
        </div>

        <div className="custom-pagination" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', backgroundColor: '#f9fafb', borderTop: '1px solid #e5e7eb', flexShrink: 0, minWidth: 0 }}>
          <div />
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ fontSize: '14px', color: '#374151' }}>Page {page} of {totalPages} ({total} total)</span>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
            <button
              type="button"
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: page <= 1 ? '#f3f4f6' : '#fff', cursor: page <= 1 ? 'not-allowed' : 'pointer', fontSize: '14px' }}
            >
              Previous
            </button>
            <button
              type="button"
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={{ padding: '8px 12px', borderRadius: '6px', border: '1px solid #d1d5db', backgroundColor: page >= totalPages ? '#f3f4f6' : '#fff', cursor: page >= totalPages ? 'not-allowed' : 'pointer', fontSize: '14px' }}
            >
              Next
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="dashboard">
      <a href="#dashboard-main" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="jobseekers" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          {pageContent}
        </main>
      </div>
    </div>
  );
}
