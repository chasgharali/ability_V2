import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { connect, createLocalVideoTrack, createLocalAudioTrack, Log } from 'twilio-video';
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
// Syncfusion Speech To Text Component
import { SpeechToTextComponent } from '@syncfusion/ej2-react-inputs';
import '@syncfusion/ej2-react-inputs/styles/material.css';
import './VideoCall.css';

// Suppress Twilio console warnings and errors
if (typeof Log !== 'undefined') {
  Log.setLevel(Log.levels.OFF);
}

// Override console.warn and console.error to filter out unwanted warnings
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.warn = function(...args) {
  const message = args.join(' ');
  
  // Filter out Twilio heartbeat warnings when connection is closed
  if (message.includes('TwilioConnection') && 
      (message.includes('Unexpected state') || message.includes('unexpected state')) && 
      (message.includes('heartbeat') || message.includes('TCMP'))) {
    return; // Suppress this specific warning
  }
  
  // Filter out React Router future flag warnings
  if (message.includes('React Router Future Flag Warning') || 
      message.includes('v7_startTransition') || 
      message.includes('v7_relativeSplatPath')) {
    return; // Suppress React Router v7 migration warnings
  }
  
  // Filter out socket-related warnings
  if (message.includes('Cannot join socket rooms') ||
      message.includes('Socket URL normalized')) {
    return; // Suppress socket connection warnings
  }
  
  // Call original console.warn for all other warnings
  originalConsoleWarn.apply(console, args);
};

console.error = function(...args) {
  const message = args.join(' ');
  
  // Filter out specific WebSocket connection errors (common when socket.io reconnects)
  if (message.includes('WebSocket') && 
      message.includes('closed before the connection is established')) {
    return; // Suppress this specific WebSocket error
  }
  
  // Call original console.error for all other errors
  originalConsoleError.apply(console, args);
};

