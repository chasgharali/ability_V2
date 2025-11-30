import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import '../Dashboard/Dashboard.css';
import './UserManagement.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { GridComponent, ColumnsDirective, ColumnDirective, Inject as GridInject, Page, Sort, Filter, Toolbar as GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu } from '@syncfusion/ej2-react-grids';
import { ButtonComponent } from '@syncfusion/ej2-react-buttons';
import { DialogComponent } from '@syncfusion/ej2-react-popups';
import { ToastComponent } from '@syncfusion/ej2-react-notifications';
import { DropDownListComponent } from '@syncfusion/ej2-react-dropdowns';
import { Input, Select } from '../UI/FormComponents';
import { listUsers, createUser, updateUser, deactivateUser, reactivateUser, deleteUserPermanently } from '../../services/users';
import { listBooths } from '../../services/booths';
import { listEvents } from '../../services/events';
import { JOB_CATEGORY_LIST } from '../../constants/options';

export default function UserManagement() {
  const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [roleFilter, setRoleFilter] = useState('');
  const [editingId, setEditingId] = useState(null);

  const [boothOptions, setBoothOptions] = useState([]);
  const [eventOptions, setEventOptions] = useState([]);
  // Accessibility live region message
  const [liveMsg, setLiveMsg] = useState('');
  // Password visibility toggles
  const [showPwd, setShowPwd] = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  // Syncfusion Toast ref
  const toastRef = useRef(null);
  // Delete confirmation dialog
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [rowPendingDelete, setRowPendingDelete] = useState(null);

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
      showToast('User deleted', 'Success');
      await loadUsers();
    } catch (e) {
      console.error('Delete failed', e);
      const msg = e?.response?.data?.message || 'Permanent delete is not available on the server yet.';
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

  const loadUsers = useCallback(async () => {
    try {
      setLoading(true);
      // Only pass role parameter if roleFilter has a value
      // When "All Roles" is selected, don't pass role parameter at all
      // The server will exclude JobSeekers by default
      // Fetch a large number of users (5000) to ensure all users are loaded
      // The grid will handle client-side pagination
      const params = { page: 1, limit: 5000 };
      if (roleFilter && roleFilter.trim()) {
        params.role = roleFilter.trim();
      }
      
      const res = await listUsers(params);
      // Server already excludes JobSeekers when no role filter is provided
      // But keep this filter as a safety measure
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
          booth: u.boothName || '-',
          assignedBoothId: u.assignedBooth || '',
          isActive: u.isActive,
          createdAt: u.createdAt,
        };
      }));
      // announce results for screen readers
      const count = (items || []).length;
      setLiveMsg(`${count} user${count === 1 ? '' : 's'} loaded`);
    } catch (e) {
      console.error('Failed to load users', e);
      showToast('Failed to load users', 'Error');
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

  // Grid template functions for custom column renders - using Syncfusion ButtonComponent
  const actionsTemplate = (props) => {
    const row = props;
    return (
      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <ButtonComponent 
          cssClass="e-outline e-primary e-small" 
          onClick={() => startEdit(row)}
          aria-label={`Edit ${row.firstName} ${row.lastName}`}
        >
          Edit
        </ButtonComponent>
        {row.isActive ? (
          <ButtonComponent 
            cssClass="e-outline e-primary e-small" 
            onClick={() => handleDeactivate(row)}
            aria-label={`Deactivate ${row.firstName} ${row.lastName}`}
          >
            Deactivate
          </ButtonComponent>
        ) : (
          <>
            <ButtonComponent 
              cssClass="e-primary e-small" 
              onClick={() => handleReactivate(row)}
              aria-label={`Reactivate ${row.firstName} ${row.lastName}`}
            >
              Reactivate
            </ButtonComponent>
            <ButtonComponent 
              cssClass="e-outline e-danger e-small" 
              onClick={() => handleDelete(row)}
              aria-label={`Delete ${row.firstName} ${row.lastName}`}
            >
              Delete
            </ButtonComponent>
          </>
        )}
      </div>
    );
  };

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
      showToast('User deactivated', 'Success');
      await loadUsers();
    } catch (e) {
      console.error('Deactivate failed', e);
      showToast('Failed to deactivate user', 'Error');
    }
  };

  const handleReactivate = async (row) => {
    try {
      await reactivateUser(row.id);
      showToast('User reactivated', 'Success');
      await loadUsers();
    } catch (e) {
      console.error('Reactivate failed', e);
      showToast('Failed to reactivate user', 'Error');
    }
  };

  const setField = (k, v) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Password validation for both create and edit modes
    if (form.password) {
      if (form.password.length < 8) {
        showToast('Password must be at least 8 characters', 'Error');
        return;
      }
      if (form.password !== form.confirmPassword) {
        showToast('Passwords do not match', 'Error');
        return;
      }
    } else if (!editingId) {
      // Password is required for new users
      showToast('Password is required', 'Error');
      return;
    }

    try {
      if (editingId) {
        const payload = {
          name: fullName || undefined,
          email: form.email || undefined,
          role: form.role || undefined,
        };
        // Include password if provided (admin can update password)
        if (form.password && form.password.trim()) {
          payload.password = form.password;
        }
        // Assign booth for Recruiter, BoothAdmin, Support, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)) {
          payload.assignedBooth = form.boothId || undefined;
        }
        await updateUser(editingId, payload);
        showToast('User updated', 'Success');
      } else {
        if (!form.role) {
          showToast('Please select a role', 'Error');
          return;
        }
        const payload = {
          name: fullName,
          email: form.email,
          password: form.password,
          role: form.role,
        };
        // Assign booth for Recruiter, BoothAdmin, Support, and Interpreter roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)) {
          if (!form.boothId) {
            showToast('Please select a booth for this role', 'Error');
            return;
          }
          payload.assignedBooth = form.boothId;
        }
        await createUser(payload);
        showToast('User created', 'Success');
      }
      setMode('list');
      setEditingId(null);
      setForm({ firstName: '', lastName: '', email: '', password: '', confirmPassword: '', role: '', boothId: '', field: '', eventId: '' });
      await loadUsers();
    } catch (e) {
      console.error('Save user failed', e);
      const msg = e?.response?.data?.message || 'Failed to save user';
      showToast(msg, 'Error', 5000);
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
                  <ButtonComponent cssClass="e-primary" onClick={() => setMode('create')} aria-label="Create new user">
                    Create User
                  </ButtonComponent>
                ) : (
                  <ButtonComponent cssClass="e-outline e-primary" onClick={() => { setMode('list'); setEditingId(null); }} aria-label="Back to user list">
                    Back to List
                  </ButtonComponent>
                )}
              </div>
            </div>

            {mode === 'list' ? (
              <div className="bm-grid-wrap">
                <div className="form-row" style={{ marginBottom: 12, paddingLeft: '20px' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {/* <label htmlFor="role-filter-dropdown" style={{ fontSize: '0.875rem', fontWeight: 500, color: '#111827', marginBottom: '4px' }}>
                      Role
                    </label> */}
                    <DropDownListComponent
                      id="role-filter-dropdown"
                      dataSource={[{ value: '', text: 'All Roles' }, ...roleOptionsNoJobSeeker.map(r => ({ value: r.value, text: r.label }))]}
                      fields={{ value: 'value', text: 'text' }}
                      value={roleFilter}
                      change={(e) => setRoleFilter(e.value || '')}
                      placeholder="Select Role"
                      cssClass="role-filter-dropdown"
                      popupHeight="300px"
                      width="200px"
                    />
                  </div>
                </div>
                <div aria-live="polite" className="sr-only">{liveMsg}</div>
                {loading && <div style={{ marginBottom: 12 }}>Loading…</div>}
                <GridComponent
                  dataSource={users}
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
                    <ColumnDirective 
                      field='firstName' 
                      headerText='First Name' 
                      width='150' 
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.firstName || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='lastName' 
                      headerText='Last Name' 
                      width='150' 
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.lastName || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='email' 
                      headerText='Email' 
                      width='250' 
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.email || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='role' 
                      headerText='Role' 
                      width='150' 
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.role || ''}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      field='booth' 
                      headerText='Booth' 
                      width='180' 
                      template={(props) => (
                        <div style={{ wordWrap: 'break-word', whiteSpace: 'normal', padding: '8px 0' }}>
                          {props.booth || '-'}
                        </div>
                      )}
                    />
                    <ColumnDirective 
                      headerText='Action' 
                      width='350' 
                      allowSorting={false} 
                      allowFiltering={false}
                      template={actionsTemplate}
                    />
                  </ColumnsDirective>
                  <GridInject services={[Page, Sort, Filter, GridToolbar, Selection, Resize, Reorder, ColumnChooser, ColumnMenu]} />
                </GridComponent>
              </div>
            ) : (
              <form className="account-form" onSubmit={handleSubmit} style={{ maxWidth: 720 }}>
                <Input label="First Name" value={form.firstName} onChange={(e) => setField('firstName', e.target.value)} required />
                <Input label="Last Name" value={form.lastName} onChange={(e) => setField('lastName', e.target.value)} required />
                <Select label="Select User Role" value={form.role} onChange={(e) => setField('role', e.target.value)} options={[{ value: '', label: 'Choose Role' }, ...roleOptionsAll]} required />
                <Input label="Email" type="email" value={form.email} onChange={(e) => setField('email', e.target.value)} required />
                <div className="password-field-container">
                  <Input label={editingId ? "New Password (leave blank to keep current)" : "Password"} type={showPwd ? 'text' : 'password'} value={form.password} onChange={(e) => setField('password', e.target.value)} required={!editingId} />
                  <ButtonComponent 
                    cssClass="e-outline e-primary e-small password-toggle-btn" 
                    aria-pressed={showPwd} 
                    aria-label={showPwd ? 'Hide password' : 'Show password'} 
                    onClick={() => setShowPwd(s => !s)}
                  >
                    {showPwd ? 'Hide' : 'Show'}
                  </ButtonComponent>
                </div>
                <div className="password-field-container">
                  <Input label={editingId ? "Confirm New Password (leave blank to keep current)" : "Confirm Password"} type={showConfirmPwd ? 'text' : 'password'} value={form.confirmPassword} onChange={(e) => setField('confirmPassword', e.target.value)} required={!editingId} />
                  <ButtonComponent 
                    cssClass="e-outline e-primary e-small password-toggle-btn" 
                    aria-pressed={showConfirmPwd} 
                    aria-label={showConfirmPwd ? 'Hide confirm password' : 'Show confirm password'} 
                    onClick={() => setShowConfirmPwd(s => !s)}
                  >
                    {showConfirmPwd ? 'Hide' : 'Show'}
                  </ButtonComponent>
                </div>
                <Select label="Select Booth" value={form.boothId} onChange={(e) => setField('boothId', e.target.value)} options={[{ value: '', label: 'Choose your Booth' }, ...boothOptions]} required={['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(form.role)} />
                {/* <Select label="Select Field" value={form.field} onChange={(e) => setField('field', e.target.value)} options={fieldOptions} /> */}
                <Select label="Select Event (Enable only for Event Admin)" value={form.eventId} onChange={(e) => setField('eventId', e.target.value)} options={[{ value: '', label: 'Select Event' }, ...eventOptions]} disabled={form.role !== 'AdminEvent'} />
                <ButtonComponent 
                  cssClass="e-primary" 
                  disabled={loading}
                  isPrimary={true}
                  onClick={(e) => { e.preventDefault(); handleSubmit(e); }}
                >
                  {editingId ? 'Update User' : 'Create User'}
                </ButtonComponent>
              </form>
            )}
          </div>
        </main>
      </div>

      <div className="mobile-overlay" aria-hidden="true" />

      {/* Delete confirm modal - Syncfusion DialogComponent */}
      <DialogComponent
        width="450px"
        isModal={true}
        showCloseIcon={true}
        visible={confirmOpen}
        header="Delete User"
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

      {/* Syncfusion ToastComponent */}
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
