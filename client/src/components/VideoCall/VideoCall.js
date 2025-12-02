import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { connect, createLocalVideoTrack, createLocalAudioTrack } from 'twilio-video';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import videoCallService from '../../services/videoCall';
import VideoParticipant from './VideoParticipant';
import CallControls from './CallControls';
import ChatPanel from './ChatPanel';
import ParticipantsList from './ParticipantsList';
import JobSeekerProfileCall from './JobSeekerProfileCall';
import CallInviteModal from './CallInviteModal';
import { validateAndCleanDevicePreferences, createExactMediaConstraints } from '../../utils/deviceUtils';
import './VideoCall.css';

const VideoCall = ({ callId: propCallId, callData: propCallData, onCallEnd }) => {
  const { callId: paramCallId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Use prop callId if provided, otherwise use URL param
  const callId = propCallId || paramCallId;

  // Use prop callData if provided, otherwise check navigation state
  const callData = propCallData || location.state?.callData;

  console.log('🎬 VideoCall initialized:', {
    callId,
    hasCallData: !!callData,
    callData,
    locationState: location.state
  });

  const { user } = useAuth();
  const { socket } = useSocket();

  // Play a short tone to indicate room join
  const playJoinSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 987.77; // B5
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.15, ctx.currentTime + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
      o.start();
      o.stop(ctx.currentTime + 0.5);
    } catch (_) { /* ignore */ }
  };

  // Play chat notification sound
  const playChatSound = () => {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = 800; // Pleasant notification tone
      o.connect(g);
      g.connect(ctx.destination);
      g.gain.setValueAtTime(0.001, ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.1, ctx.currentTime + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.2);
      o.start();
      o.stop(ctx.currentTime + 0.2);
    } catch (_) { /* ignore */ }
  };

  // Call state
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState(new Map());
  const [localTracks, setLocalTracks] = useState([]);
  const [callInfo, setCallInfo] = useState(callData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  const [callStartTime, setCallStartTime] = useState(null);
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [inviteData, setInviteData] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [unreadChatCount, setUnreadChatCount] = useState(0);
  const [connectionQuality, setConnectionQuality] = useState('good');
  const [callDuration, setCallDuration] = useState(0);
  const [networkStats, setNetworkStats] = useState({ latency: 0, packetLoss: 0 });
  
  // Caption state
  const [isCaptionEnabled, setIsCaptionEnabled] = useState(false);
  const [captionText, setCaptionText] = useState('');
  const [captionHistory, setCaptionHistory] = useState([]);

  // Refs
  // Cleanup / lifecycle guards
  const isMountedRef = useRef(true);
  const isCleaningUpRef = useRef(false);
  const roomRef = useRef();
  const reconnectTimeoutRef = useRef();
  const qualityCheckIntervalRef = useRef();
  // Once a call has been explicitly ended (by recruiter or locally),
  // prevent any further automatic reconnects or re-initialization.
  const callEndedRef = useRef(false);
  // Speech recognition ref for captions
  const recognitionRef = useRef(null);

  // Initialize call
  useEffect(() => {
    if (isInitializing || room) return; // Prevent multiple initializations

    // Add a small delay to ensure DOM is ready
    const initTimer = setTimeout(() => {
      // Prioritize callData over callId - if we have call data, use it directly
      if (callData && callData.accessToken) {
        setIsInitializing(true);
        initializeCallWithData(callData);
      } else if (callId && !callData) {
        setIsInitializing(true);
        initializeCall();
      }
    }, 100); // Small delay to ensure DOM is ready

    return () => {
      clearTimeout(initTimer);
    };
  }, [callId, callData]); // eslint-disable-line react-hooks/exhaustive-deps

  // Initialize speech synthesis on mount
  useEffect(() => {
    // Trigger voice loading immediately
    if ('speechSynthesis' in window) {
      window.speechSynthesis.getVoices();
      console.log('✓ Speech synthesis available (VideoCall)');
    } else {
      console.warn('⚠️ Speech synthesis not supported in this browser');
    }
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      cleanup();
    };
  }, []);

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    socket.on('call_invitation', handleCallInvitation);
    socket.on('chat_message', handleNewChatMessage);
    socket.on('video-call-message', (data) => {
      handleNewChatMessage(data);
    });

    socket.on('video-call-message-direct', (data) => {
      handleNewChatMessage(data);
    });
    socket.on('participant_joined', handleParticipantJoined);
    socket.on('participant_left', handleParticipantLeft);
    socket.on('participant_left_call', handleParticipantLeftCall);
    socket.on('interpreter_response', handleInterpreterResponse);
    socket.on('interpreter-declined', handleInterpreterDeclined);
    socket.on('call_ended', handleCallEnded);
    socket.on('error', (error) => {
      console.error('Socket error in video call:', error);
    });

    // Add success handler for room joining
    socket.on('participant-joined-video', (data) => {
      // Handle participant joined
    });

    return () => {
      socket.off('call_invitation', handleCallInvitation);
      socket.off('new_chat_message', handleNewChatMessage);
      socket.off('chat_message', handleNewChatMessage);
      socket.off('video-call-message');
      socket.off('video-call-message-direct');
      socket.off('participant_joined', handleParticipantJoined);
      socket.off('participant_left', handleParticipantLeft);
      socket.off('participant_left_call', handleParticipantLeftCall);
      socket.off('interpreter_response', handleInterpreterResponse);
      socket.off('interpreter-declined', handleInterpreterDeclined);
      socket.off('participant-joined-video', handleParticipantJoined);
      socket.off('participant-left-video', handleParticipantLeft);
      socket.off('call_ended', handleCallEnded);
      socket.off('error');
      socket.off('participant-joined-video');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const initializeCallWithData = async (data) => {
    // If the call has already been marked as ended, do not re-init
    if (callEndedRef.current) {
      console.warn('initializeCallWithData called after call ended - ignoring');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // Use provided call data
      setCallInfo(data);
      setChatMessages(data.chatMessages || []);

      // Validate and clean device preferences before using them
      const { audioDeviceId, videoDeviceId } = await validateAndCleanDevicePreferences();

      // Create local tracks with preferred devices if set
      let videoTrack, audioTrack;
      
      try {
        // Try with exact device constraints first
        const { video: videoConstraints, audio: audioConstraints } = createExactMediaConstraints(
          audioDeviceId,
          videoDeviceId
        );

        videoTrack = await createLocalVideoTrack(videoConstraints);
        audioTrack = await createLocalAudioTrack(audioConstraints);
      } catch (deviceError) {
        // Handle OverconstrainedError or other device errors
        if (deviceError.name === 'OverconstrainedError' || deviceError.name === 'NotReadableError' || deviceError.name === 'NotFoundError') {
          console.warn('Device constraint error, retrying without device preferences:', deviceError);
          
          // Clear invalid device IDs
          if (videoDeviceId) {
            sessionStorage.removeItem('preferredVideoDeviceId');
            console.log('Cleared invalid video device ID from sessionStorage');
          }
          if (audioDeviceId) {
            sessionStorage.removeItem('preferredAudioDeviceId');
            console.log('Cleared invalid audio device ID from sessionStorage');
          }

          // Retry without device constraints
          const fallbackVideoConstraints = {
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: 'user'
          };

          const fallbackAudioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          };

          videoTrack = await createLocalVideoTrack(fallbackVideoConstraints);
          audioTrack = await createLocalAudioTrack(fallbackAudioConstraints);
        } else {
          // Re-throw if it's not a device constraint error
          throw deviceError;
        }
      }

      setLocalTracks([videoTrack, audioTrack]);

      // Connect to Twilio room using provided access token
      const room = await connect(data.accessToken, {
        name: data.roomName,
        tracks: [videoTrack, audioTrack],
        audio: true,
        video: true,
        maxAudioBitrate: 16000,
        maxVideoBitrate: 2500000,
        preferredVideoCodecs: ['VP8', 'H264'],
        networkQuality: {
          local: 1,
          remote: 1
        }
      });

      setRoom(room);
      roomRef.current = room;

      // Handle existing participants
      room.participants.forEach(addParticipant);

      // Room event listeners
      room.on('participantConnected', addParticipant);
      room.on('participantDisconnected', removeParticipant);
      room.on('disconnected', handleRoomDisconnected);
      room.on('reconnecting', handleReconnecting);
      room.on('reconnected', handleReconnected);

      // Network quality monitoring
      room.on('networkQualityLevelChanged', handleNetworkQualityChanged);

      // Join socket room
      const socketPayload = {
        callId: data.id || data.callId,
        roomName: data.roomName
      };

      socket?.emit('join-video-call', socketPayload);

      // Test socket connection
      socket?.emit('test-connection', { message: 'Testing from video call' });

      // Add success/error handlers for room joining
      socket?.on('error', (error) => {
        console.error('Socket error during room join:', error);
      });

      socket?.on('test-connection-response', (data) => {
        // Handle test connection response
      });

      // Start quality monitoring
      startQualityMonitoring();
      // Play join sound once connected
      playJoinSound();

      // Announce successful connection for job seekers
      if (user.role === 'JobSeeker') {
        speak("You are now connected to the call. You can now speak with the recruiter.");
      }

      setLoading(false);
      setIsInitializing(false);
      setReconnectAttempts(0); // Reset on successful connection
      setCallStartTime(Date.now());
    } catch (err) {
      console.error('Error initializing call with data:', err);
      setError(err.message || 'Failed to initialize call');
      setLoading(false);
      setIsInitializing(false);
    }
  };

  const initializeCall = useCallback(async () => {
    // If the call has already been marked as ended, do not re-init
    if (callEndedRef.current) {
      console.warn('initializeCall called after call ended - ignoring');
      return;
    }
    try {
      setLoading(true);
      setError(null);

      // Get call details
      const callDetails = await videoCallService.joinCall(callId);
      setCallInfo(callDetails);
      setChatMessages(callDetails.chatMessages || []);

      // Validate and clean device preferences before using them
      const { audioDeviceId, videoDeviceId } = await validateAndCleanDevicePreferences();

      // Create local tracks using preferred device IDs if available
      let videoTrack, audioTrack;
      
      try {
        // Try with exact device constraints first
        const { video: videoConstraints2, audio: audioConstraints2 } = createExactMediaConstraints(
          audioDeviceId,
          videoDeviceId
        );

        videoTrack = await createLocalVideoTrack(videoConstraints2);
        audioTrack = await createLocalAudioTrack(audioConstraints2);
      } catch (deviceError) {
        // Handle OverconstrainedError or other device errors
        if (deviceError.name === 'OverconstrainedError' || deviceError.name === 'NotReadableError' || deviceError.name === 'NotFoundError') {
          console.warn('Device constraint error, retrying without device preferences:', deviceError);
          
          // Clear invalid device IDs
          if (videoDeviceId) {
            sessionStorage.removeItem('preferredVideoDeviceId');
            console.log('Cleared invalid video device ID from sessionStorage');
          }
          if (audioDeviceId) {
            sessionStorage.removeItem('preferredAudioDeviceId');
            console.log('Cleared invalid audio device ID from sessionStorage');
          }

          // Retry without device constraints
          const fallbackVideoConstraints = {
            width: 1280,
            height: 720,
            frameRate: 30,
            facingMode: 'user'
          };

          const fallbackAudioConstraints = {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          };

          videoTrack = await createLocalVideoTrack(fallbackVideoConstraints);
          audioTrack = await createLocalAudioTrack(fallbackAudioConstraints);
        } else {
          // Re-throw if it's not a device constraint error
          throw deviceError;
        }
      }

      setLocalTracks([videoTrack, audioTrack]);

      // No manual local video attach; handled by VideoParticipant

      // Connect to Twilio room
      const room = await connect(callDetails.accessToken, {
        name: callDetails.roomName,
        tracks: [videoTrack, audioTrack],
        audio: true,
        video: true,
        maxAudioBitrate: 16000,
        maxVideoBitrate: 2500000,
        preferredVideoCodecs: ['VP8', 'H264'],
        networkQuality: {
          local: 1,
          remote: 1
        }
      });

      setRoom(room);
      roomRef.current = room;

      // Handle existing participants
      room.participants.forEach(addParticipant);

      // Room event listeners
      room.on('participantConnected', addParticipant);
      room.on('participantDisconnected', removeParticipant);
      room.on('disconnected', handleRoomDisconnected);
      room.on('reconnecting', handleReconnecting);
      room.on('reconnected', handleReconnected);

      // Network quality monitoring
      room.on('networkQualityLevelChanged', handleNetworkQualityChanged);

      // Join socket room
      const socketPayload = {
        callId: callDetails.callId || callDetails.id,
        roomName: callDetails.roomName
      };
      socket?.emit('join-video-call', socketPayload);

      // Start quality monitoring
      startQualityMonitoring();

      // Announce successful connection for job seekers
      if (user.role === 'JobSeeker') {
        speak("You are now connected to the call. You can now speak with the recruiter.");
      }

      setLoading(false);
      setIsInitializing(false);
    } catch (err) {
      console.error('Error initializing call:', err);
      setError(err.message || 'Failed to initialize call');
      setLoading(false);
      setIsInitializing(false);
    }
  }, [callId, socket]); // Add dependencies for useCallback

  const addParticipant = useCallback((participant) => {
    setParticipants(prevParticipants => {
      const newParticipants = new Map(prevParticipants);
      newParticipants.set(participant.sid, participant);
      return newParticipants;
    });

    // The VideoParticipant component will handle track attachment
    // No need to manually attach tracks here
  }, []);

  const removeParticipant = useCallback((participant) => {
    setParticipants(prevParticipants => {
      const newParticipants = new Map(prevParticipants);
      newParticipants.delete(participant.sid);
      return newParticipants;
    });

    // The VideoParticipant component will handle track cleanup
    // No need to manually detach tracks here
  }, []);

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
    // Handle incoming call invitation for job seekers
    if (user.role === 'JobSeeker') {
      setInviteData(data);
      setShowInviteModal(true);
      setLoading(false);

      // Play notification sound
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(e => {/* Could not play notification sound */ });
      } catch (e) {
        /* Notification sound not available */
      }

      // Announce invitation with text-to-speech
      speak("You have been invited to a call. Please check your screen for the invitation.");
    }
  };

  const handleAcceptInvitation = async () => {
    if (inviteData) {
      setCallInfo(inviteData);
      setShowInviteModal(false);
      setInviteData(null);

      // Announce call joining
      speak("Joining the call now. Please wait while we connect you.");

      // Initialize call with the invitation data
      await initializeCallWithData(inviteData);
    }
  };

  const handleDeclineInvitation = () => {
    setShowInviteModal(false);
    setInviteData(null);
    // Optionally notify the server about the decline
    if (socket && inviteData) {
      socket.emit('call-invitation-declined', { callId: inviteData.id });
    }
  };

  const handleParticipantJoined = (data) => {
    // Handle participant joined
  };

  const handleParticipantLeft = (data) => {
    // Handle participant left
  };

  const handleInterpreterResponse = (data) => {
    if (data.response === 'accept') {
      // Add interpreter to callInfo.participants.interpreters so their name shows correctly
      setCallInfo(prev => {
        if (!prev) return prev;
        const currentInterpreters = prev.participants?.interpreters || [];
        // Check if interpreter is already in the list
        const exists = currentInterpreters.some(i =>
          (i.interpreter?._id || i.interpreter?.id || i._id || i.id) === (data.interpreter._id || data.interpreter.id)
        );
        if (!exists) {
          return {
            ...prev,
            participants: {
              ...prev.participants,
              interpreters: [
                ...currentInterpreters,
                {
                  interpreter: data.interpreter,
                  status: 'joined',
                  category: data.category || ''
                }
              ]
            }
          };
        }
        return prev;
      });

      setChatMessages(prev => [...prev, {
        sender: { name: data.interpreter.name, role: 'interpreter' },
        message: `${data.interpreter.name} joined as interpreter`,
        timestamp: data.timestamp,
        messageType: 'system'
      }]);
    }
  };

  const handleInterpreterDeclined = (data) => {
    console.log('Interpreter declined:', data);

    // Add message to chat
    setChatMessages(prev => [...prev, {
      sender: { name: data.interpreter.name, role: 'interpreter' },
      message: `${data.interpreter.name} declined interpreter invitation`,
      timestamp: data.timestamp,
      messageType: 'system'
    }]);

    // Announce to recruiter
    if (user.role === 'Recruiter' || callInfo?.userRole === 'recruiter') {
      speak(`Interpreter ${data.interpreter.name} declined the invitation`);
    }
  };

  const handleParticipantLeftCall = (data) => {
    console.log('🚪 Participant left call event received:', data);

    // Announce to remaining participants that someone left
    const leftUserRole = data.userRole?.toLowerCase() || 'participant';
    speak(`${leftUserRole} has left the call.`);

    // Update UI - remove participant from participants list
    // The Twilio SDK will automatically handle removing their video/audio tracks
  };

  const handleCallEnded = async (data) => {
    console.log('📞 Call ended event received:', data);
    // Mark call as ended so no further reconnect / init happens
    callEndedRef.current = true;
    
    // Announce call end for all participants
    if (user.role === 'JobSeeker') {
      speak("The call has ended. Thank you for participating.");
    } else if (user.role === 'Recruiter' || callInfo?.userRole === 'recruiter') {
      speak("The call has ended.");
    } else if (user.role === 'Interpreter' || user.role === 'GlobalInterpreter' || callInfo?.userRole === 'interpreter') {
      speak("The call has ended. Thank you for your service.");
    }

    // Disconnect from Twilio room FIRST to stop camera/mic immediately
    if (roomRef.current) {
      try {
        console.log('🔌 Disconnecting from Twilio room (call ended by recruiter)...');

        // Stop and unpublish all local tracks
        roomRef.current.localParticipant.tracks.forEach(publication => {
          if (publication.track) {
            try {
              console.log('Unpublishing track:', publication.track.kind);
              publication.unpublish();
              if (typeof publication.track.stop === 'function') {
                publication.track.stop();
              }
            } catch (e) {
              console.warn('Error unpublishing track:', e);
            }
          }
        });

        // Disconnect from room
        roomRef.current.disconnect();
        console.log('✅ Disconnected from Twilio room');
        roomRef.current = null;
      } catch (e) {
        console.warn('Error disconnecting from room:', e);
      }
    }

    // Wait a moment for disconnect to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Final cleanup
    cleanupRemainingResources();

    // Role-based navigation when call is ended by another participant
    if (user?.role === 'Interpreter' || user?.role === 'GlobalInterpreter') {
      console.log('🏠 Navigating interpreter to dashboard after call ended by recruiter');
      setTimeout(() => navigate('/dashboard'), 100);
    } else if (onCallEnd) {
      setTimeout(() => onCallEnd(data), 100);
    }
  };

  // Chat functionality
  const sendChatMessage = async (message) => {
    if (!message.trim() || !room) return;

    try {
      const messageData = {
        message: message.trim(),
        sender: {
          id: user._id || user.id,
          name: user.name,
          role: user.role
        },
        timestamp: new Date().toISOString(),
        messageType: 'text'
      };

      // Add to local messages immediately for better UX
      setChatMessages(prev => [...prev, messageData]);

      // Send via socket if available
      if (socket) {
        const chatPayload = {
          callId: callInfo?.id || callInfo?.callId || callId,
          message: messageData
        };

        // Send using original method
        socket.emit('video-call-message', chatPayload);

        // Also try direct method as backup
        const directPayload = {
          roomName: callInfo?.roomName,
          message: messageData.message
        };
        socket.emit('video-call-message-direct', directPayload);
      }

      // Chat message sent
    } catch (error) {
      console.error('Error sending chat message:', error);
      // Remove the message from local state if sending failed
      setChatMessages(prev => prev.slice(0, -1));
      throw error;
    }
  };

  const handleNewChatMessage = (messageData) => {
    // Don't add our own messages again
    if (messageData.sender?.id === (user._id || user.id)) {
      return;
    }

    setChatMessages(prev => {
      const newMessages = [...prev, messageData];
      return newMessages;
    });

    // Play sound and increment unread count if chat is closed
    if (!isChatOpen) {
      playChatSound();
      setUnreadChatCount(prev => prev + 1);
    }
  };

  // Reset unread count when chat is opened
  const handleToggleChat = () => {
    const newState = !isChatOpen;
    setIsChatOpen(newState);
    if (newState) {
      setUnreadChatCount(0);
      // Close other panels
      setIsParticipantsOpen(false);
      setIsProfileOpen(false);
    }
  };

  const handleToggleParticipants = () => {
    const newState = !isParticipantsOpen;
    setIsParticipantsOpen(newState);
    if (newState) {
      // Close other panels
      setIsChatOpen(false);
      setIsProfileOpen(false);
    }
  };

  const handleToggleProfile = () => {
    const newState = !isProfileOpen;
    setIsProfileOpen(newState);
    if (newState) {
      // Close other panels
      setIsChatOpen(false);
      setIsParticipantsOpen(false);
    }
  };

  const handleRoomDisconnected = (room, error) => {
    // Only attempt reconnect if it's an unexpected disconnection
    if (error && error.code !== 20104) { // 20104 is normal disconnection
      setError('Call disconnected. Attempting to reconnect...');
      attemptReconnect();
    }
  };

  const handleReconnecting = (error) => {
    setConnectionQuality('poor');
  };

  const handleReconnected = () => {
    setError(null);
    setConnectionQuality('good');
    setReconnectAttempts(0); // Reset reconnection attempts on successful connection
  };

  const handleNetworkQualityChanged = (participant, networkQualityLevel) => {
    const qualityMap = {
      0: 'poor',
      1: 'poor',
      2: 'fair',
      3: 'good',
      4: 'excellent',
      5: 'excellent'
    };

    if (participant === room?.localParticipant) {
      setConnectionQuality(qualityMap[networkQualityLevel] || 'poor');
    }
  };

  const attemptReconnect = () => {
    // Never attempt to reconnect after call has been explicitly ended
    if (callEndedRef.current) {
      console.log('Reconnect skipped because call has ended');
      return;
    }

    if (reconnectAttempts >= 3) {
      setError('Unable to reconnect to call. Please refresh and try again.');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      if (callInfo && callInfo.accessToken) {
        setReconnectAttempts(prev => prev + 1);
        // Use the existing call data to reconnect
        initializeCallWithData(callInfo);
      }
    }, 3000);
  };

  const startQualityMonitoring = () => {
    qualityCheckIntervalRef.current = setInterval(() => {
      if (room && socket) {
        const stats = room.getStats();
        stats.then(reports => {
          const qualityData = {
            timestamp: Date.now(),
            packetsLost: 0,
            latency: 0
          };

          reports.forEach(report => {
            if (report.type === 'inbound-rtp' && report.mediaType === 'video') {
              qualityData.packetsLost += report.packetsLost || 0;
            }
            if (report.type === 'candidate-pair' && report.state === 'succeeded') {
              qualityData.latency = report.currentRoundTripTime || 0;
            }
          });

          socket.emit('video-call-quality', {
            callId: callInfo.id || callInfo.callId,
            qualityData
          });
        });
      }
    }, 10000); // Check every 10 seconds
  };

  const toggleAudio = () => {
    const audioTrack = localTracks.find(track => track.kind === 'audio');
    if (!audioTrack) return;

    if (isAudioEnabled) {
      // Mute: disable the track (stops transmission)
      audioTrack.disable();
      setIsAudioEnabled(false);
    } else {
      // Unmute: enable the track (resumes transmission)
      audioTrack.enable();
      setIsAudioEnabled(true);
    }
  };

  const toggleVideo = () => {
    const videoTrack = localTracks.find(track => track.kind === 'video');
    if (!videoTrack) return;

    if (isVideoEnabled) {
      // Stop video: disable the track (stops transmission, preserves last frame)
      videoTrack.disable();
      setIsVideoEnabled(false);
    } else {
      // Start video: enable the track (resumes transmission)
      videoTrack.enable();
      setIsVideoEnabled(true);
    }
  };

  // Toggle captions using Web Speech API
  const toggleCaption = useCallback(() => {
    if (isCaptionEnabled) {
      // Turn off captions
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
      setIsCaptionEnabled(false);
      setCaptionText('');
      console.log('🔇 Captions disabled');
    } else {
      // Turn on captions
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        console.warn('Speech recognition not supported in this browser');
        alert('Speech recognition is not supported in your browser. Please use Chrome or Edge for captions.');
        return;
      }

      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-US';
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        console.log('🎤 Caption recognition started');
        setIsCaptionEnabled(true);
      };

      recognition.onresult = (event) => {
        let interimTranscript = '';
        let finalTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript + ' ';
            // Add to caption history
            setCaptionHistory(prev => {
              const newHistory = [...prev, {
                text: transcript,
                timestamp: new Date().toISOString(),
                speaker: user?.name || 'You'
              }];
              // Keep only last 10 entries
              return newHistory.slice(-10);
            });
          } else {
            interimTranscript += transcript;
          }
        }

        // Update current caption text
        const displayText = finalTranscript || interimTranscript;
        setCaptionText(displayText.trim());

        // Clear caption after 5 seconds of no speech
        if (finalTranscript) {
          setTimeout(() => {
            setCaptionText(prev => prev === displayText.trim() ? '' : prev);
          }, 5000);
        }
      };

      recognition.onerror = (event) => {
        console.error('Caption recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access is required for captions. Please allow microphone access and try again.');
          setIsCaptionEnabled(false);
        } else if (event.error === 'no-speech') {
          // Just restart recognition on no-speech, don't disable
          if (isCaptionEnabled && recognitionRef.current) {
            try {
              recognitionRef.current.start();
            } catch (e) {
              // Already running
            }
          }
        }
      };

      recognition.onend = () => {
        // Restart recognition if captions are still enabled
        if (isCaptionEnabled && recognitionRef.current) {
          try {
            recognitionRef.current.start();
          } catch (e) {
            console.log('Recognition already started or stopped');
          }
        }
      };

      recognitionRef.current = recognition;
      
      try {
        recognition.start();
      } catch (e) {
        console.error('Failed to start speech recognition:', e);
        setIsCaptionEnabled(false);
      }
    }
  }, [isCaptionEnabled, user?.name]);

  // Cleanup speech recognition on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
        recognitionRef.current = null;
      }
    };
  }, []);

  const inviteInterpreter = async (interpreterId, category) => {
    try {
      const callId = callInfo.id || callInfo.callId || callInfo._id;
      console.log('📞 Inviting interpreter:', {
        callId,
        interpreterId,
        category,
        callInfo
      });
      await videoCallService.inviteInterpreter(callId, interpreterId, category);

      // Show success message
      alert('Interpreter invitation sent successfully!');
    } catch (error) {
      console.error('Error inviting interpreter:', error);

      // Handle specific error cases
      const errorMessage = error.response?.data?.message || error.response?.data?.error;

      if (error.response?.status === 409) {
        // Interpreter is busy or already invited
        alert(errorMessage || 'This interpreter is not available at the moment.');
      } else {
        // General error
        alert('Failed to invite interpreter. Please try again.');
      }
    }
  };

  const leaveCall = async () => {
    try {
      console.log('🚪 Leave call initiated by user:', {
        userId: user?._id,
        userEmail: user?.email,
        userRole: user?.role,
        callInfo: callInfo,
        callId: callInfo?.id || callInfo?.callId
      });

      // Announce leaving first
      speak("You have left the call.");

      // Step 1: Disconnect from Twilio room FIRST so other participants see you leave
      if (roomRef.current) {
        try {
          console.log('🔌 Disconnecting from Twilio room...');

          // Stop and unpublish all local tracks
          roomRef.current.localParticipant.tracks.forEach(publication => {
            if (publication.track) {
              try {
                console.log('Unpublishing track:', publication.track.kind);
                publication.unpublish();
                if (typeof publication.track.stop === 'function') {
                  publication.track.stop();
                }
              } catch (e) {
                console.warn('Error unpublishing track:', e);
              }
            }
          });

          // Disconnect from room - this notifies other participants
          roomRef.current.disconnect();
          console.log('✅ Disconnected from Twilio room');
          roomRef.current = null;
        } catch (e) {
          console.warn('Error disconnecting from room:', e);
        }
      }

      // Step 2: Wait a moment for disconnect to propagate
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 3: Call leave API to update backend
      if (callInfo && (callInfo.id || callInfo.callId)) {
        try {
          const callIdToLeave = callInfo.id || callInfo.callId;
          console.log('📞 Calling API to leave call:', callIdToLeave);
          await videoCallService.leaveCall(callIdToLeave);
          console.log('✅ API call to leave call successful');
        } catch (apiError) {
          console.error('❌ API call to leave call failed:', apiError);
          console.warn('Proceeding with cleanup despite API error');
        }
      } else {
        console.warn('⚠️ No call ID found, skipping API call');
      }

      // Step 4: Final cleanup (stop remaining tracks, leave socket room)
      cleanupRemainingResources();

      // Step 5: Role-based navigation after leaving
      if (user?.role === 'Interpreter' || user?.role === 'GlobalInterpreter') {
        console.log('🏠 Navigating interpreter to dashboard');
        setTimeout(() => navigate('/dashboard'), 100);
      } else if (user?.role === 'JobSeeker') {
        console.log('🏠 Navigating job seeker back');
        if (onCallEnd) {
          setTimeout(() => onCallEnd(), 100);
        }
      }
    } catch (error) {
      console.error('💥 Error leaving call:', error);
      cleanupRemainingResources();

      // Navigate even on error
      if (user?.role === 'Interpreter' || user?.role === 'GlobalInterpreter') {
        navigate('/dashboard');
      } else if (onCallEnd) {
        onCallEnd();
      }
    }
  };

  const endCall = async () => {
    try {
      console.log('🔚 End call initiated by user:', {
        userId: user?._id,
        userEmail: user?.email,
        userRole: user?.role,
        callInfo: callInfo,
        callId: callInfo?.id || callInfo?.callId
      });

      // Step 1: Disconnect from Twilio room FIRST to stop camera/mic
      if (roomRef.current) {
        try {
          console.log('🔌 Disconnecting from Twilio room...');

          // Stop and unpublish all local tracks
          roomRef.current.localParticipant.tracks.forEach(publication => {
            if (publication.track) {
              try {
                console.log('Unpublishing track:', publication.track.kind);
                publication.unpublish();
                if (typeof publication.track.stop === 'function') {
                  publication.track.stop();
                }
              } catch (e) {
                console.warn('Error unpublishing track:', e);
              }
            }
          });

          // Disconnect from room - this notifies other participants
          roomRef.current.disconnect();
          console.log('✅ Disconnected from Twilio room');
          roomRef.current = null;
        } catch (e) {
          console.warn('Error disconnecting from room:', e);
        }
      }

      // Step 2: Wait a moment for disconnect to propagate
      await new Promise(resolve => setTimeout(resolve, 300));

      // Step 3: Call end API to notify backend and all participants
      if (callInfo && (callInfo.id || callInfo.callId)) {
        try {
          const callIdToEnd = callInfo.id || callInfo.callId;
          console.log('📞 Calling API to end call for everyone:', callIdToEnd);
          await videoCallService.endCall(callIdToEnd);
          console.log('✅ API call to end call successful');
        } catch (apiError) {
          console.error('❌ API call to end call failed:', apiError);
          console.warn('Proceeding with cleanup despite API error');
        }
      } else {
        console.warn('⚠️ No call ID found, skipping API call');
      }

      // Step 4: Final cleanup (stop remaining tracks, leave socket room)
      cleanupRemainingResources();

      // Step 5: Recruiter navigation after call ends
      if (onCallEnd) {
        setTimeout(() => onCallEnd(), 100);
      }
    } catch (error) {
      console.error('💥 Error ending call:', error);
      cleanupRemainingResources();

      if (onCallEnd) {
        onCallEnd();
      }
    }
  };

  const cleanupRemainingResources = () => {
    if (isCleaningUpRef.current) {
      console.log('⚠️ Cleanup already in progress, skipping...');
      return;
    }
    isCleaningUpRef.current = true;

    console.log('🧹 Final cleanup of remaining resources...');

    // Clear intervals
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Stop all local tracks
    localTracks.forEach(track => {
      if (track && typeof track.stop === 'function') {
        try {
          console.log('Stopping remaining local track:', track.kind);
          track.stop();
        } catch (error) {
          console.warn('Error stopping local track:', error);
        }
      }
    });

    // Stop all media stream tracks directly from browser
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
          if (video.srcObject) {
            const stream = video.srcObject;
            stream.getTracks().forEach(track => {
              console.log('Stopping media stream track:', track.kind, track.label);
              track.stop();
            });
            video.srcObject = null;
          }
        });
      }
    } catch (e) {
      console.warn('Error stopping media stream tracks:', e);
    }

    setLocalTracks([]);

    // Leave socket room
    if (socket && callInfo) {
      try {
        const roomName = callInfo.roomName || `call_${callInfo.id || callInfo.callId}`;
        console.log('👋 Leaving socket room:', roomName);
        socket.emit('leave-video-room', { roomName });
      } catch (e) {
        console.warn('Error leaving socket room:', e);
      }
    }

    setRoom(null);
    setParticipants(new Map());
  };

  const cleanup = () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    console.log('🧹 Cleaning up video call...');

    // Clear intervals
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Stop all local tracks first (before unpublishing)
    localTracks.forEach(track => {
      if (track && typeof track.stop === 'function') {
        try {
          console.log('Stopping local track:', track.kind);
          track.stop();
        } catch (error) {
          console.warn('Error stopping local track:', error);
        }
      }
    });

    // Disconnect from room and unpublish tracks
    if (roomRef.current) {
      try {
        // Unpublish all local participant tracks
        roomRef.current.localParticipant.tracks.forEach(publication => {
          if (publication.track) {
            try {
              console.log('Unpublishing track:', publication.track.kind);
              publication.unpublish();
              // Stop the track
              if (typeof publication.track.stop === 'function') {
                publication.track.stop();
              }
            } catch (e) {
              console.warn('Error unpublishing track:', e);
            }
          }
        });

        // Disconnect from room
        console.log('Disconnecting from Twilio room');
        roomRef.current.disconnect();
      } catch (e) {
        console.warn('Error during room cleanup:', e);
      }
      roomRef.current = null;
    }

    // Stop all media stream tracks directly from browser
    try {
      if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
        // Get all active media streams and stop them
        const videoElements = document.querySelectorAll('video');
        videoElements.forEach(video => {
          if (video.srcObject) {
            const stream = video.srcObject;
            stream.getTracks().forEach(track => {
              console.log('Stopping media stream track:', track.kind, track.label);
              track.stop();
            });
            video.srcObject = null;
          }
        });
      }
    } catch (e) {
      console.warn('Error stopping media stream tracks:', e);
    }

    setLocalTracks([]);

    // Leave socket room
    if (socket && callInfo) {
      try {
        socket.emit('leave-video-call', {
          roomName: callInfo.roomName
        });
      } catch (e) {
        console.warn('Error leaving socket room:', e);
      }
    }

    setRoom(null);
    setParticipants(new Map());

    console.log('✅ Video call cleanup complete - all tracks stopped');
  };

  // Call duration timer
  useEffect(() => {
    let interval;
    if (room && callStartTime) {
      interval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - callStartTime) / 1000);
        setCallDuration(elapsed);
      }, 1000);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [room, callStartTime]);

  // Network quality monitoring
  useEffect(() => {
    if (!room) return;

    const monitorNetworkQuality = () => {
      // Monitor network quality for all participants
      const participants = Array.from(room.participants.values());
      let overallQuality = 5; // Start with excellent

      participants.forEach(participant => {
        participant.on('networkQualityLevelChanged', (networkQualityLevel) => {
          if (networkQualityLevel < overallQuality) {
            overallQuality = networkQualityLevel;
          }
        });
      });

      // Update connection quality based on network level
      const getQualityString = (level) => {
        if (level >= 4) return 'excellent';
        if (level >= 3) return 'good';
        if (level >= 2) return 'fair';
        return 'poor';
      };

      setConnectionQuality(getQualityString(overallQuality));

      // Simulate network stats (in real implementation, get from Twilio stats)
      setNetworkStats({
        latency: Math.floor(Math.random() * 100) + 50,
        packetLoss: Math.floor(Math.random() * 5)
      });
    };

    const interval = setInterval(monitorNetworkQuality, 5000);
    return () => clearInterval(interval);
  }, [room]);

  if (loading) {
    return (
      <div className="video-call-loading">
        <div className="loading-spinner"></div>
        <p>Connecting to call...</p>
      </div>
    );
  }

  if (error && !room) {
    return (
      <div className="video-call-error">
        <h3>Call Error</h3>
        <p>{error}</p>
        <button onClick={() => initializeCall()} className="retry-button">
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="video-call-container-new" role="main" aria-label="Video call interface">
      {/* Skip to main content link for accessibility */}
      <a href="#call-controls" className="skip-link">Skip to call controls</a>

      <header className="video-call-header" role="banner">
        <div className="header-info">
          {/* Event Logo and Name */}
          <div className="header-section" role="img" aria-label={`Event: ${callInfo?.event?.name || 'Unknown Event'}`}>
            {callInfo?.event?.logoUrl ? (
              <img
                src={callInfo.event.logoUrl}
                alt={`${callInfo.event.name || 'Event'} logo`}
                className="header-logo event-logo"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="header-logo-placeholder event-logo-placeholder"
              style={{ display: callInfo?.event?.logoUrl ? 'none' : 'flex' }}
              aria-label={`${callInfo?.event?.name || 'Event'} logo placeholder`}
            >
              <span>{(callInfo?.event?.name || 'Event').charAt(0).toUpperCase()}</span>
            </div>
            <div className="header-names">
              <h1 className="header-event-name">{callInfo?.event?.name || 'Event'}</h1>
            </div>
          </div>

          <span className="header-divider" aria-hidden="true">|</span>

          {/* Booth Logo and Name */}
          <div className="header-section" role="img" aria-label={`Booth: ${callInfo?.booth?.name || 'Unknown Booth'}`}>
            {callInfo?.booth?.logoUrl ? (
              <img
                src={callInfo.booth.logoUrl}
                alt={`${callInfo.booth.name || 'Booth'} logo`}
                className="header-logo booth-logo"
                onError={(e) => {
                  e.target.style.display = 'none';
                  e.target.nextElementSibling.style.display = 'flex';
                }}
              />
            ) : null}
            <div
              className="header-logo-placeholder booth-logo-placeholder"
              style={{ display: callInfo?.booth?.logoUrl ? 'none' : 'flex' }}
              aria-label={`${callInfo?.booth?.name || 'Booth'} logo placeholder`}
            >
              <span>{(callInfo?.booth?.name || 'Booth').charAt(0).toUpperCase()}</span>
            </div>
            <div className="header-names">
              <h2 className="header-booth-name">{callInfo?.booth?.name || 'Booth'}</h2>
            </div>
          </div>
        </div>

        {/* Call Info and Quality */}
        <div className="header-status">
          {/* Interpreter Requested Badge */}
          {callInfo?.metadata?.interpreterRequested && (
            <button
              className="interpreter-requested-badge clickable"
              onClick={() => {
                // Open participants panel for recruiters to invite interpreter
                if (user?.role === 'Recruiter') {
                  setIsParticipantsOpen(true);
                  setIsChatOpen(false);
                  setIsProfileOpen(false);
                }
              }}
              disabled={user?.role !== 'Recruiter'}
              aria-live="polite"
              aria-label={user?.role === 'Recruiter' ? "Interpreter has been requested. Click to open participants panel and invite an interpreter." : "Interpreter has been requested"}
              title={user?.role === 'Recruiter' ? "Click to invite interpreter" : "Interpreter requested"}
            >
              <span className="badge-icon">🗣️</span>
              <span className="badge-text">Interpreter Requested</span>
            </button>
          )}

          <div className="call-duration" aria-live="polite" aria-label={`Call duration: ${Math.floor(callDuration / 60)} minutes ${callDuration % 60} seconds`}>
            <span className="duration-label" aria-hidden="true">Duration:</span>
            <span className="duration-time">
              {String(Math.floor(callDuration / 60)).padStart(2, '0')}:
              {String(callDuration % 60).padStart(2, '0')}
            </span>
          </div>

          <div className={`connection-quality ${connectionQuality}`} role="status" aria-live="polite" aria-label={`Connection quality: ${connectionQuality}`}>
            <div className="signal-bars" aria-hidden="true">
              <span className="signal-bar bar-1"></span>
              <span className="signal-bar bar-2"></span>
              <span className="signal-bar bar-3"></span>
              <span className="signal-bar bar-4"></span>
            </div>
            {networkStats.latency > 0 && (
              <span className="network-details" aria-label={`Latency: ${networkStats.latency}ms, Packet loss: ${networkStats.packetLoss}%`}>
                {networkStats.latency}ms
              </span>
            )}
          </div>
        </div>
      </header>

      {/* Main Video Area */}
      <div className="video-main-area" role="region" aria-label="Video participants">
        {/* Screen reader announcements */}
        <div className="sr-only" aria-live="polite" id="participant-announcements"></div>

        {/* All Participants Grid */}
        <div className="participants-grid" role="group" aria-label={`${participants.size} remote participants`}>
          {/* Remote Participants */}
          {Array.from(participants.values()).map(participant => (
            <VideoParticipant
              key={participant.sid}
              participant={participant}
              isLocal={false}
            />
          ))}

          {/* No participants message */}
          {participants.size === 0 && (
            <div className="no-participants" role="status" aria-live="polite">
              <div className="no-participants-content">
                <h3>Waiting for other participants...</h3>
                <p>You are currently alone in this call.</p>
              </div>
            </div>
          )}
        </div>

        {/* Local Video - Small box in bottom right */}
        {room && (
          <div className="local-video-overlay" role="region" aria-label="Your video">
            <VideoParticipant
              participant={room.localParticipant}
              isLocal={true}
            />
          </div>
        )}
      </div>

      {/* Side Panels */}
      {isChatOpen && (
        <ChatPanel
          messages={chatMessages}
          onSendMessage={sendChatMessage}
          onClose={() => setIsChatOpen(false)}
        />
      )}

      {isParticipantsOpen && (() => {
        const boothId = callInfo?.booth?._id || callInfo?.booth;
        console.log('Rendering ParticipantsList with boothId:', boothId);
        console.log('Full callInfo.booth:', callInfo?.booth);
        return (
          <ParticipantsList
            participants={{
              ...callInfo?.participants,
              twilioParticipants: Array.from(participants.values()),
              localUser: user
            }}
            onClose={() => setIsParticipantsOpen(false)}
            onInviteInterpreter={inviteInterpreter}
            userRole={callInfo?.userRole || user?.role}
            interpreterRequested={callInfo?.metadata?.interpreterRequested}
            boothId={boothId}
          />
        );
      })()}


      {/* Caption Display */}
      {isCaptionEnabled && (
        <div className="caption-container" role="region" aria-live="polite" aria-label="Live captions">
          <div className="caption-content">
            {captionText ? (
              <p className="caption-text">{captionText}</p>
            ) : (
              <p className="caption-text caption-listening">Listening for speech...</p>
            )}
          </div>
        </div>
      )}

      {isProfileOpen && callInfo?.userRole === 'recruiter' && (() => {
        // Try to get job seeker data from multiple sources
        let jobSeekerData = null;

        // First, try to get from callInfo.participants.jobSeeker
        if (callInfo.participants?.jobSeeker) {
          jobSeekerData = callInfo.participants.jobSeeker;
        }

        // If not found, try to find from the participants array
        if (!jobSeekerData && callInfo.participants) {
          // Check if there's a direct user object
          const allParticipants = [
            callInfo.participants.recruiter,
            callInfo.participants.jobSeeker,
            ...(callInfo.participants.interpreters || []).map(i => i.interpreter || i.user || i)
          ].filter(Boolean);

          jobSeekerData = allParticipants.find(p =>
            p.role === 'jobseeker' ||
            p.role === 'JobSeeker' ||
            p.role === 'jobSeeker'
          );
        }

        // If still not found, try to find from booth/event data
        if (!jobSeekerData && callInfo.jobSeeker) {
          jobSeekerData = callInfo.jobSeeker;
        }

        // Try to get job seeker ID from call participants
        if (!jobSeekerData || (!jobSeekerData._id && !jobSeekerData.id)) {
          const jobSeekerId = callInfo.jobSeekerId || callInfo.participants?.jobSeeker?._id || callInfo.participants?.jobSeeker?.id;
          if (jobSeekerId) {
            jobSeekerData = { ...jobSeekerData, _id: jobSeekerId, id: jobSeekerId };
          }
        }

        return (
          <JobSeekerProfileCall
            jobSeeker={jobSeekerData}
            onClose={() => setIsProfileOpen(false)}
          />
        );
      })()}

      <footer className="video-call-footer">
        <CallControls
          isAudioEnabled={isAudioEnabled}
          isVideoEnabled={isVideoEnabled}
          isCaptionEnabled={isCaptionEnabled}
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleCaption={toggleCaption}
          onToggleChat={handleToggleChat}
          onToggleParticipants={handleToggleParticipants}
          onToggleProfile={handleToggleProfile}
          onEndCall={endCall}
          onLeaveCall={leaveCall}
          userRole={callInfo?.userRole || user?.role}
          participantCount={participants.size + 1}
          chatUnreadCount={unreadChatCount}
        />
      </footer>

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}

      {/* Call Invitation Modal */}
      {showInviteModal && inviteData && (
        <CallInviteModal
          recruiterName={inviteData.recruiterName}
          boothName={inviteData.boothName}
          eventName={inviteData.eventName}
          audioInputs={[]} // TODO: Get actual device list
          videoInputs={[]} // TODO: Get actual device list
          selectedAudioId=""
          selectedVideoId=""
          onChangeAudio={() => { }} // TODO: Implement device selection
          onChangeVideo={() => { }} // TODO: Implement device selection
          onAccept={handleAcceptInvitation}
          onDecline={handleDeclineInvitation}
        />
      )}
    </div>
  );
};

export default VideoCall;
