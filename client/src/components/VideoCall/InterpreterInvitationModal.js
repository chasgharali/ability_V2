import React, { useState, useEffect } from 'react';
import './CallInviteModal.css';

const InterpreterInvitationModal = ({ invitation, onAccept, onReject }) => {
  const [audioDevices, setAudioDevices] = useState([]);
  const [videoDevices, setVideoDevices] = useState([]);
  const [selectedAudioDevice, setSelectedAudioDevice] = useState('');
  const [selectedVideoDevice, setSelectedVideoDevice] = useState('');

  // Load saved device preferences
  useEffect(() => {
    const savedAudioDevice = localStorage.getItem('preferredAudioDeviceId');
    const savedVideoDevice = localStorage.getItem('preferredVideoDeviceId');
    
    if (savedAudioDevice) setSelectedAudioDevice(savedAudioDevice);
    if (savedVideoDevice) setSelectedVideoDevice(savedVideoDevice);
  }, []);

  // Load available devices
  useEffect(() => {
    const loadDevices = async () => {
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
          setSelectedAudioDevice(audioInputs[0].deviceId);
        }
        if (videoInputs.length > 0 && !selectedVideoDevice) {
          setSelectedVideoDevice(videoInputs[0].deviceId);
        }

        // Stop temp stream
        tempStream.getTracks().forEach(track => track.stop());
      } catch (err) {
        console.error('Error loading devices:', err);
      }
    };
    
    loadDevices();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleAccept = () => {
    // Save device preferences
    if (selectedAudioDevice) {
      localStorage.setItem('preferredAudioDeviceId', selectedAudioDevice);
    }
    if (selectedVideoDevice) {
      localStorage.setItem('preferredVideoDeviceId', selectedVideoDevice);
    }

    // Pass invitation and device selections to parent
    onAccept({
      ...invitation,
      selectedAudioDevice,
      selectedVideoDevice,
      audioEnabled: true,
      videoEnabled: true
    });
  };

  const handleReject = () => {
    onReject(invitation);
  };

  if (!invitation) return null;

  return (
    <div className="call-invite-modal-overlay" role="dialog" aria-modal="true">
      <div className="call-invite-modal" role="document">
        <div className="call-invite-header">
          <h3 className="call-invite-title">Video Call Invitation</h3>
          <button className="call-invite-close" aria-label="Close" onClick={handleReject}>×</button>
        </div>
        
        <hr className="call-invite-divider" />
        
        <div className="call-invite-body">
          <p className="call-invite-text">
            You are invited to join a video call at{' '}
            <strong>{invitation.booth?.name || 'Unknown Booth'}</strong> for{' '}
            <strong>{invitation.booth?.event?.name || 'oct 8 event'}</strong>.
          </p>
          <p className="call-invite-subtext">Please select your camera and microphone before joining.</p>

          <div className="call-invite-device-grid">
            <div className="call-invite-field">
              <label className="call-invite-label" htmlFor="mic-select">Microphone</label>
              <select
                id="mic-select"
                className="call-invite-select"
                value={selectedAudioDevice || ''}
                onChange={(e) => setSelectedAudioDevice(e.target.value)}
              >
                {audioDevices.length === 0 && <option value="">No microphones found</option>}
                {audioDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Microphone ${audioDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>

            <div className="call-invite-field">
              <label className="call-invite-label" htmlFor="cam-select">Camera</label>
              <select
                id="cam-select"
                className="call-invite-select"
                value={selectedVideoDevice || ''}
                onChange={(e) => setSelectedVideoDevice(e.target.value)}
              >
                {videoDevices.length === 0 && <option value="">No cameras found</option>}
                {videoDevices.map((device) => (
                  <option key={device.deviceId} value={device.deviceId}>
                    {device.label || `Camera ${videoDevices.indexOf(device) + 1}`}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <hr className="call-invite-divider" />
        
        <div className="call-invite-actions">
          <button className="call-invite-btn call-invite-decline" onClick={handleReject}>Decline</button>
          <button className="call-invite-btn call-invite-accept" onClick={handleAccept}>Join Call</button>
        </div>
      </div>
    </div>
  );
};

export default InterpreterInvitationModal;
