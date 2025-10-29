import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './JobSeekerManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select } from '../UI/FormComponents';
import Toast from '../UI/Toast';
import { listUsers, updateUser, deactivateUser, reactivateUser, deleteUserPermanently } from '../../services/users';
import { 
  EXPERIENCE_LEVEL_LIST, 
  EDUCATION_LEVEL_LIST, 
  JOB_CATEGORY_LIST,
  WORK_AUTHORIZE_LIST,
  MILITARY_EXPERIENCE_LIST,
  SECURITY_CLEARANCE_LIST
} from '../../constants/options';

export default function JobSeekerManagement() {
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
          {/* Basic Information */}
          <div className="profile-section">
            <h3>Basic Information</h3>
            <div className="profile-grid">
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
              <div className="profile-field">
                <label>Status:</label>
                <span className={`status-badge ${js.isActive ? 'active' : 'inactive'}`}>
                  {js.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="profile-field">
                <label>Email Verified:</label>
                <span className={`status-badge ${js.emailVerified ? 'verified' : 'unverified'}`}>
                  {js.emailVerified ? 'Yes' : 'No'}
                </span>
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

          {/* Resume */}
          {js.resumeUrl && (
            <div className="profile-section">
              <h3>Resume</h3>
              <div className="profile-field">
                <a 
                  href={js.resumeUrl} 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="btn-primary"
                >
                  View Resume
                </a>
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
