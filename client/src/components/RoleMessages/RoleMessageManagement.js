import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useToast } from '../../contexts/ToastContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import roleMessagesAPI from '../../services/roleMessages';
import { MdAdd, MdEdit, MdDelete, MdSave, MdCancel, MdDone, MdClear } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './RoleMessageManagement.css';

const ROLES = ['JobSeeker', 'Recruiter', 'Interpreter'];
const SCREENS = {
  'JobSeeker': ['my-account', 'delete-account', 'edit-profile', 'view-profile', 'event-registration', 'survey'],
  'Recruiter': ['dashboard', 'meeting-queue', 'meeting-records', 'jobseeker-interests'],
  'Interpreter': ['dashboard', 'interpreter-dashboard', 'troubleshooting', 'instructions']
};

const MESSAGE_KEYS = {
  'my-account': ['welcome'],
  'delete-account': ['warning'],
  'edit-profile': ['info-banner'],
  'view-profile': ['profile-notice'],
  'event-registration': ['registration-instruction'],
  'survey': ['info-banner'],
  'dashboard': ['welcome'],
  'interpreter-dashboard': ['welcome'],
  'troubleshooting': ['info-banner'],
  'instructions': ['info-banner'],
  'meeting-queue': ['info-banner'],
  'meeting-records': ['info-banner'],
  'jobseeker-interests': ['info-banner']
};

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
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [createForm, setCreateForm] = useState({ role: 'JobSeeker', screen: 'my-account', messageKey: 'welcome', content: '', description: '' });
  const navigate = useNavigate();
  const { user } = useAuth();
  const { show: showToast } = useToast();

  useEffect(() => {
    if (user && ['Admin', 'GlobalSupport'].includes(user.role)) {
      fetchMessages();
    }
  }, [user]);

  const fetchMessages = async () => {
    try {
      setLoading(true);
      setError(null);
      console.log('Fetching role messages...'); // Debug log
      const response = await roleMessagesAPI.getAllMessages();
      console.log('Role messages response:', response); // Debug log
      
      if (response && response.success !== false) {
        const messagesArray = response.messages || [];
        console.log(`Loaded ${messagesArray.length} role messages`); // Debug log
        setMessages(messagesArray);
      } else {
        console.warn('Unexpected response format:', response);
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
      ? `Are you sure you want to delete the message for ${message.role} / ${message.screen} / ${message.messageKey}?`
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
    if (!createForm.content.trim()) {
      showToast('Content cannot be empty', { type: 'error', duration: 3000 });
      return;
    }
    
    // Check for duplicate message (same role, screen, messageKey)
    const duplicate = messages.find(
      msg => 
        msg.role === createForm.role && 
        msg.screen === createForm.screen && 
        msg.messageKey === createForm.messageKey
    );
    
    if (duplicate) {
      showToast('A message with this role, screen, and message key already exists. Please edit the existing message instead.', { type: 'error', duration: 4000 });
      return;
    }
    
    try {
      setSaving(true);
      await roleMessagesAPI.setMessage(
        createForm.role,
        createForm.screen,
        createForm.messageKey,
        createForm.content,
        createForm.description
      );
      await fetchMessages();
      setShowCreateForm(false);
      setCreateForm({ role: 'JobSeeker', screen: 'my-account', messageKey: 'welcome', content: '', description: '' });
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

  const filteredMessages = messages.filter(msg => {
    if (filterRole !== 'all' && msg.role !== filterRole) return false;
    if (filterScreen !== 'all' && msg.screen !== filterScreen) return false;
    return true;
  });

  const getAvailableScreens = (role) => SCREENS[role] || [];
  const getAvailableKeys = (screen) => MESSAGE_KEYS[screen] || [];

  if (loading) {
    return (
      <div className="dashboard">
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="role-messages" />
          <main id="dashboard-main" className="dashboard-main">
            <div className="loading">Loading role messages...</div>
          </main>
        </div>
        <div className="mobile-overlay" aria-hidden="true" />
      </div>
    );
  }

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="role-messages" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="bm-header">
            <h2>Page Instructions</h2>
            <div className="bm-header-actions">
              <button
                onClick={() => navigate('/instructions')}
                className="dashboard-button"
                style={{ width: 'auto', marginRight: '1rem' }}
              >
                ← Back to Instructions
              </button>
              <button
                onClick={() => setShowCreateForm(true)}
                className="dashboard-button"
                style={{ width: 'auto' }}
              >
                <MdAdd />
                Create New Message
              </button>
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
            {/* Filters */}
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
                {ROLES.map(role => (
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
                  ? [...new Set(messages.map(m => m.screen))].map(screen => (
                      <option key={screen} value={screen}>{screen}</option>
                    ))
                  : getAvailableScreens(filterRole).map(screen => (
                      <option key={screen} value={screen}>{screen}</option>
                    ))
                }
              </select>
            </div>

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
                      setCreateForm({ ...createForm, role: newRole, screen: screens[0] || '', messageKey: '' });
                    }}
                    className="dashboard-select"
                  >
                    {ROLES.map(role => (
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
                      const keys = getAvailableKeys(newScreen);
                      setCreateForm({ ...createForm, screen: newScreen, messageKey: keys[0] || '' });
                    }}
                    className="dashboard-select"
                  >
                    {getAvailableScreens(createForm.role).map(screen => (
                      <option key={screen} value={screen}>{screen}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Message Key</label>
                  <select
                    value={createForm.messageKey}
                    onChange={(e) => setCreateForm({ ...createForm, messageKey: e.target.value })}
                    className="dashboard-select"
                  >
                    {getAvailableKeys(createForm.screen).map(key => (
                      <option key={key} value={key}>{key}</option>
                    ))}
                  </select>
                </div>
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
            <div className="role-messages-list">
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
                      <th>Message Key</th>
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
                        <td><span className="key-badge">{msg.messageKey}</span></td>
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
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </main>
      </div>
      <div className="mobile-overlay" aria-hidden="true" />
    </div>
  );
}

