import React, { useState } from 'react';
import { 
  FiMic, 
  FiMicOff, 
  FiVideo, 
  FiVideoOff, 
  FiMessageCircle, 
  FiUsers, 
  FiUser, 
  FiPhoneOff,
  FiSettings,
  FiMonitor,
  FiMoreHorizontal
} from 'react-icons/fi';
import './CallControls.css';

const CallControls = ({
  isAudioEnabled,
  isVideoEnabled,
  onToggleAudio,
  onToggleVideo,
  onToggleChat,
  onToggleParticipants,
  onToggleProfile,
  onEndCall,
  userRole,
  participantCount,
  chatUnreadCount = 0
}) => {
  const [showMoreOptions, setShowMoreOptions] = useState(false);
  const [isScreenSharing, setIsScreenSharing] = useState(false);

  const handleScreenShare = async () => {
    try {
      if (!isScreenSharing) {
        // Start screen sharing
        const stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true
        });
        
        // TODO: Replace video track with screen share
        setIsScreenSharing(true);
        
        // Listen for screen share end
        stream.getVideoTracks()[0].addEventListener('ended', () => {
          setIsScreenSharing(false);
        });
      } else {
        // Stop screen sharing
        setIsScreenSharing(false);
        // TODO: Replace with camera track
      }
    } catch (error) {
      console.error('Error with screen sharing:', error);
    }
  };

  const controlButtons = [
    {
      id: 'audio',
      icon: isAudioEnabled ? FiMic : FiMicOff,
      label: isAudioEnabled ? 'Mute' : 'Unmute',
      onClick: onToggleAudio,
      className: `control-button ${isAudioEnabled ? 'enabled' : 'disabled'}`,
      primary: true
    },
    {
      id: 'video',
      icon: isVideoEnabled ? FiVideo : FiVideoOff,
      label: isVideoEnabled ? 'Stop Video' : 'Start Video',
      onClick: onToggleVideo,
      className: `control-button ${isVideoEnabled ? 'enabled' : 'disabled'}`,
      primary: true
    },
    {
      id: 'screen-share',
      icon: FiMonitor,
      label: isScreenSharing ? 'Stop Sharing' : 'Share Screen',
      onClick: handleScreenShare,
      className: `control-button ${isScreenSharing ? 'active' : ''}`,
      primary: false
    },
    {
      id: 'chat',
      icon: FiMessageCircle,
      label: 'Chat',
      onClick: onToggleChat,
      className: 'control-button',
      badge: chatUnreadCount > 0 ? chatUnreadCount : null,
      primary: false
    },
    {
      id: 'participants',
      icon: FiUsers,
      label: 'Participants',
      onClick: onToggleParticipants,
      className: 'control-button',
      badge: participantCount,
      primary: false
    }
  ];

  // Add profile button for recruiters
  if (userRole === 'recruiter') {
    controlButtons.push({
      id: 'profile',
      icon: FiUser,
      label: 'Job Seeker Profile',
      onClick: onToggleProfile,
      className: 'control-button',
      primary: false
    });
  }

  const primaryButtons = controlButtons.filter(btn => btn.primary);
  const secondaryButtons = controlButtons.filter(btn => !btn.primary);

  return (
    <div className="call-controls">
      <div className="controls-container">
        {/* Primary Controls (Always Visible) */}
        <div className="primary-controls">
          {primaryButtons.map(button => {
            const IconComponent = button.icon;
            return (
              <button
                key={button.id}
                className={button.className}
                onClick={button.onClick}
                title={button.label}
                aria-label={button.label}
              >
                <IconComponent size={20} />
                {button.badge && (
                  <span className="control-badge">{button.badge}</span>
                )}
              </button>
            );
          })}
        </div>

        {/* Secondary Controls */}
        <div className="secondary-controls">
          {secondaryButtons.slice(0, 3).map(button => {
            const IconComponent = button.icon;
            return (
              <button
                key={button.id}
                className={button.className}
                onClick={button.onClick}
                title={button.label}
                aria-label={button.label}
              >
                <IconComponent size={20} />
                {button.badge && (
                  <span className="control-badge">{button.badge}</span>
                )}
              </button>
            );
          })}

          {/* More Options */}
          {secondaryButtons.length > 3 && (
            <div className="more-options">
              <button
                className="control-button"
                onClick={() => setShowMoreOptions(!showMoreOptions)}
                title="More options"
                aria-label="More options"
              >
                <FiMoreHorizontal size={20} />
              </button>
              
              {showMoreOptions && (
                <div className="more-options-menu">
                  {secondaryButtons.slice(3).map(button => {
                    const IconComponent = button.icon;
                    return (
                      <button
                        key={button.id}
                        className="menu-item"
                        onClick={() => {
                          button.onClick();
                          setShowMoreOptions(false);
                        }}
                      >
                        <IconComponent size={18} />
                        <span>{button.label}</span>
                        {button.badge && (
                          <span className="menu-badge">{button.badge}</span>
                        )}
                      </button>
                    );
                  })}
                  
                  <div className="menu-divider"></div>
                  
                  <button className="menu-item">
                    <FiSettings size={18} />
                    <span>Settings</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* End Call Button */}
        <div className="end-call-controls">
          <button
            className="end-call-button"
            onClick={onEndCall}
            title="End Call"
            aria-label="End Call"
          >
            <FiPhoneOff size={20} />
          </button>
        </div>
      </div>

      {/* Call Duration */}
      <div className="call-info">
        <CallDuration />
      </div>
    </div>
  );
};

// Call Duration Component
const CallDuration = () => {
  const [duration, setDuration] = useState(0);

  React.useEffect(() => {
    const startTime = Date.now();
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - startTime) / 1000));
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  const formatDuration = (seconds) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (hours > 0) {
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="call-duration">
      <span className="duration-text">{formatDuration(duration)}</span>
    </div>
  );
};

export default CallControls;
