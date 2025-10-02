import React, { useState, useEffect } from 'react';
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
  const [messages, setMessages] = useState([]);

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
      socket.on('queue-updated', handleQueueUpdate);
      socket.on('new-queue-message', handleNewMessage);
      
      return () => {
        socket.off('queue-updated', handleQueueUpdate);
        socket.off('new-queue-message', handleNewMessage);
      };
    }
  }, [socket]);

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
      socket.emit('join-booth-management', { 
        boothId, 
        userId: user._id 
      });
    }
  };

  const handleQueueUpdate = (data) => {
    if (data.boothId === boothId) {
      setQueue(data.queue);
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
                </div>
              </div>
              
              <div className="serving-controls">
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
                            {queueEntry.jobSeeker.profilePicture ? (
                              <img src={queueEntry.jobSeeker.profilePicture} alt="Profile" />
                            ) : (
                              <div className="avatar-placeholder">
                                {queueEntry.jobSeeker.name.charAt(0)}
                              </div>
                            )}
                          </div>
                          <div>
                            <h3>Meeting no. {queueEntry.position}</h3>
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
                          <strong>Joined:</strong> {new Date(queueEntry.joinedAt).toLocaleTimeString()}
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
                          onClick={() => handleInviteToMeeting(queueEntry)}
                          className="btn-invite"
                          disabled={queueEntry.position > currentServing}
                        >
                          Invite
                        </button>
                        
                        <button
                          onClick={() => handleViewMessages(queueEntry)}
                          className="btn-messages"
                        >
                          Messages ({queueEntry.messageCount || 0})
                        </button>
                        
                        <button
                          onClick={() => handleRemoveFromQueue(queueEntry)}
                          className="btn-remove"
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
    </div>
  );
}
