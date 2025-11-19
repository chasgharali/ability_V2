import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import DataGrid from '../UI/DataGrid';
import { notesAPI } from '../../services/notes';
import { MdAdd, MdEdit, MdDelete, MdVisibility } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';

const NoteManagement = () => {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [filterType, setFilterType] = useState('all'); // 'all', 'troubleshooting', 'instruction'
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch notes
    const fetchNotes = async () => {
        try {
            setLoading(true);
            const params = {};
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
        if (user?.role === 'Admin') {
            fetchNotes();
        }
    }, [filterType, user?.role]);

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

    // DataGrid columns configuration
    const columns = [
        {
            key: 'title',
            label: 'Title',
            render: (row) => (
                <div className="note-title-cell">
                    <strong>{row.title}</strong>
                    <span className={`type-badge ${row.type}`}>{row.type}</span>
                </div>
            )
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
                        className="action-btn view-btn"
                        onClick={() => navigate(`/notes/${row._id}`)}
                        title="View Details"
                        aria-label={`View details for ${row.title}`}
                    >
                        <MdVisibility />
                    </button>
                    {user?.role === 'Admin' && (
                        <>
                            <button
                                className="action-btn edit-btn"
                                onClick={() => navigate(`/notes/${row._id}/edit`)}
                                title="Edit"
                                aria-label={`Edit ${row.title}`}
                            >
                                <MdEdit />
                            </button>
                            <button
                                className="action-btn delete-btn"
                                onClick={() => handleDelete(row._id)}
                                title="Delete"
                                aria-label={`Delete ${row.title}`}
                            >
                                <MdDelete />
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
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading notes...</div>
                    </main>
                </div>
                <div className="mobile-overlay" aria-hidden="true" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="error">
                            <h3>Error</h3>
                            <p>{error}</p>
                            <button onClick={fetchNotes} className="dashboard-button" style={{ width: 'auto' }}>Retry</button>
                        </div>
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
                <AdminSidebar active="notes" />
                <main id="dashboard-main" className="dashboard-main">
                    <div className="bm-header">
                        <h2>Notes Management</h2>
                        <div className="bm-header-actions">
                            {user?.role === 'Admin' && (
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
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default NoteManagement;





