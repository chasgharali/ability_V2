import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';
import { useToast, ToastContainer } from '../common/Toast';
import { useSocket } from '../../contexts/SocketContext';
import { boothQueueAPI } from '../../services/boothQueue';
import videoCallService from '../../services/videoCall';
import VideoCall from '../VideoCall/VideoCall';
import { FaRedoAlt, FaPlug, FaVideo } from 'react-icons/fa';
import CallInviteModal from '../VideoCall/CallInviteModal';
import DeviceTestModal from './DeviceTestModal';
import RatingModal from '../MeetingRecords/RatingModal';
import { meetingRecordsAPI } from '../../services/meetingRecords';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import './BoothQueueManagement.css';
import '../Dashboard/Dashboard.css';

export default function BoothQueueManagement() {
  const { boothId } = useParams();
  const { user } = useAuth();
  const { getMessage } = useRoleMessages();
  const { socket } = useSocket();
  
  // Get role message from context
  const infoBannerMessage = getMessage('meeting-queue', 'info-banner') || '';

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
  const [toast, setToast] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [showMessagesModal, setShowMessagesModal] = useState(false);
  const [currentChatEntry, setCurrentChatEntry] = useState(null);
  const [messageToSend, setMessageToSend] = useState('');
  const [isSendingMessage, setIsSendingMessage] = useState(false);
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();

  // Video call state
  const [activeCall, setActiveCall] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  // Recruiter pre-join device selection
  const [showRecruiterInviteModal, setShowRecruiterInviteModal] = useState(false);
  const [pendingQueueEntry, setPendingQueueEntry] = useState(null);
  const [audioInputs, setAudioInputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  // Rating modal state
  const [showRatingModal, setShowRatingModal] = useState(false);
  const [ratingModalData, setRatingModalData] = useState(null);
  const [submittingRating, setSubmittingRating] = useState(false);
  const messagesEndRef = useRef(null);

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
    // Don't check for active calls automatically - only when recruiter creates one

    return () => {
      if (socket) {
        socket.emit('leave-booth-management', { boothId, userId: user?._id });
      }
    };
  }, [boothId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ensure we (re)join socket rooms after the socket connects/reconnects
  useEffect(() => {
    if (!socket) {
      setSocketConnected(false);
      return;
    }

    const handleConnect = () => {
      setSocketConnected(true);
      // Re-join rooms for this booth so we receive live updates
      joinSocketRoom();
    };

    const handleDisconnect = () => {
      setSocketConnected(false);
    };

    // Reflect current state immediately
    setSocketConnected(!!socket.connected);
    if (socket.connected) {
      // If already connected (hot reload/navigation), ensure we are in rooms
      joinSocketRoom();
    }

    socket.on('connect', handleConnect);
    socket.on('disconnect', handleDisconnect);

    return () => {
      socket.off('connect', handleConnect);
      socket.off('disconnect', handleDisconnect);
    };
  }, [socket, boothId, user]);

  // Check for active video call
  const checkActiveCall = async () => {
    try {
      const response = await videoCallService.getActiveCall();
      if (response.activeCall) {
        setActiveCall(response.activeCall);
        setIsInCall(true);
      }
    } catch (error) {
      console.error('Error checking active call:', error);
    }
  };

  useEffect(() => {
    if (!socket || !socket.connected) {
      setSocketConnected(false);
      return;
    }

    console.log('Setting up socket event listeners for booth management');
    setSocketConnected(true);
    socket.on('queue-updated', handleQueueUpdate);
    socket.on('new-queue-message', handleNewMessage);
    socket.on('jobseeker-left-with-message', handleJobSeekerLeftWithMessage);
    socket.on('test-connection-response', (data) => {
      console.log('Test connection response received:', data);
    });

    return () => {
      socket.off('queue-updated', handleQueueUpdate);
      socket.off('new-queue-message', handleNewMessage);
      socket.off('jobseeker-left-with-message', handleJobSeekerLeftWithMessage);
      socket.off('test-connection-response');
    };
  }, [socket?.connected]); // eslint-disable-line react-hooks/exhaustive-deps

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


  const loadData = async () => {
    try {
      setLoading(true);

      const [boothRes, queueRes] = await Promise.all([
        fetch(`/api/booths/${boothId}`, {
          headers: { Authorization: `Bearer ${sessionStorage.getItem('token')}` }
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

  const joinSocketRoom = async () => {
    if (!socket || !boothId || !user) {
      console.warn('Cannot join socket rooms:', { socket: !!socket, boothId, user: !!user });
      setToast('Cannot reconnect: Missing connection details');
      setTimeout(() => setToast(''), 3000);
      return;
    }

    try {
      setIsReconnecting(true);
      console.log('Joining socket rooms for booth management:', { boothId, userId: user._id, userRole: user.role });
      socket.emit('join-booth-management', { boothId, userId: user._id });
      // Also join booth room to receive generic queue updates
      socket.emit('join-booth-queue', { boothId, userId: user._id });

      // Add a small delay and then test the connection
      setTimeout(() => {
        console.log('Testing socket connection after joining rooms...');
        socket.emit('test-connection', { message: 'Testing after room join' });
        setToast('Reconnected to real-time updates');
        setTimeout(() => setToast(''), 2000);
      }, 1000);
    } catch (error) {
      console.error('Error joining socket rooms:', error);
      setToast('Failed to reconnect');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setIsReconnecting(false);
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
      setIsRefreshing(true);
      const queueRes = await boothQueueAPI.getBoothQueue(boothId);
      if (queueRes.success) {
        setQueue(queueRes.queue);
        setCurrentServing(queueRes.currentServing || 1);
        setToast('Queue data refreshed successfully');
        setTimeout(() => setToast(''), 2000);
      } else {
        setToast('Failed to refresh queue data');
        setTimeout(() => setToast(''), 3000);
      }
    } catch (error) {
      console.error('Error reloading queue data:', error);
      setToast('Error refreshing queue data');
      setTimeout(() => setToast(''), 3000);
    } finally {
      setIsRefreshing(false);
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const handleNewMessage = (data) => {
    if (data.boothId === boothId) {
      playNotificationSound();
      // Show toast with job seeker name, auto-dismiss after 200ms
      const jobSeekerName = data.queueEntry?.jobSeeker?.name || 'job seeker';
      showInfo(`New message from ${jobSeekerName}`, 200);
      
      // If chat modal is open for this entry, add message to chat and scroll
      if (currentChatEntry?._id === data.queueEntry._id && showMessagesModal) {
        setMessages(prev => [...prev, data.message]);
        setTimeout(scrollToBottom, 100);
      }
      
      // Always refresh queue data to update unread counter
      loadQueueData();
    }
  };

  const handleJobSeekerLeftWithMessage = (data) => {
    showInfo(`${data.jobSeekerName} left a ${data.messageType} message and exited the queue`);
    loadQueueData(); // Refresh queue to show left_with_message status
  };

  const handleSendMessage = async () => {
    if (!messageToSend.trim() || !currentChatEntry) return;

    try {
      setIsSendingMessage(true);
      await boothQueueAPI.sendMessageToJobSeeker(currentChatEntry._id, messageToSend);
      
      // Add message to local state immediately for instant feedback
      const newMessage = {
        type: 'text',
        content: messageToSend,
        sender: 'recruiter',
        createdAt: new Date(),
        isRead: true
      };
      setMessages(prev => [...prev, newMessage]);
      setMessageToSend('');
      // Removed toast notification for message sent
      
      // Scroll to bottom
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Error sending message to job seeker:', error);
      showError('Failed to send message');
    } finally {
      setIsSendingMessage(false);
    }
  };

  const playNotificationSound = () => {
    try {
      // Create a simple notification beep using Web Audio API
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);
      
      oscillator.frequency.value = 800;
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);
      
      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (err) {
      console.log('Could not play notification sound:', err);
    }
  };

  const enumerateDevicesForRecruiter = async () => {
    try {
      try { await navigator.mediaDevices.getUserMedia({ audio: true, video: true }); } catch (e) { }
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter(d => d.kind === 'audioinput');
      const videos = devices.filter(d => d.kind === 'videoinput');
      setAudioInputs(audios);
      setVideoInputs(videos);
      const savedAudio = sessionStorage.getItem('preferredAudioDeviceId');
      const savedVideo = sessionStorage.getItem('preferredVideoDeviceId');
      setSelectedAudioId(savedAudio || audios[0]?.deviceId || '');
      setSelectedVideoId(savedVideo || videos[0]?.deviceId || '');
    } catch (err) {
      console.error('Failed to enumerate devices (recruiter):', err);
    }
  };

  const handleDeviceSelection = async () => {
    try {
      // Request permissions and enumerate devices
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter(d => d.kind === 'audioinput');
      const videos = devices.filter(d => d.kind === 'videoinput');

      setAudioInputs(audios);
      setVideoInputs(videos);

      // Load saved preferences
      const savedAudio = sessionStorage.getItem('preferredAudioDeviceId');
      const savedVideo = sessionStorage.getItem('preferredVideoDeviceId');
      setSelectedAudioId(savedAudio || audios[0]?.deviceId || '');
      setSelectedVideoId(savedVideo || videos[0]?.deviceId || '');

      setShowDeviceModal(true);
    } catch (error) {
      console.error('Error accessing devices:', error);
      showError('Unable to access camera and microphone. Please check your permissions.');
    }
  };

  const handleDeviceSave = () => {
    if (selectedAudioId) {
      sessionStorage.setItem('preferredAudioDeviceId', selectedAudioId);
    }
    if (selectedVideoId) {
      sessionStorage.setItem('preferredVideoDeviceId', selectedVideoId);
    }

    setShowDeviceModal(false);
    showSuccess('Camera and microphone preferences saved successfully!');
  };

  const handleDeviceCancel = () => {
    setShowDeviceModal(false);
  };

  const handleInviteToMeeting = async (queueEntry) => {
    setPendingQueueEntry(queueEntry);
    await enumerateDevicesForRecruiter();
    setShowRecruiterInviteModal(true);
  };

  const handleRecruiterAcceptInvite = async () => {
    try {
      if (selectedAudioId) sessionStorage.setItem('preferredAudioDeviceId', selectedAudioId);
      if (selectedVideoId) sessionStorage.setItem('preferredVideoDeviceId', selectedVideoId);
      setShowRecruiterInviteModal(false);
      if (!pendingQueueEntry) return;

      const queueEntry = pendingQueueEntry;
      setPendingQueueEntry(null);

      // Create video call after device selection
      const callResponse = await videoCallService.createCall(queueEntry._id);
      if (callResponse.success) {
        setActiveCall({
          id: callResponse.callId,
          roomName: callResponse.roomName,
          accessToken: callResponse.accessToken,
          userRole: 'recruiter',
          booth: callResponse.booth,
          event: callResponse.event,
          participants: {
            recruiter: user,
            jobSeeker: callResponse.jobSeeker
          },
          metadata: {
            interpreterRequested: callResponse.interpreterRequested,
            interpreterCategory: callResponse.interpreterCategory
          }
        });
        setIsInCall(true);
        await handleUpdateServing(queueEntry.position);
      }
    } catch (error) {
      console.error('Error creating video call:', error);
      alert('Failed to start video call with job seeker');
    }
  };

  const handleRecruiterDeclineInvite = () => {
    setShowRecruiterInviteModal(false);
    setPendingQueueEntry(null);
  };

  const handleCallEnd = async () => {
    try {
      // Create meeting record from the video call
      if (activeCall && (activeCall.id || activeCall.callId)) {
        const videoCallId = activeCall.id || activeCall.callId;
        await meetingRecordsAPI.createFromVideoCall(videoCallId);
      }
    } catch (error) {
      console.error('Error creating meeting record:', error);
      // Don't show error toast - we'll still show rating modal
    }

    // Always show rating modal for recruiters, regardless of meeting record creation success
    if (user.role === 'Recruiter' && activeCall) {
      const jobSeekerName = activeCall.jobSeekerName || 
                           activeCall.jobSeeker?.name || 
                           'Job Seeker';
      
      setRatingModalData({
        meetingId: null, // Will be set after meeting record is created
        videoCallId: activeCall.id || activeCall.callId,
        jobSeekerName: jobSeekerName
      });
      setShowRatingModal(true);
    }

    setActiveCall(null);
    setIsInCall(false);
    // Refresh queue data to see updated statuses
    loadData();
  };

  const showToast = (message, type = 'info') => {
    setToast(message);
    setTimeout(() => setToast(''), 3000);
  };

  const handleRatingSubmit = async ({ rating, feedback }) => {
    try {
      setSubmittingRating(true);
      
      // First, get the meeting record ID by creating it from the video call
      if (ratingModalData?.videoCallId) {
        const meetingRecord = await meetingRecordsAPI.createFromVideoCall(ratingModalData.videoCallId);
        
        // Submit the rating
        await meetingRecordsAPI.submitRating(meetingRecord._id, rating, feedback);
        
        showToast('Rating submitted successfully!', 'success');
        setShowRatingModal(false);
        setRatingModalData(null);
      }
    } catch (error) {
      console.error('Error submitting rating:', error);
      showToast('Failed to submit rating. Please try again.', 'error');
    } finally {
      setSubmittingRating(false);
    }
  };

  const handleRatingClose = () => {
    if (!submittingRating) {
      setShowRatingModal(false);
      setRatingModalData(null);
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
    setCurrentChatEntry(queueEntry);
    setShowMessagesModal(true);
    try {
      const response = await boothQueueAPI.getQueueMessages(queueEntry._id);
      if (response.success) {
        setMessages(response.messages || []);
        // Scroll to bottom after messages load
        setTimeout(scrollToBottom, 100);
        // Refresh queue to update counter
        loadQueueData();
      }
    } catch (error) {
      console.error('Error fetching messages:', error);
      showError('Error loading messages');
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
            {infoBannerMessage && (
              <div className="info-banner" style={{ marginBottom: '1.5rem' }}>
                <span>{infoBannerMessage}</span>
              </div>
            )}
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
                  {/* Compact stats in header */}
                  <div className="header-stats">
                    <div className="header-stat">
                      <span className="stat-label">Total</span>
                      <span className="stat-value">{queue.length}</span>
                    </div>
                    <div className="header-stat">
                      <span className="stat-label">Serving</span>
                      <span className="stat-value">{currentServing}</span>
                    </div>
                    <div className="header-stat">
                      <span className="stat-label">Waiting</span>
                      <span className="stat-value">{queue.filter(q => q.position > currentServing).length}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="serving-controls">
                <div className="serving-controls-row">
                  <span className={`rt-badge ${socketConnected ? 'online' : 'offline'}`} title={socketConnected ? 'Real-time connected' : 'Real-time offline'}>
                    <span className="rt-dot" /> {socketConnected ? 'Online' : 'Offline'}
                  </span>
                  <button
                    onClick={loadQueueData}
                    className={`icon-btn refresh-btn ${isRefreshing ? 'loading' : ''}`}
                    title="Refresh Queue Data"
                    aria-label="Refresh Queue Data"
                    disabled={isRefreshing}
                  >
                    <FaRedoAlt size={16} />
                  </button>
                  <button
                    onClick={joinSocketRoom}
                    className={`icon-btn reconnect-btn ${isReconnecting ? 'loading' : ''}`}
                    title="Reconnect to Real-time Updates"
                    aria-label="Reconnect to Real-time Updates"
                    disabled={isReconnecting}
                  >
                    <FaPlug size={16} />
                  </button>
                </div>
                <div className="serving-controls-row">
                  <label>Now Serving:</label>
                  <input
                    type="number"
                    value={currentServing}
                    onChange={(e) => setCurrentServing(parseInt(e.target.value) || 1)}
                    min="1"
                    className="serving-input"
                    aria-label="Current serving number"
                  />
                </div>
                <div className="serving-controls-row">
                  <button
                    onClick={async () => {
                      await handleUpdateServing(currentServing);
                      setToast('Now Serving updated');
                      setTimeout(() => setToast(''), 2000);
                    }}
                    className="update-serving-btn"
                    style={{ background: '#111827', borderColor: '#111827', color: '#fff' }}
                    aria-label="Update serving number"
                  >
                    Update
                  </button>
                  <button
                    onClick={handleDeviceSelection}
                    className="test-device-btn"
                    title="Test Camera & Microphone"
                    aria-label="Test camera and microphone devices"
                  >
                    <FaVideo size={16} aria-hidden="true" /> Test Device
                  </button>
                </div>
              </div>
            </div>

            {/* Stats moved to header; removed cards */}

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
                      className={`queue-card ${queueEntry.status === 'left_with_message' ? 'left-message' : queueEntry.status === 'in_meeting' || queueEntry.isInCall ? 'in-call' : queueEntry.position <= currentServing ? 'ready' : 'waiting'}`}
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
                            <h3>Meeting no. {queueEntry.position}</h3>
                            <p className="job-seeker-name">{queueEntry.jobSeeker.name}</p>
                            <p className="job-seeker-email">{queueEntry.jobSeeker.email}</p>
                          </div>
                        </div>

                        <div className="queue-status">
                          {queueEntry.status === 'left_with_message' ? (
                            <span className="status-badge left-message-badge">Left Message</span>
                          ) : queueEntry.status === 'in_meeting' || queueEntry.isInCall ? (
                            <span className="status-badge in-call">In Call</span>
                          ) : queueEntry.position <= currentServing ? (
                            <span className="status-badge ready">Ready</span>
                          ) : (
                            <span className="status-badge waiting">Waiting</span>
                          )}
                        </div>
                      </div>

                      <div className="queue-details">
                        <div className="waiting-row">
                          <div className="waiting-left">
                            <strong>{queueEntry.status === 'in_meeting' || queueEntry.isInCall ? 'In Call:' : 'Waiting:'}</strong>
                            <span className="waiting-timer">{formatDuration(nowTs - new Date(queueEntry.joinedAt).getTime())}</span>
                          </div>
                          <button
                            onClick={() => { setSelectedJobSeeker(queueEntry); setShowDetails(true); }}
                            className="btn-details-inline"
                          >
                            View Details
                          </button>
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
                        {queueEntry.status === 'left_with_message' ? (
                          <>
                            <button
                              onClick={() => handleViewMessages(queueEntry)}
                              className="btn-messages"
                              style={{ background: theme.primary, borderColor: theme.primary }}
                            >
                              View Message ({queueEntry.messageCount || 0})
                            </button>
                            <button
                              onClick={() => handleRemoveFromQueue(queueEntry)}
                              className="btn-remove"
                              style={{ background: theme.danger, borderColor: theme.danger }}
                            >
                              Remove
                            </button>
                          </>
                        ) : queueEntry.status === 'in_meeting' || queueEntry.isInCall ? (
                          <>
                            <button
                              onClick={() => handleInviteToMeeting(queueEntry)}
                              className="btn-invite"
                              style={{ background: theme.success, borderColor: theme.success }}
                              disabled
                            >
                              Invite
                            </button>

                            <button
                              onClick={() => handleViewMessages(queueEntry)}
                              className="btn-messages"
                              style={{ background: theme.primary, borderColor: theme.primary }}
                              disabled
                            >
                              Messages ({queueEntry.messageCount || 0})
                            </button>

                            <button
                              onClick={() => handleRemoveFromQueue(queueEntry)}
                              className="btn-remove"
                              style={{ background: theme.danger, borderColor: theme.danger }}
                              disabled
                            >
                              Remove
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleInviteToMeeting(queueEntry)}
                              className="btn-invite"
                              style={{ background: theme.success, borderColor: theme.success }}
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
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </main>
      </div>

      {/* Chat-style Messages Modal */}
      {showMessagesModal && currentChatEntry && (
        <div className="modal-overlay">
          <div className="modal-content text-messaging-modal">
            <div className="modal-header">
              <h3>Messages - {currentChatEntry.jobSeeker.name}</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setShowMessagesModal(false);
                  setCurrentChatEntry(null);
                  setMessages([]);
                  setMessageToSend('');
                }}
              >
                ×
              </button>
            </div>

            <div className="messages-container">
              <div className="messages-list">
                {messages.length === 0 ? (
                  <p className="no-messages">No messages yet</p>
                ) : (
                  <>
                    {messages.map((msg, index) => (
                      <div 
                        key={index} 
                        className={`message-bubble ${msg.sender === 'recruiter' ? 'sent' : 'received'}`}
                      >
                        <div className="message-sender">
                          {msg.sender === 'recruiter' ? 'You' : currentChatEntry.jobSeeker.name}
                        </div>
                        {msg.type === 'text' ? (
                          <div className="message-text">{msg.content}</div>
                        ) : msg.type === 'audio' ? (
                          <audio src={msg.content} controls style={{ width: '100%', maxWidth: '250px' }} />
                        ) : (
                          <video
                            src={msg.content}
                            controls
                            style={{ width: '100%', maxWidth: '250px', borderRadius: '8px' }}
                          />
                        )}
                        <div className="message-time">
                          {new Date(msg.createdAt).toLocaleTimeString()}
                        </div>
                      </div>
                    ))}
                    <div ref={messagesEndRef} />
                  </>
                )}
              </div>

              <div className="message-input-area">
                <textarea
                  value={messageToSend}
                  onChange={(e) => setMessageToSend(e.target.value)}
                  placeholder="Type your message..."
                  rows={3}
                  aria-label="Message content"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!messageToSend.trim() || isSendingMessage}
                  className="btn-send-message"
                  type="button"
                >
                  {isSendingMessage ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Job Seeker Profile Modal */}
      {showDetails && selectedJobSeeker && (
        <div className="modal-overlay">
          <div className="modal-content profile-modal">
            <div className="modal-header">
              <h3>Job Seeker Profile</h3>
              <button
                className="modal-close"
                onClick={() => setShowDetails(false)}
              >
                ×
              </button>
            </div>

            <div className="profile-body">
              {/* Profile Header */}
              <div className="profile-header">
                <div className="profile-avatar">
                  {selectedJobSeeker.jobSeeker.avatarUrl ? (
                    <img src={selectedJobSeeker.jobSeeker.avatarUrl} alt="Profile" />
                  ) : (
                    <div className="avatar-placeholder">
                      {selectedJobSeeker.jobSeeker.name.charAt(0)}
                    </div>
                  )}
                  <div className="online-indicator"></div>
                </div>
                <div className="profile-info">
                  <h2 className="profile-name">{selectedJobSeeker.jobSeeker.name}</h2>
                  <p className="profile-email">{selectedJobSeeker.jobSeeker.email}</p>
                  {selectedJobSeeker.jobSeeker.phoneNumber && (
                    <p className="profile-phone">{selectedJobSeeker.jobSeeker.phoneNumber}</p>
                  )}
                  {(selectedJobSeeker.jobSeeker.city || selectedJobSeeker.jobSeeker.state) && (
                    <p className="profile-location">
                      {[selectedJobSeeker.jobSeeker.city, selectedJobSeeker.jobSeeker.state, 'US'].filter(Boolean).join(', ')}
                    </p>
                  )}
                  <div className="profile-actions">
                    {selectedJobSeeker.jobSeeker.resumeUrl ? (
                      <a
                        href={selectedJobSeeker.jobSeeker.resumeUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="btn-resume"
                      >
                        📄 View Complete Resume
                      </a>
                    ) : (
                      <button className="btn-resume" disabled>📄 No Resume Available</button>
                    )}
                  </div>
                </div>
              </div>

              {/* Professional Details */}
              <div className="professional-details">
                <h3>Professional Details</h3>

                <div className="details-grid">
                  {/* Professional Summary */}
                  <div className="detail-section">
                    <h4>Professional Summary</h4>
                    <div className="detail-content">
                      <div className="detail-item">
                        <span className="detail-label">PROFESSIONAL HEADLINE</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.professionalHeadline || 'this is test headline'}</p>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">KEYWORDS & SKILLS</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.skills || 'mern dev'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Experience & Employment */}
                  <div className="detail-section">
                    <h4>Experience & Employment</h4>
                    <div className="detail-content">
                      <div className="detail-item">
                        <span className="detail-label">PRIMARY JOB EXPERIENCE</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.primaryJobExperience || 'Accounting / Finance'}</p>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.secondaryJobExperience || 'Administrative Services / Human Resources'}</p>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">EMPLOYMENT TYPES</span>
                        <div className="tags">
                          <span className="tag">Part-Time</span>
                          <span className="tag">Contract</span>
                        </div>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">EXPERIENCE LEVEL</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.experienceLevel || 'Experienced (non-Manager)'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Education & Qualifications */}
                  <div className="detail-section">
                    <h4>Education & Qualifications</h4>
                    <div className="detail-content">
                      <div className="detail-item">
                        <span className="detail-label">HIGHEST EDUCATION LEVEL</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.education || 'General Educational Development (GED)'}</p>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">SECURITY CLEARANCE</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.securityClearance || 'None'}</p>
                      </div>
                    </div>
                  </div>

                  {/* Additional Information */}
                  <div className="detail-section">
                    <h4>Additional Information</h4>
                    <div className="detail-content">
                      <div className="detail-item">
                        <span className="detail-label">LANGUAGES</span>
                        <div className="tags">
                          <span className="tag">ASL/Sign Language</span>
                          <span className="tag">English</span>
                          <span className="tag">Urdu</span>
                        </div>
                      </div>
                      <div className="detail-item">
                        <span className="detail-label">VETERAN/MILITARY STATUS</span>
                        <p>{selectedJobSeeker.jobSeeker.metadata?.veteranStatus || 'None'}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />

      {/* Video Call Component */}
      {isInCall && activeCall && (
        <VideoCall
          callId={typeof activeCall === 'string' ? activeCall : activeCall.id}
          callData={typeof activeCall === 'object' ? activeCall : null}
          onCallEnd={handleCallEnd}
        />
      )}

      {/* Recruiter device selection before inviting */}
      {showRecruiterInviteModal && (
        <CallInviteModal
          recruiterName={user?.name}
          boothName={booth?.name}
          eventName={event?.name}
          audioInputs={audioInputs}
          videoInputs={videoInputs}
          selectedAudioId={selectedAudioId}
          selectedVideoId={selectedVideoId}
          onChangeAudio={setSelectedAudioId}
          onChangeVideo={setSelectedVideoId}
          onAccept={handleRecruiterAcceptInvite}
          onDecline={handleRecruiterDeclineInvite}
        />
      )}

      {/* Rating Modal */}
      {showRatingModal && ratingModalData && (
        <RatingModal
          isOpen={showRatingModal}
          onClose={handleRatingClose}
          onSubmit={handleRatingSubmit}
          jobSeekerName={ratingModalData.jobSeekerName}
          loading={submittingRating}
        />
      )}

      {/* Device Test Modal */}
      <DeviceTestModal
        isOpen={showDeviceModal}
        onClose={handleDeviceCancel}
        audioInputs={audioInputs}
        videoInputs={videoInputs}
        selectedAudioId={selectedAudioId}
        selectedVideoId={selectedVideoId}
        onChangeAudio={setSelectedAudioId}
        onChangeVideo={setSelectedVideoId}
        onSave={handleDeviceSave}
      />
    </div>
  );
}
