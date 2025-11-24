import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import { boothQueueAPI } from '../../services/boothQueue';
import { uploadAudioToS3, uploadVideoToS3 } from '../../services/uploads';
import { FaVideo, FaCommentDots, FaSyncAlt, FaArrowLeft, FaSignOutAlt, FaBars } from 'react-icons/fa';
import VideoCall from '../VideoCall/VideoCall';
import CallInviteModal from '../VideoCall/CallInviteModal';
import DeviceTestModal from './DeviceTestModal';
import { useToast, ToastContainer } from '../common/Toast';
import './BoothQueueWaiting.css';
import AdminHeader from '../Layout/AdminHeader';

export default function BoothQueueWaiting() {
  const { eventSlug, boothId } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const { socket } = useSocket();
  const { toasts, removeToast, showSuccess, showError, showInfo } = useToast();

  const [event, setEvent] = useState(null);
  const [booth, setBooth] = useState(null);
  // Persist numbers across refresh
  const initialQueuePos = (() => {
    const fromState = location.state?.queuePosition;
    const fromStorage = sessionStorage.getItem(`queuePos_${boothId}`);
    return typeof fromState === 'number' ? fromState : (fromStorage ? Number(fromStorage) : 0);
  })();
  const initialServing = (() => {
    const fromStorage = sessionStorage.getItem(`serving_${boothId}`);
    return fromStorage ? Number(fromStorage) : 0;
  })();
  const [queuePosition, setQueuePosition] = useState(initialQueuePos);
  const [currentServing, setCurrentServing] = useState(initialServing);
  const [queueToken, setQueueToken] = useState(location.state?.queueToken || '');
  const [queueEntryId, setQueueEntryId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showMessageModal, setShowMessageModal] = useState(false);
  const [showLeaveMessageModal, setShowLeaveMessageModal] = useState(false);
  const [showTextMessagingModal, setShowTextMessagingModal] = useState(false);
  const [messageType, setMessageType] = useState('text');
  const [messageContent, setMessageContent] = useState('');
  const [textMessageContent, setTextMessageContent] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showMessagePreview, setShowMessagePreview] = useState(false);
  const [recordedBlob, setRecordedBlob] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [messages, setMessages] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [isMobile, setIsMobile] = useState(window.innerWidth <= 1199);
  const modalRef = useRef(null);
  const previousFocusRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Video call state
  const [callInvitation, setCallInvitation] = useState(null);
  const [isInCall, setIsInCall] = useState(false);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [pendingInvitation, setPendingInvitation] = useState(null);
  const [audioInputs, setAudioInputs] = useState([]);
  const [videoInputs, setVideoInputs] = useState([]);
  const [selectedAudioId, setSelectedAudioId] = useState('');
  const [selectedVideoId, setSelectedVideoId] = useState('');
  const [showDeviceModal, setShowDeviceModal] = useState(false);

  const mediaRecorderRef = useRef(null);
  const recordedChunksRef = useRef([]);
  const announcementCounterRef = useRef(0);

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

  // Initialize speech synthesis on mount
  useEffect(() => {
    // Trigger voice loading immediately
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      console.log('✓ Speech synthesis available');
    } else {
      console.warn('⚠️ Speech synthesis not supported in this browser');
    }
  }, []);

  // Ensure we (re)join socket rooms after the socket connects/reconnects
  useEffect(() => {
    if (!socket) return;

    const handleConnect = () => {
      // Re-join booth room so recruiter sees updates in real-time
      joinSocketRoom();
    };

    socket.on('connect', handleConnect);
    return () => {
      socket.off('connect', handleConnect);
    };
  }, [socket, boothId, user?._id]);

  useEffect(() => {
    if (!socket || !socket.connected) return;

    socket.on('queue-position-updated', handleQueueUpdate);
    socket.on('queue-serving-updated', handleServingUpdate);
    socket.on('queue-invited-to-meeting', handleMeetingInvite);
    socket.on('call_invitation', handleCallInvitation);
    socket.on('new-message-from-recruiter', handleNewMessageFromRecruiter);
    // Detect server-side queue leaves (e.g., when recruiter ends call)
    socket.on('queue-updated', handleQueueUpdated);
    socket.on('queue_left', handleQueueUpdated);

    return () => {
      socket.off('queue-position-updated', handleQueueUpdate);
      socket.off('queue-serving-updated', handleServingUpdate);
      socket.off('queue-invited-to-meeting', handleMeetingInvite);
      socket.off('call_invitation', handleCallInvitation);
      socket.off('new-message-from-recruiter', handleNewMessageFromRecruiter);
      socket.off('queue-updated', handleQueueUpdated);
      socket.off('queue_left', handleQueueUpdated);
    };
  }, [socket?.connected]);

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

      // Load event and booth in parallel
      const [eventRes, boothRes] = await Promise.all([
        fetch(`/api/events/slug/${eventSlug}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`/api/booths/${boothId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        })
      ]);

      const eventData = await eventRes.json();
      const boothData = await boothRes.json();

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

      // Load queue status separately so a 404 doesn't break the page on refresh
      try {
        const queueData = await boothQueueAPI.getQueueStatus(boothId);
        if (queueData?.success) {
          setQueuePosition(queueData.position);
          setCurrentServing(queueData.currentServing);
          setQueueToken(queueData.token);
          setQueueEntryId(queueData.queueEntry?._id);
          setUnreadCount(queueData.unreadMessages || 0);
          try {
            sessionStorage.setItem(`queuePos_${boothId}`, String(queueData.position));
            sessionStorage.setItem(`serving_${boothId}`, String(queueData.currentServing));
          } catch (e) { }
        } else {
          // Not in queue or backend returned a non-successful shape
          // Do not reset to 0; retain last known value in UI
        }
      } catch (qErr) {
        // Gracefully handle 404 Not Found (user not in queue after refresh)
        console.warn('Queue status unavailable (likely not in queue):', qErr?.response?.status || qErr);
        // Keep existing values to avoid flashing zeros
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
    if (data?.queueEntry?.jobSeeker?._id === user?._id) {
      setQueuePosition(data.queueEntry.position);
      setQueueEntryId(data.queueEntry._id);
      try {
        sessionStorage.setItem(`queuePos_${boothId}`, String(data.queueEntry.position));
      } catch (e) { }
      speak(`Your position has been updated to ${data.queueEntry.position}.`, 'polite');
    }
  };

  const handleServingUpdate = (data) => {
    if (data.boothId === boothId) {
      const oldServing = currentServing;
      setCurrentServing(data.currentServing);
      try { sessionStorage.setItem(`serving_${boothId}`, String(data.currentServing)); } catch (e) { }

      // Announce serving number changes to screen readers
      if (oldServing !== data.currentServing) {
        const announcement = `Now serving number ${data.currentServing}`;
        announceToScreenReader(announcement);

        // Check if user is next or being called
        if (queuePosition === data.currentServing) {
          const urgentAnnouncement = 'It is now your turn! Please prepare for your meeting invitation.';
          announceToScreenReader(urgentAnnouncement);
          speak(urgentAnnouncement);
        } else if (queuePosition === data.currentServing + 1) {
          const nextAnnouncement = 'You are next in line. Please be ready.';
          announceToScreenReader(nextAnnouncement);
        }
      }
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

  // Handle queue updates from server indicating the user has left
  const handleQueueUpdated = (data) => {
    try {
      // We get this on booth rooms; ensure it's this booth and it's our queue entry
      if (!data) return;
      const sameBooth = String(data.boothId) === String(boothId);
      const isLeft = data.action === 'left' || data.type === 'left';
      const je = data.queueEntry?.jobSeeker;
      const jobSeekerId = typeof je === 'string' ? je : je?._id;
      const isCurrentUser = String(jobSeekerId) === String(user._id);

      if (sameBooth && isLeft && isCurrentUser) {
        // User has been removed from the queue (e.g., call ended)
        setIsInCall(false);
        setCallInvitation(null);
        // Redirect out of the waiting page
        navigate(`/events/registered/${eventSlug}`);
      }
    } catch (err) {
      console.warn('Error handling queue-updated event:', err);
    }
  };

  // Play a short beep using Web Audio
  const playInviteSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 880; // A5
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.2, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.6);
      o.start();
      o.stop(ctx.currentTime + 0.6);
    } catch (e) {
      // ignore audio failures
    }
  };

  const enumerateDevicesAndShowModal = async () => {
    try {
      // Request permissions so device labels are available
      await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
    } catch (e) {
      // If user blocks, still attempt to enumerate
    }
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audios = devices.filter(d => d.kind === 'audioinput');
      const videos = devices.filter(d => d.kind === 'videoinput');
      setAudioInputs(audios);
      setVideoInputs(videos);
      const savedAudio = localStorage.getItem('preferredAudioDeviceId');
      const savedVideo = localStorage.getItem('preferredVideoDeviceId');
      setSelectedAudioId(savedAudio || audios[0]?.deviceId || '');
      setSelectedVideoId(savedVideo || videos[0]?.deviceId || '');
      setShowInviteModal(true);
    } catch (err) {
      console.error('Failed to enumerate devices:', err);
      // Fallback: proceed without modal
      handleAcceptInvite();
    }
  };

  // Announce to screen readers using ARIA live regions
  const announceToScreenReader = (message) => {
    announcementCounterRef.current += 1;
    const uniqueId = `announcement-${Date.now()}-${announcementCounterRef.current}-${Math.random().toString(36).substr(2, 9)}`;
    setAnnouncements(prev => {
      const newAnnouncements = [...prev, { id: uniqueId, message }];
      // Keep only last 5 announcements
      return newAnnouncements.slice(-5);
    });
  };

  // Simple, reliable speech function using native SpeechSynthesis
  const speak = (text) => {
    try {
      if (!('speechSynthesis' in window)) {
        console.warn('Speech synthesis not supported');
        return;
      }

      // Cancel any ongoing speech
      window.speechSynthesis.cancel();

      console.log('🗣️ Speaking:', text);

      // Create utterance
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.volume = 1.0;
      utterance.lang = 'en-US';

      // Get voices and set English voice if available
      const voices = window.speechSynthesis.getVoices();
      const englishVoice = voices.find(voice => voice.lang.startsWith('en'));
      if (englishVoice) {
        utterance.voice = englishVoice;
      }

      // Event handlers
      utterance.onstart = () => {
        console.log('▶️ Speech started');
      };

      utterance.onend = () => {
        console.log('✅ Speech completed');
      };

      utterance.onerror = (event) => {
        console.error('❌ Speech error:', event.error);
      };

      // Speak immediately
      window.speechSynthesis.speak(utterance);

    } catch (e) {
      console.error('Speech error:', e);
    }
  };


  const handleCallInvitation = (data) => {
    console.log('Received call invitation:', data);
    setPendingInvitation(data);
    playInviteSound();
    const boothName = booth?.name || data?.booth?.name || '';
    const eventName = event?.name || data?.event?.name || '';
    const message = `You are invited to join a video call${boothName ? ` at ${boothName}` : ''}${eventName ? ` for ${eventName}` : ''}.`;
    speak(message);
    enumerateDevicesAndShowModal();
  };

  const handleAcceptInvite = () => {
    if (!pendingInvitation) return;
    if (selectedAudioId) localStorage.setItem('preferredAudioDeviceId', selectedAudioId);
    if (selectedVideoId) localStorage.setItem('preferredVideoDeviceId', selectedVideoId);
    // Build callData for VideoCall
    const data = pendingInvitation;
    setCallInvitation({
      id: data.callId,
      roomName: data.roomName,
      accessToken: data.accessToken,
      userRole: 'jobseeker',
      booth: data.booth,
      event: data.event,
      participants: {
        recruiter: data.recruiter,
        jobSeeker: user
      },
      metadata: {
        interpreterRequested: false,
        interpreterCategory: null
      }
    });
    setShowInviteModal(false);
    setIsInCall(true);
  };

  const handleDeclineInvite = () => {
    setShowInviteModal(false);
    setPendingInvitation(null);
  };

  const handleCallEnd = () => {
    setCallInvitation(null);
    setIsInCall(false);
    // Backend already removes queue entry on call end; navigate away
    navigate(`/events/registered/${eventSlug}`);
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

  const handleNewMessageFromRecruiter = (data) => {
    if (data.queueId === queueEntryId || data.boothId === boothId) {
      playNotificationSound();
      // Show toast that stays until manually closed
      showInfo('New message from recruiter', 0); // 0 means no auto-dismiss

      // If chat modal is open, add message to chat and scroll
      if (showTextMessagingModal) {
        setMessages(prev => [...prev, data.message]);
        setTimeout(scrollToBottom, 100);
      } else {
        // If modal is closed, increment unread counter
        setUnreadCount(prev => prev + 1);
      }
    }
  };

  const handleLeaveQueue = async () => {
    if (window.confirm('Are you sure you want to leave the queue?')) {
      try {
        await boothQueueAPI.leaveQueue(boothId);
        showSuccess('Successfully left the queue');
        navigate(`/events/registered/${eventSlug}`);
      } catch (error) {
        console.error('Error leaving queue:', error);
        showError('Failed to leave queue');
      }
    }
  };

  const handleReturnToEvent = () => {
    // Open event page in a new tab without leaving the queue
    const eventUrl = `/events/registered/${eventSlug}`;
    window.open(eventUrl, '_blank');
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
      const savedAudio = localStorage.getItem('preferredAudioDeviceId');
      const savedVideo = localStorage.getItem('preferredVideoDeviceId');
      setSelectedAudioId(savedAudio || audios[0]?.deviceId || '');
      setSelectedVideoId(savedVideo || videos[0]?.deviceId || '');

      setShowDeviceModal(true);
    } catch (error) {
      console.error('Error accessing devices:', error);
      alert('Unable to access camera and microphone. Please check your permissions.');
    }
  };


  const handleDeviceSave = () => {
    if (selectedAudioId) {
      localStorage.setItem('preferredAudioDeviceId', selectedAudioId);
    }
    if (selectedVideoId) {
      localStorage.setItem('preferredVideoDeviceId', selectedVideoId);
    }

    setShowDeviceModal(false);
    showSuccess('Camera and microphone preferences saved successfully!');
  };

  const handleDeviceCancel = () => {
    setShowDeviceModal(false);
  };

  const handleMobilePanelClose = () => {
    setMobilePanelOpen(false);
    announceToScreenReader('Queue panel closed');
  };

  const handleMobilePanelToggle = () => {
    const newState = !mobilePanelOpen;
    setMobilePanelOpen(newState);
    announceToScreenReader(newState ? 'Queue panel opened' : 'Queue panel closed');
  };

  // Focus management for modals
  const openModal = () => {
    previousFocusRef.current = document.activeElement;
    setShowMessageModal(true);
  };

  const closeModal = () => {
    setShowMessageModal(false);
    if (previousFocusRef.current) {
      previousFocusRef.current.focus();
    }
  };

  // Focus trap for modal
  const handleModalKeyDown = (event) => {
    if (event.key === 'Escape') {
      closeModal();
      return;
    }

    if (event.key === 'Tab') {
      const modal = modalRef.current;
      if (!modal) return;

      const focusableElements = modal.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements[focusableElements.length - 1];

      if (event.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          event.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          event.preventDefault();
        }
      }
    }
  };

  // Focus first element when modal opens
  useEffect(() => {
    if (showMessageModal && modalRef.current) {
      const firstFocusable = modalRef.current.querySelector(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (firstFocusable) {
        firstFocusable.focus();
      }
    }
  }, [showMessageModal]);

  // Keyboard event handler for accessibility
  const handleKeyDown = (event) => {
    if (event.key === 'Escape' && mobilePanelOpen) {
      handleMobilePanelClose();
    }
  };

  // Add keyboard event listener and window resize listener
  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);

    const handleResize = () => {
      const mobile = window.innerWidth <= 1199;
      setIsMobile(mobile);
      if (!mobile && mobilePanelOpen) {
        setMobilePanelOpen(false);
      }
    };

    window.addEventListener('resize', handleResize);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('resize', handleResize);
    };
  }, [mobilePanelOpen]);

  const handleSendTextMessage = async () => {
    try {
      if (!textMessageContent.trim()) return;

      setIsUploading(true);
      const messageData = {
        boothId,
        type: 'text',
        content: textMessageContent,
        queueToken
      };

      await boothQueueAPI.sendMessage(messageData);

      // Add message to local state immediately
      const newMessage = {
        type: 'text',
        content: textMessageContent,
        sender: 'jobseeker',
        createdAt: new Date(),
        isRead: true
      };
      setMessages(prev => [...prev, newMessage]);
      setTextMessageContent('');
      // Removed toast notification for message sent

      // Scroll to bottom
      setTimeout(scrollToBottom, 100);
    } catch (error) {
      console.error('Error sending message:', error);
      showError('Failed to send message');
    } finally {
      setIsUploading(false);
    }
  };

  const handleLeaveWithMessage = async () => {
    try {
      let finalContent = messageContent;

      if (messageType === 'text') {
        if (!messageContent.trim()) {
          showError('Please enter a message');
          return;
        }
        finalContent = messageContent.trim();
      } else {
        if (!recordedBlob) {
          showError('Please record a message first');
          return;
        }

        setIsUploading(true);
        const file = new File(
          [recordedBlob],
          `leave_message_${Date.now()}.${messageType === 'audio' ? 'webm' : 'webm'}`,
          { type: recordedBlob.type }
        );

        const uploadResult = messageType === 'audio'
          ? await uploadAudioToS3(file)
          : await uploadVideoToS3(file);

        finalContent = uploadResult.downloadUrl;
      }

      setIsUploading(true);
      await boothQueueAPI.leaveWithMessage({
        boothId,
        type: messageType,
        content: finalContent,
        queueToken
      });

      setShowLeaveMessageModal(false);
      setRecordedBlob(null);
      setMessageContent('');
      showSuccess('Message sent! You have left the queue.');
      navigate(`/events/registered/${eventSlug}`);
    } catch (error) {
      console.error('Error leaving with message:', error);
      showError('Failed to send leave message');
    } finally {
      setIsUploading(false);
    }
  };

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  };

  const loadMessages = async () => {
    if (!queueEntryId) {
      console.error('No queue entry ID available');
      return;
    }
    try {
      const response = await boothQueueAPI.getMessages(queueEntryId);
      if (response.success) {
        setMessages(response.messages || []);
        setUnreadCount(0); // Mark as read when viewing
        // Scroll to bottom after messages load
        setTimeout(scrollToBottom, 100);
      }
    } catch (error) {
      console.error('Error loading messages:', error);
    }
  };

  const handleViewMessages = async () => {
    setShowTextMessagingModal(true);
    await loadMessages();
  };

  const handleSendMessage = async () => {
    try {
      setIsUploading(true);
      let finalContent = messageContent;

      // If it's audio/video, upload to S3 first
      if ((messageType === 'audio' || messageType === 'video') && recordedBlob) {
        const fileName = `message_${Date.now()}.${messageType === 'audio' ? 'webm' : 'webm'}`;
        const file = new File([recordedBlob], fileName, {
          type: messageType === 'audio' ? 'audio/webm' : 'video/webm'
        });

        const uploadResult = messageType === 'audio'
          ? await uploadAudioToS3(file)
          : await uploadVideoToS3(file);

        finalContent = uploadResult.downloadUrl;
      }

      const messageData = {
        boothId,
        type: messageType,
        content: finalContent,
        queueToken
      };

      await boothQueueAPI.sendMessage(messageData);

      // Reset all message-related state
      setShowMessageModal(false);
      setShowMessagePreview(false);
      setMessageContent('');
      setRecordedBlob(null);
      setMessageType('text');

      showSuccess('Message sent successfully!');

      // If audio/video message, leave queue and navigate to event detail
      if (messageType === 'audio' || messageType === 'video') {
        try {
          await boothQueueAPI.leaveQueue(boothId);
        } catch (error) {
          console.error('Error leaving queue after message:', error);
        }
        navigate(`/events/registered/${eventSlug}`);
      }
    } catch (error) {
      console.error('Error sending message:', error);
      showError('Failed to send message');
    } finally {
      setIsUploading(false);
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

        setRecordedBlob(blob);

        // Create preview URL for audio/video
        const previewUrl = URL.createObjectURL(blob);
        setMessageContent(previewUrl);
        setShowMessagePreview(true);

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

  const handleMessagePreview = () => {
    if (recordedBlob) {
      setShowMessagePreview(true);
    }
  };

  const handleRetakeRecording = () => {
    setRecordedBlob(null);
    setMessageContent('');
    setShowMessagePreview(false);
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
      <AdminHeader brandingLogo={event?.logoUrl || event?.logo || ''} hideMenuToggle={true} />

      {/* Skip to main content link for screen readers */}
      <a href="#main-content" className="skip-link sr-only sr-only-focusable">
        Skip to main content
      </a>

      {/* Main content area */}
      <div className="waiting-layout">
        {/* Mobile backdrop overlay */}
        {mobilePanelOpen && (
          <div
            className="mobile-backdrop"
            onClick={handleMobilePanelClose}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleMobilePanelClose();
              }
            }}
            role="button"
            tabIndex={0}
            aria-label="Close queue panel"
          />
        )}

        {/* Left sidebar with queue info and actions (moved from right) */}
        <div
          id="queue-panel"
          className={`waiting-sidebar-left mobile-collapsible ${mobilePanelOpen ? 'open' : ''}`}
          role="complementary"
          aria-label="Queue information and actions"
          aria-hidden={isMobile && !mobilePanelOpen ? 'true' : 'false'}
        >
          <div className="sidebar-header">
            <div className="booth-logo-section">
              {booth?.logoUrl ? (
                <img
                  src={booth.logoUrl}
                  alt={`${booth?.name || 'Company'} logo`}
                  className="booth-logo-modern"
                />
              ) : (
                <div className="booth-logo-modern-placeholder" role="img" aria-label={`${booth?.name || 'Company'} logo placeholder`}>
                  <span aria-hidden="true">{booth?.name?.[0] || 'C'}</span>
                </div>
              )}
            </div>
            <div className="event-info">
              <h1 className="event-title" id="event-title">{event?.name || 'ABILITY Job Fair - Event'}</h1>
              <h2 className="booth-subtitle" id="booth-title">{booth?.name || 'Company Booth'}</h2>
            </div>
          </div>

          <div className="queue-numbers" role="region" aria-label="Queue status information">
            <div className="queue-number-card" role="status" aria-live="polite">
              <span className="queue-label" id="user-position-label">Your Meeting Number</span>
              <span
                className="queue-number"
                aria-labelledby="user-position-label"
                aria-describedby="queue-position-desc"
              >
                {queuePosition}
              </span>
              <span id="queue-position-desc" className="sr-only">
                You are number {queuePosition} in the queue
              </span>
            </div>
            <div className="queue-number-card" role="status" aria-live="polite">
              <span className="queue-label" id="serving-number-label">Now Serving Number</span>
              <span
                className="queue-number"
                aria-labelledby="serving-number-label"
                aria-describedby="serving-number-desc"
              >
                {currentServing}
              </span>
              <span id="serving-number-desc" className="sr-only">
                Currently serving number {currentServing}
              </span>
            </div>
          </div>

          <div className="queue-status" role="status" aria-live="polite" aria-label="Current queue status">
            <span className="status-dot waiting" aria-hidden="true"></span>
            <span className="status-text">Waiting in queue</span>
          </div>

          {/* Action buttons */}
          <div className="sidebar-actions">
            <button
              className="sidebar-action-btn camera-btn"
              onClick={handleDeviceSelection}
              aria-label="Select camera and microphone devices"
              type="button"
            >
              <FaVideo aria-hidden="true" /> Select camera & mic
            </button>

            <button
              className="sidebar-action-btn message-btn"
              onClick={handleViewMessages}
              aria-label="View and send text messages to the recruiter"
              type="button"
            >
              <FaCommentDots aria-hidden="true" />Send Messages {unreadCount > 0 && `(${unreadCount})`}
            </button>

            <button
              className="sidebar-action-btn leave-message-btn"
              onClick={() => { setShowLeaveMessageModal(true); setMessageType('audio'); }}
              aria-label="Leave a message and exit the queue"
              type="button"
            >
              <FaCommentDots aria-hidden="true" /> Leave Message
            </button>

            <button
              className="sidebar-action-btn refresh-btn"
              onClick={() => window.location.reload()}
              aria-label="Refresh connection to update queue status"
              type="button"
            >
              <FaSyncAlt aria-hidden="true" /> Refresh connection
            </button>

            <button
              className="sidebar-action-btn return-btn-alt"
              onClick={handleReturnToEvent}
              aria-label="Return to main event page in new tab"
              type="button"
            >
              <FaArrowLeft aria-hidden="true" /> Return to main event
            </button>

            <button
              className="sidebar-action-btn exit-btn"
              onClick={handleExitEvent}
              aria-label="Exit the event and leave the queue"
              type="button"
            >
              <FaSignOutAlt aria-hidden="true" /> Exit the event
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="waiting-main" id="main-content">
          {/* Mobile toggle for queue panel */}
          <button
            className="mobile-toggle-btn"
            onClick={handleMobilePanelToggle}
            aria-expanded={mobilePanelOpen}
            aria-controls="queue-panel"
            aria-label={mobilePanelOpen ? 'Close queue information panel' : 'Open queue information panel'}
            type="button"
          >
            <FaBars aria-hidden="true" />
            {mobilePanelOpen ? 'Close Queue Options' : 'Queue Options'}
          </button>

          {/* Waiting message on top of placeholders */}
          <div className="waiting-message-header waiting-message-centered" role="status" aria-live="polite">
            <h3>You are now in the queue.</h3>
            <p>An invitation to join will appear when it's your turn.</p>
          </div>

          {/* ARIA Live Regions for Screen Reader Announcements */}
          <div aria-live="assertive" aria-atomic="true" className="sr-only">
            {announcements.map(announcement => (
              <div key={announcement.id}>{announcement.message}</div>
            ))}
          </div>

          {/* Content sections - expanded */}
          <div className="content-grid-expanded">
            {(booth?.richSections && booth.richSections.length > 0
              ? booth.richSections
                .filter(s => s.isActive !== false)
                .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
                .slice(0, 3)
              : [
                {
                  contentHtml: '<div style="width:100%;height:180px;border-radius:8px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;color:#6b7280;font-weight:600;">Welcome to the booth</div>'
                },
                {
                  contentHtml: '<div style="width:100%;height:180px;border-radius:8px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;color:#6b7280;font-weight:600;">Resources coming soon</div>'
                },
                {
                  contentHtml: '<div style="width:100%;height:180px;border-radius:8px;background:linear-gradient(135deg,#f3f4f6,#e5e7eb);display:flex;align-items:center;justify-content:center;color:#6b7280;font-weight:600;">Please stay on this page</div>'
                }
              ]
            ).map((section, idx) => (
              <div key={section._id || idx} className="content-card-expanded">
                {section.contentHtml ? (
                  <div className="content-body" dangerouslySetInnerHTML={{ __html: section.contentHtml }} />
                ) : (
                  <p className="content-placeholder">Content will be available soon.</p>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Removed old right sidebar */}
      </div>


      {/* Message Modal */}
      {showMessageModal && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-labelledby="modal-title"
          onKeyDown={handleModalKeyDown}
        >
          <div className="modal-content" ref={modalRef}>
            <div className="modal-header">
              <h3 id="modal-title">Send Message to Recruiter</h3>
              <button
                className="modal-close"
                onClick={closeModal}
                aria-label="Close message dialog"
                type="button"
              >
                ×
              </button>
            </div>

            <div className="message-form">
              <fieldset className="message-type-selector">
                <legend className="sr-only">Choose message type</legend>
                <label>
                  <input
                    type="radio"
                    name="messageType"
                    value="text"
                    checked={messageType === 'text'}
                    onChange={(e) => setMessageType(e.target.value)}
                    aria-describedby="text-message-desc"
                  />
                  Text Message
                  <span id="text-message-desc" className="sr-only">Send a written text message</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="messageType"
                    value="audio"
                    checked={messageType === 'audio'}
                    onChange={(e) => setMessageType(e.target.value)}
                    aria-describedby="audio-message-desc"
                  />
                  Audio Message
                  <span id="audio-message-desc" className="sr-only">Record and send an audio message</span>
                </label>
                <label>
                  <input
                    type="radio"
                    name="messageType"
                    value="video"
                    checked={messageType === 'video'}
                    onChange={(e) => setMessageType(e.target.value)}
                    aria-describedby="video-message-desc"
                  />
                  Video Message
                  <span id="video-message-desc" className="sr-only">Record and send a video message</span>
                </label>
              </fieldset>

              {messageType === 'text' ? (
                <textarea
                  value={messageContent}
                  onChange={(e) => setMessageContent(e.target.value)}
                  placeholder="Type your message here..."
                  rows={4}
                  aria-label="Message content"
                  aria-describedby="text-input-help"
                />
              ) : (
                <div className="recording-controls">
                  {!recordedBlob ? (
                    <div className="recording-section">
                      {!isRecording ? (
                        <button onClick={startRecording} className="record-btn">
                          Start Recording {messageType === 'video' ? 'Video' : 'Audio'}
                        </button>
                      ) : (
                        <button onClick={stopRecording} className="stop-btn">
                          Stop Recording
                        </button>
                      )}
                      {isRecording && (
                        <p className="recording-status">Recording in progress...</p>
                      )}
                    </div>
                  ) : (
                    <div className="recording-preview-section">
                      <div className="preview-controls">
                        <button onClick={handleMessagePreview} className="btn-preview">
                          Preview {messageType === 'video' ? 'Video' : 'Audio'}
                        </button>
                        <button onClick={handleRetakeRecording} className="btn-retake">
                          Retake Recording
                        </button>
                      </div>

                      {showMessagePreview && (
                        <div className="media-preview">
                          {messageType === 'video' ? (
                            <video
                              src={messageContent}
                              controls
                              style={{
                                width: '100%',
                                maxWidth: '300px',
                                borderRadius: '8px',
                                backgroundColor: '#000'
                              }}
                            />
                          ) : (
                            <audio
                              src={messageContent}
                              controls
                              style={{ width: '100%' }}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button
                  onClick={closeModal}
                  className="btn-cancel"
                  type="button"
                  aria-label="Cancel and close dialog"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSendMessage}
                  disabled={!messageContent || isUploading || (messageType !== 'text' && !recordedBlob)}
                  className="btn-send"
                  type="button"
                  aria-label={isUploading ? 'Sending message, please wait' : 'Send message to recruiter'}
                >
                  {isUploading ? 'Sending...' : 'Send Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Leave Message Modal */}
      {showLeaveMessageModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="leave-modal-title">
          <div className="modal-content">
            <div className="modal-header">
              <h3 id="leave-modal-title">Leave a Message</h3>
              <button
                className="modal-close"
                onClick={() => {
                  setShowLeaveMessageModal(false);
                  setRecordedBlob(null);
                  setMessageContent('');
                  setShowMessagePreview(false);
                }}
                aria-label="Close leave message dialog"
                type="button"
              >
                ×
              </button>
            </div>

            <div className="message-form">
              <p style={{ marginBottom: '1rem', color: '#6b7280' }}>
                Leave a text, audio, or video message. You will be removed from the queue after sending.
              </p>
              <fieldset className="message-type-selector">
                <legend className="sr-only">Choose message type</legend>
                <label>
                  <input
                    type="radio"
                    name="leaveMessageType"
                    value="text"
                    checked={messageType === 'text'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Text Message
                </label>
                <label>
                  <input
                    type="radio"
                    name="leaveMessageType"
                    value="audio"
                    checked={messageType === 'audio'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Audio Message
                </label>
                <label>
                  <input
                    type="radio"
                    name="leaveMessageType"
                    value="video"
                    checked={messageType === 'video'}
                    onChange={(e) => setMessageType(e.target.value)}
                  />
                  Video Message
                </label>
              </fieldset>

              {messageType === 'text' ? (
                <div className="text-message-section">
                  <textarea
                    value={messageContent}
                    onChange={(e) => setMessageContent(e.target.value)}
                    placeholder="Type your message here..."
                    rows={6}
                    style={{
                      width: '100%',
                      padding: '0.75rem',
                      border: '1px solid #d1d5db',
                      borderRadius: '6px',
                      fontSize: '0.875rem',
                      resize: 'vertical',
                      marginBottom: '1rem'
                    }}
                  />
                </div>
              ) : (
                <div className="recording-controls">
                  {!recordedBlob ? (
                    <div className="recording-section">
                      {!isRecording ? (
                        <button onClick={startRecording} className="record-btn">
                          Start Recording {messageType === 'video' ? 'Video' : 'Audio'}
                        </button>
                      ) : (
                        <button onClick={stopRecording} className="stop-btn">
                          Stop Recording
                        </button>
                      )}
                      {isRecording && (
                        <p className="recording-status">Recording in progress...</p>
                      )}
                    </div>
                  ) : (
                    <div className="recording-preview-section">
                      <div className="preview-controls">
                        <button onClick={handleMessagePreview} className="btn-preview">
                          Preview {messageType === 'video' ? 'Video' : 'Audio'}
                        </button>
                        <button onClick={handleRetakeRecording} className="btn-retake">
                          Retake Recording
                        </button>
                      </div>

                      {showMessagePreview && (
                        <div className="media-preview">
                          {messageType === 'video' ? (
                            <video
                              src={messageContent}
                              controls
                              style={{ width: '100%', maxWidth: '300px', borderRadius: '8px', backgroundColor: '#000' }}
                            />
                          ) : (
                            <audio src={messageContent} controls style={{ width: '100%' }} />
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              <div className="modal-actions">
                <button
                  onClick={() => {
                    setShowLeaveMessageModal(false);
                    setRecordedBlob(null);
                    setMessageContent('');
                    setShowMessagePreview(false);
                  }}
                  className="btn-cancel"
                  type="button"
                >
                  Cancel
                </button>
                <button
                  onClick={handleLeaveWithMessage}
                  disabled={messageType === 'text' ? (!messageContent.trim() || isUploading) : (!recordedBlob || isUploading)}
                  className="btn-send"
                  type="button"
                >
                  {isUploading ? 'Sending...' : 'Send & Leave Queue'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Text Messaging Modal */}
      {showTextMessagingModal && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-labelledby="text-modal-title">
          <div className="modal-content text-messaging-modal">
            <div className="modal-header">
              <h3 id="text-modal-title">Messages</h3>
              <button
                className="modal-close"
                onClick={() => setShowTextMessagingModal(false)}
                aria-label="Close messages dialog"
                type="button"
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
                        className={`message-bubble ${msg.sender === 'jobseeker' ? 'sent' : 'received'}`}
                      >
                        <div className="message-sender">
                          {msg.sender === 'jobseeker' ? 'You' : 'Recruiter'}
                        </div>
                        <div className="message-text">{msg.content}</div>
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
                  value={textMessageContent}
                  onChange={(e) => setTextMessageContent(e.target.value)}
                  placeholder="Type your message..."
                  rows={3}
                  aria-label="Message content"
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendTextMessage();
                    }
                  }}
                />
                <button
                  onClick={handleSendTextMessage}
                  disabled={!textMessageContent.trim() || isUploading}
                  className="btn-send-message"
                  type="button"
                >
                  {isUploading ? 'Sending...' : 'Send'}
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

      {/* Call Invitation Modal */}
      {showInviteModal && (
        <CallInviteModal
          recruiterName={pendingInvitation?.recruiter?.name}
          boothName={booth?.name}
          eventName={event?.name}
          audioInputs={audioInputs}
          videoInputs={videoInputs}
          selectedAudioId={selectedAudioId}
          selectedVideoId={selectedVideoId}
          onChangeAudio={setSelectedAudioId}
          onChangeVideo={setSelectedVideoId}
          onAccept={handleAcceptInvite}
          onDecline={handleDeclineInvite}
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

      {/* Toast Container */}
      <ToastContainer toasts={toasts} removeToast={removeToast} />
    </div>
  );
}