const VideoCall = ({ callId: propCallId, callData: propCallData, onCallEnd }) => {
  const { callId: paramCallId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  // Use prop callId if provided, otherwise use URL param
  const callId = propCallId || paramCallId;

  // Use prop callData if provided, otherwise check navigation state
  const callData = propCallData || location.state?.callData;

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
  // Remote captions from all participants (Map of participantId -> {text, speaker, timestamp, isFinal})
  const [remoteCaptions, setRemoteCaptions] = useState(new Map());

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
  // Syncfusion SpeechToText component reference
  const speechToTextRef = useRef(null);
  // Ref to track caption enabled state (avoids stale closure in event handlers)
  const isCaptionEnabledRef = useRef(false);
  // Ref to track caption clear timeout (for cleanup)
  const captionClearTimeoutRef = useRef(null);
  // Ref to track last transcript time (for detecting if recognition stopped)
  const lastTranscriptTimeRef = useRef(null);
  // Ref to track periodic check interval for Syncfusion component
  const syncfusionCheckIntervalRef = useRef(null);
  // Ref to track if we're currently restarting the component (prevent multiple restarts)
  const isRestartingSyncfusionRef = useRef(false);

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

  // Create caption transcription handler function (outside useEffect to avoid closure issues)
  const handleCaptionTranscription = useCallback((data) => {
      // IMPORTANT: Always check the ref directly (refs don't have closure issues)
      // The ref is updated synchronously when captions are enabled/disabled
      const captionsCurrentlyEnabled = isCaptionEnabledRef.current;
      
      // Debug logging to help diagnose the issue
      if (!captionsCurrentlyEnabled) {
        // Only log once every 5 seconds to reduce spam
        if (!window._lastCaptionDisabledWarning || Date.now() - window._lastCaptionDisabledWarning > 5000) {
          console.warn('📝 Caption received but captions are disabled');
          console.warn('🔍 Debug info:', {
            isCaptionEnabledRef: isCaptionEnabledRef.current,
            isCaptionEnabledState: isCaptionEnabled,
            hasData: !!data,
            participantId: data?.participantId,
            text: data?.text?.substring(0, 30),
            timestamp: new Date().toISOString()
          });
          console.warn('💡 Toggle captions off/on to refresh the socket listener');
          window._lastCaptionDisabledWarning = Date.now();
        }
        return;
      }
      
      if (!data) {
        console.warn('📝 Caption received but data is null/undefined');
        return;
      }
      
      // Extract data first
      const { participantId, participantName, text, isFinal, timestamp } = data;
      
      // Deduplication: Skip if we've already processed this exact caption recently
      const captionKey = `${participantId}_${text}_${timestamp}`;
      if (!window._processedCaptions) {
        window._processedCaptions = new Set();
      }
      
      // Clean old entries (keep only last 100)
      if (window._processedCaptions.size > 100) {
        const entries = Array.from(window._processedCaptions);
        window._processedCaptions = new Set(entries.slice(-50));
      }
      
      if (window._processedCaptions.has(captionKey)) {
        // Already processed this caption - skip to avoid duplicates
        return;
      }
      window._processedCaptions.add(captionKey);
      
      // Log when we actually process captions (not when disabled)
      if (!window._lastCaptionLog || Date.now() - window._lastCaptionLog > 2000) {
        console.log('🔔 caption-transcription event received:', data);
        console.log('✅ Processing caption - isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
        window._lastCaptionLog = Date.now();
      }
      
      // Verify ref is still true (double-check)
      if (!isCaptionEnabledRef.current) {
        console.warn('⚠️ Ref became false during processing - skipping');
        return;
      }
      
      if (!participantId || !text) {
        console.error('📝 Invalid caption data received:', { participantId, text: text?.substring(0, 30), fullData: data });
        return;
      }

      // Only log unique captions
      const logKey = `${participantId}_${text.substring(0, 50)}_${timestamp}`;
      if (!window._lastLoggedCaptionKey || window._lastLoggedCaptionKey !== logKey) {
        console.log('✅ Processing REMOTE caption:', { participantId, participantName, text: text.substring(0, 50), isFinal, timestamp });
        window._lastLoggedCaptionKey = logKey;
      }

      // Update remote captions map with OTHER participant's transcript
      // This ensures OTHER users' captions show up on YOUR screen
      setRemoteCaptions(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(participantId);
        const newText = text.trim();
        const newTimestamp = timestamp || new Date().toISOString();
        
        // Only update if text actually changed (avoid unnecessary re-renders)
        if (!existing || existing.text !== newText) {
          const captionData = {
            text: newText,
            speaker: participantName || 'Participant',
            timestamp: newTimestamp,
            isFinal: isFinal !== false
          };
          newMap.set(participantId, captionData);
          console.log(`✅ Updated OTHER user's caption: ${participantName} -> "${newText.substring(0, 50)}" (isFinal: ${isFinal})`);
          // Reset logged captions so new caption will be logged
          window._lastLoggedCaptions = null;
        } else {
          // Text is same, but update timestamp and isFinal status
          newMap.set(participantId, {
            ...existing,
            timestamp: newTimestamp,
            isFinal: isFinal !== false
          });
        }
        return newMap;
      });
      
      // Don't force re-render with setCaptionText - it causes unnecessary renders
      // The remoteCaptions state update is enough to trigger a re-render

      // Clear this participant's caption after 15 seconds if final (longer timeout to keep captions visible)
      if (isFinal) {
        setTimeout(() => {
          if (isCaptionEnabledRef.current) {
            setRemoteCaptions(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(participantId);
              // Only clear if this is still the same caption (not overwritten by newer speech)
              if (existing && existing.timestamp === timestamp) {
                console.log(`🧹 Clearing old caption for ${participantName} after 15 seconds`);
                newMap.delete(participantId);
              }
              return newMap;
            });
          }
        }, 15000); // Increased from 5 to 15 seconds
      }
  }, [isCaptionEnabled]); // Include isCaptionEnabled for debugging, but use ref for actual check

  // Socket event listeners
  useEffect(() => {
    if (!socket) return;

    console.log('🔌 Setting up socket listeners for video call');
    console.log('🔍 Current caption state when setting up listeners:', {
      isCaptionEnabledRef: isCaptionEnabledRef.current,
      isCaptionEnabledState: isCaptionEnabled
    });
    
    // IMPORTANT: If captions were enabled before this listener was set up (e.g., during hot reload),
    // ensure the ref is synced with the state
    if (isCaptionEnabled && !isCaptionEnabledRef.current) {
      console.warn('⚠️ State says captions are enabled but ref is false - syncing ref');
      isCaptionEnabledRef.current = true;
    }

    socket.on('call_invitation', handleCallInvitation);
    
    // Listen for all possible message events
    socket.on('chat_message', (data) => {
      console.log('📨 Received chat_message event:', data);
      handleNewChatMessage(data);
    });
    
    socket.on('new_chat_message', (data) => {
      console.log('📨 Received new_chat_message event:', data);
      handleNewChatMessage(data);
    });
    
    socket.on('video-call-message', (data) => {
      console.log('📨 Received video-call-message event:', data);
      handleNewChatMessage(data);
    });

    socket.on('video-call-message-direct', (data) => {
      console.log('📨 Received video-call-message-direct event:', data);
      handleNewChatMessage(data);
    });

    // Listen for caption transcriptions from other participants (via socket broadcast)
    // IMPORTANT: This listener works REGARDLESS of your mic state (muted/unmuted)
    // When you're muted, you won't see YOUR captions, but you'll still see OTHER users' captions
    socket.on('caption-transcription', handleCaptionTranscription);
    
    // Log current ref state when listener is set up (for debugging)
    console.log('🔍 Socket listener setup - isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
    
    // Listen for caption errors
    socket.on('caption-error', (error) => {
      console.error('❌ Caption error:', error);
      if (error.code === 'SERVICE_UNAVAILABLE') {
        setCaptionText('Caption service unavailable - check server configuration');
        alert('Caption service is not configured on the server. Please contact your administrator.\n\n' + 
              (error.details || 'DEEPGRAM_API_KEY not set in server configuration'));
      }
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
      console.log('🔌 Cleaning up socket listeners');
      socket.off('call_invitation', handleCallInvitation);
      socket.off('new_chat_message', handleNewChatMessage);
      socket.off('chat_message', handleNewChatMessage);
      socket.off('video-call-message', handleNewChatMessage);
      socket.off('video-call-message-direct', handleNewChatMessage);
      socket.off('participant_joined', handleParticipantJoined);
      socket.off('participant_left', handleParticipantLeft);
      socket.off('participant_left_call', handleParticipantLeftCall);
      socket.off('interpreter_response', handleInterpreterResponse);
      socket.off('interpreter-declined', handleInterpreterDeclined);
      socket.off('participant-joined-video', handleParticipantJoined);
      socket.off('participant-left-video', handleParticipantLeft);
      socket.off('call_ended', handleCallEnded);
      socket.off('caption-transcription', handleCaptionTranscription);
      socket.off('caption-error');
      socket.off('error');
    };
  }, [socket, handleCaptionTranscription]); // Include handleCaptionTranscription to ensure it's up to date

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

    console.log('🧹 Stopping camera/mic for job seeker (call ended by recruiter)...');

    // Step 1: Detach all Twilio tracks from video elements FIRST (removes browser media indicator)
    if (roomRef.current) {
      try {
        // Detach all local participant tracks from video elements
        roomRef.current.localParticipant.tracks.forEach(publication => {
          if (publication.track && typeof publication.track.detach === 'function') {
            try {
              console.log('Detaching local track from video elements:', publication.track.kind);
              const elements = publication.track.detach();
              elements.forEach(el => {
                if (el && el.srcObject) {
                  // Stop tracks in the detached element's stream
                  if (el.srcObject instanceof MediaStream) {
                    el.srcObject.getTracks().forEach(track => track.stop());
                  }
                  el.srcObject = null;
                }
              });
            } catch (e) {
              console.warn('Error detaching local track:', e);
            }
          }
        });

        // Detach all remote participant tracks from video elements
        roomRef.current.participants.forEach(participant => {
          participant.tracks.forEach(publication => {
            if (publication.track && typeof publication.track.detach === 'function') {
              try {
                console.log('Detaching remote track from video elements:', publication.track.kind);
                const elements = publication.track.detach();
                elements.forEach(el => {
                  if (el && el.srcObject) {
                    if (el.srcObject instanceof MediaStream) {
                      el.srcObject.getTracks().forEach(track => track.stop());
                    }
                    el.srcObject = null;
                  }
                });
              } catch (e) {
                console.warn('Error detaching remote track:', e);
              }
            }
          });
        });
      } catch (e) {
        console.warn('Error detaching tracks from video elements:', e);
      }
    }

    // Step 2: Stop all local tracks from state (after detaching)
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

    // Step 3: Stop all MediaStream tracks directly from video elements (critical for camera/mic)
    try {
      const videoElements = document.querySelectorAll('video');
      videoElements.forEach(video => {
        if (video.srcObject) {
          const stream = video.srcObject;
          stream.getTracks().forEach(track => {
            try {
              console.log('Stopping media stream track:', track.kind, track.label);
              track.stop();
            } catch (e) {
              console.warn('Error stopping media stream track:', e);
            }
          });
          video.srcObject = null;
        }
        // Also pause the video element to ensure browser releases resources
        if (video) {
          video.pause();
          video.load(); // Reset the video element
        }
      });

      // Also clear audio elements if any
      const audioElements = document.querySelectorAll('audio');
      audioElements.forEach(audio => {
        if (audio.srcObject) {
          const stream = audio.srcObject;
          stream.getTracks().forEach(track => {
            try {
              track.stop();
            } catch (e) {
              console.warn('Error stopping audio stream track:', e);
            }
          });
          audio.srcObject = null;
        }
        if (audio) {
          audio.pause();
          audio.load(); // Reset the audio element
        }
      });
    } catch (e) {
      console.warn('Error stopping media stream tracks from video elements:', e);
    }

    // Step 4: Disconnect from Twilio room and unpublish tracks
    if (roomRef.current) {
      try {
        console.log('🔌 Disconnecting from Twilio room (call ended by recruiter)...');

        // Unpublish all local participant tracks
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

    // Step 4: Wait a moment for disconnect to complete
    await new Promise(resolve => setTimeout(resolve, 300));

    // Step 5: Final cleanup (socket, intervals, etc.)
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
    console.log('📩 handleNewChatMessage received:', messageData);
    console.log('📩 Current user ID:', user._id || user.id);
    console.log('📩 Message sender ID:', messageData.sender?.id);
    
    // Normalize IDs for comparison (handle both string and ObjectId)
    const currentUserId = String(user._id || user.id);
    const senderId = String(messageData.sender?.id || '');
    
    // Don't add our own messages again (they're already added optimistically)
    if (senderId === currentUserId) {
      console.log('⏭️ Skipping own message');
      return;
    }

    // Ensure message has the correct structure for ChatPanel
    const formattedMessage = {
      sender: {
        id: messageData.sender?.id,
        name: messageData.sender?.name,
        role: messageData.sender?.role
      },
      message: messageData.message || messageData.content || '',
      timestamp: messageData.timestamp || new Date().toISOString(),
      messageType: messageData.messageType || 'text'
    };

    console.log('✅ Adding message to chat:', formattedMessage);

    setChatMessages(prev => {
      // Check for duplicates based on timestamp and sender
      const isDuplicate = prev.some(msg => 
        msg.timestamp === formattedMessage.timestamp && 
        String(msg.sender?.id) === senderId
      );
      
      if (isDuplicate) {
        console.log('⏭️ Skipping duplicate message');
        return prev;
      }
      
      const newMessages = [...prev, formattedMessage];
      console.log('📝 Updated messages count:', newMessages.length);
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

  const toggleAudio = useCallback(() => {
    const audioTrack = localTracks.find(track => track.kind === 'audio');
    if (!audioTrack) return;

    if (isAudioEnabled) {
      // Mute: disable the track (stops transmission)
      audioTrack.disable();
      setIsAudioEnabled(false);

      // When muted, stop Syncfusion SpeechToText (no point capturing if mic is off)
      // But keep captions enabled to receive other users' captions via socket
      if (isCaptionEnabledRef.current && speechToTextRef.current) {
        console.log('🔇 Muted - Stopping Syncfusion SpeechToText (no mic input)');
        console.log('📝 You will still receive OTHER users\' captions via socket');
        try {
          // Syncfusion component handles stop internally
          if (speechToTextRef.current && typeof speechToTextRef.current.stop === 'function') {
            speechToTextRef.current.stop();
          }
        } catch (e) {
          console.warn('⚠️ Error stopping Syncfusion SpeechToText:', e);
        }
      }
    } else {
      // Unmute: enable the track (resumes transmission)
      audioTrack.enable();
      setIsAudioEnabled(true);

      // When unmuted, Syncfusion SpeechToText will resume automatically if captions are enabled
      if (isCaptionEnabledRef.current && speechToTextRef.current) {
        console.log('🔊 Unmuted - Syncfusion SpeechToText will resume capturing YOUR speech');
    }
    }
  }, [localTracks, isAudioEnabled, user, callInfo]);

  const toggleVideo = useCallback(() => {
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
  }, [localTracks, isVideoEnabled]);

  // Handle Syncfusion SpeechToText transcriptChanged event
  const handleTranscriptChanged = useCallback((args) => {
    if (!args) {
      return;
    }

    const transcript = args.transcript || args.text || '';
    const isFinal = args.isFinal !== false; // Default to true if not specified
    
    if (!transcript || transcript.trim() === '') {
      return; // Skip empty transcripts
    }
    
    // Update last transcript time to track if recognition is still active
    lastTranscriptTimeRef.current = Date.now();
    
    // Only log when transcript actually changes to reduce spam
    if (!window._lastProcessedSyncfusionTranscript || window._lastProcessedSyncfusionTranscript !== transcript.trim()) {
      console.log(`🎤 [Syncfusion SpeechToText] New transcript: "${transcript.substring(0, 50)}" (isFinal: ${isFinal})`);
      window._lastProcessedSyncfusionTranscript = transcript.trim();
    }
    
    if (!isCaptionEnabledRef.current) {
      return;
    }

    const localId = user?._id || user?.id || 'local';
    const localName = user?.name || 'You';
    const timestamp = new Date().toISOString();

    // Update remote captions map with local user's transcript
    setRemoteCaptions(prev => {
      const newMap = new Map(prev);
      const existing = newMap.get(localId);
      
      // Only update if text actually changed (avoid unnecessary re-renders)
      if (!existing || existing.text !== transcript.trim()) {
        const captionData = {
          text: transcript.trim(),
          speaker: localName,
          timestamp: timestamp,
          isFinal: isFinal
        };
        newMap.set(localId, captionData);
        window._lastLoggedCaptions = null; // Reset to allow new caption logging
      } else {
        // Text is same, but update timestamp and isFinal status
        newMap.set(localId, {
          ...existing,
          timestamp: timestamp,
          isFinal: isFinal
        });
      }
      return newMap;
    });

    // Broadcast YOUR caption to other participants via socket
    if (socket && callInfo) {
      const callId = callInfo.id || callInfo.callId || callInfo._id;
      // Server requires roomName (not connectionKey)
      const roomName = callInfo.roomName || callInfo.connectionKey || `booth_${callInfo.booth?._id || callInfo.booth}_${localId}_${Date.now()}`;
      const participantId = user?._id || user?.id || 'local';
      const participantName = user?.name || 'You';

      const broadcastData = {
        callId: callId,
        roomName: roomName, // REQUIRED by server - must be present
        participantId: participantId, // REQUIRED by server - must be present
        participantName: participantName,
        text: transcript.trim(), // REQUIRED by server - must be present
        isFinal: isFinal,
        timestamp: timestamp
      };

      // Only log broadcast details when transcript changes
      if (!window._lastBroadcastedTranscript || window._lastBroadcastedTranscript !== transcript.trim()) {
        console.log('📤 [Syncfusion SpeechToText] Broadcasting:', {
          roomName,
          participantId,
          text: transcript.trim().substring(0, 50),
          isFinal
        });
        window._lastBroadcastedTranscript = transcript.trim();
      }

      socket.emit('caption-transcription-broadcast', broadcastData);
    } else {
      console.warn('⚠️ [Syncfusion SpeechToText] Cannot broadcast - missing socket or callInfo');
    }
  }, [user, socket, callInfo]);

  // Legacy function name for compatibility (not used anymore)
  const handleSpeechResult = useCallback((transcript, isFinal) => {
    console.log(`🎤 [Speech Recognition] Processing: "${transcript.substring(0, 50)}" (isFinal: ${isFinal})`);
    
    if (!isCaptionEnabledRef.current) {
      console.warn('⚠️ [Speech Recognition] Caption received but captions are disabled');
      return;
    }

    if (transcript.trim()) {
      const localId = user?._id || user?.id || 'local';
      const localName = user?.name || 'You';
      const timestamp = new Date().toISOString();

      // Update remote captions map with local user's transcript
      // This ensures YOUR captions show up on YOUR screen
      setRemoteCaptions(prev => {
        const newMap = new Map(prev);
        const existing = newMap.get(localId);
        
        // Only update if text actually changed (avoid unnecessary re-renders)
        if (!existing || existing.text !== transcript.trim()) {
          const captionData = {
            text: transcript.trim(),
            speaker: localName,
            timestamp: timestamp,
            isFinal: isFinal
          };
          newMap.set(localId, captionData);
          console.log(`✅ [Speech Recognition] Updated YOUR caption: "${transcript.trim().substring(0, 50)}" (isFinal: ${isFinal})`);
          // Reset logged captions so new caption will be logged
          window._lastLoggedCaptions = null;
        } else {
          // Text is same, but update timestamp and isFinal status
          newMap.set(localId, {
            ...existing,
            timestamp: timestamp,
            isFinal: isFinal
          });
        }
        return newMap;
      });

      // Broadcast to other participants via socket (so they see your captions too)
      if (socket && callInfo) {
        const roomName = callInfo.roomName;
        const callId = callInfo.id || callInfo.callId || callInfo._id;
        
        socket.emit('caption-transcription-broadcast', {
          callId,
          roomName,
          participantId: localId,
          participantName: localName,
          text: transcript.trim(),
          isFinal: isFinal,
          timestamp: timestamp
        });
      }

      // Add to history if final
      if (isFinal) {
        setCaptionHistory(prev => [...prev.slice(-9), {
          text: transcript.trim(),
          timestamp: timestamp,
          speaker: localName
        }]);

        // Clear caption after 15 seconds of inactivity (longer timeout to keep captions visible)
        // This allows users to read the captions and keeps them visible during natural speech pauses
        if (captionClearTimeoutRef.current) {
          clearTimeout(captionClearTimeoutRef.current);
        }
        captionClearTimeoutRef.current = setTimeout(() => {
          if (isCaptionEnabledRef.current) {
            setRemoteCaptions(prev => {
              const newMap = new Map(prev);
              const existing = newMap.get(localId);
              // Only clear if this is still the same caption (not overwritten by newer speech)
              if (existing && existing.timestamp === timestamp) {
                console.log('🧹 Clearing old caption after 15 seconds of inactivity');
                newMap.delete(localId);
              }
              return newMap;
            });
          }
        }, 15000); // Increased from 5 to 15 seconds
      }
    }
  }, [user, socket, callInfo]);

  // Toggle captions using Syncfusion SpeechToText component
  const toggleCaption = useCallback(() => {
    if (isCaptionEnabledRef.current) {
      // Turn off captions
      console.log('🔇 Disabling captions...');
      isCaptionEnabledRef.current = false;

      // Clear any pending caption clear timeout
      if (captionClearTimeoutRef.current) {
        clearTimeout(captionClearTimeoutRef.current);
        captionClearTimeoutRef.current = null;
      }

      // Stop Syncfusion SpeechToText component
      if (speechToTextRef.current) {
        try {
          if (typeof speechToTextRef.current.stop === 'function') {
            speechToTextRef.current.stop();
          }
          console.log('✅ [Syncfusion SpeechToText] Stopped');
        } catch (e) {
          console.warn('⚠️ Error stopping Syncfusion SpeechToText:', e);
        }
      }

      setIsCaptionEnabled(false);
      setCaptionText('');
      setRemoteCaptions(new Map());
      console.log('✅ Captions disabled');
    } else {
      // Turn on captions
      console.log('🎤 Enabling captions with Syncfusion SpeechToText...');

      if (!socket || !callInfo) {
        alert('Cannot enable captions: missing connection or call info');
        return;
      }

      // Check if Web Speech API is supported (required for Syncfusion)
      if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
        alert('Speech recognition is not supported in this browser. Please use Chrome, Edge, or Safari.');
        return;
      }

      // Enable caption state - Set ref FIRST (synchronously) before state
      // This ensures socket listeners see the updated ref immediately
      isCaptionEnabledRef.current = true;
      setIsCaptionEnabled(true);
      setCaptionText('Starting captions...');
      console.log('✅ Captions enabled - isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
      console.log('🔍 Verification: Ref set synchronously before any async operations');
      
      // Force a small delay to ensure ref is set before any socket events arrive
      // This helps with hot reload scenarios where socket listeners might be recreated
      setTimeout(() => {
        console.log('🔍 Post-enable check - isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
      }, 100);

      // Check actual audio track state (more reliable than state variable)
      const audioTrack = localTracks.find(track => track.kind === 'audio');
      const actualAudioEnabled = audioTrack ? audioTrack.isEnabled : isAudioEnabled;
      
      console.log('🔍 Audio state check:', {
        isAudioEnabled,
        actualAudioEnabled,
        hasAudioTrack: !!audioTrack,
        trackEnabled: audioTrack?.isEnabled
      });

      // IMPORTANT: Only start Syncfusion SpeechToText if mic is UNMUTED
      // If muted, we'll only receive other users' captions via socket (no need to capture our own speech)
      if (!actualAudioEnabled) {
        console.log('🔇 Mic is muted - Syncfusion SpeechToText will not start');
        console.log('📝 You will only receive OTHER users\' captions via socket (when they speak)');
        setCaptionText('Waiting for others to speak...');
        // CRITICAL: Set ref FIRST (synchronously) before state to ensure socket listener sees it
        isCaptionEnabledRef.current = true;
        setIsCaptionEnabled(true);
        console.log('✅ Captions enabled (muted mode) - ready to receive OTHER users\' captions');
        console.log('🔍 Verification: isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
        
        // Force a small delay to ensure ref is set before any socket events arrive
        setTimeout(() => {
          console.log('🔍 Post-enable check (muted) - isCaptionEnabledRef.current =', isCaptionEnabledRef.current);
        }, 100);
        
        // Syncfusion component won't be started - just wait for socket broadcasts
        return;
      }
      
      // Mic is unmuted - also set ref synchronously
      isCaptionEnabledRef.current = true;

      // Mic is unmuted - Syncfusion SpeechToText component will start automatically when rendered
      console.log('🎤 Mic is unmuted - Syncfusion SpeechToText will start capturing YOUR speech');
      console.log('📝 You will also receive OTHER users\' captions via socket when they speak');
    }
  }, [socket, callInfo, isAudioEnabled, localTracks, user]);

  // Helper function to start Syncfusion SpeechToText component
  const startSyncfusionComponent = useCallback(() => {
    if (!speechToTextRef.current) {
      console.warn('⚠️ Cannot start Syncfusion - component ref is null');
      return false;
    }

    if (isRestartingSyncfusionRef.current) {
      console.log('⏳ Already restarting Syncfusion - skipping');
      return false;
    }

    try {
      console.log('🎤 Attempting to start Syncfusion SpeechToText component...');
      
      // First, check if component is already listening
      const buttonElement = speechToTextRef.current.element?.querySelector('button');
      const isAlreadyListening = buttonElement && (
        buttonElement.getAttribute('aria-pressed') === 'true' ||
        buttonElement.classList.contains('e-active') ||
        buttonElement.classList.contains('e-listening-state')
      );

      if (isAlreadyListening) {
        console.log('✅ Syncfusion SpeechToText is already listening');
        lastTranscriptTimeRef.current = Date.now();
        return true;
      }

      // Try multiple methods to start the component
      let started = false;
      
      // Method 1: Try startListening() method directly
      if (speechToTextRef.current.startListening) {
        try {
          speechToTextRef.current.startListening();
          console.log('✅ Syncfusion SpeechToText started via startListening() method');
          started = true;
          lastTranscriptTimeRef.current = Date.now();
          
          // Verify it actually started after a short delay
          setTimeout(() => {
            const buttonEl = speechToTextRef.current?.element?.querySelector('button');
            const isActive = buttonEl && (
              buttonEl.getAttribute('aria-pressed') === 'true' ||
              buttonEl.classList.contains('e-active') ||
              buttonEl.classList.contains('e-listening-state')
            );
            if (!isActive) {
              console.warn('⚠️ startListening() called but component not active - trying button click');
              if (buttonEl) {
                buttonEl.click();
              }
            }
          }, 300);
        } catch (e) {
          console.warn('⚠️ startListening() failed:', e);
        }
      }
      
      // Method 2: Find and click the button element
      if (!started) {
        if (buttonElement) {
          try {
            console.log('✅ Found button element, clicking...');
            // Stop first if it's in a stopped state
            const isStopped = buttonElement.classList.contains('e-stopped-state') || 
                            buttonElement.getAttribute('aria-label')?.includes('Press to start');
            if (isStopped) {
              buttonElement.click();
              console.log('✅ Syncfusion SpeechToText button clicked');
              started = true;
              lastTranscriptTimeRef.current = Date.now();
            } else {
              // Try clicking anyway
              buttonElement.click();
              started = true;
              lastTranscriptTimeRef.current = Date.now();
            }
          } catch (e) {
            console.warn('⚠️ Button click failed:', e);
          }
        } else {
          console.warn('⚠️ Could not find button element');
        }
      }
      
      // Method 3: Try start() method as fallback
      if (!started && speechToTextRef.current.start) {
        try {
          speechToTextRef.current.start();
          console.log('✅ Syncfusion SpeechToText started via start() method');
          started = true;
          lastTranscriptTimeRef.current = Date.now();
        } catch (e) {
          console.warn('⚠️ start() method failed:', e);
        }
      }

      // If still not started, wait a bit and try button click again
      if (!started) {
        setTimeout(() => {
          const btnEl = speechToTextRef.current?.element?.querySelector('button');
          if (btnEl) {
            try {
              btnEl.click();
              console.log('✅ Retry: Syncfusion SpeechToText button clicked');
              lastTranscriptTimeRef.current = Date.now();
            } catch (e) {
              console.warn('⚠️ Retry button click failed:', e);
            }
          }
        }, 500);
      }
      
      return started;
    } catch (e) {
      console.error('❌ Error starting Syncfusion SpeechToText:', e);
      return false;
    }
  }, []);

  // Check if Syncfusion component is still running
  const checkSyncfusionStatus = useCallback(() => {
    if (!isCaptionEnabledRef.current || !speechToTextRef.current) {
      return;
    }

    const audioTrack = localTracks.find(track => track.kind === 'audio');
    const actualAudioEnabled = audioTrack ? audioTrack.isEnabled : isAudioEnabled;
    
    // Only check if captions are enabled and mic is unmuted
    if (!actualAudioEnabled) {
      return;
    }

    // Check if component is still listening
    const buttonElement = speechToTextRef.current.element?.querySelector('button');
    const isListening = buttonElement && (
      buttonElement.getAttribute('aria-pressed') === 'true' ||
      buttonElement.classList.contains('e-active') ||
      buttonElement.classList.contains('e-listening-state')
    );

    // Check if recognition object exists and is active
    let recognitionActive = false;
    try {
      recognitionActive = speechToTextRef.current.recognition && 
        (speechToTextRef.current.recognition.state === 'listening' ||
         speechToTextRef.current.recognition.state === 'starting');
    } catch (e) {
      // Recognition object might not be accessible
    }

    // If component appears stopped, restart it
    if (!isListening && !recognitionActive) {
      // Check if we've received transcripts recently
      // If we received transcripts recently (within last 20 seconds), component might just be processing
      const timeSinceLastTranscript = lastTranscriptTimeRef.current 
        ? Date.now() - lastTranscriptTimeRef.current 
        : Infinity;
      
      // More aggressive restart: if component is not listening and no recent transcripts (15 seconds)
      // OR if it's been more than 60 seconds since last transcript (definitely stopped)
      const shouldRestart = (timeSinceLastTranscript > 15000 && timeSinceLastTranscript < 60000) || 
                           (timeSinceLastTranscript > 60000);
      
      if (shouldRestart && !isRestartingSyncfusionRef.current) {
        console.warn(`⚠️ Syncfusion SpeechToText appears to have stopped (${Math.round(timeSinceLastTranscript / 1000)}s since last transcript) - restarting...`);
        isRestartingSyncfusionRef.current = true;
        
        // Try to restart with retry logic
        const attemptRestart = (attempt = 1) => {
          setTimeout(() => {
            const restarted = startSyncfusionComponent();
            if (restarted) {
              console.log('✅ Syncfusion SpeechToText restarted successfully');
              isRestartingSyncfusionRef.current = false;
            } else if (attempt < 3) {
              console.log(`🔄 Retry ${attempt}/3: Attempting to restart Syncfusion SpeechToText...`);
              attemptRestart(attempt + 1);
            } else {
              console.warn('⚠️ Failed to restart Syncfusion SpeechToText after 3 attempts');
              isRestartingSyncfusionRef.current = false;
            }
          }, attempt * 500); // Exponential backoff
        };
        
        attemptRestart();
      }
    } else if (isListening || recognitionActive) {
      // Component is active, reset the last transcript time if it's been a while
      // This prevents false positives when user is just silent
      if (lastTranscriptTimeRef.current && (Date.now() - lastTranscriptTimeRef.current) > 30000) {
        // User might be silent, but component is still listening - that's fine
        // Don't reset the timer, but don't restart either
      }
    }
  }, [isAudioEnabled, localTracks, startSyncfusionComponent]);

  // Auto-start Syncfusion SpeechToText component when enabled
  useEffect(() => {
    // Check actual audio track state
    const audioTrack = localTracks.find(track => track.kind === 'audio');
    const actualAudioEnabled = audioTrack ? audioTrack.isEnabled : isAudioEnabled;
    
    if (isCaptionEnabled && actualAudioEnabled) {
      // Wait for component to mount, then start it
      const timer = setTimeout(() => {
        if (speechToTextRef.current) {
          startSyncfusionComponent();
          
          // Set up event listeners on the recognition object if available
          try {
            if (speechToTextRef.current.recognition) {
              const recognition = speechToTextRef.current.recognition;
              
              // Listen for when recognition ends
              recognition.onend = () => {
                console.log('🔄 Syncfusion recognition ended - will check status and restart if needed');
                // Don't restart immediately - let the periodic check handle it
                // This prevents rapid restart loops
                setTimeout(() => {
                  if (isCaptionEnabledRef.current && actualAudioEnabled) {
                    checkSyncfusionStatus();
                  }
                }, 1000);
              };
              
              // Listen for errors
              recognition.onerror = (event) => {
                console.error('❌ Syncfusion recognition error:', event.error);
                // Restart on certain errors
                if (event.error === 'no-speech' || event.error === 'aborted' || event.error === 'network') {
                  setTimeout(() => {
                    if (isCaptionEnabledRef.current && actualAudioEnabled) {
                      console.log('🔄 Restarting after recognition error...');
                      startSyncfusionComponent();
                    }
                  }, 2000);
                }
              };
            }
          } catch (e) {
            console.warn('⚠️ Could not set up recognition event listeners:', e);
          }
        } else {
          console.warn('⚠️ speechToTextRef.current is null - component may not be mounted yet');
        }
      }, 1500); // Delay to ensure component is fully mounted and rendered
      
      // Set up periodic check to ensure component stays running
      // Check more frequently (every 5 seconds) for better reliability
      syncfusionCheckIntervalRef.current = setInterval(() => {
        checkSyncfusionStatus();
      }, 5000); // Check every 5 seconds for faster detection
      
      return () => {
        clearTimeout(timer);
        if (syncfusionCheckIntervalRef.current) {
          clearInterval(syncfusionCheckIntervalRef.current);
          syncfusionCheckIntervalRef.current = null;
        }
      };
    } else {
      // Clear interval if captions are disabled or mic is muted
      if (syncfusionCheckIntervalRef.current) {
        clearInterval(syncfusionCheckIntervalRef.current);
        syncfusionCheckIntervalRef.current = null;
      }
    }
  }, [isCaptionEnabled, isAudioEnabled, localTracks, startSyncfusionComponent, checkSyncfusionStatus]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      // Clear caption enabled ref
      isCaptionEnabledRef.current = false;

      // Clear any pending caption clear timeout
      if (captionClearTimeoutRef.current) {
        clearTimeout(captionClearTimeoutRef.current);
        captionClearTimeoutRef.current = null;
      }

      // Clear Syncfusion check interval
      if (syncfusionCheckIntervalRef.current) {
        clearInterval(syncfusionCheckIntervalRef.current);
        syncfusionCheckIntervalRef.current = null;
      }

      // Syncfusion component cleanup is handled automatically
    };
  }, []);

  const inviteInterpreter = async (interpreterId, category) => {
    try {
      const callId = callInfo.id || callInfo.callId || callInfo._id;
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
    const wasAlreadyCleaning = isCleaningUpRef.current;
    isCleaningUpRef.current = true;

    if (wasAlreadyCleaning) {
      console.log('⚠️ Cleanup already in progress, but ensuring socket/intervals are cleaned up...');
    } else {
      console.log('🧹 Final cleanup of remaining resources...');
    }

    // Always clear intervals (even if cleanup was already in progress)
    if (qualityCheckIntervalRef.current) {
      clearInterval(qualityCheckIntervalRef.current);
      qualityCheckIntervalRef.current = null;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Clear caption timeout
    if (captionClearTimeoutRef.current) {
      clearTimeout(captionClearTimeoutRef.current);
      captionClearTimeoutRef.current = null;
    }

    // Syncfusion component will clean up automatically when unmounted
    isCaptionEnabledRef.current = false;

    // Stop all local tracks (only if not already stopped)
    if (!wasAlreadyCleaning) {
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

      // Stop all media stream tracks directly from browser (only if not already stopped)
      try {
        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
          const videoElements = document.querySelectorAll('video');
          videoElements.forEach(video => {
            if (video.srcObject) {
              const stream = video.srcObject;
              stream.getTracks().forEach(track => {
                if (track.readyState !== 'ended') {
                  console.log('Stopping media stream track:', track.kind, track.label);
                  track.stop();
                }
              });
              video.srcObject = null;
            }
          });
        }
      } catch (e) {
        console.warn('Error stopping media stream tracks:', e);
      }

      setLocalTracks([]);
    }

    // Always leave socket room (even if cleanup was already in progress)
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

    // Clear caption timeout
    if (captionClearTimeoutRef.current) {
      clearTimeout(captionClearTimeoutRef.current);
      captionClearTimeoutRef.current = null;
    }

    // Syncfusion component will clean up automatically when unmounted
    isCaptionEnabledRef.current = false;

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

  // Network quality monitoring - removed duplicate monitoring that was causing MaxListenersExceededWarning
  // Network quality is already handled by handleNetworkQualityChanged on the room level

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

      {/* Syncfusion SpeechToText Component - Must be visible (but off-screen) for microphone access */}
      {(() => {
        const audioTrack = localTracks.find(track => track.kind === 'audio');
        const actualAudioEnabled = audioTrack ? audioTrack.isEnabled : isAudioEnabled;
        
        if (isCaptionEnabled && actualAudioEnabled) {
          return (
            <div 
              style={{ 
                position: 'fixed', 
                top: '10px', 
                right: '10px', 
                width: '200px', 
                height: '50px',
                zIndex: 9999,
                opacity: 0.01, // Nearly invisible but still "visible" to browser
                pointerEvents: 'auto'
              }}
              aria-hidden="true"
            >
              <SpeechToTextComponent
                ref={speechToTextRef}
                transcriptChanged={handleTranscriptChanged}
                locale="en-US"
                cssClass="e-primary"
              />
            </div>
          );
        }
        return null;
      })()}


      {/* Caption Display */}
      {isCaptionEnabled && (
        <div className="caption-container" role="region" aria-live="polite" aria-label="Live captions">
          <div className="caption-content">
            {(() => {
              // Collect all captions to display
              const allCaptions = [];
              
              // Add captions from remoteCaptions map (from Syncfusion SpeechToText and socket broadcasts)
              remoteCaptions.forEach((caption, participantId) => {
                if (caption && caption.text && caption.text.trim()) {
                  allCaptions.push({
                    id: participantId,
                    text: caption.text,
                    speaker: caption.speaker || 'Participant',
                    isFinal: caption.isFinal,
                    timestamp: caption.timestamp // Include timestamp for unique keys
                  });
                }
              });

              // Log only when captions actually change (not on every render)
              if (allCaptions.length > 0) {
                const captionTexts = allCaptions.map(c => c.text).join(' | ');
                // Use a ref to track last logged caption to avoid spam
                if (!window._lastLoggedCaptions || window._lastLoggedCaptions !== captionTexts) {
                  console.log(`📺 Rendering ${allCaptions.length} caption(s):`, allCaptions.map(c => `${c.speaker}: "${c.text.substring(0, 30)}"`));
                  window._lastLoggedCaptions = captionTexts;
                }
              }

              if (allCaptions.length > 0) {
                // Show all captions (both your own and other participants')
                // Only log when captions change (not on every render)
                return allCaptions.map((caption, index) => {
                  return (
                    <div key={`${caption.id}-${caption.timestamp || index}`} className="caption-item">
                    <span className="caption-speaker">{caption.speaker}:</span>
                    <span className="caption-text">{caption.text}</span>
                  </div>
                  );
                });
              } else {
                // Show appropriate status based on mic state
                if (!isAudioEnabled) {
                  // Mic is muted - only waiting for other users' captions
                  return <p className="caption-text caption-listening">Waiting for others to speak...</p>;
                } else {
                  // Mic is unmuted - actively listening for your speech
                return <p className="caption-text caption-listening">Listening for speech...</p>;
                }
              }
            })()}
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
