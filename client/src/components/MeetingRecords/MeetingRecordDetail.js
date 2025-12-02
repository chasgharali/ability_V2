import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import '../Dashboard/Dashboard.css';
import './MeetingRecordDetail.css';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import { useAuth } from '../../contexts/AuthContext';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import { useRecruiterBooth } from '../../hooks/useRecruiterBooth';

export default function MeetingRecordDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user, loading } = useAuth();
    const { booth, event } = useRecruiterBooth();

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

    const formatStatus = (status) => {
        const statusLabels = {
            'scheduled': 'Scheduled',
            'active': 'Active',
            'completed': 'Completed',
            'cancelled': 'Cancelled',
            'failed': 'Failed',
            'left_with_message': 'Left Message'
        };
        return statusLabels[status] || status;
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
                <AdminHeader 
                    brandingLogo={event?.logoUrl || event?.logo || ''}
                    secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
                />
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
                <AdminHeader 
                    brandingLogo={event?.logoUrl || event?.logo || ''}
                    secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
                />
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
                                    type="button"
                                >
                                    ← Back to Meeting Records
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
            <AdminHeader 
                brandingLogo={event?.logoUrl || event?.logo || ''}
                secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
            />
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
                                        type="button"
                                    >
                                        ← Back to Meeting Records
                                    </button>
                                    <h1>Meeting Record Details</h1>
                                </div>
                            </div>

                            <div className="meeting-detail-content">
                                {/* Basic Information */}
                                <section className="detail-section" aria-labelledby="meeting-info-heading">
                                    <h2 id="meeting-info-heading">Meeting Information</h2>
                                    <div className="detail-grid">
                                        <div className="detail-item">
                                            <label>Event</label>
                                            <span>{meetingRecord.eventId?.name || 'N/A'}</span>
                                        </div>
                                        <div className="detail-item">
                                            <label>Booth</label>
                                            <span>{meetingRecord.boothId?.name || 'N/A'}</span>
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
                                                {formatStatus(meetingRecord.status)}
                                            </span>
                                        </div>
                                    </div>
                                </section>

                                {/* Participants */}
                                <section className="detail-section" aria-labelledby="participants-heading">
                                    <h2 id="participants-heading">Participants</h2>
                                    <div className="participants-grid" role="list">
                                        <article className="participant-card" role="listitem">
                                            <h3>Recruiter</h3>
                                            {meetingRecord.status === 'left_with_message' ? (
                                                <>
                                                    <p><strong>Name:</strong> All Recruiters in Booth</p>
                                                    <p><strong>Email:</strong> {meetingRecord.boothId?.name || 'Booth Message'}</p>
                                                    <p><strong>Note:</strong> This message is visible to all recruiters in the booth</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p><strong>Name:</strong> {meetingRecord.recruiterId?.name || 'N/A'}</p>
                                                    <p><strong>Email:</strong> {meetingRecord.recruiterId?.email || 'N/A'}</p>
                                                </>
                                            )}
                                        </article>
                                        <article className="participant-card" role="listitem">
                                            <h3>Job Seeker</h3>
                                            <p><strong>Name:</strong> {meetingRecord.jobseekerId?.name || 'N/A'}</p>
                                            <p><strong>Email:</strong> {meetingRecord.jobseekerId?.email || 'N/A'}</p>
                                            <p><strong>Location:</strong> {
                                                meetingRecord.jobseekerId?.city && meetingRecord.jobseekerId?.state
                                                    ? `${meetingRecord.jobseekerId.city}, ${meetingRecord.jobseekerId.state}`
                                                    : 'N/A'
                                            }</p>
                                        </article>
                                        {meetingRecord.interpreterId && (
                                            <article className="participant-card" role="listitem">
                                                <h3>Interpreter</h3>
                                                <p><strong>Name:</strong> {meetingRecord.interpreterId.name}</p>
                                                <p><strong>Email:</strong> {meetingRecord.interpreterId.email}</p>
                                            </article>
                                        )}
                                    </div>
                                </section>

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
                                    <section className="detail-section" aria-labelledby="messages-heading">
                                        <h2 id="messages-heading">Job Seeker Messages ({meetingRecord.jobSeekerMessages.length})</h2>
                                        <div className="messages-container" role="list">
                                            {meetingRecord.jobSeekerMessages.map((message, index) => (
                                                <article key={index} className="message-item" role="listitem">
                                                    <div className="message-header">
                                                        <span className="message-type">{renderMessageType(message.type)}</span>
                                                        <span className="message-time">{formatDateTime(message.createdAt)}</span>
                                                    </div>
                                                    <div className="message-content">
                                                        {message.type === 'text' ? (
                                                            <p>{message.content}</p>
                                                        ) : message.type === 'audio' ? (
                                                            <div className="media-player">
                                                                <audio 
                                                                    controls 
                                                                    aria-label="Audio message from job seeker"
                                                                    preload="metadata"
                                                                >
                                                                    <source src={message.content} type="audio/webm" />
                                                                    <source src={message.content} type="audio/mp4" />
                                                                    Your browser does not support the audio element.
                                                                </audio>
                                                            </div>
                                                        ) : message.type === 'video' ? (
                                                            <div className="media-player">
                                                                <video 
                                                                    controls 
                                                                    aria-label="Video message from job seeker"
                                                                    preload="metadata"
                                                                >
                                                                    <source src={message.content} type="video/webm" />
                                                                    <source src={message.content} type="video/mp4" />
                                                                    Your browser does not support the video element.
                                                                </video>
                                                            </div>
                                                        ) : (
                                                            <div className="media-message">
                                                                <p>Media file: {message.content}</p>
                                                            </div>
                                                        )}
                                                    </div>
                                                </article>
                                            ))}
                                        </div>
                                    </section>
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
