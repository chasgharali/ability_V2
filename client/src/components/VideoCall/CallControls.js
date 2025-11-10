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
  onLeaveCall,
  userRole,
  participantCount,
  chatUnreadCount = 0
}) => {
  const [showMoreOptions, setShowMoreOptions] = useState(false);

  // Close more options menu when clicking outside
  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (showMoreOptions && !event.target.closest('.more-options')) {
        setShowMoreOptions(false);
      }
    };

    if (showMoreOptions) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          setShowMoreOptions(false);
        }
      });
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleClickOutside);
    };
  }, [showMoreOptions]);

  const controlButtons = [
    {
      id: 'audio',
      icon: isAudioEnabled ? FiMic : FiMicOff,
      label: isAudioEnabled ? 'Mute' : 'Unmute',
      ariaLabel: isAudioEnabled ? 'Mute microphone' : 'Unmute microphone',
      onClick: onToggleAudio,
      className: `control-button ${isAudioEnabled ? 'enabled' : 'disabled'}`,
      primary: true
    },
    {
      id: 'video',
      icon: isVideoEnabled ? FiVideo : FiVideoOff,
      label: isVideoEnabled ? 'Stop video' : 'Start video',
      ariaLabel: isVideoEnabled ? 'Stop video' : 'Start video',
      onClick: onToggleVideo,
      className: `control-button ${isVideoEnabled ? 'enabled' : 'disabled'}`,
      primary: true
    },
    {
      id: 'chat',
      icon: FiMessageCircle,
      label: 'Chat',
      ariaLabel: chatUnreadCount > 0 ? `Open chat (${chatUnreadCount} unread messages)` : 'Open chat',
      onClick: onToggleChat,
      className: 'control-button',
      badge: chatUnreadCount > 0 ? chatUnreadCount : null,
      primary: false
    },
    {
      id: 'participants',
      icon: FiUsers,
      label: 'Participants',
      ariaLabel: `View participants (${participantCount} in call)`,
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
      label: 'Profile',
      ariaLabel: 'View job seeker profile',
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
        <div className="primary-controls" role="toolbar" aria-label="Primary call controls">
          {primaryButtons.map(button => {
            const IconComponent = button.icon;
            return (
              <div key={button.id} className="control-wrapper">
                <button
                  className={button.className}
                  onClick={button.onClick}
                  title={button.ariaLabel}
                  aria-label={button.ariaLabel}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      button.onClick();
                    }
                  }}
                >
                  <IconComponent size={20} aria-hidden="true" />
                  {button.badge && (
                    <span className="control-badge" aria-label={`${button.badge} items`}>{button.badge}</span>
                  )}
                </button>
                <span className="control-label">{button.label}</span>
              </div>
            );
          })}
        </div>

        {/* Secondary Controls */}
        <div className="secondary-controls" role="toolbar" aria-label="Secondary call controls">
          {secondaryButtons.slice(0, 3).map(button => {
            const IconComponent = button.icon;
            return (
              <div key={button.id} className="control-wrapper">
                <button
                  className={button.className}
                  onClick={button.onClick}
                  title={button.ariaLabel}
                  aria-label={button.ariaLabel}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      button.onClick();
                    }
                  }}
                >
                  <IconComponent size={20} aria-hidden="true" />
                  {button.badge && (
                    <span className="control-badge" aria-label={`${button.badge} items`}>{button.badge}</span>
                  )}
                </button>
                <span className="control-label">{button.label}</span>
              </div>
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
                aria-describedby="more-options-tooltip"
                aria-expanded={showMoreOptions}
                aria-haspopup="menu"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    setShowMoreOptions(!showMoreOptions);
                  }
                }}
              >
                <FiMoreHorizontal size={20} aria-hidden="true" />
                <span id="more-options-tooltip" className="tooltip" role="tooltip" aria-live="polite">More options</span>
              </button>

              {showMoreOptions && (
                <div className="more-options-menu" role="menu" aria-label="Additional call options">
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
                        role="menuitem"
                        tabIndex={0}
                        aria-label={button.label}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            button.onClick();
                            setShowMoreOptions(false);
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setShowMoreOptions(false);
                          }
                        }}
                      >
                        <IconComponent size={18} aria-hidden="true" />
                        <span>{button.label}</span>
                        {button.badge && (
                          <span className="menu-badge" aria-label={`${button.badge} items`}>{button.badge}</span>
                        )}
                      </button>
                    );
                  })}

                  <div className="menu-divider"></div>

                  <button
                    className="menu-item"
                    role="menuitem"
                    tabIndex={0}
                    aria-label="Call settings"
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        // TODO: Implement settings functionality
                      } else if (e.key === 'Escape') {
                        e.preventDefault();
                        setShowMoreOptions(false);
                      }
                    }}
                  >
                    <FiSettings size={18} aria-hidden="true" />
                    <span>Settings</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* End Call / Leave Call Button */}
        <div className="end-call-controls" role="toolbar" aria-label="End call controls">
          {(() => {
            // Determine if user is recruiter or not
            const isRecruiter = userRole === 'recruiter' || userRole === 'Recruiter';
            const isJobSeeker = userRole === 'jobseeker' || userRole === 'JobSeeker';
            const isInterpreter = userRole === 'interpreter' || userRole === 'Interpreter' || userRole === 'GlobalInterpreter';
            
            const buttonLabel = isRecruiter ? 'End call' : 'Leave call';
            const handleClick = isRecruiter ? onEndCall : onLeaveCall;
            
            return (
              <div className="control-wrapper">
                <button
                  className="end-call-button"
                  onClick={handleClick}
                  title={buttonLabel}
                  aria-label={buttonLabel}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleClick();
                    }
                  }}
                >
                  <FiPhoneOff size={20} aria-hidden="true" />
                </button>
                <span className="control-label">{buttonLabel}</span>
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
};

export default CallControls;
