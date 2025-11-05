import React, { useState, useEffect, useRef } from 'react';
import { MdVideocam, MdMic, MdRefresh } from 'react-icons/md';
import { useNavigate } from 'react-router-dom';
import { useSocket } from '../../contexts/SocketContext';
import InterpreterInvitationModal from '../VideoCall/InterpreterInvitationModal';
import './InterpreterDashboard.css';

const InterpreterDashboard = () => {
  const navigate = useNavigate();
  const socket = useSocket();
  
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [testing, setTesting] = useState(false);
  const [error, setError] = useState('');
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [invitation, setInvitation] = useState(null);
  const [showInvitationModal, setShowInvitationModal] = useState(false);
  const videoRef = useRef(null);

  // Socket listener for interpreter invitations
  useEffect(() => {
    if (!socket?.socket) {
      console.log('⚠️ Socket not available for interpreter invitations');
      return;
    }

    console.log('✅ Listening for interpreter invitations on socket');

    const handleInvitation = (data) => {
      console.log('📞 Interpreter invitation received:', data);
      setInvitation(data);
      setShowInvitationModal(true);
      
      // Play notification sound
      try {
        const audio = new Audio('/sounds/notification.mp3');
        audio.play().catch(e => console.log('Could not play sound'));
      } catch (e) {
        console.log('Notification sound not available');
      }
    };

    socket.socket.on('interpreter_invitation', handleInvitation);

    return () => {
      socket.socket.off('interpreter_invitation', handleInvitation);
    };
  }, [socket]);

  useEffect(() => {
    // Cleanup stream when component unmounts
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, [stream]);

  // Load available devices on mount
  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Request permissions first to get device labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        tempStream.getTracks().forEach(track => track.stop());

        // Now enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        
        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        // Set default selections
        if (audioInputs.length > 0 && !selectedAudioDevice) {
          setSelectedAudioDevice(audioInputs[0].deviceId);
        }
        if (videoInputs.length > 0 && !selectedVideoDevice) {
          setSelectedVideoDevice(videoInputs[0].deviceId);
        }
      } catch (err) {
        console.error('Error loading devices:', err);
        setError('Could not load devices. Please grant camera/microphone permissions.');
      }
    };
    
    loadDevices();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCameraTest = async () => {
    try {
      setError('');
      setTesting(true);

      // Build constraints with selected devices
      const constraints = {
        video: selectedVideoDevice ? {
          deviceId: { exact: selectedVideoDevice },
          width: { ideal: 1280 },
          height: { ideal: 720 }
        } : {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: selectedAudioDevice ? {
          deviceId: { exact: selectedAudioDevice }
        } : true
      };

      // Request both audio and video permissions
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      setStream(mediaStream);
      
      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Check which tracks are enabled
      const videoTrack = mediaStream.getVideoTracks()[0];
      const audioTrack = mediaStream.getAudioTracks()[0];
      
      if (videoTrack) {
        setVideoEnabled(true);
      }
      if (audioTrack) {
        setAudioEnabled(true);
      }

    } catch (err) {
      console.error('Camera test error:', err);
      setError(`Failed to access camera/microphone: ${err.message}`);
      setTesting(false);
    }
  };

  const stopCameraTest = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
      setVideoEnabled(false);
      setAudioEnabled(false);
      setTesting(false);
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
    }
  };

  const toggleAudio = () => {
    if (stream) {
      const audioTrack = stream.getAudioTracks()[0];
      if (audioTrack) {
        audioTrack.enabled = !audioTrack.enabled;
        setAudioEnabled(audioTrack.enabled);
      }
    }
  };

  const toggleVideo = () => {
    if (stream) {
      const videoTrack = stream.getVideoTracks()[0];
      if (videoTrack) {
        videoTrack.enabled = !videoTrack.enabled;
        setVideoEnabled(videoTrack.enabled);
      }
    }
  };

  const handleAudioDeviceChange = async (deviceId) => {
    setSelectedAudioDevice(deviceId);
    
    // If testing, restart with new device
    if (testing && stream) {
      const wasAudioEnabled = audioEnabled;
      stopCameraTest();
      // Small delay to ensure cleanup and state update
      setTimeout(async () => {
        await startCameraTest();
        if (!wasAudioEnabled && stream) {
          toggleAudio();
        }
      }, 100);
    }
  };

  const handleVideoDeviceChange = async (deviceId) => {
    setSelectedVideoDevice(deviceId);
    
    // If testing, restart with new device
    if (testing && stream) {
      const wasVideoEnabled = videoEnabled;
      stopCameraTest();
      // Small delay to ensure cleanup and state update
      setTimeout(async () => {
        await startCameraTest();
        if (!wasVideoEnabled && stream) {
          toggleVideo();
        }
      }, 100);
    }
  };

  // Handle invitation acceptance
  const handleAcceptInvitation = (invitationData) => {
    console.log('Accepting invitation:', invitationData);
    
    // Send response to server
    if (socket?.socket) {
      socket.socket.emit('interpreter-response', {
        callId: invitationData.callId,
        response: 'accept',
        devicePreferences: {
          audioDeviceId: invitationData.selectedAudioDevice,
          videoDeviceId: invitationData.selectedVideoDevice,
          audioEnabled: invitationData.audioEnabled,
          videoEnabled: invitationData.videoEnabled
        }
      });

      // Listen for confirmation
      socket.socket.once('interpreter-accepted-confirmation', (data) => {
        console.log('Confirmation received:', data);
        // Navigate to video call with call data
        navigate(`/video-call/${data.callId}`, {
          state: {
            callData: {
              callId: data.callId,
              roomName: data.roomName,
              accessToken: data.accessToken,
              userRole: 'interpreter',
              booth: data.booth,
              participants: {
                recruiter: data.recruiter,
                jobSeeker: data.jobSeeker
              }
            }
          }
        });
      });
    }

    // Close modal
    setShowInvitationModal(false);
    setInvitation(null);
  };

  // Handle invitation rejection
  const handleRejectInvitation = (invitationData) => {
    console.log('Rejecting invitation:', invitationData);
    
    // Send response to server
    if (socket?.socket) {
      socket.socket.emit('interpreter-response', {
        callId: invitationData.callId,
        response: 'decline'
      });
    }

    // Close modal
    setShowInvitationModal(false);
    setInvitation(null);
  };

  return (
    <div className="interpreter-dashboard">
      <div className="interpreter-content">
        <div className="waiting-section">
          <h1>Interpreter Waiting Section</h1>
          <p className="waiting-message">
            You have successfully joined the queue. Wait for the interviewer to let you into the call.
          </p>
        </div>

        <div className="camera-test-section">
          <h2>Camera & Microphone Test</h2>
          
          {error && (
            <div className="error-message" role="alert">
              {error}
            </div>
          )}

          <div className="device-selectors">
            <div className="device-selector">
              <label htmlFor="video-device-select">
                <MdVideocam size={18} />
                Camera:
              </label>
              <select 
                id="video-device-select"
                value={selectedVideoDevice} 
                onChange={(e) => handleVideoDeviceChange(e.target.value)}
                className="device-select"
              >
                {videoDevices.length === 0 && (
                  <option value="">No cameras found</option>
                )}
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="device-selector">
              <label htmlFor="audio-device-select">
                <MdMic size={18} />
                Microphone:
              </label>
              <select 
                id="audio-device-select"
                value={selectedAudioDevice} 
                onChange={(e) => handleAudioDeviceChange(e.target.value)}
                className="device-select"
              >
                {audioDevices.length === 0 && (
                  <option value="">No microphones found</option>
                )}
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="video-preview-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`video-preview ${!testing || !videoEnabled ? 'disabled' : ''}`}
            />
            {!testing && (
              <div className="video-placeholder">
                <MdVideocam size={64} />
                <p>Click "Start Test" to preview your camera</p>
              </div>
            )}
          </div>

          <div className="test-controls">
            {!testing ? (
              <button 
                className="test-button primary"
                onClick={startCameraTest}
              >
                <MdRefresh size={20} />
                Start Test
              </button>
            ) : (
              <>
                <button
                  className={`test-button ${audioEnabled ? 'active' : 'inactive'}`}
                  onClick={toggleAudio}
                  title={audioEnabled ? 'Mute' : 'Unmute'}
                >
                  <MdMic size={20} />
                  {audioEnabled ? 'Mute' : 'Unmute'}
                </button>

                <button
                  className={`test-button ${videoEnabled ? 'active' : 'inactive'}`}
                  onClick={toggleVideo}
                  title={videoEnabled ? 'Stop Video' : 'Start Video'}
                >
                  <MdVideocam size={20} />
                  {videoEnabled ? 'Stop Video' : 'Start Video'}
                </button>

                <button 
                  className="test-button danger"
                  onClick={stopCameraTest}
                >
                  Stop Test
                </button>
              </>
            )}
          </div>

          <div className="test-status">
            <div className={`status-item ${videoEnabled ? 'enabled' : 'disabled'}`}>
              <MdVideocam size={18} />
              <span>Camera: {videoEnabled ? 'Working' : 'Not Active'}</span>
            </div>
            <div className={`status-item ${audioEnabled ? 'enabled' : 'disabled'}`}>
              <MdMic size={18} />
              <span>Microphone: {audioEnabled ? 'Working' : 'Not Active'}</span>
            </div>
          </div>

          <div className="instructions">
            <h3>Instructions:</h3>
            <ul>
              <li>Click "Start Test" to check your camera and microphone</li>
              <li>Make sure your camera shows a clear picture</li>
              <li>Speak to test your microphone (check the browser's permission prompt)</li>
              <li>You can toggle audio/video during the test</li>
              <li>Once you're ready, wait for the interviewer to invite you</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Interpreter Invitation Modal */}
      {showInvitationModal && invitation && (
        <InterpreterInvitationModal
          invitation={invitation}
          onAccept={handleAcceptInvitation}
          onReject={handleRejectInvitation}
        />
      )}
    </div>
  );
};

export default InterpreterDashboard;
