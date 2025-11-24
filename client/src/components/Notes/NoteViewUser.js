import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { notesAPI } from '../../services/notes';
import { MdArrowBack } from 'react-icons/md';
import '../Dashboard/Dashboard.css';
import './Notes.css';

const NoteViewUser = ({ type }) => {
    const [notes, setNotes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const navigate = useNavigate();

    // Fetch notes for current user's role
    const fetchNotes = useCallback(async () => {
        try {
            setLoading(true);
            const data = await notesAPI.getByRole(type);
            setNotes(data.notes || []);
        } catch (err) {
            setError(err.response?.data?.message || err.message || 'Failed to fetch notes');
            console.error('Error fetching notes:', err);
        } finally {
            setLoading(false);
        }
    }, [type]);

    useEffect(() => {
        fetchNotes();
    }, [fetchNotes]);

    if (loading) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active={type === 'troubleshooting' ? 'troubleshooting' : 'instructions'} />
                    <main id="dashboard-main" className="dashboard-main">
                        <div className="loading">Loading {type === 'troubleshooting' ? 'troubleshooting notes' : 'instructions'}...</div>
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
                    <AdminSidebar active={type === 'troubleshooting' ? 'troubleshooting' : 'instructions'} />
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

    const title = type === 'troubleshooting' ? 'Troubleshooting' : 'Instructions';

    return (
        <div className="dashboard">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active={type === 'troubleshooting' ? 'troubleshooting' : 'instructions'} />
                <main id="dashboard-main" className="dashboard-main">
                    <div className="bm-header">
                        <h2>{title}</h2>
                        <div className="bm-header-actions">
                            <button
                                onClick={() => navigate('/dashboard')}
                                className="dashboard-button"
                                style={{ width: 'auto' }}
                            >
                                <MdArrowBack />
                                Back to Dashboard
                            </button>
                        </div>
                    </div>

                    <div className="dashboard-content-area">
                        {notes.length === 0 ? (
                            <div className="muted" style={{ marginTop: '2rem', textAlign: 'center' }}>
                                <p>No {title.toLowerCase()} available at this time.</p>
                            </div>
                        ) : (
                            <div className="notes-list-view">
                                {notes.map((note) => (
                                    <div key={note._id} className="note-card">
                                        <div className="note-card-header">
                                            <h3>{note.title}</h3>
                                            {note.createdAt && (
                                                <span className="note-date">
                                                    {new Date(note.createdAt).toLocaleDateString()}
                                                </span>
                                            )}
                                        </div>
                                        <div
                                            className="note-card-content"
                                            dangerouslySetInnerHTML={{ __html: note.content }}
                                        />
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </main>
            </div>
            <div className="mobile-overlay" aria-hidden="true" />
        </div>
    );
};

export default NoteViewUser;

