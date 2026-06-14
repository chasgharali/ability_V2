import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import CopyToOrganizationModal from '../UI/CopyToOrganizationModal';
import roleMessagesAPI from '../../services/roleMessages';
import { listOrganizations } from '../../services/organizations';
import { MdAdd, MdEdit, MdDelete, MdSave, MdCancel, MdDone, MdClear } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './RoleMessageManagement.css';

const ROLES = ['JobSeeker', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'Admin'];
const SCREENS = {
  'JobSeeker': ['my-account', 'delete-account', 'edit-profile', 'view-profile', 'upcoming-events', 'event-registration', 'registered-events', 'registered-event-detail', 'survey', 'resume-builder'],
  'Recruiter': ['dashboard', 'meeting-queue', 'meeting-records', 'jobseeker-interests'],
  'Interpreter': ['dashboard', 'troubleshooting', 'instructions'],
  'GlobalInterpreter': ['dashboard', 'troubleshooting', 'instructions'],
  'Support': ['dashboard', 'analytics', 'troubleshooting', 'instructions'],
  'GlobalSupport': ['dashboard', 'analytics', 'troubleshooting', 'instructions'],
  'Admin': [
    'dashboard',
    'event-management',
    'event-create-edit-page',
    'booth-management',
    'create-edit-page',
    'employer-page-builder',
    'user-management',
    'jobseeker-management',
    'meeting-records',
    'jobseeker-interests',
    'jobseeker-survey',
    'jobseeker-qualifications',
    'interpreter-categories',
    'branding',
    'terms-conditions',
    'notes',
    'analytics',
    'troubleshooting',
    'instructions'
  ]
};
const canManageRole = (currentUserRole, targetRole) => {
  if (currentUserRole === 'SuperAdmin') return true;
  // Only SuperAdmin manages JobSeeker instructions
  if (targetRole === 'JobSeeker') return false;
  // Managers can't manage instructions for their own role
  if (targetRole === currentUserRole) return false;
  return true;
};
const ALL_ORGANIZATIONS = '';

