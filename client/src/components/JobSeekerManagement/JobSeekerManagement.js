import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select } from '../UI/FormComponents';
import Toast from '../UI/Toast';
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
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);

  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');

  const statusOptions = useMemo(() => [
    { value: '', label: 'All Status' },
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ], []);

  const showToast = (message, type = 'info', duration = 3000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type, duration });
    toastTimer.current = setTimeout(() => setToast(null), duration);
  };

  const handleDelete = async (row) => {
    if (row.isActive) return; // safety
    const ok = window.confirm(`Permanently delete ${row.firstName} ${row.lastName}? This cannot be undone.`);
    if (!ok) return;
    try {
      await deleteUserPermanently(row.id);
      showToast('Job seeker deleted', 'success');
      await loadJobSeekers();
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Delete failed';
      showToast(msg, 'error');
    }
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
      showToast('Failed to load job seekers', 'error');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadJobSeekers();
  }, [loadJobSeekers]);

  const handleToggleActive = async (row) => {
    try {
      if (row.isActive) {
        await deactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} deactivated`, 'success');
      } else {
        await reactivateUser(row.id);
        showToast(`${row.firstName} ${row.lastName} reactivated`, 'success');
      }
      await loadJobSeekers();
    } catch (e) {
      console.error('Toggle active failed', e);
      showToast('Failed to update status', 'error');
    }
  };

  const handleViewProfile = (row) => {
    setSelectedJobSeeker(row);
    setMode('view');
  };

  const handleVerifyEmail = async (row) => {
    if (row.emailVerified) return; // safety check
    const ok = window.confirm(`Verify email for ${row.firstName} ${row.lastName}?`);
    if (!ok) return;
    try {
      await verifyUserEmail(row.id);
      showToast(`Email verified for ${row.firstName} ${row.lastName}`, 'success');
      await loadJobSeekers(); // Refresh the list
    } catch (e) {
      console.error('Verify email failed', e);
      const msg = e?.response?.data?.message || 'Failed to verify email';
      showToast(msg, 'error');
    }
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

  const columns = [
    { key: 'firstName', label: 'First Name', sortable: true },
    { key: 'lastName', label: 'Last Name', sortable: true },
    { key: 'email', label: 'Email', sortable: true },
    { key: 'phone', label: 'Phone' },
    { key: 'city', label: 'City' },
    { key: 'state', label: 'State' },
    { 
      key: 'isActive', 
      label: 'Status', 
      render: (row) => (
        <span className={`status-badge ${row.isActive ? 'active' : 'inactive'}`}>
          {row.isActive ? 'Active' : 'Inactive'}
        </span>
      )
    },
    { 
      key: 'emailVerified', 
      label: 'Email Verified', 
      render: (row) => (
        <span className={`status-badge ${row.emailVerified ? 'verified' : 'unverified'}`}>
          {row.emailVerified ? 'Yes' : 'No'}
        </span>
      )
    },
    { 
      key: 'lastLogin', 
      label: 'Last Login', 
      render: (row) => row.lastLogin ? new Date(row.lastLogin).toLocaleDateString() : 'Never'
    },
    {
      key: 'actions',
      label: 'Actions',
      render: (row) => (
        <div className="action-buttons">
          <button
            className="btn-sm btn-primary"
            onClick={() => handleViewProfile(row)}
            title="View Profile"
          >
            View
          </button>
          {!row.emailVerified && (
            <button
              className="btn-sm btn-info"
              onClick={() => handleVerifyEmail(row)}
              title="Verify Email"
            >
              Verify Email
            </button>
          )}
          <button
            className={`btn-sm ${row.isActive ? 'btn-warning' : 'btn-success'}`}
            onClick={() => handleToggleActive(row)}
            title={row.isActive ? 'Deactivate' : 'Activate'}
          >
            {row.isActive ? 'Deactivate' : 'Activate'}
          </button>
          {!row.isActive && (
            <button
              className="btn-sm btn-danger"
              onClick={() => handleDelete(row)}
              title="Delete Permanently"
            >
              Delete
            </button>
          )}
        </div>
      )
    }
  ];

  const renderJobSeekerProfile = () => {
    if (!selectedJobSeeker) return null;

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
          <button 
            type="button" 
            className="btn-secondary"
            onClick={() => setMode('list')}
          >
            ← Back to List
          </button>
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

  if (mode === 'view') {
    return (
      <div className="dashboard">
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="jobseekers" />
          <main className="dashboard-main">
            {renderJobSeekerProfile()}
          </main>
        </div>
        {toast && <Toast {...toast} />}
      </div>
    );
  }

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="jobseekers" />
        <main className="dashboard-main">
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
              <Select
                label="Status Filter"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                options={statusOptions}
              />
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
            <DataGrid
              data={filteredJobSeekers}
              columns={columns}
              loading={loading}
              emptyMessage="No job seekers found"
            />
          </div>
        </main>
      </div>
      {toast && <Toast {...toast} />}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {liveMsg}
      </div>
    </div>
  );
}
