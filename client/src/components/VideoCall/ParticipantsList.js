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
    const emailToIdMap = new Map(); // Map emails to participant IDs
    
    const addParticipant = (participant, source, forcedRole = null) => {
      if (!participant) return;
      
      // Get unique identifiers
      const userId = participant._id || participant.id;
      const email = participant.email || participant.identity;
      const name = participant.name || 
                  (participant.firstName && participant.lastName ? 
                   `${participant.firstName} ${participant.lastName}`.trim() : '') || '';
      
      // Skip if no valid identifier or name
      if ((!userId && !email) || !name) return;
      
      // Determine primary ID to use
      let primaryId = userId;
      
      // If we have an email, check if we've seen this email before
      if (email) {
        if (emailToIdMap.has(email)) {
          // Use the existing ID for this email
          primaryId = emailToIdMap.get(email);
        } else if (userId) {
          // Map this email to this user ID
          emailToIdMap.set(email, userId);
        } else {
          // Use email as primary ID if no user ID
          primaryId = email;
        }
      }
      
      // Check if this is the current user
      const isCurrentUser = participants?.localUser && 
                           (primaryId === participants.localUser._id || 
                            primaryId === participants.localUser.id ||
                            email === participants.localUser.email ||
                            name === `${participants.localUser.firstName} ${participants.localUser.lastName}`.trim());
      
      // Determine role
      let role = forcedRole || participant.role || 'participant';
      
      // If participant already exists, update their connection status
      if (participantMap.has(primaryId)) {
        const existing = participantMap.get(primaryId);
        // Update connection status if this is from Twilio
        if (source === 'twilio') {
          participantMap.set(primaryId, {
            ...existing,
            twilioConnected: true,
            status: 'connected',
            role: existing.role // Keep the existing role (recruiter/jobseeker)
          });
        } else {
          // Keep the more specific role for non-Twilio updates
          if (existing.role !== 'participant' && role === 'participant') {
            role = existing.role;
          }
          participantMap.set(primaryId, {
            ...existing,
            role: role
          });
        }
      } else {
        // Add new participant
        participantMap.set(primaryId, {
          id: primaryId,
          name,
          email: email || '',
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
      // Ensure email mapping is set for recruiter
      const recruiterEmail = participants.recruiter.email;
      const recruiterId = participants.recruiter._id || participants.recruiter.id;
      if (recruiterEmail && recruiterId) {
        emailToIdMap.set(recruiterEmail, recruiterId);
      }
      addParticipant(participants.recruiter, 'call', 'recruiter');
    }
    
    if (participants.jobSeeker) {
      // Ensure email mapping is set for job seeker
      const jobSeekerEmail = participants.jobSeeker.email;
      const jobSeekerId = participants.jobSeeker._id || participants.jobSeeker.id;
      if (jobSeekerEmail && jobSeekerId) {
        emailToIdMap.set(jobSeekerEmail, jobSeekerId);
      }
      addParticipant(participants.jobSeeker, 'call', 'jobseeker');
    }
    
    if (participants.interpreters && Array.isArray(participants.interpreters)) {
      participants.interpreters.forEach(interpreterEntry => {
        if (interpreterEntry.interpreter) {
          addParticipant({
            ...interpreterEntry.interpreter,
            status: interpreterEntry.status,
            category: interpreterEntry.category
          }, 'call', 'interpreter');
        }
      });
    }
    
    // Then update with Twilio participants (currently connected)
    // Match Twilio participants with existing call participants by email/ID
    if (participants.twilioParticipants && Array.isArray(participants.twilioParticipants)) {
      participants.twilioParticipants.forEach(twilioParticipant => {
        const twilioIdentity = twilioParticipant.identity;
        
        console.log('Processing Twilio participant:', {
          identity: twilioIdentity,
          sid: twilioParticipant.sid,
          existingParticipants: Array.from(participantMap.entries()).map(([id, p]) => ({
            id,
            name: p.name,
            email: p.email,
            role: p.role
          })),
          emailToIdMap: Array.from(emailToIdMap.entries())
        });
        
        // Try to find matching participant in map by email/ID
        let matchedId = null;
        
        // Check if this identity matches any email we've seen
        if (emailToIdMap.has(twilioIdentity)) {
          matchedId = emailToIdMap.get(twilioIdentity);
          console.log('Matched by email map:', matchedId);
        } else {
          // Try to find by searching through existing participants
          for (const [id, participant] of participantMap.entries()) {
            // Check multiple possible matches
            if (participant.email === twilioIdentity || 
                participant.id === twilioIdentity ||
                id === twilioIdentity ||
                // Also check if Twilio identity contains the participant ID
                twilioIdentity.includes(id) ||
                twilioIdentity.includes(participant.email)) {
              matchedId = id;
              console.log('Matched by search:', { matchedId, participant });
              break;
            }
          }
        }
        
        // If we found a match, update that participant's status
        if (matchedId && participantMap.has(matchedId)) {
          const existing = participantMap.get(matchedId);
          console.log('Updating existing participant:', matchedId, 'from', existing.status, 'to connected');
          participantMap.set(matchedId, {
            ...existing,
            twilioConnected: true,
            status: 'connected'
          });
        } else {
          // Only add as new participant if no match found
          console.warn('No match found for Twilio participant, adding as new:', twilioIdentity);
          const transformedParticipant = {
            identity: twilioIdentity,
            email: twilioIdentity,
            sid: twilioParticipant.sid,
            name: twilioIdentity
          };
          addParticipant(transformedParticipant, 'twilio');
        }
      });
    }
    
    // Mark local user as connected if they're in the call
    if (participants.localUser) {
      const localUserId = participants.localUser._id || participants.localUser.id;
      const localUserEmail = participants.localUser.email;
      
      // Check if local user exists in map
      if (participantMap.has(localUserId)) {
        // Update to connected status
        const existing = participantMap.get(localUserId);
        participantMap.set(localUserId, {
          ...existing,
          twilioConnected: true,
          status: 'connected'
        });
      } else if (localUserEmail && emailToIdMap.has(localUserEmail)) {
        // Update by email mapping
        const mappedId = emailToIdMap.get(localUserEmail);
        const existing = participantMap.get(mappedId);
        if (existing) {
          participantMap.set(mappedId, {
            ...existing,
            twilioConnected: true,
            status: 'connected'
          });
        }
      } else {
        // Add as new participant if not found
        addParticipant({
          ...participants.localUser,
          status: 'connected',
          twilioConnected: true
        }, 'local', participants.localUser.role);
      }
    }

    // Filter and deduplicate - ensure only one recruiter and one job seeker
    const allParticipantsList = Array.from(participantMap.values()).filter(p => p.name);
    
    // Remove duplicates by role - keep the connected one
    const roleMap = new Map();
    
    allParticipantsList.forEach(participant => {
      const role = participant.role;
      
      // Allow multiple interpreters and generic participants
      if (role === 'interpreter') {
        // Keep all interpreters
        return;
      }
      
      // For recruiter and jobseeker, only keep one - prefer connected
      if (role === 'recruiter' || role === 'jobseeker') {
        if (!roleMap.has(role)) {
          roleMap.set(role, participant);
        } else {
          const existing = roleMap.get(role);
          // Prefer the connected participant
          if (participant.twilioConnected && !existing.twilioConnected) {
            console.log(`Replacing ${role} with connected version:`, { old: existing.name, new: participant.name });
            roleMap.set(role, participant);
          } else if (!participant.twilioConnected && !existing.twilioConnected) {
            // Both not connected, prefer the one with more complete data (has proper name)
            if (participant.name && !participant.name.includes('_') && existing.name.includes('_')) {
              roleMap.set(role, participant);
            }
          }
        }
      } else if (role === 'participant') {
        // Generic participants - only add if not already covered by role-specific entries
        const hasAsJobSeeker = roleMap.has('jobseeker') && 
          (roleMap.get('jobseeker').email === participant.email || 
           roleMap.get('jobseeker').id === participant.id);
        const hasAsRecruiter = roleMap.has('recruiter') && 
          (roleMap.get('recruiter').email === participant.email || 
           roleMap.get('recruiter').id === participant.id);
        
        if (!hasAsJobSeeker && !hasAsRecruiter) {
          // Keep generic participant only if not already added as specific role
          if (!roleMap.has('participant_' + participant.id)) {
            roleMap.set('participant_' + participant.id, participant);
          }
        }
      }
    });
    
    // Get interpreters separately (they're not deduplicated)
    const interpreters = allParticipantsList.filter(p => p.role === 'interpreter');
    
    // Combine role-specific participants with interpreters
    const deduplicated = [...Array.from(roleMap.values()), ...interpreters];
    
    console.log('Final participants after deduplication:', deduplicated);
    return deduplicated;
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
