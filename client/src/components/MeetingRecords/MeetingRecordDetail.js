import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import './MeetingRecordDetail.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { meetingRecordsAPI } from '../../services/meetingRecords';

export default function MeetingRecordDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    
    const [meetingRecord, setMeetingRecord] = useState(null);
    const [loadingData, setLoadingData] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!loading) {
            if (!user) {
                navigate('/login', { replace: true });
            } else if (!['Admin', 'GlobalSupport', 'Recruiter'].includes(user.role)) {
                navigate('/dashboard', { replace: true });
            }
        }
    }, [user, loading, navigate]);

    const loadMeetingRecord = useCallback(async () => {
        try {
            setLoadingData(true);
            const record = await meetingRecordsAPI.getMeetingRecord(id);
            setMeetingRecord(record);
        } catch (error) {
            console.error('Error loading meeting record:', error);
            setError('Failed to load meeting record');
        } finally {
            setLoadingData(false);
        }
    }, [id]);

    useEffect(() => {
        if (user && id) {
            loadMeetingRecord();
        }
    }, [user, id, loadMeetingRecord]);

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const formatDuration = (minutes) => {
        if (!minutes) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) {
            return `${hours}h ${mins}m`;
        }
        return `${mins}m`;
    };

    const renderStars = (rating) => {
        if (!rating) return 'No rating';
        return '★'.repeat(rating) + '☆'.repeat(5 - rating);
    };

    const renderMessageType = (type) => {
        const typeMap = {
            text: 'Text Message',
            audio: 'Audio Message',
            video: 'Video Message'
        };
        return typeMap[type] || type;
    };

    if (loading || !user) {
        return (
            <div className="loading-container">
                <div className="loading-spinner"></div>
            </div>
        );
    }

    if (loadingData) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="meeting-records" />
                    <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                        <div className="dashboard-content">
                            <div className="loading-container">
                                <div className="loading-spinner"></div>
                                <p>Loading meeting record...</p>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    if (error || !meetingRecord) {
        return (
            <div className="dashboard">
                <AdminHeader />
                <div className="dashboard-layout">
                    <AdminSidebar active="meeting-records" />
                    <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                        <div className="dashboard-content">
                            <div className="error-container">
                                <h2>Error</h2>
                                <p>{error || 'Meeting record not found'}</p>
                                <button 
                                    className="btn-back"
                                    onClick={() => navigate('/meeting-records')}
                                >
                                    Back to Meeting Records
                                </button>
                            </div>
                        </div>
                    </main>
                </div>
            </div>
        );
    }

    return (
        <div className="dashboard">
            <AdminHeader />
            <div className="dashboard-layout">
                <AdminSidebar active="meeting-records" />
                <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
                    <div className="dashboard-content">
                        <div className="meeting-detail-container">
                        <div className="page-header">
                            <div className="header-left">
                                <button 
                                    className="btn-back"
                                    onClick={() => navigate('/meeting-records')}
                                >
                                    ← Back to Meeting Records
                                </button>
                                <h1>Meeting Record Details</h1>
                            </div>
                        </div>

                        <div className="meeting-detail-content">
                            {/* Basic Information */}
                            <div className="detail-section">
                                <h2>Meeting Information</h2>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>Event</label>
                                        <span>{meetingRecord.eventId?.name || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Company</label>
                                        <span>{meetingRecord.boothId?.company || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Start Time</label>
                                        <span>{formatDateTime(meetingRecord.startTime)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>End Time</label>
                                        <span>{formatDateTime(meetingRecord.endTime)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Duration</label>
                                        <span>{formatDuration(meetingRecord.duration)}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Status</label>
                                        <span className={`status-badge status-${meetingRecord.status}`}>
                                            {meetingRecord.status}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Participants */}
                            <div className="detail-section">
                                <h2>Participants</h2>
                                <div className="participants-grid">
                                    <div className="participant-card">
                                        <h3>Recruiter</h3>
                                        <p><strong>Name:</strong> {meetingRecord.recruiterId?.name || 'N/A'}</p>
                                        <p><strong>Email:</strong> {meetingRecord.recruiterId?.email || 'N/A'}</p>
                                    </div>
                                    <div className="participant-card">
                                        <h3>Job Seeker</h3>
                                        <p><strong>Name:</strong> {meetingRecord.jobseekerId?.name || 'N/A'}</p>
                                        <p><strong>Email:</strong> {meetingRecord.jobseekerId?.email || 'N/A'}</p>
                                        <p><strong>Location:</strong> {
                                            meetingRecord.jobseekerId?.city && meetingRecord.jobseekerId?.state
                                                ? `${meetingRecord.jobseekerId.city}, ${meetingRecord.jobseekerId.state}`
                                                : 'N/A'
                                        }</p>
                                    </div>
                                    {meetingRecord.interpreterId && (
                                        <div className="participant-card">
                                            <h3>Interpreter</h3>
                                            <p><strong>Name:</strong> {meetingRecord.interpreterId.name}</p>
                                            <p><strong>Email:</strong> {meetingRecord.interpreterId.email}</p>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Rating and Feedback */}
                            {(meetingRecord.recruiterRating || meetingRecord.recruiterFeedback) && (
                                <div className="detail-section">
                                    <h2>Rating & Feedback</h2>
                                    <div className="rating-feedback-container">
                                        {meetingRecord.recruiterRating && (
                                            <div className="rating-display">
                                                <label>Rating</label>
                                                <div className="stars-container">
                                                    <span className="stars">{renderStars(meetingRecord.recruiterRating)}</span>
                                                    <span className="rating-number">({meetingRecord.recruiterRating}/5)</span>
                                                </div>
                                            </div>
                                        )}
                                        {meetingRecord.recruiterFeedback && (
                                            <div className="feedback-display">
                                                <label>Feedback</label>
                                                <div className="feedback-text">
                                                    {meetingRecord.recruiterFeedback}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Job Seeker Messages */}
                            {meetingRecord.jobSeekerMessages && meetingRecord.jobSeekerMessages.length > 0 && (
                                <div className="detail-section">
                                    <h2>Job Seeker Messages ({meetingRecord.jobSeekerMessages.length})</h2>
                                    <div className="messages-container">
                                        {meetingRecord.jobSeekerMessages.map((message, index) => (
                                            <div key={index} className="message-item">
                                                <div className="message-header">
                                                    <span className="message-type">{renderMessageType(message.type)}</span>
                                                    <span className="message-time">{formatDateTime(message.createdAt)}</span>
                                                </div>
                                                <div className="message-content">
                                                    {message.type === 'text' ? (
                                                        <p>{message.content}</p>
                                                    ) : (
                                                        <div className="media-message">
                                                            <p>Media file: {message.content}</p>
                                                            <small>({message.type} message)</small>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Chat Messages */}
                            {meetingRecord.chatMessages && meetingRecord.chatMessages.length > 0 && (
                                <div className="detail-section">
                                    <h2>Chat Messages ({meetingRecord.chatMessages.length})</h2>
                                    <div className="chat-container">
                                        {meetingRecord.chatMessages.map((message, index) => (
                                            <div key={index} className="chat-message">
                                                <div className="chat-header">
                                                    <span className="sender-name">
                                                        {message.userId === meetingRecord.recruiterId?._id ? 'Recruiter' : 
                                                         message.userId === meetingRecord.jobseekerId?._id ? 'Job Seeker' : 
                                                         'Interpreter'}
                                                    </span>
                                                    <span className="chat-time">{formatDateTime(message.timestamp)}</span>
                                                </div>
                                                <div className="chat-content">
                                                    {message.message}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Technical Information */}
                            <div className="detail-section">
                                <h2>Technical Information</h2>
                                <div className="detail-grid">
                                    <div className="detail-item">
                                        <label>Room ID</label>
                                        <span>{meetingRecord.twilioRoomId || 'N/A'}</span>
                                    </div>
                                    <div className="detail-item">
                                        <label>Room SID</label>
                                        <span>{meetingRecord.twilioRoomSid || 'N/A'}</span>
                                    </div>
                                    {meetingRecord.qualityMetrics && (
                                        <>
                                            <div className="detail-item">
                                                <label>Connection Quality</label>
                                                <span>{meetingRecord.qualityMetrics.connectionQuality || 'N/A'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Audio Quality</label>
                                                <span>{meetingRecord.qualityMetrics.audioQuality || 'N/A'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Video Quality</label>
                                                <span>{meetingRecord.qualityMetrics.videoQuality || 'N/A'}</span>
                                            </div>
                                            <div className="detail-item">
                                                <label>Dropped Connections</label>
                                                <span>{meetingRecord.qualityMetrics.droppedConnections || 0}</span>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                        </div>
                    </div>
                </main>
            </div>
        </div>
    );
}
