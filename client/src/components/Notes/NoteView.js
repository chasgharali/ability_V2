import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { notesAPI } from '../../services/notes';
import { MdArrowBack, MdEdit } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';

const NoteView = () => {
    const [note, setNote] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();

    // Fetch note details
    const fetchNote = useCallback(async () => {
        try {
            setLoading(true);
            const data = await notesAPI.getById(id);
            setNote(data.note);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch note');
            console.error('Error fetching note:', err);
        } finally {
            setLoading(false);
        }
    }, [id]);

    useEffect(() => {
        fetchNote();
    }, [fetchNote]);

    if (loading) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading note...</div>
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
                            <button onClick={fetchNote} className="dashboard-button" style={{ width: 'auto' }}>Retry</button>
                        </div>
                    </main>
                </div>
                <div className="mobile-overlay" aria-hidden="true" />
            </div>
        );
    }

    if (!note) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="notes" />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="error">
                            <h3>Note Not Found</h3>
                            <p>The requested note could not be found.</p>
                            <button onClick={() => navigate('/notes')} className="dashboard-button" style={{ width: 'auto' }}>
                                Back to List
                            </button>
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
                        <h2>{note.title}</h2>
                        <div className="bm-header-actions">
                            <button
                                onClick={() => navigate('/notes')}
                                className="dashboard-button"
                                style={{ width: 'auto' }}
                            >
                                <MdArrowBack />
                                Back to List
                            </button>
                            {user?.role === 'Admin' && (
                                <button
                                    onClick={() => navigate(`/notes/${id}/edit`)}
                                    className="dashboard-button"
                                    style={{ width: 'auto' }}
                                >
                                    <MdEdit />
                                    Edit
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="dashboard-content-area">
                        <div className="note-meta">
                            <div className="note-title-section">
                                <div className="note-badges">
                                    <span className={`type-badge ${note.type}`}>
                                        {note.type === 'troubleshooting' ? 'Troubleshooting' : 'Instruction'}
                                    </span>
                                    <span className={`status-badge ${note.isActive ? 'active' : 'inactive'}`}>
                                        {note.isActive ? 'Active' : 'Inactive'}
                                    </span>
                                </div>
                            </div>

                            <div className="note-info">
                                <div className="info-item">
                                    <strong>Assigned Roles:</strong>
                                    <div className="roles-list">
                                        {note.assignedRoles?.map((role, idx) => (
                                            <span key={idx} className="role-badge">{role}</span>
                                        ))}
                                    </div>
                                </div>
                                <div className="info-item">
                                    <strong>Created:</strong> {new Date(note.createdAt).toLocaleDateString()}
                                </div>
                                <div className="info-item">
                                    <strong>Last Updated:</strong> {new Date(note.updatedAt).toLocaleDateString()}
                                </div>
                                {note.createdBy && (
                                    <div className="info-item">
                                        <strong>Created By:</strong> {note.createdBy.name || note.createdBy.email}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="note-content">
                            <h3>Content</h3>
                            <div
                                className="note-html-content"
                                dangerouslySetInnerHTML={{ __html: note.content }}
                            />
                        </div>
                    </div>
                </main>
            </div>
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default NoteView;





