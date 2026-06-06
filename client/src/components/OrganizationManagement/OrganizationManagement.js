import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import {
  listOrganizations,
  deleteOrganization,
  getOrgDashboardStats
} from '../../services/organizations';
import OrganizationForm from './OrganizationForm';
import OrgDashboardDropdown from './OrgDashboardDropdown';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './OrganizationManagement.css';

export default function OrganizationManagement() {
  const { user, startImpersonation } = useAuth();
  const navigate = useNavigate();

  const [organizations, setOrganizations] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 20;

  const [showForm, setShowForm] = useState(false);
  const [editOrg, setEditOrg] = useState(null);
  const [selectedOrg, setSelectedOrg] = useState(null);
  const [showStats, setShowStats] = useState(false);
  const [accessingOrgId, setAccessingOrgId] = useState(null);

  const isSuperAdmin = user?.role === 'SuperAdmin';

  // Redirect if not authorized
  useEffect(() => {
    if (user && user.role !== 'SuperAdmin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  const fetchOrganizations = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await listOrganizations({ page, limit: LIMIT, search: search || undefined });
      setOrganizations(res.organizations || []);
      setTotal(res.total || 0);
      setTotalPages(res.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load organizations');
    } finally {
      setLoading(false);
    }
  }, [page, search]);

  useEffect(() => {
    fetchOrganizations();
  }, [fetchOrganizations]);

  const handleDelete = async (org) => {
    if (!window.confirm(`Delete organization "${org.name}"? This cannot be undone.`)) return;
    try {
      await deleteOrganization(org._id);
      fetchOrganizations();
    } catch (err) {
      alert(err.response?.data?.error || 'Failed to delete organization');
    }
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditOrg(null);
    fetchOrganizations();
  };

  const handleViewStats = async (org) => {
    try {
      const data = await getOrgDashboardStats(org._id);
      setSelectedOrg({ ...org, ...data });
      setShowStats(true);
    } catch (err) {
      alert('Failed to load stats');
    }
  };

  const orgHasAdmin = (org) => (org?.stats?.adminCount || 0) > 0;

  const handleAccessOrganization = async (org) => {
    if (!isSuperAdmin || !org?._id || accessingOrgId) return;
    if (!orgHasAdmin(org)) {
      alert('You cannot access this organization until an organization Admin user has been created for it.');
      return;
    }
    setAccessingOrgId(org._id);
    try {
      const result = await startImpersonation(org._id);
      if (!result?.success) {
        alert(result?.error || 'Failed to access organization');
        return;
      }
      navigate('/dashboard');
    } finally {
      setAccessingOrgId(null);
    }
  };

  const pageContent = showForm ? (
    <OrganizationForm
      org={editOrg}
      onSave={handleFormSave}
      onCancel={() => { setShowForm(false); setEditOrg(null); }}
    />
  ) : (
    <div className="org-management">
      <div className="org-management-header">
        <h1>Organization Management</h1>
        {isSuperAdmin && (
          <button className="btn btn-primary" onClick={() => { setEditOrg(null); setShowForm(true); }}>
            + New Organization
          </button>
        )}
      </div>

      {isSuperAdmin && (
        <div className="org-access-instruction" role="note">
          <strong>Note:</strong> You cannot access an organization until an organization Admin user has been created for it. The <em>Access</em> button stays disabled until an Admin is added.
        </div>
      )}

      {/* Search */}
      <div className="org-search-bar">
        <input
          type="search"
          placeholder="Search organizations..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="org-search-input"
          aria-label="Search organizations"
        />
        <span className="org-count">{total} organization{total !== 1 ? 's' : ''}</span>
      </div>

      {error && <div className="org-error" role="alert">{error}</div>}

      {loading ? (
        <div className="org-loading">Loading organizations...</div>
      ) : organizations.length === 0 ? (
        <div className="org-empty">No organizations found.</div>
      ) : (
        <div className="org-grid">
          {organizations.map(org => (
            <div key={org._id} className={`org-card ${!org.isActive ? 'org-card--inactive' : ''}`}>
              <div className="org-card-header">
                {org.logoUrl ? (
                  <img src={org.logoUrl} alt={org.logoAltText || org.name} className="org-logo" />
                ) : (
                  <div className="org-logo-placeholder">{org.name[0]?.toUpperCase()}</div>
                )}
                <div className="org-card-title">
                  <h2>{org.name}</h2>
                  <span className="org-slug">/{org.slug}</span>
                  {!org.isActive && <span className="org-badge org-badge--inactive">Inactive</span>}
                </div>
              </div>

              {org.description && (
                <p className="org-description">{org.description}</p>
              )}

              {org.stats && (
                <div className="org-stats-row">
                  <span><strong>{org.stats.totalEvents}</strong> Events</span>
                  <span><strong>{org.stats.totalBooths}</strong> Booths</span>
                  <span><strong>{org.stats.totalUsers}</strong> Users</span>
                  <span><strong>{org.stats.totalRegisteredJobSeekers}</strong> Job Seekers</span>
                </div>
              )}

              {isSuperAdmin && org.limits && (
                <div className="org-limits">
                  <span>
                    Limits: {org.limits.maxEvents || '∞'} events / {org.limits.maxRecruiters || '∞'} recruiters / {org.limits.maxUsers || org.limits.maxRecruiters || '∞'} users / {org.limits.maxJobSeekers || '∞'} job seekers / {org.limits.maxBooths || '∞'} booths
                  </span>
                </div>
              )}

              {isSuperAdmin && !orgHasAdmin(org) && (
                <div className="org-no-admin-note" role="note">
                  No organization Admin user has been created yet. You cannot access this organization until an Admin is added.
                </div>
              )}

              <div className="org-card-actions">
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => handleViewStats(org)}
                >
                  View Stats
                </button>
                {isSuperAdmin && (
                  <button
                    className="btn btn-sm btn-primary"
                    onClick={() => handleAccessOrganization(org)}
                    disabled={accessingOrgId === org._id || !orgHasAdmin(org)}
                    title={!orgHasAdmin(org) ? 'Create an organization Admin user before accessing this organization' : undefined}
                  >
                    {accessingOrgId === org._id ? 'Accessing...' : 'Access'}
                  </button>
                )}
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => { setEditOrg(org); setShowForm(true); }}
                >
                  Edit
                </button>
                {isSuperAdmin && org.slug !== 'abilityjobfair' && (
                  <button
                    className="btn btn-sm btn-danger"
                    onClick={() => handleDelete(org)}
                  >
                    Delete
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="org-pagination">
          <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
        </div>
      )}

      {/* Stats Modal */}
      {showStats && selectedOrg && (
        <OrgDashboardDropdown
          org={selectedOrg}
          onClose={() => { setShowStats(false); setSelectedOrg(null); }}
        />
      )}
    </div>
  );

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="organizations" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            {pageContent}
          </div>
        </main>
      </div>
    </div>
  );
}