export default function RoleMessageManagement() {
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filterRole, setFilterRole] = useState('all');
  const [filterScreen, setFilterScreen] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState({ content: '', description: '' });
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [copyModalOpen, setCopyModalOpen] = useState(false);
  const [selectedMessageId, setSelectedMessageId] = useState(null);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ role: 'Recruiter', screen: 'dashboard', content: '', description: '', organizationId: ALL_ORGANIZATIONS });
  const [filterOrganizationId, setFilterOrganizationId] = useState(ALL_ORGANIZATIONS);
  const [isScrolledX, setIsScrolledX] = useState(false);
  const listRef = useRef(null);
  const { user } = useAuth();
  const { show: showToast } = useToast();
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const availableRoles = ROLES.filter((role) => canManageRole(user?.role, role));

  useEffect(() => {
    if (user && ['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role)) {
      fetchMessages();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filterOrganizationId]);

  useEffect(() => {
    const fetchOrganizations = async () => {
      if (user?.role !== 'SuperAdmin') return;
      try {
        const response = await listOrganizations({ limit: 100, isActive: 'true' });
        setOrganizations(response.organizations || []);
      } catch (err) {
        console.error('Error fetching organizations:', err);
      }
    };
    fetchOrganizations();
  }, [user?.role]);

  useEffect(() => {
    if (!availableRoles.length) return;

    if (!availableRoles.includes(createForm.role)) {
      const fallbackRole = availableRoles[0];
      const fallbackScreen = getAvailableScreens(fallbackRole)[0] || '';
      setCreateForm((prev) => ({ ...prev, role: fallbackRole, screen: fallbackScreen }));
    }
  }, [availableRoles, createForm.role]);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;

    const handleScroll = () => {
      setIsScrolledX(container.scrollLeft > 0);
    };

    handleScroll();
    container.addEventListener('scroll', handleScroll, { passive: true });
    return () => container.removeEventListener('scroll', handleScroll);
  }, [messages, filterRole, filterScreen, loading]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      if (user?.role === 'Admin') {
        await roleMessagesAPI.syncDefaults();
      }
      const orgParam = isSuperAdmin ? (filterOrganizationId || undefined) : undefined;
      const response = await roleMessagesAPI.getAllMessages(orgParam);
      
      if (response && response.success !== false) {
        const messagesArray = response.messages || [];
        setMessages(messagesArray);
      } else {
        setMessages([]);
        if (response && response.error) {
          setError(response.error);
        }
      }
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to fetch role messages';
      setError(errorMsg);
      console.error('Error fetching role messages:', err);
      setMessages([]);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (message) => {
    setEditingId(message._id);
    setEditForm({ content: message.content, description: message.description || '' });
    showToast('Editing mode enabled. Make your changes and click Save.', { type: 'info', duration: 3000 });
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditForm({ content: '', description: '' });
    showToast('Edit cancelled', { type: 'info', duration: 2000 });
  };

  const handleSaveEdit = async () => {
    if (!editForm.content.trim()) {
      showToast('Content cannot be empty', { type: 'error', duration: 3000 });
      return;
    }
    
    try {
      setSaving(true);
      await roleMessagesAPI.updateMessage(editingId, editForm.content, editForm.description);
      await fetchMessages();
      setEditingId(null);
      setEditForm({ content: '', description: '' });
      showToast('Message updated successfully!', { type: 'success', duration: 3000 });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to update message';
      setError(errorMsg);
      showToast(errorMsg, { type: 'error', duration: 4000 });
      console.error('Error updating message:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id) => {
    const message = messages.find(m => m._id === id);
    const confirmMsg = message 
      ? `Are you sure you want to delete the message for ${message.role} / ${message.screen}?`
      : 'Are you sure you want to delete this message?';
    
    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      setDeletingId(id);
      await roleMessagesAPI.deleteMessage(id);
      await fetchMessages();
      showToast('Message deleted successfully!', { type: 'success', duration: 3000 });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to delete message';
      setError(errorMsg);
      showToast(errorMsg, { type: 'error', duration: 4000 });
      console.error('Error deleting message:', err);
    } finally {
      setDeletingId(null);
    }
  };

  const handleCreate = async () => {
    if (!canManageRole(user?.role, createForm.role)) {
      showToast('Only Super Admin can manage JobSeeker instructions', { type: 'error', duration: 4000 });
      return;
    }

    if (!createForm.content.trim()) {
      showToast('Content cannot be empty', { type: 'error', duration: 3000 });
      return;
    }
    const targetOrganizationId = isSuperAdmin ? (createForm.organizationId || ALL_ORGANIZATIONS) : ALL_ORGANIZATIONS;

    // Check for duplicate message (same role, screen and organization scope)
    const duplicate = messages.find(
      msg =>
        msg.role === createForm.role &&
        msg.screen === createForm.screen &&
        String(msg.organizationId?._id || msg.organizationId || '') === String(targetOrganizationId || '')
    );

    if (duplicate) {
      showToast('A message with this role and screen already exists for this organization scope. Please edit the existing message instead.', { type: 'error', duration: 4000 });
      return;
    }
    
    try {
      setSaving(true);
      await roleMessagesAPI.setMessage(
        createForm.role,
        createForm.screen,
        createForm.content,
        createForm.description,
        false,
        targetOrganizationId || null
      );
      // Surface the new entry under the matching organization scope (SuperAdmin)
      if (isSuperAdmin && (targetOrganizationId || '') !== (filterOrganizationId || '')) {
        setFilterOrganizationId(targetOrganizationId || ALL_ORGANIZATIONS);
      }
      await fetchMessages();
      setShowCreateForm(false);
      const fallbackRole = availableRoles[0] || 'Recruiter';
      const fallbackScreen = getAvailableScreens(fallbackRole)[0] || '';
      setCreateForm({ role: fallbackRole, screen: fallbackScreen, content: '', description: '', organizationId: ALL_ORGANIZATIONS });
      showToast('Message created successfully!', { type: 'success', duration: 3000 });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to create message';
      setError(errorMsg);
      showToast(errorMsg, { type: 'error', duration: 4000 });
      console.error('Error creating message:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSetDefault = async (id) => {
    try {
      await roleMessagesAPI.setDefaultMessage(id);
      await fetchMessages();
      showToast('Page instruction marked as platform default. Organization copies will be created during sync.', { type: 'success', duration: 3000 });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to set default page instruction';
      showToast(errorMsg, { type: 'error', duration: 4000 });
    }
  };

  const handleUnsetDefault = async (id) => {
    try {
      await roleMessagesAPI.unsetDefaultMessage(id);
      await fetchMessages();
      showToast('Page instruction removed from platform defaults.', { type: 'success', duration: 3000 });
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to unset default page instruction';
      showToast(errorMsg, { type: 'error', duration: 4000 });
    }
  };

  const handleCopyToOrganization = async (targetOrganizationId, overwrite) => {
    if (!selectedMessageId) return;
    const selectedOrganization = organizations.find((org) => org._id === targetOrganizationId);
    try {
      await roleMessagesAPI.copyMessageToOrganization(selectedMessageId, targetOrganizationId, overwrite);
      await fetchMessages();
      showToast(`Page instruction copied to ${selectedOrganization?.name || 'selected organization'}.`, { type: 'success', duration: 3000 });
      setCopyModalOpen(false);
      setSelectedMessageId(null);
    } catch (err) {
      const errorMsg = err.response?.data?.error || err.message || 'Failed to copy page instruction';
      showToast(errorMsg, { type: 'error', duration: 4000 });
    }
  };

  const getCopyRecipientLabel = (recipient) =>
    recipient.organizationName || recipient.adminName || recipient.adminEmail || 'Organization';

  const renderCopyRecipients = (message) => {
    const recipients = Array.isArray(message.copyRecipients) ? message.copyRecipients : [];
    if (!recipients.length) return <span className="description-text">-</span>;

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {recipients.slice(0, 2).map((recipient) => (
          <span key={recipient.organizationId || recipient.adminUserId || recipient.adminEmail} className="role-badge">
            {getCopyRecipientLabel(recipient)}
          </span>
        ))}
        {recipients.length > 2 && (
          <span className="description-text">+{recipients.length - 2} more</span>
        )}
      </div>
    );
  };

  const visibleMessages = messages.filter((msg) => canManageRole(user?.role, msg.role));

  const filteredMessages = visibleMessages.filter(msg => {
    if (filterRole !== 'all' && msg.role !== filterRole) return false;
    if (filterScreen !== 'all' && msg.screen !== filterScreen) return false;
    return true;
  });

  const getAvailableScreens = (role) => SCREENS[role] || [];

  if (loading) {
    return (
      <div className="dashboard">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="role-messages" />
          <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
            <div className="loading">Loading role messages...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="role-messages" />
        <CopyToOrganizationModal
          isOpen={copyModalOpen}
          organizations={organizations}
          title="Copy Page Instruction to Organization"
          description="Select an organization and choose whether to overwrite existing copy."
          onCancel={() => {
            setCopyModalOpen(false);
            setSelectedMessageId(null);
          }}
          onConfirm={handleCopyToOrganization}
        />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
          <div className="bm-header">
            <h1>Page Instructions</h1>
            <div className="bm-header-actions">
              {showCreateForm ? (
                <button
                  onClick={() => setShowCreateForm(false)}
                  className="dashboard-button"
                  style={{ width: 'auto', marginRight: '1rem' }}
                >
                  ← Back to Instructions
                </button>
              ) : (
                <button
                  onClick={() => setShowCreateForm(true)}
                  className="dashboard-button"
                  style={{ width: 'auto' }}
                >
                  <MdAdd />
                  Create New Message
                </button>
              )}
            </div>
          </div>

          {error && (
            <div className="alert-box" style={{ background: '#ffe8e8', borderColor: '#f5c2c7', marginBottom: '1rem' }}>
              <strong>Error:</strong> {error}
              <button 
                onClick={fetchMessages} 
                className="dashboard-button" 
                style={{ marginLeft: '1rem', padding: '0.5rem 1rem' }}
              >
                Retry
              </button>
            </div>
          )}

          <div className="dashboard-content-area">
            {/* Filters (list view only) */}
            {!showCreateForm && (
              <div className="role-message-filters">
                <select
                  value={filterRole}
                  onChange={(e) => {
                    const newRole = e.target.value;
                    setFilterRole(newRole);
                    // Reset screen filter when role changes, or set to first available screen
                    if (newRole !== 'all') {
                      const availableScreens = getAvailableScreens(newRole);
                      setFilterScreen(availableScreens.length > 0 ? availableScreens[0] : 'all');
                    } else {
                      setFilterScreen('all');
                    }
                  }}
                  className="dashboard-select"
                >
                  <option value="all">All Roles</option>
                  {availableRoles.map(role => (
                    <option key={role} value={role}>{role}</option>
                  ))}
                </select>
                <select
                  value={filterScreen}
                  onChange={(e) => setFilterScreen(e.target.value)}
                  className="dashboard-select"
                >
                  <option value="all">All Screens</option>
                  {filterRole === 'all'
                    ? [...new Set(visibleMessages.map(m => m.screen))].map(screen => (
                        <option key={screen} value={screen}>{screen}</option>
                      ))
                    : getAvailableScreens(filterRole).map(screen => (
                        <option key={screen} value={screen}>{screen}</option>
                      ))
                  }
                </select>
                {isSuperAdmin && (
                  <select
                    value={filterOrganizationId}
                    onChange={(e) => setFilterOrganizationId(e.target.value)}
                    className="dashboard-select"
                    aria-label="Filter by organization"
                  >
                    <option value={ALL_ORGANIZATIONS}>All Organizations (Global)</option>
                    {organizations.map((org) => (
                      <option key={org._id} value={org._id}>{org.name}</option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {/* Create Form */}
            {showCreateForm && (
              <div className="role-message-form">
                <h3>Create New Message</h3>
                <div className="form-group">
                  <label>Role</label>
                  <select
                    value={createForm.role}
                    onChange={(e) => {
                      const newRole = e.target.value;
                      const screens = getAvailableScreens(newRole);
                      const firstScreen = screens[0] || '';
                      setCreateForm({ ...createForm, role: newRole, screen: firstScreen });
                    }}
                    className="dashboard-select"
                  >
                    {availableRoles.map(role => (
                      <option key={role} value={role}>{role}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Screen</label>
                  <select
                    value={createForm.screen}
                    onChange={(e) => {
                      const newScreen = e.target.value;
                      setCreateForm({ ...createForm, screen: newScreen });
                    }}
                    className="dashboard-select"
                  >
                    {getAvailableScreens(createForm.role).map(screen => (
                      <option key={screen} value={screen}>{screen}</option>
                    ))}
                  </select>
                </div>
                {isSuperAdmin && createForm.role !== 'JobSeeker' && (
                  <div className="form-group">
                    <label>Organization</label>
                    <select
                      value={createForm.organizationId}
                      onChange={(e) => setCreateForm({ ...createForm, organizationId: e.target.value })}
                      className="dashboard-select"
                    >
                      <option value={ALL_ORGANIZATIONS}>All Organizations (applies to every org)</option>
                      {organizations.map((org) => (
                        <option key={org._id} value={org._id}>{org.name}</option>
                      ))}
                    </select>
                    <p className="description-text" style={{ marginTop: '0.5rem' }}>
                      Choose “All Organizations” for a platform-wide instruction, or select a specific organization to target only that org.
                    </p>
                  </div>
                )}
                <div className="form-group">
                  <label>Content *</label>
                  <textarea
                    value={createForm.content}
                    onChange={(e) => setCreateForm({ ...createForm, content: e.target.value })}
                    rows={4}
                    className="dashboard-input"
                    required
                  />
                </div>
                <div className="form-group">
                  <label>Description</label>
                  <input
                    type="text"
                    value={createForm.description}
                    onChange={(e) => setCreateForm({ ...createForm, description: e.target.value })}
                    className="dashboard-input"
                    placeholder="Optional description"
                  />
                </div>
                <div className="form-actions">
                  <button onClick={handleCreate} className="dashboard-button">
                    <MdSave /> Save
                  </button>
                  <button onClick={() => setShowCreateForm(false)} className="dashboard-button">
                    <MdCancel /> Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Messages List */}
            {!showCreateForm && (
              <div ref={listRef} className={`role-messages-list ${isScrolledX ? 'is-scrolled-x' : ''}`} data-dual-scroll-target="true">
                {filteredMessages.length === 0 ? (
                  <div style={{ marginTop: '2rem', padding: '2rem', background: '#f9fafb', borderRadius: '8px', border: '1px solid #e5e7eb' }}>
                    <h3 style={{ marginTop: 0, marginBottom: '1rem' }}>No Messages Found</h3>
                    <p className="muted" style={{ marginBottom: '1rem' }}>
                      {messages.length === 0
                        ? 'No role messages have been created yet. Click "Create New Message" to add your first message.'
                        : `No messages match your current filters (Role: ${filterRole}, Screen: ${filterScreen}). Try changing the filters or create a new message.`
                      }
                    </p>
                  </div>
                ) : (
                  <table className="role-messages-table">
                  <thead>
                    <tr>
                      <th>Role</th>
                      <th>Screen</th>
                      <th>Template</th>
                      <th>Sent To Organizations</th>
                      <th>Content</th>
                      <th>Description</th>
                      <th>Updated</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredMessages.map((msg) => (
                      <tr key={msg._id} className={editingId === msg._id ? 'editing-row' : ''}>
                        <td><span className="role-badge">{msg.role}</span></td>
                        <td><span className="screen-badge">{msg.screen}</span></td>
                        <td>
                          {msg.isPlatformDefault ? (
                            <span className="role-badge">Platform Default</span>
                          ) : msg.sourceTemplateId ? (
                            msg.lastSyncedAt ? (
                              <span className="role-badge">Org Copy</span>
                            ) : (
                              <span className="role-badge">Customized</span>
                            )
                          ) : (
                            <span className="description-text">-</span>
                          )}
                        </td>
                        <td>{renderCopyRecipients(msg)}</td>
                        <td>
                          {editingId === msg._id ? (
                            <div className="edit-field-wrapper">
                              <textarea
                                value={editForm.content}
                                onChange={(e) => setEditForm({ ...editForm, content: e.target.value })}
                                rows={4}
                                className="edit-textarea"
                                placeholder="Enter message content..."
                                autoFocus
                              />
                              <div className="char-count">{editForm.content.length} characters</div>
                            </div>
                          ) : (
                            <div className="message-preview">{msg.content}</div>
                          )}
                        </td>
                        <td>
                          {editingId === msg._id ? (
                            <input
                              type="text"
                              value={editForm.description}
                              onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                              className="edit-input"
                              placeholder="Optional description..."
                            />
                          ) : (
                            <span className="description-text">{msg.description || '-'}</span>
                          )}
                        </td>
                        <td>
                          <span className="date-text">
                            {msg.updatedAt ? new Date(msg.updatedAt).toLocaleDateString() : '-'}
                          </span>
                        </td>
                        <td>
                          {editingId === msg._id ? (
                            <div className="action-buttons">
                              <button
                                onClick={handleSaveEdit}
                                className="action-btn save-btn"
                                title="Save changes"
                                disabled={saving || !editForm.content.trim()}
                              >
                                {saving ? (
                                  <>⏳ Saving...</>
                                ) : (
                                  <>
                                    <MdDone /> Save
                                  </>
                                )}
                              </button>
                              <button
                                onClick={handleCancelEdit}
                                className="action-btn cancel-btn"
                                title="Cancel editing"
                                disabled={saving}
                              >
                                <MdClear /> Cancel
                              </button>
                            </div>
                          ) : (
                            <div className="action-buttons">
                              <button
                                onClick={() => handleEdit(msg)}
                                className="action-btn edit-btn"
                                title="Edit this message"
                              >
                                <MdEdit /> Edit
                              </button>
                              <button
                                onClick={() => handleDelete(msg._id)}
                                className="action-btn delete-btn"
                                title="Delete this message"
                                disabled={deletingId === msg._id}
                              >
                                {deletingId === msg._id ? (
                                  <>⏳ Deleting...</>
                                ) : (
                                  <>
                                    <MdDelete /> Delete
                                  </>
                                )}
                              </button>
                              {user?.role === 'SuperAdmin' && !msg.organizationId && (
                                <>
                                  <button
                                    onClick={() => {
                                      if (msg.isPlatformDefault) {
                                        handleUnsetDefault(msg._id);
                                      } else {
                                        handleSetDefault(msg._id);
                                      }
                                    }}
                                    className="action-btn"
                                    title={msg.isPlatformDefault ? 'Remove default template' : 'Set as default template'}
                                  >
                                    {msg.isPlatformDefault ? 'Un-default' : 'Default'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setSelectedMessageId(msg._id);
                                      setCopyModalOpen(true);
                                    }}
                                    className="action-btn"
                                    title="Copy to organization"
                                  >
                                    Copy
                                  </button>
                                </>
                              )}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

