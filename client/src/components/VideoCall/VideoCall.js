import React, { useState, useEffect, useRef, useCallback } from 'react';
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
import './VideoCall.css';

const VideoCall = ({ callId, callData, onCallEnd }) => {
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

  // Refs
  // Cleanup guards
  const isMountedRef = useRef(true);
  const isCleaningUpRef = useRef(false);
  const roomRef = useRef();
  const reconnectTimeoutRef = useRef();
  const qualityCheckIntervalRef = useRef();

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
    socket.on('interpreter_response', handleInterpreterResponse);
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
      socket.off('interpreter_response', handleInterpreterResponse);
      socket.off('participant-joined-video', handleParticipantJoined);
      socket.off('participant-left-video', handleParticipantLeft);
      socket.off('call_ended', handleCallEnded);
      socket.off('error');
      socket.off('participant-joined-video');
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const initializeCallWithData = async (data) => {
    try {
      setLoading(true);
      setError(null);

      // Use provided call data
      setCallInfo(data);
      setChatMessages(data.chatMessages || []);

      // Create local tracks with preferred devices if set
      const preferredVideoDeviceId = localStorage.getItem('preferredVideoDeviceId');
      const preferredAudioDeviceId = localStorage.getItem('preferredAudioDeviceId');

      const videoConstraints = {
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'user',
        ...(preferredVideoDeviceId ? { deviceId: { exact: preferredVideoDeviceId } } : {})
      };

      const audioConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(preferredAudioDeviceId ? { deviceId: { exact: preferredAudioDeviceId } } : {})
      };

      const videoTrack = await createLocalVideoTrack(videoConstraints);
      const audioTrack = await createLocalAudioTrack(audioConstraints);

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
    try {
      setLoading(true);
      setError(null);

      // Get call details
      const callDetails = await videoCallService.joinCall(callId);
      setCallInfo(callDetails);
      setChatMessages(callDetails.chatMessages || []);

      // Create local tracks using preferred device IDs if available
      const preferredVideoDeviceId2 = localStorage.getItem('preferredVideoDeviceId');
      const preferredAudioDeviceId2 = localStorage.getItem('preferredAudioDeviceId');

      const videoConstraints2 = {
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'user',
        ...(preferredVideoDeviceId2 ? { deviceId: { exact: preferredVideoDeviceId2 } } : {})
      };

      const audioConstraints2 = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(preferredAudioDeviceId2 ? { deviceId: { exact: preferredAudioDeviceId2 } } : {})
      };

      const videoTrack = await createLocalVideoTrack(videoConstraints2);
      const audioTrack = await createLocalAudioTrack(audioConstraints2);

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

  // Speak announcement using Web Speech API
  const speak = (text) => {
    try {
      const synth = window.speechSynthesis;
      if (!synth) return;
      
      // Cancel any ongoing speech to avoid overlap
      if (synth.speaking) synth.cancel();
      
      const speakText = () => {
        const utter = new SpeechSynthesisUtterance(text);
        utter.rate = 1.05;
        utter.pitch = 1.0;
        utter.volume = 1.0;
        
        // Prefer an English voice if available
        const voices = synth.getVoices();
        const enVoice = voices.find(v => /en(-|_)?.*/i.test(v.lang));
        if (enVoice) utter.voice = enVoice;
        
        synth.speak(utter);
      };
      
      // If voices are not loaded yet, wait for them
      if (synth.getVoices().length === 0) {
        synth.addEventListener('voiceschanged', speakText, { once: true });
      } else {
        speakText();
      }
    } catch (e) {
      // ignore failures
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
        audio.play().catch(e => {/* Could not play notification sound */});
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
      setChatMessages(prev => [...prev, {
        sender: { name: data.interpreter.name, role: 'interpreter' },
        message: `${data.interpreter.name} joined as interpreter`,
        timestamp: data.timestamp,
        messageType: 'system'
      }]);
    }
  };

  const handleCallEnded = (data) => {
    // Announce call end for job seekers
    if (user.role === 'JobSeeker') {
      speak("The call has ended. Thank you for participating.");
    }
    
    cleanup();
    onCallEnd?.(data);
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

  const inviteInterpreter = async (category) => {
    try {
      await videoCallService.inviteInterpreter(callInfo.id || callInfo.callId, category);
    } catch (error) {
      console.error('Error inviting interpreter:', error);
    }
  };

  const endCall = async () => {
    try {
      // Only try to end call via API if we have call info and user is recruiter or jobseeker
      if (callInfo && (callInfo.userRole === 'recruiter' || user.role === 'Recruiter')) {
        try {
          await videoCallService.endCall(callInfo.id || callInfo.callId);
        } catch (apiError) {
          console.warn('API call to end call failed, proceeding with local cleanup:', apiError);
        }
      }

      cleanup();
      onCallEnd?.();
    } catch (error) {
      console.error('Error ending call:', error);
      cleanup();
      onCallEnd?.();
    }
  };

  const cleanup = () => {
    if (isCleaningUpRef.current) return;
    isCleaningUpRef.current = true;

    // Clear intervals
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    // Disconnect from room
    if (roomRef.current) {
      try {
        roomRef.current.disconnect();
      } catch (e) {
        // ignore
      }
      roomRef.current = null;
    }

    // Stop local tracks with safety checks
    localTracks.forEach(track => {
      if (track && track.stop) {
        try {
          track.stop();
        } catch (error) {
          // ignore
        }
      }
    });
    setLocalTracks([]);

    // Leave socket room
    if (socket && callInfo) {
      try {
        socket.emit('leave-video-call', {
          roomName: callInfo.roomName
        });
      } catch (e) {
        // ignore
      }
    }

    setRoom(null);
    setParticipants(new Map());
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
            <div className="interpreter-requested-badge" role="status" aria-live="polite" aria-label="Interpreter has been requested">
              <span className="badge-icon">🗣️</span>
              <span className="badge-text">Interpreter Requested</span>
            </div>
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

      {isParticipantsOpen && (
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
        />
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
          onToggleAudio={toggleAudio}
          onToggleVideo={toggleVideo}
          onToggleChat={handleToggleChat}
          onToggleParticipants={handleToggleParticipants}
          onToggleProfile={handleToggleProfile}
          onEndCall={endCall}
          userRole={callInfo?.userRole}
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
          onChangeAudio={() => {}} // TODO: Implement device selection
          onChangeVideo={() => {}} // TODO: Implement device selection
          onAccept={handleAcceptInvitation}
          onDecline={handleDeclineInvitation}
        />
      )}
    </div>
  );
};

export default VideoCall;
