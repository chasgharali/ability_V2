import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '../../contexts/AuthContext';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import './MeetingRecordDetail.css';
import './MeetingRecordDetailModal.css';

export default function MeetingRecordDetailModal({ isOpen, onClose, meetingRecordId }) {
    const { user } = useAuth();
    const isRecruiter = user?.role === 'Recruiter';

    const [meetingRecord, setMeetingRecord] = useState(null);
    const [loadingData, setLoadingData] = useState(false);
    const [error, setError] = useState(null);

    const loadMeetingRecord = useCallback(async (id) => {
        try {
            setLoadingData(true);
            setError(null);
            const record = await meetingRecordsAPI.getMeetingRecord(id);
            setMeetingRecord(record);
        } catch (err) {
            console.error('Error loading meeting record:', err);
            setError('Failed to load meeting record');
            setMeetingRecord(null);
        } finally {
            setLoadingData(false);
        }
    }, []);

    useEffect(() => {
        if (!isOpen || !meetingRecordId) {
            setMeetingRecord(null);
            setError(null);
            setLoadingData(false);
            return;
        }
        loadMeetingRecord(meetingRecordId);
    }, [isOpen, meetingRecordId, loadMeetingRecord]);

    useEffect(() => {
        if (!isOpen) return undefined;
        const handleKeyDown = (e) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    useEffect(() => {
        if (!isOpen || typeof document === 'undefined') return undefined;
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => {
            document.body.style.overflow = previousOverflow;
        };
    }, [isOpen]);

    if (!isOpen || !meetingRecordId) return null;

    const formatDateTime = (dateString) => {
        if (!dateString) return 'N/A';
        return new Date(dateString).toLocaleString();
    };

    const formatDuration = (minutes) => {
        if (!minutes) return 'N/A';
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        if (hours > 0) return `${hours}h ${mins}m`;
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
            scheduled: 'Scheduled',
            active: 'Active',
            completed: 'Completed',
            cancelled: 'Cancelled',
            failed: 'Failed',
            left_with_message: 'Left Message'
        };
        return statusLabels[status] || status;
    };

    const modalContent = (
        <div
            className="modal-overlay meeting-record-detail-overlay"
            onClick={(e) => {
                if (e.target === e.currentTarget) onClose();
            }}
            onKeyDown={(e) => {
                if (e.key === 'Escape' || (e.key === 'Enter' && e.target === e.currentTarget)) {
                    onClose();
                }
            }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="meeting-record-detail-title"
            tabIndex={-1}
        >
            <div className="modal-content meeting-record-detail-modal">
                <div className="modal-header">
                    <h3 id="meeting-record-detail-title">Meeting Record Details</h3>
                    <button
                        className="modal-close"
                        onClick={onClose}
                        aria-label="Close meeting record details"
                        type="button"
                    >
                        ×
                    </button>
                </div>

                <div className="meeting-record-detail-body">
                    {loadingData ? (
                        <div className="meeting-record-detail-loading" role="status" aria-live="polite">
                            <div className="loading-spinner" />
                            <p>Loading meeting record...</p>
                        </div>
                    ) : error || !meetingRecord ? (
                        <div className="meeting-record-detail-error">
                            <p>{error || 'Meeting record not found'}</p>
                            <button type="button" className="btn-back" onClick={onClose}>
                                Close
                            </button>
                        </div>
                    ) : (
                        <div className="meeting-detail-content">
                            <div className="meeting-detail-top-sections">
                                <section className="detail-section" aria-labelledby="meeting-info-heading-modal">
                                    <h2 id="meeting-info-heading-modal">Meeting Information</h2>
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
                                            <label>Status</label>
                                            <span className={`status-badge status-${meetingRecord.status}`}>
                                                {formatStatus(meetingRecord.status)}
                                            </span>
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
                                    </div>
                                </section>

                                <section className="detail-section" aria-labelledby="participants-heading-modal">
                                    <h2 id="participants-heading-modal">Participants</h2>
                                    <div className="mr-detail-participants-grid" role="list">
                                        <article className="mr-detail-participant-card" role="listitem">
                                            <h3>Recruiter</h3>
                                            {meetingRecord.status === 'left_with_message' ? (
                                                <>
                                                    <div className="mr-detail-participant-row">
                                                        <span className="mr-detail-participant-label">Name</span>
                                                        <span>All Recruiters in Booth</span>
                                                    </div>
                                                    <div className="mr-detail-participant-row">
                                                        <span className="mr-detail-participant-label">Email</span>
                                                        <span>{meetingRecord.boothId?.name || 'Booth Message'}</span>
                                                    </div>
                                                    <div className="mr-detail-participant-row">
                                                        <span className="mr-detail-participant-label">Note</span>
                                                        <span>This message is visible to all recruiters in the booth</span>
                                                    </div>
                                                </>
                                            ) : (
                                                <>
                                                    <div className="mr-detail-participant-row">
                                                        <span className="mr-detail-participant-label">Name</span>
                                                        <span>{meetingRecord.recruiterId?.name || 'N/A'}</span>
                                                    </div>
                                                    <div className="mr-detail-participant-row">
                                                        <span className="mr-detail-participant-label">Email</span>
                                                        <span>{meetingRecord.recruiterId?.email || 'N/A'}</span>
                                                    </div>
                                                </>
                                            )}
                                        </article>
                                        <article className="mr-detail-participant-card" role="listitem">
                                            <h3>Job Seeker</h3>
                                            <div className="mr-detail-participant-row">
                                                <span className="mr-detail-participant-label">Name</span>
                                                <span>{meetingRecord.jobseekerId?.name || 'N/A'}</span>
                                            </div>
                                            <div className="mr-detail-participant-row">
                                                <span className="mr-detail-participant-label">Email</span>
                                                <span>{meetingRecord.jobseekerId?.email || 'N/A'}</span>
                                            </div>
                                            <div className="mr-detail-participant-row">
                                                <span className="mr-detail-participant-label">Location</span>
                                                <span>
                                                    {meetingRecord.jobseekerId?.city && meetingRecord.jobseekerId?.state
                                                        ? `${meetingRecord.jobseekerId.city}, ${meetingRecord.jobseekerId.state}`
                                                        : 'N/A'}
                                                </span>
                                            </div>
                                            {(() => {
                                                const resumeId = meetingRecord.jobSeekerResumeId || meetingRecord.resolvedResume?.resumeId;
                                                const resumeUrl = meetingRecord.jobSeekerResumeUrl || meetingRecord.resolvedResume?.resumeUrl || meetingRecord.jobseekerId?.resumeUrl;
                                                if (!resumeId && !resumeUrl) return null;
                                                return (
                                                    <div className="mr-detail-participant-row mr-detail-participant-row--resume">
                                                        <span className="mr-detail-participant-label">Resume</span>
                                                        <button
                                                            type="button"
                                                            className="btn-view-resume-inline"
                                                            onClick={() => openResumeInNewTab(resumeId || null, resumeUrl || null)}
                                                            aria-label={`View resume for ${meetingRecord.jobseekerId?.name || 'job seeker'}`}
                                                        >
                                                            View
                                                        </button>
                                                    </div>
                                                );
                                            })()}
                                        </article>
                                        {meetingRecord.interpreterId && (
                                            <article className="mr-detail-participant-card" role="listitem">
                                                <h3>Interpreter</h3>
                                                <div className="mr-detail-participant-row">
                                                    <span className="mr-detail-participant-label">Name</span>
                                                    <span>{meetingRecord.interpreterId.name}</span>
                                                </div>
                                                <div className="mr-detail-participant-row">
                                                    <span className="mr-detail-participant-label">Email</span>
                                                    <span>{meetingRecord.interpreterId.email}</span>
                                                </div>
                                            </article>
                                        )}
                                    </div>
                                </section>
                            </div>

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

                            {meetingRecord.jobSeekerMessages && meetingRecord.jobSeekerMessages.length > 0 && (
                                <section className="detail-section" aria-labelledby="messages-heading-modal">
                                    <h2 id="messages-heading-modal">
                                        Job Seeker Messages ({meetingRecord.jobSeekerMessages.length})
                                    </h2>
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

                            {meetingRecord.chatMessages && meetingRecord.chatMessages.length > 0 && (
                                <div className="detail-section">
                                    <h2>Chat Messages ({meetingRecord.chatMessages.length})</h2>
                                    <div className="chat-container">
                                        {meetingRecord.chatMessages.map((message, index) => (
                                            <div key={index} className="chat-message">
                                                <div className="chat-header">
                                                    <span className="sender-name">
                                                        {message.userId === meetingRecord.recruiterId?._id
                                                            ? 'Recruiter'
                                                            : message.userId === meetingRecord.jobseekerId?._id
                                                                ? 'Job Seeker'
                                                                : 'Interpreter'}
                                                    </span>
                                                    <span className="chat-time">{formatDateTime(message.timestamp)}</span>
                                                </div>
                                                <div className="chat-content">{message.message}</div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {!isRecruiter && (
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
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    return typeof document !== 'undefined'
        ? createPortal(modalContent, document.body)
        : null;
}
