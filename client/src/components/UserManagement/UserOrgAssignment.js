import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { listOrganizations, assignUserToOrg, removeUserFromOrg } from '../../services/organizations';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import axios from 'axios';

function authHeaders() {
  const token = localStorage.getItem('token');
  return { Authorization: `Bearer ${token}` };
}

/**
 * SuperAdmin page: assign / move users between organizations.
 */
export default function UserOrgAssignment() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [orgs, setOrgs] = useState([]);
  const [users, setUsers] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const [search, setSearch] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterOrg, setFilterOrg] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const LIMIT = 50;

  const [selectedUserId, setSelectedUserId] = useState('');
  const [targetOrgId, setTargetOrgId] = useState('');
  const [assigning, setAssigning] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'SuperAdmin') {
      navigate('/dashboard', { replace: true });
    }
  }, [user, navigate]);

  useEffect(() => {
    listOrganizations({ limit: 100 })
      .then(res => setOrgs(res.organizations || []))
      .catch(() => setOrgs([]));
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = {
        page,
        limit: LIMIT,
        role: filterRole || undefined,
        search: search.trim() || undefined,
        organizationId: filterOrg || undefined
      };
      const res = await axios.get('/api/users', { params, headers: authHeaders() });
      setUsers(res.data.users || []);
      setTotal(res.data.pagination?.totalCount || 0);
      setTotalPages(res.data.pagination?.totalPages || 1);
    } catch (err) {
      setError('Failed to load users');
    } finally {
      setLoading(false);
    }
  }, [page, search, filterRole, filterOrg]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleAssign = async () => {
    if (!selectedUserId || !targetOrgId) {
      setError('Please select a user and a target organization');
      return;
    }
    setAssigning(true);
    setError('');
    setSuccess('');
    try {
      await assignUserToOrg(targetOrgId, selectedUserId);
      setSuccess(`User successfully assigned to ${orgs.find(o => o._id === targetOrgId)?.name || 'organization'}`);
      setSelectedUserId('');
      setTargetOrgId('');
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign user');
    } finally {
      setAssigning(false);
    }
  };

  const handleRemoveFromOrg = async (userId, orgId, userName) => {
    if (!window.confirm(`Remove ${userName} from their organization? They will become unassigned.`)) return;
    try {
      await removeUserFromOrg(orgId, userId);
      setSuccess(`${userName} removed from organization`);
      fetchUsers();
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to remove user');
    }
  };

  const ORG_SCOPED_ROLES = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport'];

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="org-users" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="dashboard-content">
            <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
              <h1 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: 24 }}>User Organization Assignment</h1>

              {/* Quick Assign Panel */}
              <div style={{ background: '#f8f9fa', border: '1px solid #dee2e6', borderRadius: 10, padding: 20, marginBottom: 28 }}>
                <h2 style={{ fontSize: '1.1rem', fontWeight: 600, marginBottom: 16 }}>Assign / Move User to Organization</h2>
                <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>User</label>
                    <select
                      value={selectedUserId}
                      onChange={e => setSelectedUserId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                    >
                      <option value="">-- Select user --</option>
                      {users
                        .filter(u => ORG_SCOPED_ROLES.includes(u.role))
                        .map(u => (
                          <option key={u._id} value={u._id}>
                            {u.name} ({u.email}) — {u.role}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div style={{ flex: '1 1 200px' }}>
                    <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, marginBottom: 4 }}>Target Organization</label>
                    <select
                      value={targetOrgId}
                      onChange={e => setTargetOrgId(e.target.value)}
                      style={{ width: '100%', padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                    >
                      <option value="">-- Select organization --</option>
                      {orgs.map(o => (
                        <option key={o._id} value={o._id}>{o.name}</option>
                      ))}
                    </select>
                  </div>

                  <button
                    onClick={handleAssign}
                    disabled={assigning || !selectedUserId || !targetOrgId}
                    style={{
                      padding: '9px 22px',
                      background: '#007bff',
                      color: '#fff',
                      border: 'none',
                      borderRadius: 6,
                      cursor: assigning ? 'not-allowed' : 'pointer',
                      fontWeight: 600
                    }}
                  >
                    {assigning ? 'Assigning...' : 'Assign'}
                  </button>
                </div>
              </div>

              {error && (
                <div style={{ background: '#fee', color: '#c00', padding: '10px 16px', borderRadius: 6, marginBottom: 16 }} role="alert">
                  {error}
                </div>
              )}
              {success && (
                <div style={{ background: '#efe', color: '#080', padding: '10px 16px', borderRadius: 6, marginBottom: 16 }} role="status">
                  {success}
                </div>
              )}

              {/* Filters */}
              <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
                <input
                  type="search"
                  placeholder="Search users..."
                  value={search}
                  onChange={e => { setSearch(e.target.value); setPage(1); }}
                  style={{ flex: '1 1 200px', padding: '8px 12px', border: '1px solid #ccc', borderRadius: 6 }}
                  aria-label="Search users"
                />
                <select
                  value={filterRole}
                  onChange={e => { setFilterRole(e.target.value); setPage(1); }}
                  style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                  aria-label="Filter by role"
                >
                  <option value="">All roles</option>
                  {ORG_SCOPED_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                </select>
                <select
                  value={filterOrg}
                  onChange={e => { setFilterOrg(e.target.value); setPage(1); }}
                  style={{ padding: '8px 10px', border: '1px solid #ccc', borderRadius: 6 }}
                  aria-label="Filter by organization"
                >
                  <option value="">All organizations</option>
                  <option value="unassigned">Unassigned</option>
                  {orgs.map(o => <option key={o._id} value={o._id}>{o.name}</option>)}
                </select>
                <span style={{ color: '#666', alignSelf: 'center', fontSize: '0.9rem' }}>{total} users</span>
              </div>

              {/* Users Table */}
              {loading ? (
                <p style={{ textAlign: 'center', color: '#666' }}>Loading users...</p>
              ) : (
                <div className="org-users-table-scroll" data-dual-scroll-target="true" style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }}>
                    <thead>
                      <tr style={{ background: '#f5f5f5', borderBottom: '2px solid #ddd' }}>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Name</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Email</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Role</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Organization</th>
                        <th style={{ padding: '10px 12px', textAlign: 'left' }}>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {users.length === 0 ? (
                        <tr>
                          <td colSpan={5} style={{ textAlign: 'center', padding: 24, color: '#888' }}>No users found</td>
                        </tr>
                      ) : users.map(u => {
                        const userOrg = orgs.find(o => o._id === (u.organizationId?._id || u.organizationId));
                        return (
                          <tr key={u._id} style={{ borderBottom: '1px solid #eee' }}>
                            <td style={{ padding: '10px 12px' }}>{u.name}</td>
                            <td style={{ padding: '10px 12px', color: '#555' }}>{u.email}</td>
                            <td style={{ padding: '10px 12px' }}>{u.role}</td>
                            <td style={{ padding: '10px 12px' }}>
                              {userOrg ? (
                                <span style={{ background: '#e8f4fd', color: '#0066cc', padding: '3px 10px', borderRadius: 12, fontSize: '0.82rem' }}>
                                  {userOrg.name}
                                </span>
                              ) : (
                                <span style={{ color: '#aaa', fontSize: '0.82rem' }}>Unassigned</span>
                              )}
                            </td>
                            <td style={{ padding: '10px 12px' }}>
                              {ORG_SCOPED_ROLES.includes(u.role) && userOrg && (
                                <button
                                  onClick={() => handleRemoveFromOrg(u._id, userOrg._id, u.name)}
                                  style={{
                                    background: '#dc3545',
                                    color: '#fff',
                                    border: 'none',
                                    borderRadius: 4,
                                    padding: '4px 10px',
                                    fontSize: '0.8rem',
                                    cursor: 'pointer'
                                  }}
                                >
                                  Remove from Org
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Pagination */}
              {totalPages > 1 && (
                <div style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', marginTop: 20 }}>
                  <button disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</button>
                  <span>Page {page} of {totalPages}</span>
                  <button disabled={page === totalPages} onClick={() => setPage(p => p + 1)}>Next</button>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
