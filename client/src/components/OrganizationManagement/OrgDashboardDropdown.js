import React, { useState, useEffect } from 'react';
import { listOrganizations, getOrgDashboardStats } from '../../services/organizations';
import { useAuth } from '../../contexts/AuthContext';

/**
 * SuperAdmin: dropdown to select an org and preview its dashboard stats.
 * Also used as a stats modal when passed `org` prop directly.
 */
export default function OrgDashboardDropdown({ org: initialOrg, onClose }) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  const [orgs, setOrgs] = useState([]);
  const [selectedOrgId, setSelectedOrgId] = useState(initialOrg?._id || '');
  const [stats, setStats] = useState(null);
  const [orgInfo, setOrgInfo] = useState(initialOrg || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load org list for dropdown (SuperAdmin only)
  useEffect(() => {
    if (!isSuperAdmin) return;
    listOrganizations({ limit: 100 })
      .then(res => setOrgs(res.organizations || []))
      .catch(() => setOrgs([]));
  }, [isSuperAdmin]);

  // Load stats when org selected
  useEffect(() => {
    if (!selectedOrgId) { setStats(null); setOrgInfo(null); return; }
    if (initialOrg && initialOrg._id === selectedOrgId && initialOrg.stats) {
      setStats(initialOrg.stats);
      setOrgInfo(initialOrg);
      return;
    }
    setLoading(true);
    setError('');
    getOrgDashboardStats(selectedOrgId)
      .then(data => {
        setStats(data.stats);
        setOrgInfo(data.organization);
      })
      .catch(() => setError('Failed to load stats'))
      .finally(() => setLoading(false));
  }, [selectedOrgId, initialOrg]);

  return (
    <div className="org-stats-modal-overlay" role="dialog" aria-modal="true" aria-label="Organization Statistics">
      <div className="org-stats-modal">
        <div className="org-stats-modal-header">
          <h2>{isSuperAdmin ? 'Organization Dashboard' : `${orgInfo?.name || ''} Dashboard`}</h2>
          {onClose && (
            <button className="org-stats-close" onClick={onClose} aria-label="Close">×</button>
          )}
        </div>

        {isSuperAdmin && (
          <div className="org-stats-selector">
            <label htmlFor="org-select">Select Organization</label>
            <select
              id="org-select"
              value={selectedOrgId}
              onChange={e => setSelectedOrgId(e.target.value)}
              className="form-input"
            >
              <option value="">-- Select an organization --</option>
              {orgs.map(o => (
                <option key={o._id} value={o._id}>{o.name}</option>
              ))}
            </select>
          </div>
        )}

        {error && <div className="org-error">{error}</div>}

        {loading && <div className="org-loading">Loading stats...</div>}

        {stats && orgInfo && (
          <div className="org-stats-content">
            <div className="org-stats-org-header">
              {orgInfo.logoUrl && (
                <img src={orgInfo.logoUrl} alt={orgInfo.logoAltText || orgInfo.name} className="org-stats-logo" />
              )}
              <div>
                <h3>{orgInfo.name}</h3>
                <span className="org-slug">/{orgInfo.slug}</span>
                <span className={`org-badge ${orgInfo.isActive ? 'org-badge--active' : 'org-badge--inactive'}`}>
                  {orgInfo.isActive ? 'Active' : 'Inactive'}
                </span>
              </div>
            </div>

            <div className="org-stats-grid">
              <div className="org-stat-card">
                <div className="org-stat-value">{stats.totalEvents}</div>
                <div className="org-stat-label">Events</div>
              </div>
              <div className="org-stat-card">
                <div className="org-stat-value">{stats.totalBooths}</div>
                <div className="org-stat-label">Booths</div>
              </div>
              <div className="org-stat-card">
                <div className="org-stat-value">{stats.totalUsers}</div>
                <div className="org-stat-label">Active Users</div>
              </div>
              <div className="org-stat-card">
                <div className="org-stat-value">{stats.recruiterCount}</div>
                <div className="org-stat-label">Recruiters</div>
              </div>
              <div className="org-stat-card">
                <div className="org-stat-value">{stats.totalRegisteredJobSeekers}</div>
                <div className="org-stat-label">Registered Job Seekers</div>
              </div>
            </div>

            {stats.roleBreakdown && (
              <div className="org-role-breakdown">
                <h4>Users by Role</h4>
                <div className="org-role-grid">
                  {Object.entries(stats.roleBreakdown).map(([role, count]) => (
                    <div key={role} className="org-role-item">
                      <span className="org-role-name">{role}</span>
                      <span className="org-role-count">{count}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {orgInfo.limits && (
              <div className="org-limits-display">
                <h4>Limits</h4>
                <div className="org-limits-grid">
                  <div>
                    <span>Max Events</span>
                    <strong>{orgInfo.limits.maxEvents || 'Unlimited'}</strong>
                  </div>
                  <div>
                    <span>Max Users</span>
                    <strong>{orgInfo.limits.maxUsers || orgInfo.limits.maxRecruiters || 'Unlimited'}</strong>
                  </div>
                  <div>
                    <span>Max Job Seekers</span>
                    <strong>{orgInfo.limits.maxJobSeekers || 'Unlimited'}</strong>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
