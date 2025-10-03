import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { boothQueueAPI } from '../../services/boothQueue';
import VideoCall from '../VideoCall/VideoCall';
import './BoothQueueWaiting.css';
import AdminHeader from '../Layout/AdminHeader';
import '../Dashboard/Dashboard.css';

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
  
  // Video call state
  const [callInvitation, setCallInvitation] = useState(null);
  const [isInCall, setIsInCall] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);

  useEffect(() => {
    loadData();
    joinSocketRoom();

    // Handle page unload (close tab, navigate away, etc.) - only for actual page unload
    const handleBeforeUnload = (event) => {
      // Only leave queue on actual page unload, not navigation within the app
      if (event.type === 'beforeunload') {
        // Use synchronous request for beforeunload
        navigator.sendBeacon('/api/booth-queue/leave', JSON.stringify({ boothId }));
      }
    };

    // Don't remove users on visibility change - they might just switch tabs
    // Only handle actual page unload
    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      if (socket) {
        socket.emit('leave-booth-queue', { boothId, userId: user._id });
      }
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [eventSlug, boothId]);

  useEffect(() => {
    if (socket) {
      socket.on('queue-position-updated', handleQueueUpdate);
      socket.on('queue-serving-updated', handleServingUpdate);
      socket.on('queue-invited-to-meeting', handleMeetingInvite);
      socket.on('call_invitation', handleCallInvitation);

      return () => {
        socket.off('queue-position-updated', handleQueueUpdate);
        socket.off('queue-serving-updated', handleServingUpdate);
        socket.off('queue-invited-to-meeting', handleMeetingInvite);
        socket.off('call_invitation', handleCallInvitation);
      };
    }
  }, [socket]);

  // Heartbeat to keep connection alive and detect if user is still active
  useEffect(() => {
    const heartbeatInterval = setInterval(() => {
      if (socket && socket.connected) {
        socket.emit('queue-heartbeat', { boothId, userId: user._id });
      }
    }, 120000); // Send heartbeat every 2 minutes (less aggressive)

    return () => clearInterval(heartbeatInterval);
  }, [socket, boothId, user._id]);

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

      // Normalize event
      let extractedEvent = null;
      if (eventData?.event) extractedEvent = eventData.event;
      else if (eventData?.success && eventData?.data) extractedEvent = eventData.data;
      else if (eventData?.name) extractedEvent = eventData;

      // Normalize booth
      let extractedBooth = null;
      if (boothData?.booth) extractedBooth = boothData.booth;
      else if (boothData?.success && boothData?.data) extractedBooth = boothData.data;
      else if (boothData?.name) extractedBooth = boothData;

      if (extractedEvent) setEvent(extractedEvent);
      if (extractedBooth) setBooth(extractedBooth);
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

  const handleCallInvitation = (data) => {
    console.log('Received call invitation:', data);
    // Set call invitation data and show video call interface
    setCallInvitation({
      id: data.callId,
      roomName: data.roomName,
      accessToken: data.accessToken,
      userRole: 'jobseeker',
      participants: {
        recruiter: data.recruiter,
        jobSeeker: user
      },
      metadata: {
        interpreterRequested: false,
        interpreterCategory: null
      }
    });
    setIsInCall(true);
  };

  const handleCallEnd = () => {
    setCallInvitation(null);
    setIsInCall(false);
    // Refresh queue status after call ends
    loadData();
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
    // Don't leave queue when returning to event - user might want to come back
    navigate(`/events/registered/${eventSlug}`);
  };

  const handleExitEvent = async () => {
    // Only leave queue when explicitly exiting the event
    if (window.confirm('Are you sure you want to exit the event? This will remove you from the queue.')) {
      try {
        await boothQueueAPI.leaveQueue(boothId);
      } catch (error) {
        console.error('Error leaving queue:', error);
      }
      navigate('/dashboard');
    }
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
      {/* Global header with event branding */}
      <AdminHeader brandingLogo={event?.logoUrl || event?.logo || ''} />

      {/* Main content area */}
      <div className="waiting-layout">
        {/* Main content */}
        <div className="waiting-main">
          {/* Header with booth logo */}
          <div className="event-header">
            <div className="header-content">
              <div className="booth-logo-section">
                {booth?.logoUrl ? (
                  <img src={booth.logoUrl} alt={`${booth?.name || 'Company'} logo`} className="booth-logo-modern" />
                ) : (
                  <div className="booth-logo-modern-placeholder">
                    <span>{booth?.name?.[0] || 'C'}</span>
                  </div>
                )}
              </div>
              <div className="event-info">
                <h1 className="event-title">{event?.name || 'ABILITY Job Fair - Event'}</h1>
                <h2 className="booth-subtitle">{booth?.name || 'Company Booth'}</h2>
              </div>
            </div>
          </div>

          {/* Waiting message */}
          <div className="waiting-message">
            <h3>You are now joining the queue.</h3>
            <p>Wait for the invitation to join a meeting</p>
          </div>

          {/* Content sections - expanded */}
          <div className="content-grid-expanded">
            {(booth?.richSections && booth.richSections.length > 0
              ? booth.richSections
                .filter(s => s.isActive !== false)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .slice(0, 3)
              : [
                { title: 'First Placeholder', contentHtml: '<p>place1e</p>' },
                { title: 'Second Placeholder', contentHtml: '<p>place2e</p>' },
                { title: 'Third Placeholder', contentHtml: '<p>place3e</p>' }
              ]
            ).map((section, idx) => (
              <div key={section._id || idx} className="content-card-expanded">
                {section.title && <h4 className="content-title">{section.title}</h4>}
                {section.contentHtml ? (
                  <div className="content-body" dangerouslySetInnerHTML={{ __html: section.contentHtml }} />
                ) : (
                  <p className="content-placeholder">Content will be available soon.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right sidebar with queue info and actions */}
        <div className="waiting-sidebar-right">
          <div className="queue-numbers">
            <div className="queue-number-card">
              <span className="queue-label">Your Meeting Number</span>
              <span className="queue-number">{queuePosition}</span>
            </div>
            <div className="queue-number-card">
              <span className="queue-label">Now Serving Number</span>
              <span className="queue-number">{currentServing}</span>
            </div>
          </div>
          <div className="queue-status">
            <span className="status-dot waiting"></span>
            <span className="status-text">Waiting</span>
          </div>

          {/* Return button */}
          <button className="return-btn" onClick={handleReturnToEvent}>
            Return to<br />abilityJOBS.com Employer
          </button>

          {/* Action buttons moved here */}
          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn camera-btn"
              onClick={() => alert('Camera & Mic selection coming soon')}
            >
              📹 Select your camera and mic
            </button>

            <button
              className="sidebar-action-btn message-btn"
              onClick={() => setShowMessageModal(true)}
            >
              💬 Create a message
            </button>

            <button
              className="sidebar-action-btn refresh-btn"
              onClick={() => window.location.reload()}
            >
              🔄 Refresh your connection
            </button>

            <button
              className="sidebar-action-btn return-btn-alt"
              onClick={handleReturnToEvent}
            >
              ↩️ Return to main event
            </button>

            <button
              className="sidebar-action-btn exit-btn"
              onClick={handleExitEvent}
            >
              🚪 Exit the event
            </button>
          </div>
        </div>
      </div>

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

      {/* Video Call Component */}
      {isInCall && callInvitation && (
        <VideoCall
          callData={callInvitation}
          onCallEnd={handleCallEnd}
        />
      )}
    </div>
  );
}
