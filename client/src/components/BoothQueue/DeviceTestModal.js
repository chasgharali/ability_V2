import React, { useState, useEffect, useRef } from 'react';
import { FaArrowLeft, FaVideo, FaMicrophone, FaCheck, FaTimes } from 'react-icons/fa';
import { createLocalVideoTrack } from 'twilio-video';
import {
  applyBackgroundBlurToTrack,
  isBackgroundBlurEnabled,
  isBackgroundBlurSupported,
  removeBackgroundBlurFromTrack,
  setBackgroundBlurEnabled
} from '../../utils/backgroundBlur';
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
  const [srAnnouncement, setSrAnnouncement] = useState('');
  const [backgroundBlur, setBackgroundBlur] = useState(() => isBackgroundBlurEnabled());
  const [blurSupported] = useState(() => isBackgroundBlurSupported());
  const [blurStatus, setBlurStatus] = useState('idle'); // 'idle' | 'loading' | 'active' | 'unsupported' | 'error'

  const videoRef = useRef(null);
  const audioContextRef = useRef(null);
  const analyserRef = useRef(null);
  const animationFrameRef = useRef(null);
  const streamRef = useRef(null);
  const twilioVideoTrackRef = useRef(null);
  const modalRef = useRef(null);
  const previousActiveElementRef = useRef(null);

  // Cleanup function
  const cleanupTest = () => {
    if (twilioVideoTrackRef.current) {
      try {
        removeBackgroundBlurFromTrack(twilioVideoTrackRef.current);
        twilioVideoTrackRef.current.detach().forEach((el) => {
          if (el && el.parentNode) {
            el.parentNode.removeChild(el);
          }
        });
        twilioVideoTrackRef.current.stop();
      } catch (error) {
        console.warn('Error cleaning up blurred preview track:', error);
      }
      twilioVideoTrackRef.current = null;
    }

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
    setBlurStatus('idle');
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
      setSrAnnouncement('');
    } else {
      setBackgroundBlur(isBackgroundBlurEnabled());
    }
  }, [isOpen]);

  // Announce device test status changes to screen readers. The visible status
  // text lives in plain spans that screen readers don't read on change, so we
  // mirror the result into a polite live region whenever a test completes.
  useEffect(() => {
    const messages = [];
    if (cameraStatus === 'active') messages.push('Camera working!');
    else if (cameraStatus === 'error') messages.push('Camera not working');

    if (microphoneStatus === 'active') messages.push('Microphone working!');
    else if (microphoneStatus === 'error') messages.push('Microphone not working');

    if (messages.length > 0) {
      // Clear first so identical consecutive results are still announced.
      setSrAnnouncement('');
      const message = messages.join('. ');
      const id = requestAnimationFrame(() => setSrAnnouncement(message));
      return () => cancelAnimationFrame(id);
    }
  }, [cameraStatus, microphoneStatus]);

  // Move focus into the dialog when it opens so keyboard and screen reader users
  // land on the modal, and restore focus to the triggering element on close.
  useEffect(() => {
    if (!isOpen) return undefined;

    previousActiveElementRef.current = document.activeElement;

    // Wait for the dialog to render, then focus its container so screen readers
    // announce the dialog name (via aria-labelledby) before the user tabs in.
    const focusId = requestAnimationFrame(() => {
      if (modalRef.current) {
        modalRef.current.focus();
      }
    });

    return () => {
      cancelAnimationFrame(focusId);
      const previous = previousActiveElementRef.current;
      if (previous && typeof previous.focus === 'function' && document.contains(previous)) {
        previous.focus();
      }
      previousActiveElementRef.current = null;
    };
  }, [isOpen]);

  // Keep keyboard focus trapped inside the dialog while it is open.
  const handleFocusTrap = (e) => {
    if (e.key !== 'Tab' || !modalRef.current) return;

    const focusable = modalRef.current.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    if (focusable.length === 0) return;

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (e.shiftKey) {
      if (active === first || active === modalRef.current) {
        e.preventDefault();
        last.focus();
      }
    } else if (active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const startDeviceTest = async () => {
    try {
      cleanupTest();
      setCurrentView('testing');
      setCameraStatus('loading');
      setMicrophoneStatus('loading');
      setBlurStatus(backgroundBlur && blurSupported ? 'loading' : 'idle');

      let effectiveVideoDeviceId = selectedVideoId;
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
          
          // Clear invalid device IDs from localStorage
          if (selectedVideoId) {
            localStorage.removeItem('preferredVideoDeviceId');
            console.log('Cleared invalid video device ID from localStorage');
          }
          if (selectedAudioId) {
            localStorage.removeItem('preferredAudioDeviceId');
            console.log('Cleared invalid audio device ID from localStorage');
          }

          effectiveVideoDeviceId = null;

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
      if (videoTracks.length > 0 && videoRef.current) {
        try {
          const useBlurPreview = backgroundBlur && blurSupported;

          if (useBlurPreview) {
            // Free the camera from getUserMedia so Twilio can reopen it with a processor.
            videoTracks.forEach((track) => track.stop());

            const twilioTrack = await createLocalVideoTrack({
              frameRate: { ideal: 24, max: 30 },
              facingMode: 'user',
              ...(effectiveVideoDeviceId ? { deviceId: { exact: effectiveVideoDeviceId } } : {})
            });
            twilioVideoTrackRef.current = twilioTrack;

            const blurApplied = await applyBackgroundBlurToTrack(twilioTrack, { force: true });
            setBlurStatus(blurApplied ? 'active' : 'error');

            twilioTrack.attach(videoRef.current);
            await videoRef.current.play().catch(() => {});
          } else {
            if (backgroundBlur && !blurSupported) {
              setBlurStatus('unsupported');
            }

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

            await videoLoadPromise;
            await videoRef.current.play();
          }

          setCameraStatus('active');
          setTestResults(prev => ({ ...prev, camera: true }));
        } catch (error) {
          console.error('Video play error:', error);
          setCameraStatus('error');
          setTestResults(prev => ({ ...prev, camera: false }));
          if (backgroundBlur) {
            setBlurStatus('error');
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
      if (backgroundBlur) {
        setBlurStatus('error');
      }
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
    setBackgroundBlurEnabled(backgroundBlur);
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
      ref={modalRef}
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
          return;
        }
        handleFocusTrap(e);
      }}
      tabIndex={-1}
    >
      <div className="modal-content device-test-modal">
        <div className="sr-only" aria-live="polite" aria-atomic="true">
          {srAnnouncement}
        </div>
        <div className="device-test-header">
          <h3 id="device-test-modal-title">
            {currentView === 'selection' ? 'Select Camera & Microphone' : 'Test Your Devices'}
          </h3>
          <button
            className="device-test-close"
            onClick={handleClose}
            aria-label="Close device test modal"
            type="button"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>

        <div className="device-test-content">
          {currentView === 'selection' ? (
            <>
              <p className="device-selection-instructions">
                Select your camera and mic below, then click the <strong>Test Devices</strong> button. You will see a pop up that provides your status and a button to save your preferences.
              </p>

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

                <div className="device-field background-blur-field">
                  <div className="background-blur-toggle-row">
                    <div className="background-blur-copy">
                      <label className="background-blur-label" htmlFor="background-blur-toggle">
                        Background blur
                      </label>
                      <p id="background-blur-help" className="background-blur-help">
                        {blurSupported
                          ? 'Blur your background during video calls so others see less of your surroundings.'
                          : 'Background blur is not supported in this browser.'}
                      </p>
                    </div>
                    <button
                      id="background-blur-toggle"
                      type="button"
                      role="switch"
                      aria-checked={backgroundBlur}
                      aria-describedby="background-blur-help"
                      className={`background-blur-switch ${backgroundBlur ? 'is-on' : ''}`}
                      disabled={!blurSupported}
                      onClick={() => {
                        if (!blurSupported) return;
                        setBackgroundBlur((prev) => !prev);
                      }}
                    >
                      <span className="background-blur-switch-thumb" aria-hidden="true" />
                      <span className="sr-only">
                        {backgroundBlur ? 'Background blur on' : 'Background blur off'}
                      </span>
                    </button>
                  </div>
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
                  {backgroundBlur && (
                    <p>
                      <strong>Background blur:</strong>{' '}
                      {blurStatus === 'active' && 'Your background should appear blurred.'}
                      {blurStatus === 'loading' && 'Applying blur to your camera preview…'}
                      {blurStatus === 'unsupported' && 'Not supported in this browser; camera works without blur.'}
                      {blurStatus === 'error' && 'Could not apply blur. Camera still works without it.'}
                      {blurStatus === 'idle' && 'Enabled — preview will show blur when available.'}
                    </p>
                  )}
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
