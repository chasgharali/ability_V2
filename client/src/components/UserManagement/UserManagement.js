import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { Input, Select } from '../UI/FormComponents';
import Toast from '../UI/Toast';
import { listUsers, createUser, updateUser, deactivateUser, reactivateUser, deleteUserPermanently } from '../../services/users';
import { listBooths } from '../../services/booths';
import { listEvents } from '../../services/events';
import { JOB_CATEGORY_LIST } from '../../constants/options';

export default function UserManagement() {
  const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);
  const [editingId, setEditingId] = useState(null);

  const [boothOptions, setBoothOptions] = useState([]);
  const [eventOptions, setEventOptions] = useState([]);
  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');
  // Password visibility toggles
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);

  const roleOptionsAll = useMemo(() => [
    { value: 'Admin', label: 'Admin' },
    { value: 'AdminEvent', label: 'Event Admin' },
    { value: 'BoothAdmin', label: 'Booth Admin' },
    { value: 'Recruiter', label: 'Recruiter' },
    { value: 'Interpreter', label: 'Interpreter' },
    { value: 'GlobalInterpreter', label: 'Global Interpreter' },
    { value: 'Support', label: 'Support' },
    { value: 'GlobalSupport', label: 'Global Support' },
    { value: 'JobSeeker', label: 'Job Seeker' },
  ], []);
  // Hide JobSeeker from filter and create lists
  const roleOptionsNoJobSeeker = useMemo(() => roleOptionsAll.filter(r => r.value !== 'JobSeeker'), [roleOptionsAll]);

  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: '',
    boothId: '', // maps to assignedBooth on API
    field: '',
    eventId: '',
  });

  // Build Field options from centralized constants
  const fieldOptions = useMemo(
    () => [
      { value: '', label: 'Choose your Field' },
      ...JOB_CATEGORY_LIST.map(item => ({ value: item.value, label: item.name }))
    ],
    []
  );

  const fullName = `${form.firstName} ${form.lastName}`.trim();

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
      showToast('User deleted', 'success');
      await loadUsers();
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Permanent delete is not available on the server yet.';
      showToast(msg, 'error');
    }
  };

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      const res = await listUsers({ page: 1, limit: 100, role: roleFilter || '' });
      const items = (res?.users || []).filter(u => u.role !== 'JobSeeker');
      setUsers(items.map(u => {
        const parts = (u.name || '').trim().split(/\s+/);
        const firstName = parts[0] || '';
        const lastName = parts.slice(1).join(' ') || '';
        return {
          id: u._id,
          firstName,
          lastName,
          email: u.email,
          role: u.role,
          field: u.field || '',
          booth: u.boothName || '',
          assignedBoothId: u.assignedBooth || '',
          event: u.eventName || '',
          isActive: u.isActive,
          createdAt: u.createdAt,
        };
      }));
      // announce results for screen readers
      const count = (items || []).length;
      setLiveMsg(`${count} user${count === 1 ? '' : 's'} loaded`);
    } catch (e) {
      console.error('Failed to load users', e);
      showToast('Failed to load users', 'error');
    } finally { setLoading(false); }
  }, [roleFilter]);

  const loadBoothsAndEvents = async () => {
    try {
      const [boothRes, eventRes] = await Promise.all([
        listBooths({ page: 1, limit: 200 }),
        listEvents({ page: 1, limit: 200 }),
      ]);
      setBoothOptions((boothRes?.booths || []).map(b => ({ value: b._id, label: b.name })));
      setEventOptions((eventRes?.events || []).map(e => ({ value: e._id, label: e.name })));
    } catch (e) {
      // Non-blocking
    }
  };

  useEffect(() => { loadUsers(); }, [loadUsers]);
  useEffect(() => { if (mode !== 'list') loadBoothsAndEvents(); }, [mode]);

  const gridColumns = [
    { key: 'firstName', label: 'First Name' },
    { key: 'lastName', label: 'Last Name' },
    { key: 'email', label: 'Email' },
    { key: 'role', label: 'Role' },
    { key: 'field', label: 'Field' },
    { key: 'booth', label: 'Booth' },
    { key: 'event', label: 'Event' },
    { key: 'actions', label: 'Action', render: (row) => (
      <div className="ajf-grid-actions">
        <button className="ajf-btn ajf-btn-outline" onClick={() => startEdit(row)} aria-label={`Edit ${row.firstName} ${row.lastName}`}>Edit</button>
        {row.isActive ? (
          <button className="ajf-btn ajf-btn-outline" onClick={() => handleDeactivate(row)} aria-label={`Deactivate ${row.firstName} ${row.lastName}`}>Deactivate</button>
        ) : (
          <>
            <button className="ajf-btn ajf-btn-dark" onClick={() => handleReactivate(row)} aria-label={`Reactivate ${row.firstName} ${row.lastName}`}>Reactivate</button>
            <button className="ajf-btn ajf-btn-danger" onClick={() => handleDelete(row)} aria-label={`Delete ${row.firstName} ${row.lastName}`}>Delete</button>
          </>
        )}
      </div>
    ) }
  ];

  const startEdit = (row) => {
    const firstName = row.firstName || '';
    const lastName = row.lastName || '';
    setForm(prev => ({
      ...prev,
      firstName,
      lastName,
      email: row.email || '',
      role: row.role || '',
      boothId: row.assignedBoothId || '',
      field: '',
      eventId: '',
      password: '',
      confirmPassword: '',
    }));
    setEditingId(row.id);
    setMode('create'); // reuse the same form UI
  };

  const handleDeactivate = async (row) => {
    try {
      await deactivateUser(row.id);
      showToast('User deactivated', 'success');
      await loadUsers();
    } catch (e) {
      console.error('Deactivate failed', e);
      showToast('Failed to deactivate user', 'error');
    }
  };

  const handleReactivate = async (row) => {
    try {
      await reactivateUser(row.id);
      showToast('User reactivated', 'success');
      await loadUsers();
    } catch (e) {
      console.error('Reactivate failed', e);
      showToast('Failed to reactivate user', 'error');
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!editingId) {
      if (!form.password || form.password.length < 8) {
        showToast('Password must be at least 8 characters', 'error');
        return;
      }
      if (form.password !== form.confirmPassword) {
        showToast('Passwords do not match', 'error');
        return;
      }
    }

    try {
      if (editingId) {
        const payload = {
          name: fullName || undefined,
          email: form.email || undefined,
          role: form.role || undefined,
        };
        // Assign booth for Recruiter, BoothAdmin, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Interpreter'].includes(form.role)) {
          payload.assignedBooth = form.boothId || undefined;
        }
        await updateUser(editingId, payload);
        showToast('User updated', 'success');
      } else {
        if (!form.role) {
          showToast('Please select a role', 'error');
          return;
        }
        const payload = {
          name: fullName,
          email: form.email,
          password: form.password,
          role: form.role,
        };
        // Assign booth for Recruiter, BoothAdmin, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Interpreter'].includes(form.role)) {
          if (!form.boothId) {
            showToast('Please select a booth for this role', 'error');
            return;
          }
          payload.assignedBooth = form.boothId;
        }
        await createUser(payload);
        showToast('User created', 'success');
      }
      setMode('list');
      setEditingId(null);
      setForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: '', boothId: '', field: '', eventId: '' });
      await loadUsers();
    } catch (e) {
      console.error('Save user failed', e);
      const msg = e?.response?.data?.message || 'Failed to save user';
      showToast(msg, 'error', 5000);
    }
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="users" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>User Management</h2>
              <div className="bm-header-actions">
                {mode === 'list' ? (
                  <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => setMode('create')} aria-label="Create new user">Create User</button>
                ) : (
                  <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => { setMode('list'); setEditingId(null); }} aria-label="Back to user list">Back to List</button>
                )}
              </div>
            </div>

            {mode === 'list' ? (
              <div className="bm-grid-wrap">
                <div className="form-row" style={{ marginBottom: 12 }}>
                  <Select label="Role" value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)} options={[{ value: '', label: 'All Roles' }, ...roleOptionsNoJobSeeker]} />
                </div>
                <div aria-live="polite" className="sr-only">{liveMsg}</div>
                <DataGrid data={users} columns={gridColumns} selectable searchable sortable aria-label="Users table" />
                {loading && <div style={{ marginTop: 12 }}>Loading…</div>}
              </div>
            ) : (
              <form className="account-form" onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
                <Input label="First Name" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} required />
                <Input label="Last Name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} required />
                <Select label="Select User Role" value={form.role} onChange={(e) => setField('role', e.target.value)} options={[{ value: '', label: 'Choose Role' }, ...roleOptionsNoJobSeeker]} required />
                <Input label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
                {!editingId && (
                  <>
                    <div className="password-field-container">
                      <Input label="Password" type={showPwd ? 'text' : 'password'} value={form.password} onChange={(e) => setField('password', e.target.value)} required />
                      <button type="button" className="ajf-btn ajf-btn-outline password-toggle-btn" aria-pressed={showPwd} aria-label={showPwd ? 'Hide password' : 'Show password'} onClick={() => setShowPwd(s => !s)}> {showPwd ? 'Hide' : 'Show'} </button>
                    </div>
                    <div className="password-field-container">
                      <Input label="Confirm Password" type={showConfirmPwd ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required />
                      <button type="button" className="ajf-btn ajf-btn-outline password-toggle-btn" aria-pressed={showConfirmPwd} aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'} onClick={() => setShowConfirmPwd(s => !s)}> {showConfirmPwd ? 'Hide' : 'Show'} </button>
                    </div>
                  </>
                )}
                <Select label="Select Booth" value={form.boothId} onChange={(e) => setField('boothId', e.target.value)} options={[{ value: '', label: 'Choose your Booth' }, ...boothOptions]} required={['Recruiter', 'BoothAdmin', 'Interpreter'].includes(form.role)} />
                <Select label="Select Field" value={form.field} onChange={(e) => setField('field', e.target.value)} options={fieldOptions} />
                <Select label="Select Event (Enable only for Event Admin)" value={form.eventId} onChange={(e) => setField('eventId', e.target.value)} options={[{ value: '', label: 'Select Event' }, ...eventOptions]} disabled={form.role !== 'AdminEvent'} />
                <button type="submit" className="dashboard-button" disabled={loading}>{editingId ? 'Update User' : 'Create User'}</button>
              </form>
            )}
          </div>
        </main>
      </div>

      {toast && (
        <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} autoFocusClose={toast.type === 'error'} />
      )}

      <div className="mobile-overlay" aria-hidden="true" />
    </div>
  );
}
