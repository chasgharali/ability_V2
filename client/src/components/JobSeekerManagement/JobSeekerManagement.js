import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input } from '../UI/FormComponents';
import { listUsers, deactivateUser, reactivateUser, deleteUserPermanently, verifyUserEmail } from '../../services/users';
import { 
  JOB_CATEGORY_LIST, 
  LANGUAGE_LIST, 
  JOB_TYPE_LIST, 
  EXPERIENCE_LEVEL_LIST, 
  EDUCATION_LEVEL_LIST, 
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST 
} from '../../constants/options';

export default function JobSeekerManagement() {
  // Helper function to get label from value using options list
  const getLabelFromValue = (value, optionsList) => {
    if (!value) return 'Not provided';
    const option = optionsList.find(opt => opt.value === value);
    return option ? option.name : value; // Fallback to original value if not found
  };

  // Helper function to format array of values to labels
  const formatArrayToLabels = (values, optionsList) => {
    if (!values || !Array.isArray(values) || values.length === 0) {
      return ['Not provided'];
    }
    return values.map(value => getLabelFromValue(value, optionsList));
  };
  const [mode, setMode] = useState('list'); // 'list' | 'view' | 'edit'
  const [jobSeekers, setJobSeekers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchFilter, setSearchFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [isTransitioning, setIsTransitioning] = useState(false);
  const toastRef = useRef(null);
  const gridRef = useRef(null);
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);
  // Delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);
  // Verify email confirmation dialog
  const [verifyEmailOpen, setVerifyEmailOpen] = useState(false);
  const [rowPendingVerify, setRowPendingVerify] = useState(null);

  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');

  const statusOptions = useMemo(() => [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ], []);

  // Syncfusion Toast
  const showToast = (message, type = 'Success', duration = 3000) => {
    if (toastRef.current) {
      toastRef.current.show({
        title: type,
        content: message,
        cssClass: `e-toast-${type.toLowerCase()}`,
        showProgressBar: true,
        timeOut: duration
      });
    }
  };

  const handleDelete = (row) => {
    if (row.isActive) return; // safety - can't delete active users
    setRowPendingDelete(row);
    setConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (!rowPendingDelete) return;
    try {
      await deleteUserPermanently(rowPendingDelete.id);
      showToast('Job seeker deleted', 'Success');
      await loadJobSeekers();
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Delete failed';
      showToast(msg, 'Error');
    } finally {
      setConfirmOpen(false);
      setRowPendingDelete(null);
    }
  };

  const cancelDelete = () => {
    setConfirmOpen(false);
    setRowPendingDelete(null);
  };

  const loadJobSeekers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listUsers({ page: 1, limit: 1000, role: 'JobSeeker' });
      const items = (res?.users || []).filter(u => u.role === 'JobSeeker');
      setJobSeekers(items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return {
          id: u._id,
          firstName,
          lastName,
          email: u.email,
          phone: u.phoneNumber || '',
          city: u.city || '',
          state: u.state || '',
          country: u.country || '',
          isActive: u.isActive,
          createdAt: u.createdAt,
          lastLogin: u.lastLogin,
          emailVerified: u.emailVerified,
          resumeUrl: u.resumeUrl,
          survey: u.survey || {},
          metadata: u.metadata || {},
          avatarUrl: u.avatarUrl,
          usesScreenMagnifier: u.usesScreenMagnifier,
          usesScreenReader: u.usesScreenReader,
          needsASL: u.needsASL,
          needsCaptions: u.needsCaptions,
          needsOther: u.needsOther,
        };
      }));
      setLiveMsg(`Loaded ${items.length} job seekers`);
    } catch (e) {
      console.error('Load failed', e);
      showToast('Failed to load job seekers', 'Error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobSeekers();
  }, [loadJobSeekers]);

  // Cleanup grid and toast when mode changes to prevent DOM manipulation errors
  useEffect(() => {
    // When switching to view mode, ensure grid and toast are cleaned up
    if (mode === 'view') {
      // Cleanup grid
      if (gridRef.current) {
        const grid = gridRef.current;
        try {
          if (typeof grid.destroy === 'function') {
            grid.destroy();
          }
          gridRef.current = null;
        } catch (e) {
          console.warn('Grid cleanup (non-critical):', e.message);
        }
      }
      
      // Clear any active toasts to prevent DOM errors when switching ToastComponents
      if (toastRef.current) {
        try {
          // Hide all active toasts before component unmounts
          toastRef.current.hideAll();
        } catch (e) {
          // Ignore toast cleanup errors
        }
      }
    }
  }, [mode]);

  const handleToggleActive = async (row) => {
    try {
      if (row.isActive) {
        await deactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} deactivated`, 'Success');
      } else {
        await reactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} reactivated`, 'Success');
      }
      await loadJobSeekers();
    } catch (e) {
      console.error('Toggle active failed', e);
      showToast('Failed to update status', 'Error');
    }
  };

  const handleViewProfile = (row) => {
    console.log('View Profile clicked for:', row);
    
    // Clear any active toasts before switching modes to prevent DOM errors
    if (toastRef.current) {
      try {
        toastRef.current.hideAll();
      } catch (e) {
        // Ignore toast cleanup errors
      }
    }
    
    // Set transitioning first to hide the grid
    setIsTransitioning(true);
    
    // Set the selected job seeker
    setSelectedJobSeeker(row);
    
    // Destroy the grid after a brief moment
    setTimeout(() => {
      if (gridRef.current) {
        try {
          const grid = gridRef.current;
          if (typeof grid.destroy === 'function') {
            grid.destroy();
          }
          gridRef.current = null;
        } catch (e) {
          console.warn('Grid cleanup warning:', e);
        }
      }
      
      // Change mode after grid is destroyed
      // Use a small additional delay to ensure all cleanup completes
      setTimeout(() => {
        setMode('view');
        setIsTransitioning(false);
      }, 50);
    }, 100); // Delay to allow grid to be hidden first
  };

  const handleVerifyEmail = (row) => {
    if (row.emailVerified) return; // safety check
    setRowPendingVerify(row);
    setVerifyEmailOpen(true);
  };

  const confirmVerifyEmail = async () => {
    if (!rowPendingVerify) return;
    try {
      await verifyUserEmail(rowPendingVerify.id);
      showToast(`Email verified for ${rowPendingVerify.firstName} ${rowPendingVerify.lastName}`, 'Success');
      await loadJobSeekers(); // Refresh the list
    } catch (e) {
      console.error('Verify email failed', e);
      const msg = e?.response?.data?.message || 'Failed to verify email';
      showToast(msg, 'Error');
    } finally {
      setVerifyEmailOpen(false);
      setRowPendingVerify(null);
    }
  };

  const cancelVerifyEmail = () => {
    setVerifyEmailOpen(false);
    setRowPendingVerify(null);
  };

  const filteredJobSeekers = useMemo(() => {
    return jobSeekers.filter(js => {
      const matchesSearch = !searchFilter || 
        js.firstName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        js.lastName.toLowerCase().includes(searchFilter.toLowerCase()) ||
        js.email.toLowerCase().includes(searchFilter.toLowerCase());
      
      const matchesStatus = !statusFilter || 
        (statusFilter === 'active' && js.isActive) ||
        (statusFilter === 'inactive' && !js.isActive);
      
      return matchesSearch && matchesStatus;
    });
  }, [jobSeekers, searchFilter, statusFilter]);

  // Grid template functions for custom column renders - using Syncfusion ButtonComponent
  const statusTemplate = (props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.isActive ? 'active' : 'inactive'}`}>
        {row.isActive ? 'Active' : 'Inactive'}
      </span>
    );
  };

  const emailVerifiedTemplate = (props) => {
    const row = props;
    return (
      <span className={`status-badge ${row.emailVerified ? 'verified' : 'unverified'}`}>
        {row.emailVerified ? 'Yes' : 'No'}
      </span>
    );
  };

  const lastLoginTemplate = (props) => {
    const row = props;
    return row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never';
  };

  const actionsTemplate = (props) => {
    const row = props;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <ButtonComponent 
          cssClass="e-primary e-small" 
          onClick={() => handleViewProfile(row)}
          title="View Profile"
        >
          View
        </ButtonComponent>
        {!row.emailVerified && (
          <ButtonComponent 
            cssClass="e-outline e-primary e-small" 
            onClick={() => handleVerifyEmail(row)}
            title="Verify Email"
          >
            Verify Email
          </ButtonComponent>
        )}
        <ButtonComponent 
          cssClass={row.isActive ? "e-outline e-primary e-small" : "e-primary e-small"}
          onClick={() => handleToggleActive(row)}
          title={row.isActive ? 'Deactivate' : 'Activate'}
        >
          {row.isActive ? 'Deactivate' : 'Activate'}
        </ButtonComponent>
        {!row.isActive && (
          <ButtonComponent 
            cssClass="e-outline e-danger e-small" 
            onClick={() => handleDelete(row)}
            title="Delete Permanently"
          >
            Delete
          </ButtonComponent>
        )}
      </div>
    );
  };

  const renderJobSeekerProfile = () => {
    console.log('renderJobSeekerProfile called, selectedJobSeeker:', selectedJobSeeker);
    console.log('Current mode:', mode);
    console.log('isTransitioning:', isTransitioning);
    
    if (!selectedJobSeeker) {
      console.warn('No selectedJobSeeker, returning null');
      return (
        <div className="dashboard-content">
          <div className="form-header">
            <ButtonComponent 
              cssClass="e-outline e-primary"
              onClick={() => {
                setMode('list');
                setSelectedJobSeeker(null);
                setIsTransitioning(false);
              }}
            >
              ← Back to List
            </ButtonComponent>
            <h2>No Job Seeker Selected</h2>
          </div>
          <p>Please select a job seeker from the list to view their profile.</p>
        </div>
      );
    }

    const js = selectedJobSeeker;
    const survey = js.survey || {};
    const metadata = js.metadata || {};
    const profile = metadata.profile || {};
    
    // Debug: Log metadata to console
    console.log('Job Seeker Metadata:', metadata);
    console.log('Job Seeker Profile:', profile);
    console.log('Full Job Seeker Object:', js);

    return (
      <div className="dashboard-content">
        <div className="form-header">
          <ButtonComponent 
            cssClass="e-outline e-primary"
            onClick={() => setMode('list')}
          >
            ← Back to List
          </ButtonComponent>
          <h2>Job Seeker Profile: {js.firstName} {js.lastName}</h2>
        </div>

        <div className="profile-sections">
          {/* Profile Header with Image */}
          <div className="profile-header">
            <div className="profile-avatar">
              {js.avatarUrl ? (
                <img src={js.avatarUrl} alt={`${js.firstName} ${js.lastName}`} className="avatar-image" />
              ) : (
                <div className="avatar-placeholder">
                  <span className="avatar-initials">
                    {js.firstName?.charAt(0)}{js.lastName?.charAt(0)}
                  </span>
                </div>
              )}
            </div>
            <div className="profile-info">
              <h2>{js.firstName} {js.lastName}</h2>
              <p className="profile-email">{js.email}</p>
              <p className="profile-location">{js.phone || '09239320093'}</p>
              <p className="profile-location">{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'denver, Colorado, US'}</p>
              {js.resumeUrl && (
                <a 
                  href={js.resumeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-resume"
                >
                  📄 View Complete Resume
                </a>
              )}
            </div>
          </div>

          {/* Basic Information */}
          <div className="profile-section">
            <h3>Basic Information</h3>
            <div className="profile-grid-basic">
              <div className="profile-field">
                <label>Name:</label>
                <span>{js.firstName} {js.lastName}</span>
              </div>
              <div className="profile-field">
                <label>Email:</label>
                <span>{js.email}</span>
              </div>
              <div className="profile-field">
                <label>Phone:</label>
                <span>{js.phone || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Location:</label>
                <span>{[js.city, js.state, js.country].filter(Boolean).join(', ') || 'Not provided'}</span>
              </div>
              <div className="profile-field status-field">
                <label>Status:</label>
                <span className={`status-badge ${js.isActive ? 'active' : 'inactive'}`}>
                  {js.isActive ? 'ACTIVE' : 'INACTIVE'}
                </span>
              </div>
              <div className="profile-field email-verified-field">
                <label>Email Verified:</label>
                <span className={`status-badge ${js.emailVerified ? 'verified' : 'unverified'}`}>
                  {js.emailVerified ? 'YES' : 'NO'}
                </span>
              </div>
            </div>
          </div>

          {/* Professional Summary */}
          <div className="profile-section">
            <h3>Professional Summary</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Professional Headline:</label>
                <span>{profile.headline || metadata.professionalHeadline || metadata.headline || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Keywords & Skills:</label>
                <span>{profile.keywords || metadata.skills || metadata.keywords || 'Not provided'}</span>
              </div>
            </div>
          </div>

          {/* Experience & Employment */}
          <div className="profile-section">
            <h3>Experience & Employment</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Primary Job Experience:</label>
                <span>{getLabelFromValue(profile.primaryExperience?.[0] || metadata.primaryJobExperience || metadata.primaryExperience?.[0], JOB_CATEGORY_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Secondary Job Experience:</label>
                <span>{getLabelFromValue(profile.primaryExperience?.[1] || metadata.secondaryJobExperience || metadata.primaryExperience?.[1], JOB_CATEGORY_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Employment Types:</label>
                <div className="tags">
                  {(profile.employmentTypes || metadata.employmentTypes || metadata.employmentType) ? 
                    (Array.isArray(profile.employmentTypes) ? profile.employmentTypes : 
                     Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes : 
                     Array.isArray(metadata.employmentType) ? metadata.employmentType : 
                     [profile.employmentTypes || metadata.employmentTypes || metadata.employmentType]).map((type, index) => (
                      <span key={index} className="tag">{getLabelFromValue(type, JOB_TYPE_LIST)}</span>
                    )) : <span>Not provided</span>}
                </div>
              </div>
              <div className="profile-field">
                <label>Experience Level:</label>
                <span>{getLabelFromValue(profile.workLevel || metadata.experienceLevel || metadata.workLevel, EXPERIENCE_LEVEL_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Education & Qualifications */}
          <div className="profile-section">
            <h3>Education & Qualifications</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Highest Education Level:</label>
                <span>{getLabelFromValue(profile.educationLevel || metadata.education || metadata.educationLevel, EDUCATION_LEVEL_LIST)}</span>
              </div>
              <div className="profile-field">
                <label>Security Clearance:</label>
                <span>{getLabelFromValue(profile.clearance || metadata.securityClearance || metadata.clearance, SECURITY_CLEARANCE_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Additional Information */}
          <div className="profile-section">
            <h3>Additional Information</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Languages:</label>
                <div className="tags">
                  {(profile.languages || metadata.languages || js.languages) ? 
                    (profile.languages || metadata.languages || js.languages).map((lang, index) => (
                      <span key={index} className="tag">{getLabelFromValue(lang, LANGUAGE_LIST)}</span>
                    )) : <span>Not provided</span>}
                </div>
              </div>
              <div className="profile-field">
                <label>Work Authorization:</label>
                <span>{profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || 'Not provided'}</span>
              </div>
              <div className="profile-field">
                <label>Veteran/Military Status:</label>
                <span>{getLabelFromValue(profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus, MILITARY_EXPERIENCE_LIST)}</span>
              </div>
            </div>
          </div>

          {/* Accessibility Needs */}
          <div className="profile-section">
            <h3>Accessibility Needs</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Screen Magnifier:</label>
                <span>{js.usesScreenMagnifier ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Screen Reader:</label>
                <span>{js.usesScreenReader ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>ASL Interpreter:</label>
                <span>{js.needsASL ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Captions:</label>
                <span>{js.needsCaptions ? 'Yes' : 'No'}</span>
              </div>
              <div className="profile-field">
                <label>Other Accommodations:</label>
                <span>{js.needsOther ? 'Yes' : 'No'}</span>
              </div>
            </div>
          </div>

          {/* Survey Information */}
          {survey && Object.keys(survey).length > 0 && (
            <div className="profile-section">
              <h3>Survey Information</h3>
              <div className="profile-grid">
                {survey.race && survey.race.length > 0 && (
                  <div className="profile-field">
                    <label>Race/Ethnicity:</label>
                    <span>{survey.race.join(', ')}</span>
                  </div>
                )}
                {survey.genderIdentity && (
                  <div className="profile-field">
                    <label>Gender Identity:</label>
                    <span>{survey.genderIdentity}</span>
                  </div>
                )}
                {survey.ageGroup && (
                  <div className="profile-field">
                    <label>Age Group:</label>
                    <span>{survey.ageGroup}</span>
                  </div>
                )}
                {survey.countryOfOrigin && (
                  <div className="profile-field">
                    <label>Country of Origin:</label>
                    <span>{survey.countryOfOrigin}</span>
                  </div>
                )}
                {survey.disabilities && survey.disabilities.length > 0 && (
                  <div className="profile-field">
                    <label>Disabilities:</label>
                    <span>{survey.disabilities.join(', ')}</span>
                  </div>
                )}
                {survey.otherDisability && (
                  <div className="profile-field">
                    <label>Other Disability:</label>
                    <span>{survey.otherDisability}</span>
                  </div>
                )}
              </div>
            </div>
          )}


          {/* Account Details */}
          <div className="profile-section">
            <h3>Account Details</h3>
            <div className="profile-grid">
              <div className="profile-field">
                <label>Created:</label>
                <span>{new Date(js.createdAt).toLocaleDateString()}</span>
              </div>
              <div className="profile-field">
                <label>Last Login:</label>
                <span>{js.lastLogin ? new Date(js.lastLogin).toLocaleDateString() : 'Never'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="jobseekers" />
        <main className="dashboard-main">
          {mode === 'view' ? (
            renderJobSeekerProfile()
          ) : (
          <div className="dashboard-content">
            <div className="page-header">
              <h2>Job Seeker Management</h2>
              <p>Manage job seeker accounts and profiles</p>
            </div>

            {/* Filters */}
            <div className="filters-row">
              <Input
                label="Search by name or email"
                value={searchFilter}
                onChange={(e) => setSearchFilter(e.target.value)}
                placeholder="Search job seekers..."
              />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <label htmlFor="status-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                  Status Filter
                </label>
                <DropDownListComponent
                  id="status-filter-dropdown"
                  dataSource={statusOptions.map(s => ({ value: s.value, text: s.label }))}
                  fields={{ value: 'value', text: 'text' }}
                  value={statusFilter}
                  change={(e) => setStatusFilter(e.value || '')}
                  placeholder="Select Status"
                  cssClass="status-filter-dropdown"
                  popupHeight="300px"
                  width="200px"
                />
              </div>
            </div>

            {/* Stats */}
            <div className="stats-row">
              <div className="stat-card">
                <h4>Total Job Seekers</h4>
                <span className="stat-number">{jobSeekers.length}</span>
              </div>
              <div className="stat-card">
                <h4>Active</h4>
                <span className="stat-number">{jobSeekers.filter(js => js.isActive).length}</span>
              </div>
              <div className="stat-card">
                <h4>Inactive</h4>
                <span className="stat-number">{jobSeekers.filter(js => !js.isActive).length}</span>
              </div>
              <div className="stat-card">
                <h4>Email Verified</h4>
                <span className="stat-number">{jobSeekers.filter(js => js.emailVerified).length}</span>
              </div>
            </div>

            {/* Data Grid */}
            {loading && <div style={{ marginBottom: 12 }}>Loading…</div>}
            {mode === 'list' && !isTransitioning && (
              <div style={{ display: isTransitioning ? 'none' : 'block' }}>
                <GridComponent
                  key="job-seekers-grid"
                  ref={gridRef}
                  dataSource={filteredJobSeekers}
                  allowPaging={true}
                  pageSettings={{ pageSize: 10, pageSizes: [10, 20, 50, 100] }}
                  allowSorting={true}
                  allowFiltering={true}
                  filterSettings={{ type: 'Menu' }}
                  showColumnMenu={true}
                  showColumnChooser={true}
                  allowResizing={true}
                  allowReordering={true}
                  toolbar={['Search', 'ColumnChooser']}
                  selectionSettings={{ type: 'Multiple', checkboxOnly: true }}
                  enableHover={true}
                  allowRowDragAndDrop={false}
                >
              <ColumnsDirective>
                <ColumnDirective type='checkbox' width='50' />
                <ColumnDirective field='firstName' headerText='First Name' width='150' clipMode='EllipsisWithTooltip' />
                <ColumnDirective field='lastName' headerText='Last Name' width='150' clipMode='EllipsisWithTooltip' />
                <ColumnDirective field='email' headerText='Email' width='250' clipMode='EllipsisWithTooltip' />
                <ColumnDirective field='phone' headerText='Phone' width='150' clipMode='EllipsisWithTooltip' />
                <ColumnDirective field='city' headerText='City' width='120' clipMode='EllipsisWithTooltip' />
                <ColumnDirective field='state' headerText='State' width='120' clipMode='EllipsisWithTooltip' />
                <ColumnDirective 
                  field='isActive' 
                  headerText='Status' 
                  width='120' 
                  textAlign='Center'
                  template={statusTemplate}
                />
                <ColumnDirective 
                  field='emailVerified' 
                  headerText='Email Verified' 
                  width='130' 
                  textAlign='Center'
                  template={emailVerifiedTemplate}
                />
                <ColumnDirective 
                  field='lastLogin' 
                  headerText='Last Login' 
                  width='150' 
                  clipMode='EllipsisWithTooltip'
                  template={lastLoginTemplate}
                />
                <ColumnDirective 
                  headerText='Actions' 
                  width='450' 
                  allowSorting={false} 
                  allowFiltering={false}
                  template={actionsTemplate}
                />
              </ColumnsDirective>
              <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>
              </div>
            )}
          </div>
          )}
        </main>
      </div>
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMsg}
      </div>

      {/* Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmOpen}
        header="Delete Job Seeker"
        closeOnEscape={true}
        close={cancelDelete}
        buttons={[
          {
            buttonModel: {
              content: 'Cancel',
              isPrimary: false,
              cssClass: 'e-outline e-primary'
            },
            click: () => {
              cancelDelete();
            }
          },
          {
            buttonModel: {
              content: 'Delete',
              isPrimary: true,
              cssClass: 'e-danger'
            },
            click: () => {
              confirmDelete();
            }
          }
        ]}
      >
        <p style={{ margin: 0, lineHeight: '1.5' }}>
          Are you sure you want to permanently delete <strong>{rowPendingDelete?.firstName} {rowPendingDelete?.lastName}</strong>? This action cannot be undone.
        </p>
      </DialogComponent>

      {/* Verify Email confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={verifyEmailOpen}
        header="Verify Email"
        closeOnEscape={true}
        close={cancelVerifyEmail}
        buttons={[
          {
            buttonModel: {
              content: 'Cancel',
              isPrimary: false,
              cssClass: 'e-outline e-primary'
            },
            click: () => {
              cancelVerifyEmail();
            }
          },
          {
            buttonModel: {
              content: 'Verify',
              isPrimary: true,
              cssClass: 'e-primary'
            },
            click: () => {
              confirmVerifyEmail();
            }
          }
        ]}
      >
        <p style={{ margin: 0, lineHeight: '1.5' }}>
          Verify email for <strong>{rowPendingVerify?.firstName} {rowPendingVerify?.lastName}</strong> ({rowPendingVerify?.email})?
        </p>
      </DialogComponent>

      {/* Syncfusion ToastComponent - shared across all modes to prevent DOM errors */}
      <ToastComponent 
        ref={(toast) => toastRef.current = toast}
        position={{ X: 'Right', Y: 'Bottom' }}
        showProgressBar={true}
        timeOut={3000}
        newestOnTop={true}
      />
    </div>
  );
}
