import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaVideo, FaMicrophone, FaCheck, FaTimes } from 'react-icons/fa';
import './DeviceTestModal.css';

export default function DeviceTestModal({
  isOpen,
  onClose,
  audioInputs,
  videoInputs,
  selectedAudioId,
  selectedVideoId,
  onChangeAudio,
  onChangeVideo,
  onSave
}) {
  const [currentView, setCurrentView] = useState('selection'); // 'selection' or 'testing'
  const [testStream, setTestStream] = useState(null);
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [cameraStatus, setCameraStatus] = useState('inactive'); // 'inactive', 'loading', 'active', 'error'
  const [microphoneStatus, setMicrophoneStatus] = useState('inactive'); // 'inactive', 'loading', 'active', 'error'
  const [testResults, setTestResults] = useState({ camera: false, microphone: false });

  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);

  // Cleanup function
  const cleanupTest = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    if (testStream) {
      testStream.getTracks().forEach(track => track.stop());
      setTestStream(null);
    }

    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    analyserRef.current = null;
    setIsTestingAudio(false);
    setAudioLevel(0);
    setCameraStatus('inactive');
    setMicrophoneStatus('inactive');
  };

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      cleanupTest();
    };
  }, []);

  useEffect(() => {
    if (!isOpen) {
      cleanupTest();
      setCurrentView('selection');
      setTestResults({ camera: false, microphone: false });
    }
  }, [isOpen]);

  const startDeviceTest = async () => {
    try {
      cleanupTest();
      setCurrentView('testing');
      setCameraStatus('loading');
      setMicrophoneStatus('loading');

      let constraints = {
        audio: selectedAudioId ? { deviceId: { exact: selectedAudioId } } : true,
        video: selectedVideoId ? { deviceId: { exact: selectedVideoId } } : true
      };

      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia(constraints);
      } catch (deviceError) {
        // Handle OverconstrainedError or other device errors
        if (deviceError.name === 'OverconstrainedError' || deviceError.name === 'NotReadableError' || deviceError.name === 'NotFoundError') {
          console.warn('Device constraint error in device test, retrying without device preferences:', deviceError);
          
          // Clear invalid device IDs from sessionStorage
          if (selectedVideoId) {
            sessionStorage.removeItem('preferredVideoDeviceId');
            console.log('Cleared invalid video device ID from sessionStorage');
          }
          if (selectedAudioId) {
            sessionStorage.removeItem('preferredAudioDeviceId');
            console.log('Cleared invalid audio device ID from sessionStorage');
          }

          // Retry without device constraints
          constraints = {
            audio: true,
            video: true
          };
          stream = await navigator.mediaDevices.getUserMedia(constraints);
        } else {
          throw deviceError;
        }
      }
      streamRef.current = stream;
      setTestStream(stream);

      // Test camera
      const videoTracks = stream.getVideoTracks();
      if (videoTracks.length > 0) {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          
          // Wait for video to load metadata
          const videoLoadPromise = new Promise((resolve, reject) => {
            const video = videoRef.current;
            const onLoadedMetadata = () => {
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
              video.removeEventListener('error', onError);
              resolve();
            };
            const onError = (error) => {
              video.removeEventListener('loadedmetadata', onLoadedMetadata);
              video.removeEventListener('error', onError);
              reject(error);
            };
            
            video.addEventListener('loadedmetadata', onLoadedMetadata);
            video.addEventListener('error', onError);
          });

          try {
            await videoLoadPromise;
            await videoRef.current.play();
            setCameraStatus('active');
            setTestResults(prev => ({ ...prev, camera: true }));
          } catch (error) {
            console.error('Video play error:', error);
            setCameraStatus('error');
            setTestResults(prev => ({ ...prev, camera: false }));
          }
        }
      } else {
        setCameraStatus('error');
        setTestResults(prev => ({ ...prev, camera: false }));
      }

      // Test microphone
      const audioTracks = stream.getAudioTracks();
      if (audioTracks.length > 0) {
        try {
          await setupAudioLevelMonitoring(stream);
          setMicrophoneStatus('active');
          setTestResults(prev => ({ ...prev, microphone: true }));
        } catch (error) {
          console.error('Audio monitoring error:', error);
          setMicrophoneStatus('error');
          setTestResults(prev => ({ ...prev, microphone: false }));
        }
      } else {
        setMicrophoneStatus('error');
        setTestResults(prev => ({ ...prev, microphone: false }));
      }

    } catch (error) {
      console.error('Error starting device test:', error);
      setCameraStatus('error');
      setMicrophoneStatus('error');
      setTestResults({ camera: false, microphone: false });
    }
  };

  const setupAudioLevelMonitoring = async (stream) => {
    try {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)();
      
      // Resume audio context if suspended
      if (audioContextRef.current.state === 'suspended') {
        await audioContextRef.current.resume();
      }

      const source = audioContextRef.current.createMediaStreamSource(stream);
      analyserRef.current = audioContextRef.current.createAnalyser();

      // Optimized settings for microphone input
      analyserRef.current.fftSize = 2048;
      analyserRef.current.smoothingTimeConstant = 0.3;
      analyserRef.current.minDecibels = -90;
      analyserRef.current.maxDecibels = -10;

      source.connect(analyserRef.current);
      setIsTestingAudio(true);

      // Use time domain data for better microphone level detection
      const dataArray = new Uint8Array(analyserRef.current.fftSize);

      const updateAudioLevel = () => {
        if (!analyserRef.current) return;

        // Get time domain data (waveform) instead of frequency data
        analyserRef.current.getByteTimeDomainData(dataArray);

        // Calculate RMS (Root Mean Square) for accurate volume measurement
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const sample = (dataArray[i] - 128) / 128; // Convert to -1 to 1 range
          sum += sample * sample;
        }
        
        const rms = Math.sqrt(sum / dataArray.length);
        
        // Convert RMS to decibels and then to percentage
        const decibels = 20 * Math.log10(rms + 0.0001); // Add small value to avoid log(0)
        
        // Map decibels to percentage with wider range for better scaling
        // Typical speaking range: -70dB (very quiet) to -10dB (loud)
        const minDb = -70;
        const maxDb = -10;
        const normalizedDb = Math.max(0, Math.min(1, (decibels - minDb) / (maxDb - minDb)));
        
        // Apply more aggressive exponential scaling to reduce high levels for quiet voices
        const level = Math.pow(normalizedDb, 1.5) * 100;
        
        // Ensure minimum visible level for very quiet sounds
        const finalLevel = Math.max(level, rms > 0.005 ? 1 : 0);
        
        setAudioLevel(Math.min(finalLevel, 100));
        animationFrameRef.current = requestAnimationFrame(updateAudioLevel);
      };

      updateAudioLevel();
    } catch (error) {
      console.error('Error setting up audio monitoring:', error);
      throw error;
    }
  };

  const handleBackToSelection = () => {
    cleanupTest();
    setCurrentView('selection');
    setTestResults({ camera: false, microphone: false });
  };

  const handleSave = () => {
    cleanupTest();
    onSave();
  };

  const handleClose = () => {
    cleanupTest();
    onClose();
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'loading':
        return <div className="status-spinner" />;
      case 'active':
        return <FaCheck className="status-icon success" />;
      case 'error':
        return <FaTimes className="status-icon error" />;
      default:
        return null;
    }
  };

  const getStatusText = (status, deviceType) => {
    switch (status) {
      case 'loading':
        return `Testing ${deviceType}...`;
      case 'active':
        return `${deviceType} working!`;
      case 'error':
        return `${deviceType} not working`;
      default:
        return `${deviceType} not tested`;
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="modal-overlay device-test-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="device-test-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          handleClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          handleClose();
        }
      }}
      tabIndex={-1}
    >
      <div className="modal-content device-test-modal">
        <div className="modal-header">
          <h3 id="device-test-modal-title">
            {currentView === 'selection' ? 'Select Camera & Microphone' : 'Test Your Devices'}
          </h3>
          <button
            className="modal-close"
            onClick={handleClose}
            aria-label="Close device test modal"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="device-test-content">
          {currentView === 'selection' ? (
            <>
              <div className="device-selection-section">
                <div className="device-field">
                  <label className="device-label" htmlFor="mic-select">
                    <FaMicrophone className="device-icon" />
                    Microphone
                  </label>
                  <select
                    id="mic-select"
                    className="device-select"
                    value={selectedAudioId || ''}
                    onChange={e => onChangeAudio(e.target.value)}
                  >
                    {audioInputs.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Microphone ${device.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="device-field">
                  <label className="device-label" htmlFor="cam-select">
                    <FaVideo className="device-icon" />
                    Camera
                  </label>
                  <select
                    id="cam-select"
                    className="device-select"
                    value={selectedVideoId || ''}
                    onChange={e => onChangeVideo(e.target.value)}
                  >
                    {videoInputs.map(device => (
                      <option key={device.deviceId} value={device.deviceId}>
                        {device.label || `Camera ${device.deviceId.slice(0, 8)}`}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="selection-actions">
                <button
                  onClick={startDeviceTest}
                  className="btn-test-devices"
                  disabled={!selectedAudioId && !selectedVideoId}
                >
                  Test Devices
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="test-header">
                <button
                  onClick={handleBackToSelection}
                  className="btn-back"
                  aria-label="Back to device selection"
                >
                  <FaArrowLeft /> Back
                </button>
              </div>

              <div className="test-content">
                <div className="test-video-section">
                  <div className="video-container">
                    <video
                      ref={videoRef}
                      autoPlay
                      muted
                      playsInline
                      className="test-video"
                    />
                    <div className="video-overlay">
                      <div className={`device-status camera-status ${cameraStatus}`}>
                        {getStatusIcon(cameraStatus)}
                        <span>{getStatusText(cameraStatus, 'Camera')}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="test-audio-section">
                  <div className={`device-status microphone-status ${microphoneStatus}`}>
                    {getStatusIcon(microphoneStatus)}
                    <span>{getStatusText(microphoneStatus, 'Microphone')}</span>
                  </div>

                  {isTestingAudio && (
                    <div className="audio-level-container">
                      <div className="audio-level-label">Microphone Level</div>
                      <div className="audio-level-bar">
                        <div
                          className="audio-level-fill"
                          style={{ width: `${Math.max(audioLevel, 1)}%` }}
                        />
                      </div>
                      <div className="audio-level-text">
                        {audioLevel > 3 ? 
                          `🎤 Level: ${Math.round(audioLevel)}% - Microphone working!` : 
                          '🎤 Speak to test microphone'
                        }
                      </div>
                    </div>
                  )}
                </div>

                <div className="test-instructions">
                  <p>
                    <strong>Camera:</strong> You should see yourself in the video above.
                  </p>
                  <p>
                    <strong>Microphone:</strong> Speak normally to see the level indicator move.
                  </p>
                </div>
              </div>
            </>
          )}
        </div>

        <div className="modal-actions">
          <button
            onClick={handleClose}
            className="btn-cancel"
          >
            Cancel
          </button>
          {currentView === 'testing' && (
            <button
              onClick={handleSave}
              className="btn-save"
              disabled={!testResults.camera && !testResults.microphone}
            >
              Save Preferences
            </button>
          )}
          {currentView === 'selection' && (
            <button
              onClick={handleSave}
              className="btn-save"
            >
              Save Without Testing
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
