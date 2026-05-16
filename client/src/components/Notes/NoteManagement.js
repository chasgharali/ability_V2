import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import CopyToAdminModal from '../UI/CopyToAdminModal';
import { notesAPI } from '../../services/notes';
import { listUsers } from '../../services/users';
import { MdAdd, MdEdit, MdDelete, MdVisibility } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';

const NoteManagement = () => {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [successMessage, setSuccessMessage] = useState(null);
    const [filterType, setFilterType] = useState('all'); // 'all', 'troubleshooting', 'instruction'
    const [adminUsers, setAdminUsers] = useState([]);
    const [copyModalOpen, setCopyModalOpen] = useState(false);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch notes
    const fetchNotes = async () => {
        try {
            setLoading(true);
            const params = {};
            if (user?.role === 'Admin') {
                await notesAPI.syncDefaults();
            }
            if (filterType !== 'all') {
                params.type = filterType;
            }
            const data = await notesAPI.getAll(params);
            setNotes(data.notes || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch notes');
            console.error('Error fetching notes:', err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (['Admin', 'SuperAdmin'].includes(user?.role)) {
            fetchNotes();
        }
    }, [filterType, user?.role]);

    useEffect(() => {
        const fetchAdminUsers = async () => {
            if (user?.role !== 'SuperAdmin') return;
            try {
                const response = await listUsers({ role: 'Admin', limit: 500, isActive: true });
                setAdminUsers(response.users || []);
            } catch (err) {
                console.error('Error fetching admin users:', err);
            }
        };
        fetchAdminUsers();
    }, [user?.role]);

    // Handle delete note
    const handleDelete = async (noteId) => {
        if (!window.confirm('Are you sure you want to delete this note?')) {
            return;
        }

        try {
            await notesAPI.delete(noteId);
            await fetchNotes();
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to delete note');
            console.error('Error deleting note:', err);
        }
    };

    const handleSetDefault = async (noteId) => {
        try {
            setError(null);
            setSuccessMessage(null);
            await notesAPI.setDefault(noteId);
            await fetchNotes();
            setSuccessMessage('Note marked as default and copied to organization admins.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to set default note');
        }
    };

    const handleUnsetDefault = async (noteId) => {
        try {
            setError(null);
            setSuccessMessage(null);
            await notesAPI.unsetDefault(noteId);
            await fetchNotes();
            setSuccessMessage('Note removed from platform defaults.');
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to unset default note');
        }
    };

    const handleCopyToAdmin = async (targetAdminUserId, overwrite) => {
        if (!selectedNoteId) return;
        const selectedAdmin = adminUsers.find((admin) => admin._id === targetAdminUserId);
        try {
            setError(null);
            setSuccessMessage(null);
            await notesAPI.copyToAdmin(selectedNoteId, targetAdminUserId, overwrite);
            await fetchNotes();
            setSuccessMessage(`Note copied to ${selectedAdmin?.name || selectedAdmin?.email || 'selected admin'}.`);
            setCopyModalOpen(false);
            setSelectedNoteId(null);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to copy note to admin');
        }
    };

    const renderCopyRecipients = (row) => {
        const recipients = Array.isArray(row.copyRecipients) ? row.copyRecipients : [];
        if (!recipients.length) return <span className="muted">-</span>;

        return (
            <div className="roles-list">
                {recipients.slice(0, 2).map((recipient) => (
                    <span key={recipient.adminUserId || recipient.adminEmail} className="role-badge">
                        {recipient.adminName || recipient.adminEmail || 'Admin'}
                    </span>
                ))}
                {recipients.length > 2 && (
                    <span className="muted">+{recipients.length - 2} more</span>
                )}
            </div>
        );
    };

    // DataGrid columns configuration
    const columns = [
        {
            key: 'title',
            label: 'Title',
            render: (row) => <strong>{row.title}</strong>
        },
        {
            key: 'type',
            label: 'Type',
            render: (row) => (
                <span className={`type-badge ${row.type}`}>
                    {row.type === 'troubleshooting' ? 'Troubleshooting' : 'Instruction'}
                </span>
            )
        },
        {
            key: 'assignedRoles',
            label: 'Assigned Roles',
            render: (row) => (
                <div className="roles-list">
                    {row.assignedRoles?.map((role, idx) => (
                        <span key={idx} className="role-badge">{role}</span>
                    ))}
                </div>
            )
        },
        {
            key: 'contentPreview',
            label: 'Preview',
            render: (row) => (
                <div className="note-preview">
                    {row.contentPreview || 'No preview available'}
                </div>
            )
        },
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
            key: 'templateStatus',
            label: 'Template',
            render: (row) => {
                if (row.isPlatformDefault) return <span className="role-badge">Platform Default</span>;
                if (row.sourceTemplateId) {
                    return row.lastSyncedAt
                        ? <span className="role-badge">Org Copy</span>
                        : <span className="role-badge">Customized</span>;
                }
                return <span className="muted">-</span>;
            }
        },
        {
            key: 'copyRecipients',
            label: 'Sent To Admins',
            render: (row) => renderCopyRecipients(row)
        },
        {
            key: 'createdAt',
            label: 'Created',
            render: (row) => new Date(row.createdAt).toLocaleDateString()
        },
        {
            key: 'actions',
            label: 'Actions',
            render: (row) => (
                <div className="note-actions">
                    <button
                        type="button"
                        className="action-btn view-btn action-btn--labeled"
                        onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/notes/${row._id}`);
                        }}
                        title="View read-only details"
                        aria-label={`View details for ${row.title}`}
                    >
                        <MdVisibility aria-hidden="true" />
                        <span>View</span>
                    </button>
                    {['Admin', 'SuperAdmin'].includes(user?.role) && (
                        <>
                            <button
                                type="button"
                                className="action-btn edit-btn action-btn--labeled"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/notes/${row._id}/edit`);
                                }}
                                title="Edit note"
                                aria-label={`Edit ${row.title}`}
                            >
                                <MdEdit aria-hidden="true" />
                                <span>Edit</span>
                            </button>
                            {user?.role === 'SuperAdmin' && (
                                <>
                                    <button
                                        type="button"
                                        className="action-btn action-btn--labeled"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            if (row.isPlatformDefault) {
                                                handleUnsetDefault(row._id);
                                            } else {
                                                handleSetDefault(row._id);
                                            }
                                        }}
                                        title={row.isPlatformDefault ? 'Remove default template' : 'Set as default template'}
                                    >
                                        <span>{row.isPlatformDefault ? 'Un-default' : 'Set Default'}</span>
                                    </button>
                                    <button
                                        type="button"
                                        className="action-btn copy-btn action-btn--labeled"
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setSelectedNoteId(row._id);
                                            setCopyModalOpen(true);
                                        }}
                                        title="Copy to specific admin"
                                    >
                                        <span>Copy</span>
                                    </button>
                                </>
                            )}
                            <button
                                type="button"
                                className="action-btn delete-btn"
                                onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(row._id);
                                }}
                                title="Delete"
                                aria-label={`Delete ${row.title}`}
                            >
                                <MdDelete aria-hidden="true" />
                            </button>
                        </>
                    )}
                </div>
            )
        }
    ];

    if (loading) {
        return (
            <div className="dashboard">
                <a href="#main-content" className="skip-link">Skip to main content</a>
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                        <div className="loading">Loading notes...</div>
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
                <AdminSidebar active="notes" />
                <CopyToAdminModal
                    isOpen={copyModalOpen}
                    admins={adminUsers}
                    title="Copy Note to Admin"
                    description="Select an organization admin and choose whether to overwrite existing copy."
                    onCancel={() => {
                        setCopyModalOpen(false);
                        setSelectedNoteId(null);
                    }}
                    onConfirm={handleCopyToAdmin}
                />
                <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
                    <div className="bm-header">
                        <h1>Notes Management</h1>
                        <div className="bm-header-actions">
                            {['Admin', 'SuperAdmin'].includes(user?.role) && (
                                <>
                                    <select
                                        value={filterType}
                                        onChange={(e) => setFilterType(e.target.value)}
                                        className="dashboard-select"
                                        style={{ marginRight: '1rem' }}
                                    >
                                        <option value="all">All Types</option>
                                        <option value="troubleshooting">Troubleshooting</option>
                                        <option value="instruction">Instructions</option>
                                    </select>
                                    <button
                                        onClick={() => navigate('/notes/create')}
                                        className="dashboard-button"
                                        aria-label="Create new note"
                                        style={{ width: 'auto' }}
                                    >
                                        <MdAdd />
                                        Create New Note
                                    </button>
                                </>
                            )}
                        </div>
                    </div>

                    <div className="dashboard-content-area">
                        {(error || successMessage) && (
                            <div className={`terms-message ${error ? 'terms-error-message' : 'terms-success-message'}`} style={{ marginBottom: '1rem' }}>
                                {error || successMessage}
                            </div>
                        )}
                        <DataGrid
                            data={notes}
                            columns={columns}
                            onRowClick={(row) => navigate(`/notes/${row._id}`)}
                            searchable={true}
                            sortable={true}
                            selectable={false}
                            aria-label="Notes list"
                        />
                        {notes.length === 0 && (
                            <div className="muted" style={{ marginTop: '0.75rem' }}>
                                No notes have been created yet.
                            </div>
                        )}
                    </div>
                </main>
            </div>
        </div>
    );
};

export default NoteManagement;





