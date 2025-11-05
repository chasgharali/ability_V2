import React, { useState, useEffect, useRef } from 'react';
import { MdVideocam, MdMic, MdCall, MdCallEnd, MdCheckCircle, MdError } from 'react-icons/md';
import './InterpreterInvitationModal.css';

const InterpreterInvitationModal = ({ invitation, onAccept, onReject }) => {
  const [stream, setStream] = useState(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [videoEnabled, setVideoEnabled] = useState(true);
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');
  const [error, setError] = useState('');
  const [isPreviewActive, setIsPreviewActive] = useState(false);
  const videoRef = useRef(null);

  // Load saved device preferences
  useEffect(() => {
    const savedAudioDevice = localStorage.getItem('preferredAudioDeviceId');
    const savedVideoDevice = localStorage.getItem('preferredVideoDeviceId');
    
    if (savedAudioDevice) setSelectedAudioDevice(savedAudioDevice);
    if (savedVideoDevice) setSelectedVideoDevice(savedVideoDevice);
  }, []);

  // Load available devices and start preview
  useEffect(() => {
    const loadDevicesAndStartPreview = async () => {
      try {
        // Request permissions to get device labels
        const tempStream = await navigator.mediaDevices.getUserMedia({ 
          video: true, 
          audio: true 
        });

        // Enumerate devices
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        const videoInputs = devices.filter(device => device.kind === 'videoinput');
        
        setAudioDevices(audioInputs);
        setVideoDevices(videoInputs);

        // Set default selections if not already set
        if (audioInputs.length > 0 && !selectedAudioDevice) {
          const defaultAudio = audioInputs[0].deviceId;
          setSelectedAudioDevice(defaultAudio);
        }
        if (videoInputs.length > 0 && !selectedVideoDevice) {
          const defaultVideo = videoInputs[0].deviceId;
          setSelectedVideoDevice(defaultVideo);
        }

        // Stop temp stream and start actual preview
        tempStream.getTracks().forEach(track => track.stop());
        await startPreview();
      } catch (err) {
        console.error('Error loading devices:', err);
        setError('Could not access camera/microphone. Please grant permissions.');
      }
    };
    
    loadDevicesAndStartPreview();
    
    // Cleanup on unmount
    return () => {
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const startPreview = async () => {
    try {
      setError('');

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
          deviceId: { exact: selectedAudioDevice },
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        } : {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      };

      // Get media stream
      const mediaStream = await navigator.mediaDevices.getUserMedia(constraints);
      
      setStream(mediaStream);
      setIsPreviewActive(true);
      
      // Attach stream to video element
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }

      // Set initial track states
      const videoTrack = mediaStream.getVideoTracks()[0];
      const audioTrack = mediaStream.getAudioTracks()[0];
      
      if (videoTrack) {
        videoTrack.enabled = videoEnabled;
      }
      if (audioTrack) {
        audioTrack.enabled = audioEnabled;
      }

    } catch (err) {
      console.error('Preview start error:', err);
      setError(`Failed to access camera/microphone: ${err.message}`);
      setIsPreviewActive(false);
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
    localStorage.setItem('preferredAudioDeviceId', deviceId);
    
    // Restart preview with new device
    if (isPreviewActive) {
      const wasAudioEnabled = audioEnabled;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      await startPreview();
      if (!wasAudioEnabled && stream) {
        setTimeout(() => toggleAudio(), 100);
      }
    }
  };

  const handleVideoDeviceChange = async (deviceId) => {
    setSelectedVideoDevice(deviceId);
    localStorage.setItem('preferredVideoDeviceId', deviceId);
    
    // Restart preview with new device
    if (isPreviewActive) {
      const wasVideoEnabled = videoEnabled;
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      await startPreview();
      if (!wasVideoEnabled && stream) {
        setTimeout(() => toggleVideo(), 100);
      }
    }
  };

  const handleAccept = () => {
    // Save device preferences
    if (selectedAudioDevice) {
      localStorage.setItem('preferredAudioDeviceId', selectedAudioDevice);
    }
    if (selectedVideoDevice) {
      localStorage.setItem('preferredVideoDeviceId', selectedVideoDevice);
    }

    // Stop preview stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    // Pass invitation and device selections to parent
    onAccept({
      ...invitation,
      selectedAudioDevice,
      selectedVideoDevice,
      audioEnabled,
      videoEnabled
    });
  };

  const handleReject = () => {
    // Stop preview stream
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }
    
    onReject(invitation);
  };

  if (!invitation) return null;

  return (
    <div className="interpreter-invitation-overlay" role="dialog" aria-modal="true" aria-labelledby="invitation-title">
      <div className="interpreter-invitation-modal">
        {/* Header */}
        <div className="invitation-header">
          <div className="invitation-icon">
            <MdCall size={32} />
          </div>
          <h2 id="invitation-title">Interpreter Request</h2>
        </div>

        {/* Call Details */}
        <div className="invitation-details">
          <p className="invitation-message">
            You have been invited to join a call as an interpreter
          </p>
          
          <div className="call-info">
            <div className="info-item">
              <strong>Recruiter:</strong>
              <span>{invitation.recruiter?.name || 'Unknown'}</span>
            </div>
            {invitation.category && (
              <div className="info-item">
                <strong>Category:</strong>
                <span className="category-badge">{invitation.category}</span>
              </div>
            )}
            {invitation.jobSeeker && (
              <div className="info-item">
                <strong>Job Seeker:</strong>
                <span>{invitation.jobSeeker.name || 'Unknown'}</span>
              </div>
            )}
          </div>
        </div>

        {/* Device Selection */}
        <div className="device-setup-section">
          <h3>Setup Your Devices</h3>
          
          {error && (
            <div className="error-banner" role="alert">
              <MdError size={20} />
              <span>{error}</span>
            </div>
          )}

          <div className="device-selectors">
            <div className="device-selector">
              <label htmlFor="interpreter-video-device">
                <MdVideocam size={18} />
                Camera:
              </label>
              <select 
                id="interpreter-video-device"
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
              <label htmlFor="interpreter-audio-device">
                <MdMic size={18} />
                Microphone:
              </label>
              <select 
                id="interpreter-audio-device"
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

          {/* Video Preview */}
          <div className="video-preview-container">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className={`video-preview ${!isPreviewActive || !videoEnabled ? 'disabled' : ''}`}
            />
            {!isPreviewActive && (
              <div className="video-placeholder">
                <MdVideocam size={64} />
                <p>Setting up camera preview...</p>
              </div>
            )}
            {isPreviewActive && !videoEnabled && (
              <div className="video-overlay">
                <MdVideocam size={48} />
                <p>Camera is off</p>
              </div>
            )}
          </div>

          {/* Media Controls */}
          <div className="media-controls">
            <button
              className={`control-button ${audioEnabled ? 'active' : 'inactive'}`}
              onClick={toggleAudio}
              title={audioEnabled ? 'Mute' : 'Unmute'}
              disabled={!isPreviewActive}
            >
              <MdMic size={20} />
              <span>{audioEnabled ? 'Mute' : 'Unmute'}</span>
            </button>

            <button
              className={`control-button ${videoEnabled ? 'active' : 'inactive'}`}
              onClick={toggleVideo}
              title={videoEnabled ? 'Stop Video' : 'Start Video'}
              disabled={!isPreviewActive}
            >
              <MdVideocam size={20} />
              <span>{videoEnabled ? 'Stop Video' : 'Start Video'}</span>
            </button>
          </div>

          {/* Device Status */}
          <div className="device-status">
            <div className={`status-indicator ${videoEnabled && isPreviewActive ? 'active' : 'inactive'}`}>
              {videoEnabled && isPreviewActive ? <MdCheckCircle size={16} /> : <MdError size={16} />}
              <span>Camera: {videoEnabled && isPreviewActive ? 'Ready' : 'Not Active'}</span>
            </div>
            <div className={`status-indicator ${audioEnabled && isPreviewActive ? 'active' : 'inactive'}`}>
              {audioEnabled && isPreviewActive ? <MdCheckCircle size={16} /> : <MdError size={16} />}
              <span>Microphone: {audioEnabled && isPreviewActive ? 'Ready' : 'Not Active'}</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="invitation-actions">
          <button
            className="reject-button"
            onClick={handleReject}
          >
            <MdCallEnd size={20} />
            <span>Decline</span>
          </button>
          <button
            className="accept-button"
            onClick={handleAccept}
            disabled={!isPreviewActive}
          >
            <MdCall size={20} />
            <span>Accept & Join Call</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default InterpreterInvitationModal;
