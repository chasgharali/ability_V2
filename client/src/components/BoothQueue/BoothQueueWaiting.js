import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { boothQueueAPI } from '../../services/boothQueue';
import './BoothQueueWaiting.css';

export default function BoothQueueWaiting() {
  const { eventSlug, boothId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { socket } = useSocket();
  
  const [event, setEvent] = useState(null);
  const [booth, setBooth] = useState(null);
  const [queuePosition, setQueuePosition] = useState(location.state?.queuePosition || 0);
  const [currentServing, setCurrentServing] = useState(0);
  const [queueToken, setQueueToken] = useState(location.state?.queueToken || '');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [messageType, setMessageType] = useState('text');
  const [messageContent, setMessageContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  
  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    loadData();
    joinSocketRoom();
    
    return () => {
      if (socket) {
        socket.emit('leave-booth-queue', { boothId, userId: user._id });
      }
    };
  }, [eventSlug, boothId]);

  useEffect(() => {
    if (socket) {
      socket.on('queue-position-updated', handleQueueUpdate);
      socket.on('queue-serving-updated', handleServingUpdate);
      socket.on('queue-invited-to-meeting', handleMeetingInvite);
      
      return () => {
        socket.off('queue-position-updated', handleQueueUpdate);
        socket.off('queue-serving-updated', handleServingUpdate);
        socket.off('queue-invited-to-meeting', handleMeetingInvite);
      };
    }
  }, [socket]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      const [eventRes, boothRes, queueRes] = await Promise.all([
        fetch(`/api/events/slug/${eventSlug}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`/api/booths/${boothId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        boothQueueAPI.getQueueStatus(boothId)
      ]);

      const eventData = await eventRes.json();
      const boothData = await boothRes.json();
      const queueData = await queueRes;

      if (eventData.success) setEvent(eventData.event);
      if (boothData.success) setBooth(boothData.booth);
      if (queueData.success) {
        setQueuePosition(queueData.position);
        setCurrentServing(queueData.currentServing);
        setQueueToken(queueData.token);
      }

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load queue information');
    } finally {
      setLoading(false);
    }
  };

  const joinSocketRoom = () => {
    if (socket && boothId && user) {
      socket.emit('join-booth-queue', { 
        boothId, 
        userId: user._id,
        eventSlug 
      });
    }
  };

  const handleQueueUpdate = (data) => {
    if (data.userId === user._id) {
      setQueuePosition(data.position);
    }
  };

  const handleServingUpdate = (data) => {
    if (data.boothId === boothId) {
      setCurrentServing(data.currentServing);
    }
  };

  const handleMeetingInvite = (data) => {
    if (data.userId === user._id && data.boothId === boothId) {
      // Navigate to meeting room
      navigate(`/meeting/${data.meetingId}`, {
        state: { fromQueue: true, eventSlug, boothId }
      });
    }
  };

  const handleLeaveQueue = async () => {
    if (window.confirm('Are you sure you want to leave the queue?')) {
      try {
        await boothQueueAPI.leaveQueue(boothId);
        navigate(`/events/registered/${eventSlug}`);
      } catch (error) {
        console.error('Error leaving queue:', error);
      }
    }
  };

  const handleReturnToEvent = () => {
    navigate(`/events/registered/${eventSlug}`);
  };

  const handleExitEvent = () => {
    navigate('/dashboard');
  };

  const handleSendMessage = async () => {
    try {
      const messageData = {
        boothId,
        type: messageType,
        content: messageContent,
        queueToken
      };

      await boothQueueAPI.sendMessage(messageData);
      setShowMessageModal(false);
      setMessageContent('');
      alert('Message sent successfully!');
    } catch (error) {
      console.error('Error sending message:', error);
      alert('Failed to send message');
    }
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: messageType === 'video' 
      });
      
      mediaRecorderRef.current = new MediaRecorder(stream);
      recordedChunksRef.current = [];
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) {
          recordedChunksRef.current.push(event.data);
        }
      };
      
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, {
          type: messageType === 'video' ? 'video/webm' : 'audio/webm'
        });
        
        const reader = new FileReader();
        reader.onload = () => {
          setMessageContent(reader.result);
        };
        reader.readAsDataURL(blob);
        
        stream.getTracks().forEach(track => track.stop());
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
    } catch (error) {
      console.error('Error starting recording:', error);
      alert('Failed to start recording');
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  if (loading) {
    return (
      <div className="booth-queue-waiting">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading queue information...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="booth-queue-waiting">
      {/* Header */}
      <header className="queue-header">
        <div className="header-left">
          <div className="booth-logo">
            {booth?.companyLogo && (
              <img src={booth.companyLogo} alt={`${booth.company} logo`} />
            )}
          </div>
          <div className="event-logo">
            {event?.logo && (
              <img src={event.logo} alt={`${event.name} logo`} />
            )}
          </div>
        </div>
        
        <div className="header-center">
          <h1 className="event-title">{event?.name}</h1>
          <h2 className="booth-title">{booth?.company}</h2>
        </div>
        
        <div className="header-right">
          <div className="queue-info">
            <div className="queue-numbers">
              <div className="your-number">
                <span className="label">Your Meeting Number</span>
                <span className="number">{queuePosition}</span>
              </div>
              <div className="serving-number">
                <span className="label">Now Serving Number</span>
                <span className="number">{currentServing}</span>
              </div>
            </div>
            <div className="queue-status">
              <span className="status-indicator waiting"></span>
              <span>Waiting</span>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="queue-main">
        <div className="waiting-message">
          <h3>You are now joining the queue.</h3>
          <p>Wait for the invitation to join a meeting</p>
        </div>

        <div className="queue-content">
          <div className="content-section">
            <h4>test content</h4>
          </div>
          <div className="content-section">
            <h4>test content</h4>
          </div>
          <div className="content-section">
            <h4>test content</h4>
          </div>
        </div>
      </main>

      {/* Bottom Actions */}
      <footer className="queue-actions">
        <button 
          className="action-btn camera-btn"
          onClick={() => alert('Camera & Mic selection coming soon')}
        >
          📹 Select your camera and mic
        </button>
        
        <button 
          className="action-btn message-btn"
          onClick={() => setShowMessageModal(true)}
        >
          💬 Create a message
        </button>
        
        <button 
          className="action-btn refresh-btn"
          onClick={() => window.location.reload()}
        >
          🔄 Refresh your connection
        </button>
        
        <button 
          className="action-btn return-btn"
          onClick={handleReturnToEvent}
        >
          ↩️ Return to main event
        </button>
        
        <button 
          className="action-btn exit-btn"
          onClick={handleExitEvent}
        >
          🚪 Exit the event
        </button>
      </footer>

      {/* Message Modal */}
      {showMessageModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3>Send Message to Recruiter</h3>
              <button 
                className="modal-close"
                onClick={() => setShowMessageModal(false)}
              >
                ×
              </button>
            </div>
            
            <div className="message-form">
              <div className="message-type-selector">
                <label>
                  <input
                    type="radio"
                    value="text"
                    checked={messageType === 'text'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Text Message
                </label>
                <label>
                  <input
                    type="radio"
                    value="audio"
                    checked={messageType === 'audio'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Audio Message
                </label>
                <label>
                  <input
                    type="radio"
                    value="video"
                    checked={messageType === 'video'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Video Message
                </label>
              </div>

              {messageType === 'text' ? (
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your message here..."
                  rows={4}
                />
              ) : (
                <div className="recording-controls">
                  {!isRecording ? (
                    <button onClick={startRecording} className="record-btn">
                      Start Recording {messageType === 'video' ? 'Video' : 'Audio'}
                    </button>
                  ) : (
                    <button onClick={stopRecording} className="stop-btn">
                      Stop Recording
                    </button>
                  )}
                  {messageContent && (
                    <p className="recording-ready">Recording ready to send</p>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button 
                  onClick={() => setShowMessageModal(false)}
                  className="btn-cancel"
                >
                  Cancel
                </button>
                <button 
                  onClick={handleSendMessage}
                  disabled={!messageContent}
                  className="btn-send"
                >
                  Send Message
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
