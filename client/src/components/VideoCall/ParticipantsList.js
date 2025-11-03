import React, { useState } from 'react';
import { FiUsers, FiX, FiMic, FiVideo, FiUserPlus } from 'react-icons/fi';
import { INTERPRETER_CATEGORIES } from '../../constants/options';
import './ParticipantsList.css';

const ParticipantsList = ({
  participants,
  onClose,
  onInviteInterpreter,
  userRole,
  interpreterRequested
}) => {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  const handleInviteInterpreter = () => {
    if (selectedCategory) {
      onInviteInterpreter(selectedCategory);
      setShowInviteModal(false);
      setSelectedCategory('');
    }
  };


  const formatRole = (role) => {
    switch (role) {
      case 'recruiter':
        return 'Recruiter';
      case 'jobseeker':
        return 'Job Seeker';
      case 'interpreter':
        return 'Interpreter';
      default:
        return 'Participant';
    }
  };

  // Process participants data with improved logic
  const processParticipants = () => {
    const participantMap = new Map();
    
    const addParticipant = (participant, source, forcedRole = null) => {
      if (!participant) return;
      
      // Get unique identifier - prefer identity for Twilio participants
      const id = participant.identity || participant._id || participant.id || participant.sid;
      
      // Get name
      const name = participant.name || 
                  (participant.firstName && participant.lastName ? 
                   `${participant.firstName} ${participant.lastName}`.trim() : '') ||
                  participant.identity || 'Unknown User';
      
      if (!id || !name || name === 'Unknown User') return;
      
      // Check if this is the current user
      const isCurrentUser = participants?.localUser && 
                           (id === participants.localUser._id || 
                            id === participants.localUser.id ||
                            participant.identity === participants.localUser.email ||
                            name === participants.localUser.name ||
                            name === `${participants.localUser.firstName} ${participants.localUser.lastName}`.trim());
      
      // Determine role
      let role = forcedRole || participant.role || 'participant';
      
      // If participant already exists, update their connection status
      if (participantMap.has(id)) {
        const existing = participantMap.get(id);
        // Update connection status if this is from Twilio
        if (source === 'twilio') {
          existing.twilioConnected = true;
          existing.status = 'connected';
        }
        // Keep the existing role if it's more specific
        if (existing.role !== 'participant' && role === 'participant') {
          role = existing.role;
        }
        participantMap.set(id, {
          ...existing,
          twilioConnected: existing.twilioConnected || source === 'twilio',
          role: role
        });
      } else {
        // Add new participant
        participantMap.set(id, {
          id,
          name,
          email: participant.email || '',
          role: role,
          status: source === 'twilio' ? 'connected' : (participant.status || 'invited'),
          company: participant.company || '',
          location: participant.location || '',
          category: participant.category || '',
          isLocal: isCurrentUser,
          source,
          twilioConnected: source === 'twilio'
        });
      }
    };

    if (!participants) return [];

    // First, add call participants with their proper roles
    if (participants.recruiter) {
      addParticipant({
        ...participants.recruiter,
        identity: participants.recruiter.email || participants.recruiter._id
      }, 'call', 'recruiter');
    }
    
    if (participants.jobSeeker) {
      addParticipant({
        ...participants.jobSeeker,
        identity: participants.jobSeeker.email || participants.jobSeeker._id
      }, 'call', 'jobseeker');
    }
    
    if (participants.interpreters && Array.isArray(participants.interpreters)) {
      participants.interpreters.forEach(interpreterEntry => {
        if (interpreterEntry.interpreter) {
          addParticipant({
            ...interpreterEntry.interpreter,
            identity: interpreterEntry.interpreter.email || interpreterEntry.interpreter._id,
            status: interpreterEntry.status,
            category: interpreterEntry.category
          }, 'call', 'interpreter');
        }
      });
    }
    
    // Then update with Twilio participants (currently connected)
    // This will update existing participants' connection status
    if (participants.twilioParticipants && Array.isArray(participants.twilioParticipants)) {
      participants.twilioParticipants.forEach(twilioParticipant => {
        addParticipant(twilioParticipant, 'twilio');
      });
    }
    
    // Add local user if not already included
    if (participants.localUser && !participantMap.has(participants.localUser._id)) {
      const localUserIdentity = participants.localUser.email || participants.localUser._id;
      if (!participantMap.has(localUserIdentity)) {
        addParticipant({
          ...participants.localUser,
          identity: localUserIdentity,
          status: 'connected'
        }, 'local', participants.localUser.role);
      }
    }

    return Array.from(participantMap.values()).filter(p => p.name && p.name !== 'Unknown User');
  };

  const allParticipants = processParticipants();
  

  return (
    <div className="participants-panel" role="complementary" aria-label="Call participants">
      {/* Header */}
      <div className="participants-header">
        <div className="participants-title">
          <FiUsers size={20} aria-hidden="true" />
          <span>Participants</span>
          <span className="participant-count" aria-label={`${allParticipants.length} participants`}>
            ({allParticipants.length})
          </span>
        </div>
        <button
          className="close-button"
          onClick={onClose}
          aria-label="Close participants panel"
        >
          <FiX size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Interpreter Request Info - Show for all roles */}
      {interpreterRequested && (
        <div className="interpreter-info-banner" role="status" aria-live="polite">
          <div className="banner-icon">ℹ️</div>
          <div className="banner-content">
            <strong>Interpreter Requested</strong>
            <p>Job seeker has requested interpreter support for this call</p>
          </div>
        </div>
      )}

      {/* Invite Interpreter Section - Recruiter only */}
      {userRole === 'recruiter' && (
        <div className="invite-section" role="region" aria-labelledby="interpreter-heading">
          <div className="section-header">
            <h4 id="interpreter-heading">Interpreter Support</h4>
          </div>
          
          {interpreterRequested ? (
            <div className="interpreter-status" role="status" aria-live="polite">
              <p className="status-text">Interpreter has been requested</p>
              <button
                className="invite-interpreter-button"
                onClick={() => setShowInviteModal(true)}
                aria-describedby="interpreter-help"
              >
                <FiUserPlus size={16} aria-hidden="true" />
                <span>Invite Interpreter</span>
              </button>
            </div>
          ) : (
            <button
              className="invite-interpreter-button"
              onClick={() => setShowInviteModal(true)}
              aria-describedby="interpreter-help"
            >
              <FiUserPlus size={16} aria-hidden="true" />
              <span>Invite Interpreter</span>
            </button>
          )}
          <div id="interpreter-help" className="sr-only">
            Request an interpreter to assist with communication during the call
          </div>
        </div>
      )}

      {/* Participants List */}
      <div className="participants-list" role="list" aria-label="List of call participants">
        {allParticipants.map((participant, index) => (
          <div
            key={participant.id || index}
            className="participant-item"
            role="listitem"
            aria-label={`${participant.name}, ${formatRole(participant.role)}, ${participant.status}`}
          >
            <div className="participant-avatar">
              <div
                className="avatar-circle"
                aria-label={`Avatar for ${participant.name}`}
              >
                {participant.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div
                className={`status-indicator ${participant.status}`}
                aria-label={`Status: ${participant.status}`}
              ></div>
            </div>

            <div className="participant-info">
              <div className="participant-name">
                <span className="name-text" title={participant.name}>{participant.name}</span>
                {participant.isLocal && <span className="local-indicator">You</span>}
              </div>
              <div className="participant-role">
                <span className={`role-badge role-${participant.role}`}>
                  {formatRole(participant.role)}
                </span>
                {participant.category && (
                  <span className="interpreter-category">
                    {participant.category}
                  </span>
                )}
              </div>
            </div>

            <div className="participant-controls">
              <div className={`connection-badge ${participant.twilioConnected ? 'in-call' : 'invited'}`}>
                <div className="badge-indicator"></div>
                <span className="badge-text">
                  {participant.twilioConnected ? 'In Call' : 'Invited'}
                </span>
              </div>
              {participant.twilioConnected && (
                <div className="media-status" aria-label="Media status">
                  <div
                    className="media-indicator audio enabled"
                    aria-label="Microphone enabled"
                    title="Microphone on"
                  >
                    <FiMic size={10} aria-hidden="true" />
                  </div>
                  <div
                    className="media-indicator video enabled"
                    aria-label="Camera enabled"
                    title="Camera on"
                  >
                    <FiVideo size={10} aria-hidden="true" />
                  </div>
                </div>
              )}
            </div>
          </div>
        ))}

        {/* Empty state */}
        {allParticipants.length === 0 && (
          <div className="no-participants" role="status" aria-live="polite">
            <FiUsers size={48} aria-hidden="true" />
            <p>No participants yet</p>
          </div>
        )}
      </div>

      {/* Invite Interpreter Modal */}
      {showInviteModal && (
        <div className="modal-overlay">
          <div className="invite-modal">
            <div className="modal-header">
              <h3>Invite Interpreter</h3>
              <button
                className="close-button"
                onClick={() => setShowInviteModal(false)}
              >
                <FiX size={20} />
              </button>
            </div>

            <div className="modal-content">
              <p>Select the type of interpreter needed:</p>

              <div className="category-selection">
                {INTERPRETER_CATEGORIES.map(category => (
                  <label key={category.value} className="category-option">
                    <input
                      type="radio"
                      name="interpreterCategory"
                      value={category.value}
                      checked={selectedCategory === category.value}
                      onChange={(e) => setSelectedCategory(e.target.value)}
                    />
                    <span className="category-label">{category.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="modal-actions">
              <button
                className="cancel-button"
                onClick={() => setShowInviteModal(false)}
              >
                Cancel
              </button>
              <button
                className="invite-button"
                onClick={handleInviteInterpreter}
                disabled={!selectedCategory}
              >
                Send Invitation
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ParticipantsList;
