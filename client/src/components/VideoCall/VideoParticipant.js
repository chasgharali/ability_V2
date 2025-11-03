import React, { useEffect, useRef, useState } from 'react';
import { FiMic, FiMicOff, FiVideo, FiVideoOff, FiUser } from 'react-icons/fi';
import './VideoParticipant.css';

const VideoParticipant = ({ participant, isLocal = false }) => {
  const videoRef = useRef();
  const audioRef = useRef();
  const [videoTrack, setVideoTrack] = useState(null);
  const [audioTrack, setAudioTrack] = useState(null);
  const [isVideoEnabled, setIsVideoEnabled] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [networkQuality, setNetworkQuality] = useState(5);

  useEffect(() => {
    if (!participant) return;

    const trackSubscribed = (track) => {
      if (track.kind === 'video') {
        setVideoTrack(track);
      } else if (track.kind === 'audio') {
        setAudioTrack(track);
      }
    };

    const trackUnsubscribed = (track) => {
      if (track.kind === 'video') {
        setVideoTrack(null);
        try {
          const els = track.detach();
          // Do not remove React-managed element; just let React handle DOM
          // If Twilio created any extra element, it's safe to remove those
          els.forEach(el => {
            if (el && el !== videoRef.current && el.parentNode) {
              try { el.parentNode.removeChild(el); } catch (e) {}
            }
          });
        } catch (_) {}
      } else if (track.kind === 'audio') {
        setAudioTrack(null);
        try {
          const els = track.detach();
          els.forEach(el => {
            if (el && el !== audioRef.current && el.parentNode) {
              try { el.parentNode.removeChild(el); } catch (e) {}
            }
          });
        } catch (_) {}
      }
    };

    const trackEnabled = (track) => {
      if (track.kind === 'video') {
        setIsVideoEnabled(true);
      } else if (track.kind === 'audio') {
        setIsAudioEnabled(true);
      }
    };

    const trackDisabled = (track) => {
      if (track.kind === 'video') {
        setIsVideoEnabled(false);
      } else if (track.kind === 'audio') {
        setIsAudioEnabled(false);
      }
    };

    const networkQualityChanged = (participant, networkQualityLevel) => {
      setNetworkQuality(networkQualityLevel);
    };

    // Handle existing tracks
    participant.tracks.forEach(publication => {
      // For remote participants, isSubscribed indicates an active track.
      // For local participants, publication.track exists even if isSubscribed is undefined/false.
      if (publication.isSubscribed || publication.track) {
        const track = publication.track;
        if (track) {
          trackSubscribed(track);
        }
      }
    });

    // Set up event listeners
    participant.on('trackSubscribed', trackSubscribed);
    participant.on('trackUnsubscribed', trackUnsubscribed);
    participant.on('trackEnabled', trackEnabled);
    participant.on('trackDisabled', trackDisabled);
    participant.on('networkQualityLevelChanged', networkQualityChanged);

    return () => {
      participant.off('trackSubscribed', trackSubscribed);
      participant.off('trackUnsubscribed', trackUnsubscribed);
      participant.off('trackEnabled', trackEnabled);
      participant.off('trackDisabled', trackDisabled);
      participant.off('networkQualityLevelChanged', networkQualityChanged);
    };
  }, [participant]);

  // Attach video track after element mounts
  useEffect(() => {
    if (videoTrack && videoRef.current && videoTrack.attach) {
      try {
        const attachedElements = videoTrack.attach(videoRef.current);
        
        // Ensure the video element has the correct styles after attachment
        if (videoRef.current) {
          const applyVideoStyles = () => {
            videoRef.current.style.width = '100%';
            videoRef.current.style.height = '100%';
            videoRef.current.style.objectFit = 'cover';
            videoRef.current.style.position = 'absolute';
            videoRef.current.style.top = '0';
            videoRef.current.style.left = '0';
            videoRef.current.style.maxWidth = 'none';
            videoRef.current.style.maxHeight = 'none';
            videoRef.current.style.minWidth = '100%';
            videoRef.current.style.minHeight = '100%';
          };
          
          // Apply styles immediately
          applyVideoStyles();
          
          // Also apply styles after a short delay in case Twilio overrides them
          setTimeout(applyVideoStyles, 100);
          setTimeout(applyVideoStyles, 500);
        }
        
      } catch (error) {
        console.error('Error attaching video track (post-mount):', error);
      }
    }
    return () => {
      if (videoTrack && videoTrack.detach) {
        try {
          const els = videoTrack.detach();
          els.forEach(el => {
            if (el && el !== videoRef.current && el.parentNode) {
              try { el.parentNode.removeChild(el); } catch (e) {}
            }
          });
        } catch (e) {
          // ignore
        }
      }
    };
  }, [videoTrack]);

  // Attach audio track after element mounts
  useEffect(() => {
    if (audioTrack && audioRef.current && audioTrack.attach) {
      try {
        audioTrack.attach(audioRef.current);
      } catch (error) {
        console.error('Error attaching audio track (post-mount):', error);
      }
    }
    return () => {
      if (audioTrack && audioTrack.detach) {
        try {
          const els = audioTrack.detach();
          els.forEach(el => {
            if (el && el !== audioRef.current && el.parentNode) {
              try { el.parentNode.removeChild(el); } catch (e) {}
            }
          });
        } catch (e) {
          // ignore
        }
      }
    };
  }, [audioTrack]);

  const getNetworkQualityClass = () => {
    if (networkQuality >= 4) return 'excellent';
    if (networkQuality >= 3) return 'good';
    if (networkQuality >= 2) return 'fair';
    return 'poor';
  };

  const getParticipantName = () => {
    if (isLocal) return 'You';
    
    // Try to get name from participant identity or use a default
    const identity = participant?.identity || '';
    const role = getParticipantRole();
    
    // For now, use role as name since we don't have actual names in identity
    if (role) return role;
    return 'Participant';
  };

  const getParticipantRole = () => {
    if (isLocal) return '';
    const identity = participant?.identity || '';
    if (identity.startsWith('recruiter_')) return 'Recruiter';
    if (identity.startsWith('jobseeker_')) return 'Job Seeker';
    if (identity.startsWith('interpreter_')) return 'Interpreter';
    return '';
  };

  return (
    <div 
      className={`video-participant ${isLocal ? 'local' : 'remote'}`}
      role="region"
      aria-label={`${getParticipantName()} video ${isLocal ? '(you)' : ''}`}
      tabIndex={0}
    >
      {/* Video Container */}
      <div className="video-container">
        {/* Always render the video element - keep visible to preserve last frame when disabled */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted={isLocal}
          className="participant-video"
          aria-label={`${getParticipantName()} video stream`}
        />
        
        {/* Overlay when video is disabled or not available - shows over frozen frame */}
        {!(isVideoEnabled && videoTrack) && (
          <div className="video-disabled-overlay" role="img" aria-label={`${getParticipantName()} camera is off`}>
            <div className="video-disabled-content">
              <FiUser size={48} aria-hidden="true" />
              <span className="video-disabled-text">Camera Off</span>
            </div>
          </div>
        )}
        
        {/* Audio element (hidden) */}
        <audio ref={audioRef} autoPlay aria-hidden="true" />
      </div>

      {/* Participant Info Overlay */}
      <div className="participant-info">
        <div className="participant-name">
          <span className="name">{getParticipantName()}</span>
          {/* Only show role label if it's different from the name (avoids duplicate) */}
          {getParticipantRole() && getParticipantRole() !== getParticipantName() && (
            <span className="role">{getParticipantRole()}</span>
          )}
        </div>

        {/* Controls Indicators */}
        <div className="participant-controls" role="group" aria-label={`${getParticipantName()} controls status`}>
          <div 
            className={`control-indicator ${isAudioEnabled ? 'enabled' : 'disabled'}`}
            role="status"
            aria-label={`${getParticipantName()} microphone is ${isAudioEnabled ? 'on' : 'off'}`}
          >
            {isAudioEnabled ? <FiMic size={18} aria-hidden="true" /> : <FiMicOff size={18} aria-hidden="true" />}
          </div>
          <div 
            className={`control-indicator ${isVideoEnabled ? 'enabled' : 'disabled'}`}
            role="status"
            aria-label={`${getParticipantName()} camera is ${isVideoEnabled ? 'on' : 'off'}`}
          >
            {isVideoEnabled ? <FiVideo size={18} aria-hidden="true" /> : <FiVideoOff size={18} aria-hidden="true" />}
          </div>
        </div>
      </div>

      {/* Speaking Indicator */}
      {audioTrack && isAudioEnabled && (
        <div className="speaking-indicator">
          <div className="speaking-animation"></div>
        </div>
      )}
    </div>
  );
};

export default VideoParticipant;
