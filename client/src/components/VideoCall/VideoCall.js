import React, { useState, useEffect, useRef, useCallback } from 'react';
import { connect, createLocalVideoTrack, createLocalAudioTrack } from 'twilio-video';
import { useAuth } from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import videoCallService from '../../services/videoCall';
import VideoParticipant from './VideoParticipant';
import CallControls from './CallControls';
import ChatPanel from './ChatPanel';
import ParticipantsList from './ParticipantsList';
import JobSeekerProfile from './JobSeekerProfile';
import './VideoCall.css';

const VideoCall = ({ callId, callData, onCallEnd }) => {
  const { user } = useAuth();
  const { socket } = useSocket();
  
  // Call state
  const [room, setRoom] = useState(null);
  const [participants, setParticipants] = useState(new Map());
  const [localTracks, setLocalTracks] = useState([]);
  const [callInfo, setCallInfo] = useState(callData);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // UI state
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isParticipantsOpen, setIsParticipantsOpen] = useState(false);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [chatMessages, setChatMessages] = useState([]);
  const [connectionQuality, setConnectionQuality] = useState('good');
  
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
        console.log('Initializing call with provided data:', callData);
        setIsInitializing(true);
        initializeCallWithData(callData);
      } else if (callId && !callData) {
        console.log('Initializing call by joining with ID:', callId);
        setIsInitializing(true);
        initializeCall();
      } else {
        console.log('No valid call data or ID provided');
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
    socket.on('new_chat_message', handleNewChatMessage);
    socket.on('participant-joined-video', handleParticipantJoined);
    socket.on('participant-left-video', handleParticipantLeft);
    socket.on('interpreter-response', handleInterpreterResponse);
    socket.on('call_ended', handleCallEnded);

    return () => {
      socket.off('call_invitation', handleCallInvitation);
      socket.off('new_chat_message', handleNewChatMessage);
      socket.off('participant-joined-video', handleParticipantJoined);
      socket.off('participant-left-video', handleParticipantLeft);
      socket.off('interpreter-response', handleInterpreterResponse);
      socket.off('call_ended', handleCallEnded);
    };
  }, [socket]); // eslint-disable-line react-hooks/exhaustive-deps

  const initializeCallWithData = async (data) => {
    try {
      setLoading(true);
      setError(null);

      // Use provided call data
      setCallInfo(data);
      setChatMessages(data.chatMessages || []);

      // Create local tracks
      const videoTrack = await createLocalVideoTrack({
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'user'
      });
      
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });

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
      socket?.emit('join-video-call', {
        callId: data.id,
        roomName: data.roomName
      });

      // Start quality monitoring
      startQualityMonitoring();

      setLoading(false);
      setIsInitializing(false);
      setReconnectAttempts(0); // Reset on successful connection
    } catch (err) {
      console.error('Error initializing call with data:', err);
      setError(err.message || 'Failed to initialize call');
      setLoading(false);
      setIsInitializing(false);
    }
  };

  const initializeCall = async () => {
    try {
      setLoading(true);
      setError(null);

      // Get call details
      const callDetails = await videoCallService.joinCall(callId);
      setCallInfo(callDetails);
      setChatMessages(callDetails.chatMessages || []);

      // Create local tracks
      const videoTrack = await createLocalVideoTrack({
        width: 1280,
        height: 720,
        frameRate: 30,
        facingMode: 'user'
      });
      
      const audioTrack = await createLocalAudioTrack({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      });

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
      socket?.emit('join-video-call', {
        callId: callDetails.callId,
        roomName: callDetails.roomName
      });

      // Start quality monitoring
      startQualityMonitoring();

      setLoading(false);
      setIsInitializing(false);
    } catch (err) {
      console.error('Error initializing call:', err);
      setError(err.message || 'Failed to initialize call');
      setLoading(false);
      setIsInitializing(false);
    }
  };

  const addParticipant = useCallback((participant) => {
    console.log('Adding participant:', participant.identity);
    setParticipants(prevParticipants => {
      const newParticipants = new Map(prevParticipants);
      newParticipants.set(participant.sid, participant);
      return newParticipants;
    });

    // The VideoParticipant component will handle track attachment
    // No need to manually attach tracks here
  }, []);

  const removeParticipant = useCallback((participant) => {
    console.log('Removing participant:', participant.identity);
    setParticipants(prevParticipants => {
      const newParticipants = new Map(prevParticipants);
      newParticipants.delete(participant.sid);
      return newParticipants;
    });

    // The VideoParticipant component will handle track cleanup
    // No need to manually detach tracks here
  }, []);

  const handleCallInvitation = (data) => {
    // Handle incoming call invitation for job seekers
    if (user.role === 'JobSeeker') {
      setCallInfo(data);
      setLoading(false);
    }
  };

  const handleNewChatMessage = (messageData) => {
    setChatMessages(prev => [...prev, messageData]);
  };

  const handleParticipantJoined = (data) => {
    console.log('Participant joined:', data);
  };

  const handleParticipantLeft = (data) => {
    console.log('Participant left:', data);
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
    cleanup();
    onCallEnd?.(data);
  };

  const handleRoomDisconnected = (room, error) => {
    console.log('Room disconnected:', error);
    // Only attempt reconnect if it's an unexpected disconnection
    if (error && error.code !== 20104) { // 20104 is normal disconnection
      setError('Call disconnected. Attempting to reconnect...');
      attemptReconnect();
    } else {
      console.log('Room disconnected normally');
    }
  };

  const handleReconnecting = (error) => {
    console.log('Reconnecting to room:', error);
    setConnectionQuality('poor');
  };

  const handleReconnected = () => {
    console.log('Reconnected to room');
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
      console.log('Max reconnection attempts reached');
      setError('Unable to reconnect to call. Please refresh and try again.');
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    reconnectTimeoutRef.current = setTimeout(() => {
      if (callInfo && callInfo.accessToken) {
        console.log(`Reconnection attempt ${reconnectAttempts + 1}/3`);
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
    if (localTracks.length > 0) {
      const audioTrack = localTracks.find(track => track.kind === 'audio');
      if (audioTrack) {
        if (isAudioEnabled) {
          audioTrack.disable();
        } else {
          audioTrack.enable();
        }
        setIsAudioEnabled(!isAudioEnabled);
      }
    }
  };

  const toggleVideo = () => {
    if (localTracks.length > 0) {
      const videoTrack = localTracks.find(track => track.kind === 'video');
      if (videoTrack) {
        if (isVideoEnabled) {
          videoTrack.disable();
        } else {
          videoTrack.enable();
        }
        setIsVideoEnabled(!isVideoEnabled);
      }
    }
  };

  const inviteInterpreter = async (category) => {
    try {
      await videoCallService.inviteInterpreter(callInfo.id || callInfo.callId, category);
    } catch (error) {
      console.error('Error inviting interpreter:', error);
    }
  };

  const sendChatMessage = async (message) => {
    try {
      if (callInfo && (callInfo.id || callInfo.callId)) {
        await videoCallService.sendMessage(callInfo.id || callInfo.callId, message);
      } else {
        console.warn('No call info available for sending message');
      }
    } catch (error) {
      console.error('Error sending message:', error);
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
    <div className="video-call-container">
      {/* Connection Quality Indicator */}
      <div className={`connection-quality ${connectionQuality}`}>
        <span className="quality-dot"></span>
        <span className="quality-text">{connectionQuality}</span>
      </div>

      {/* Main Video Area */}
      <div className="video-main-area">
        {/* All Participants Grid */}
        <div className="participants-grid">
          {/* Remote Participants */}
          {Array.from(participants.values()).map(participant => (
            <VideoParticipant
              key={participant.sid}
              participant={participant}
              isLocal={false}
            />
          ))}
        </div>

        {/* Local Video - Small box in bottom right */}
        {room && (
          <div className="local-video-overlay">
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
          participants={callInfo?.participants}
          onClose={() => setIsParticipantsOpen(false)}
          onInviteInterpreter={inviteInterpreter}
          userRole={callInfo?.userRole}
          interpreterRequested={callInfo?.metadata?.interpreterRequested}
        />
      )}

      {isProfileOpen && callInfo?.userRole === 'recruiter' && (
        <JobSeekerProfile
          jobSeeker={callInfo.participants?.jobSeeker}
          onClose={() => setIsProfileOpen(false)}
        />
      )}

      {/* Call Controls */}
      <CallControls
        isAudioEnabled={isAudioEnabled}
        isVideoEnabled={isVideoEnabled}
        onToggleAudio={toggleAudio}
        onToggleVideo={toggleVideo}
        onToggleChat={() => setIsChatOpen(!isChatOpen)}
        onToggleParticipants={() => setIsParticipantsOpen(!isParticipantsOpen)}
        onToggleProfile={() => setIsProfileOpen(!isProfileOpen)}
        onEndCall={endCall}
        userRole={callInfo?.userRole}
        participantCount={participants.size + 1}
        chatUnreadCount={0} // TODO: Implement unread count
      />

      {/* Error Banner */}
      {error && (
        <div className="error-banner">
          <span>{error}</span>
          <button onClick={() => setError(null)}>×</button>
        </div>
      )}
    </div>
  );
};

export default VideoCall;
