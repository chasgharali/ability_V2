import React, { useState, useEffect, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { boothQueueAPI } from '../../services/boothQueue';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import './BoothQueueManagement.css';

export default function BoothQueueManagement() {
  const { boothId } = useParams();
  const { user } = useAuth();
  const { socket } = useSocket();

  const [booth, setBooth] = useState(null);
  const [event, setEvent] = useState(null);
  const [queue, setQueue] = useState([]);
  const [currentServing, setCurrentServing] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selectedJobSeeker, setSelectedJobSeeker] = useState(null);
  const [showMessages, setShowMessages] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [messages, setMessages] = useState([]);
  const [nowTs, setNowTs] = useState(Date.now());
  const [socketConnected, setSocketConnected] = useState(false);

  // Theme colors from event (fallbacks provided)
  const theme = useMemo(() => ({
    primary: event?.theme?.primaryColor || '#3b82f6',
    success: event?.theme?.successColor || '#10b981',
    danger: event?.theme?.dangerColor || '#ef4444',
    warningBg: '#fef3c7',
    warningText: '#92400e',
  }), [event]);

  useEffect(() => {
    loadData();
    joinSocketRoom();

    return () => {
      if (socket) {
        socket.emit('leave-booth-management', { boothId, userId: user._id });
      }
    };
  }, [boothId]);

  useEffect(() => {
    if (socket) {
      console.log('Socket connected, setting up event listeners');
      setSocketConnected(true);
      socket.on('queue-updated', handleQueueUpdate);
      socket.on('new-queue-message', handleNewMessage);
      socket.on('test-connection-response', (data) => {
        console.log('Test connection response received:', data);
      });

      // Test socket connection
      socket.emit('test-connection', { message: 'Testing socket connection' });

      return () => {
        console.log('Cleaning up socket event listeners');
        socket.off('queue-updated', handleQueueUpdate);
        socket.off('new-queue-message', handleNewMessage);
      };
    } else {
      console.log('No socket available');
      setSocketConnected(false);
    }
  }, [socket]);

  // Tick every second for live waiting timers
  useEffect(() => {
    const id = setInterval(() => setNowTs(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const formatDuration = (ms) => {
    const total = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    const pad = (n) => String(n).padStart(2, '0');
    return h > 0 ? `${pad(h)}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
  };

  const shortToken = (token) => {
    if (!token) return '';
    return `#${token.slice(-6).toUpperCase()}`;
  };

  const loadData = async () => {
    try {
      setLoading(true);

      const [boothRes, queueRes] = await Promise.all([
        fetch(`/api/booths/${boothId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        boothQueueAPI.getBoothQueue(boothId)
      ]);

      const boothData = await boothRes.json();

      if (boothRes.ok && boothData.booth) {
        setBooth(boothData.booth);

        // Set event data if it's included in the response
        if (boothData.event) {
          setEvent(boothData.event);
        }
      } else {
        console.error('Failed to load booth:', boothData.message || boothData.error);
      }

      if (queueRes.success) {
        setQueue(queueRes.queue);
        setCurrentServing(queueRes.currentServing || 1);
      } else {
        console.error('Failed to load queue:', queueRes.message);
      }

    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const joinSocketRoom = () => {
    if (socket && boothId && user) {
      console.log('Joining socket rooms for booth management:', { boothId, userId: user._id, userRole: user.role });
      socket.emit('join-booth-management', { boothId, userId: user._id });
      // Also join booth room to receive generic queue updates
      socket.emit('join-booth-queue', { boothId, userId: user._id });

      // Add a small delay and then test the connection
      setTimeout(() => {
        console.log('Testing socket connection after joining rooms...');
        socket.emit('test-connection', { message: 'Testing after room join' });
      }, 1000);
    } else {
      console.warn('Cannot join socket rooms:', { socket: !!socket, boothId, user: !!user });
    }
  };

  const handleQueueUpdate = (data) => {
    console.log('Received queue-updated event:', data);
    console.log('Current boothId:', boothId);
    console.log('Event boothId:', data.boothId, 'Event booth:', data.booth);

    // When any update occurs for this booth, reload queue from API
    if (data.boothId === boothId || data.booth === boothId) {
      console.log('Reloading queue data due to update');
      // Use a more efficient approach - only reload queue data, not booth data
      loadQueueData();
    } else {
      console.log('Queue update not for this booth, ignoring');
    }
  };

  const loadQueueData = async () => {
    try {
      const queueRes = await boothQueueAPI.getBoothQueue(boothId);
      if (queueRes.success) {
        setQueue(queueRes.queue);
        setCurrentServing(queueRes.currentServing || 1);
      }
    } catch (error) {
      console.error('Error reloading queue data:', error);
    }
  };

  const handleNewMessage = (data) => {
    if (data.boothId === boothId && selectedJobSeeker?._id === data.queueEntry._id) {
      setMessages(prev => [...prev, data.message]);
    }
  };

  const handleInviteToMeeting = async (queueEntry) => {
    try {
      const meetingData = {
        jobSeekerId: queueEntry.jobSeeker._id,
        boothId: booth._id,
        eventId: event._id,
        interpreterCategory: queueEntry.interpreterCategory
      };

      await boothQueueAPI.inviteToMeeting(queueEntry._id, meetingData);

      // Update serving number
      await handleUpdateServing(queueEntry.position);

      alert(`${queueEntry.jobSeeker.name} has been invited to the meeting!`);
    } catch (error) {
      console.error('Error inviting to meeting:', error);
      alert('Failed to invite job seeker to meeting');
    }
  };

  const handleUpdateServing = async (newServingNumber) => {
    try {
      await boothQueueAPI.updateServingNumber(boothId, newServingNumber);
      setCurrentServing(newServingNumber);

      // Emit socket event for real-time updates
      if (socket) {
        socket.emit('serving-number-updated', {
          boothId,
          currentServing: newServingNumber
        });
      }
    } catch (error) {
      console.error('Error updating serving number:', error);
    }
  };

  const handleRemoveFromQueue = async (queueEntry) => {
    if (window.confirm(`Remove ${queueEntry.jobSeeker.name} from the queue?`)) {
      try {
        await boothQueueAPI.removeFromQueue(queueEntry._id);
        loadData(); // Refresh queue
      } catch (error) {
        console.error('Error removing from queue:', error);
        alert('Failed to remove job seeker from queue');
      }
    }
  };

  const handleViewMessages = async (queueEntry) => {
    try {
      setSelectedJobSeeker(queueEntry);
      const messagesRes = await boothQueueAPI.getQueueMessages(queueEntry._id);
      if (messagesRes.success) {
        setMessages(messagesRes.messages);
      }
      setShowMessages(true);
    } catch (error) {
      console.error('Error loading messages:', error);
      setMessages([]);
      setShowMessages(true);
    }
  };

  if (loading) {
    return (
      <div className="dashboard">
        <AdminHeader
          brandingLogo={event?.logoUrl || event?.logo || ''}
          secondaryLogo={booth?.logoUrl || booth?.companyLogo || ''}
        />
        <div className="dashboard-layout">
          <AdminSidebar active="booths" />
          <main className="dashboard-main">
            <div className="loading">Loading booth queue...</div>
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
        <AdminSidebar active="booths" />
        <main className="dashboard-main">
          <div className="booth-queue-management">
            {/* Header */}
            <div className="management-header">
              <div className="booth-info">
                <div className="booth-logo">
                  {(booth?.logoUrl || booth?.companyLogo) && (
                    <img src={booth?.logoUrl || booth?.companyLogo} alt={`${booth?.name || booth?.company} logo`} />
                  )}
                </div>
                <div>
                  <h1>{booth?.name || booth?.company} - Meeting Queue</h1>
                  <p>{event?.name}</p>
                  <div className="connection-status">
                    <span className={`status-indicator ${socketConnected ? 'connected' : 'disconnected'}`}>
                      {socketConnected ? '🟢 Real-time updates active' : '🔴 Real-time updates offline'}
                    </span>
                  </div>
                </div>
              </div>

              <div className="serving-controls">
                <button
                  onClick={loadQueueData}
                  className="refresh-btn"
                  title="Refresh queue data"
                >
                  🔄 Refresh
                </button>
                <button
                  onClick={joinSocketRoom}
                  className="refresh-btn"
                  title="Rejoin socket rooms"
                >
                  🔌 Reconnect
                </button>
                <button
                  onClick={() => {
                    console.log('Testing socket emit...');
                    socket.emit('test-connection', { message: 'Manual test' });
                  }}
                  className="refresh-btn"
                  title="Test socket connection"
                >
                  🧪 Test Socket
                </button>
                <button
                  onClick={() => {
                    console.log('Simulating queue update...');
                    handleQueueUpdate({
                      boothId: boothId,
                      action: 'test',
                      queueEntry: { _id: 'test', position: 1 }
                    });
                  }}
                  className="refresh-btn"
                  title="Test queue update handler"
                >
                  📋 Test Queue Update
                </button>
                <label>Now Serving:</label>
                <input
                  type="number"
                  value={currentServing}
                  onChange={(e) => setCurrentServing(parseInt(e.target.value) || 1)}
                  min="1"
                  className="serving-input"
                />
                <button
                  onClick={() => handleUpdateServing(currentServing)}
                  className="update-serving-btn"
                >
                  Update
                </button>
              </div>
            </div>

            {/* Queue Stats */}
            <div className="queue-stats">
              <div className="stat-card">
                <h3>Total Queue Count</h3>
                <span className="stat-number">{queue.length}</span>
              </div>
              <div className="stat-card">
                <h3>Currently Serving</h3>
                <span className="stat-number">{currentServing}</span>
              </div>
              <div className="stat-card">
                <h3>Waiting</h3>
                <span className="stat-number">{queue.filter(q => q.position > currentServing).length}</span>
              </div>
            </div>

            {/* Queue List */}
            <div className="queue-list">
              <h2>Job Seekers in Queue</h2>

              {queue.length === 0 ? (
                <div className="empty-queue">
                  <p>No job seekers in queue</p>
                </div>
              ) : (
                <div className="queue-grid">
                  {queue.map((queueEntry) => (
                    <div
                      key={queueEntry._id}
                      className={`queue-card ${queueEntry.position <= currentServing ? 'ready' : 'waiting'}`}
                    >
                      <div className="queue-card-header">
                        <div className="job-seeker-info">
                          <div className="avatar">
                            {queueEntry.jobSeeker.avatarUrl ? (
                              <img src={queueEntry.jobSeeker.avatarUrl} alt="Profile" />
                            ) : (
                              <div className="avatar-placeholder">
                                {queueEntry.jobSeeker.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div>
                            <h3>
                              <span className="token-badge" title={queueEntry.queueToken}>{shortToken(queueEntry.queueToken)}</span>
                              Meeting no. {queueEntry.position}
                            </h3>
                            <p className="job-seeker-name">{queueEntry.jobSeeker.name}</p>
                            <p className="job-seeker-email">{queueEntry.jobSeeker.email}</p>
                          </div>
                        </div>

                        <div className="queue-status">
                          {queueEntry.position <= currentServing ? (
                            <span className="status-badge ready">Ready</span>
                          ) : (
                            <span className="status-badge waiting">Waiting</span>
                          )}
                        </div>
                      </div>

                      <div className="queue-details">
                        <div className="detail-item">
                          <strong>Waiting:</strong> <span className="waiting-timer">{formatDuration(nowTs - new Date(queueEntry.joinedAt).getTime())}</span>
                        </div>
                        {queueEntry.interpreterCategory && (
                          <div className="detail-item">
                            <strong>Interpreter:</strong> {queueEntry.interpreterCategory.name}
                          </div>
                        )}
                        {queueEntry.messageCount > 0 && (
                          <div className="detail-item">
                            <strong>Messages:</strong> {queueEntry.messageCount} unread
                          </div>
                        )}
                      </div>

                      <div className="queue-actions">
                        <button
                          onClick={() => { setSelectedJobSeeker(queueEntry); setShowDetails(true); }}
                          className="btn-details"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => handleInviteToMeeting(queueEntry)}
                          className="btn-invite"
                          style={{ background: theme.success, borderColor: theme.success }}
                          disabled={queueEntry.position > currentServing}
                        >
                          Invite
                        </button>

                        <button
                          onClick={() => handleViewMessages(queueEntry)}
                          className="btn-messages"
                          style={{ background: theme.primary, borderColor: theme.primary }}
                        >
                          Messages ({queueEntry.messageCount || 0})
                        </button>

                        <button
                          onClick={() => handleRemoveFromQueue(queueEntry)}
                          className="btn-remove"
                          style={{ background: theme.danger, borderColor: theme.danger }}
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Messages Modal */}
      {showMessages && selectedJobSeeker && (
        <div className="modal-overlay">
          <div className="modal-content messages-modal">
            <div className="modal-header">
              <h3>Messages from {selectedJobSeeker.jobSeeker.name}</h3>
              <button
                className="modal-close"
                onClick={() => setShowMessages(false)}
              >
                ×
              </button>
            </div>

            <div className="messages-list">
              {messages.length === 0 ? (
                <p className="no-messages">No messages from this job seeker</p>
              ) : (
                messages.map((message, index) => (
                  <div key={index} className="message-item">
                    <div className="message-header">
                      <span className="message-type">{message.type}</span>
                      <span className="message-time">
                        {new Date(message.createdAt).toLocaleString()}
                      </span>
                    </div>
                    <div className="message-content">
                      {message.type === 'text' ? (
                        <p>{message.content}</p>
                      ) : (
                        <div className="media-message">
                          {message.type === 'audio' ? (
                            <audio controls src={message.content} />
                          ) : (
                            <video controls src={message.content} />
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {showDetails && selectedJobSeeker && (
        <div className="modal-overlay">
          <div className="modal-content details-modal">
            <div className="modal-header">
              <h3>Job Seeker Details</h3>
              <button
                className="modal-close"
                onClick={() => setShowDetails(false)}
              >
                ×
              </button>
            </div>
            <div className="details-body">
              <div className="details-header">
                <div className="avatar lg">
                  {selectedJobSeeker.jobSeeker.avatarUrl ? (
                    <img src={selectedJobSeeker.jobSeeker.avatarUrl} alt="Profile" />
                  ) : (
                    <div className="avatar-placeholder">
                      {selectedJobSeeker.jobSeeker.name.charAt(0)}
                    </div>
                  )}
                </div>
                <div>
                  <h4 className="details-name">{selectedJobSeeker.jobSeeker.name}</h4>
                  <p className="details-email">{selectedJobSeeker.jobSeeker.email}</p>
                  {selectedJobSeeker.jobSeeker.phoneNumber && (
                    <p className="details-meta">{selectedJobSeeker.jobSeeker.phoneNumber}</p>
                  )}
                  {(selectedJobSeeker.jobSeeker.city || selectedJobSeeker.jobSeeker.state) && (
                    <p className="details-meta">{[selectedJobSeeker.jobSeeker.city, selectedJobSeeker.jobSeeker.state].filter(Boolean).join(', ')}</p>
                  )}
                </div>
              </div>

              <div className="details-actions">
                {selectedJobSeeker.jobSeeker.resumeUrl ? (
                  <a
                    href={selectedJobSeeker.jobSeeker.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn btn-primary"
                    style={{ background: theme.primary, borderColor: theme.primary }}
                  >
                    View Resume
                  </a>
                ) : (
                  <button className="btn" disabled>No Resume</button>
                )}
                <button
                  className="btn"
                  onClick={() => setShowDetails(false)}
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
