import React, { useState } from 'react';
import { FiUsers, FiX, FiMic, FiVideo, FiUserPlus } from 'react-icons/fi';
import { INTERPRETER_CATEGORIES } from '../../constants/options';
import InterpreterSelectionModal from './InterpreterSelectionModal';
import './ParticipantsList.css';

const ParticipantsList = ({
  participants,
  onClose,
  onInviteInterpreter,
  userRole,
  interpreterRequested,
  boothId
}) => {
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('');

  const handleInviteInterpreter = (interpreter, category) => {
    // Pass the selected interpreter and category to parent
    onInviteInterpreter(interpreter._id, category || selectedCategory);
    setShowInviteModal(false);
    setSelectedCategory('');
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
    try {
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
          if (!twilioParticipant) return; // Skip null/undefined entries
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
            // Check if this Twilio participant is an interpreter
            let interpreterRole = null;
            let interpreterCategory = '';
            if (participants && participants.interpreters && Array.isArray(participants.interpreters) && twilioIdentity) {
              const matchingInterpreter = participants.interpreters.find(entry => {
                if (!entry || !entry.interpreter) return false;
                const interpreterEmail = entry.interpreter.email;
                const interpreterId = entry.interpreter._id || entry.interpreter.id;
                if (!interpreterEmail && !interpreterId) return false;
                return twilioIdentity === interpreterEmail ||
                  twilioIdentity === interpreterId ||
                  (interpreterEmail && twilioIdentity.includes && twilioIdentity.includes(interpreterEmail)) ||
                  (interpreterId && twilioIdentity.includes && twilioIdentity.includes(interpreterId));
              });
              if (matchingInterpreter) {
                interpreterRole = 'interpreter';
                interpreterCategory = matchingInterpreter.category || '';
              }
            }

            // Only add as new participant if no match found
            console.warn('No match found for Twilio participant, adding as new:', twilioIdentity, 'role:', interpreterRole || 'participant');
            const transformedParticipant = {
              identity: twilioIdentity,
              email: twilioIdentity,
              sid: twilioParticipant.sid,
              name: twilioIdentity,
              role: interpreterRole || undefined,
              category: interpreterCategory
            };
            addParticipant(transformedParticipant, 'twilio', interpreterRole);
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
    } catch (error) {
      console.error('Error processing participants:', error);
      // Return empty array to prevent component crash
      return [];
    }
  };

  const allParticipants = processParticipants();


  return (
    <div className="vcpl-panel" role="complementary" aria-label="Call participants">
      {/* Header */}
      <div className="vcpl-header">
        <div className="vcpl-title">
          <FiUsers size={20} aria-hidden="true" />
          <span>Participants</span>
          <span className="vcpl-count" aria-label={`${allParticipants.length} participants in call`}>
            ({allParticipants.length})
          </span>
        </div>
        <button
          className="vcpl-close-btn"
          onClick={onClose}
          aria-label="Close participants panel"
        >
          <FiX size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Interpreter Request Info - Show for all roles */}
      {interpreterRequested && (
        <div className="vcpl-interpreter-banner" role="status" aria-live="polite" aria-atomic="true">
          <div className="vcpl-banner-icon" aria-hidden="true">ℹ️</div>
          <div className="vcpl-banner-content">
            <strong>Interpreter Requested</strong>
            <p>Job seeker has requested interpreter support for this call</p>
          </div>
        </div>
      )}

      {/* Invite Interpreter Section - Recruiter only */}
      {userRole === 'recruiter' && (
        <div className="vcpl-invite-section" role="region" aria-labelledby="vcpl-interpreter-heading">
          <div className="vcpl-section-header">
            <h4 id="vcpl-interpreter-heading">Interpreter Support</h4>
          </div>

          {interpreterRequested ? (
            <div className="vcpl-interpreter-status" role="status" aria-live="polite" aria-atomic="true">
              <p className="vcpl-status-text">Interpreter has been requested</p>
              <button
                className="vcpl-invite-btn"
                onClick={() => setShowInviteModal(true)}
                aria-describedby="vcpl-interpreter-help"
                aria-label="Invite an interpreter to join this call"
              >
                <FiUserPlus size={16} aria-hidden="true" />
                <span>Invite Interpreter</span>
              </button>
            </div>
          ) : (
            <button
              className="vcpl-invite-btn"
              onClick={() => setShowInviteModal(true)}
              aria-describedby="vcpl-interpreter-help"
              aria-label="Invite an interpreter to join this call"
            >
              <FiUserPlus size={16} aria-hidden="true" />
              <span>Invite Interpreter</span>
            </button>
          )}
          <div id="vcpl-interpreter-help" className="vcpl-sr-only">
            Request an interpreter to assist with communication during the call
          </div>
        </div>
      )}

      {/* Participants List */}
      <div className="vcpl-list" role="list" aria-label="List of call participants">
        {allParticipants.map((participant, index) => {
          // Determine if interpreter is invited or joined
          const isInterpreter = participant.role === 'interpreter';
          const interpreterStatus = isInterpreter
            ? (participant.twilioConnected ? 'JOINED' : 'INVITED')
            : (participant.twilioConnected ? 'IN CALL' : 'INVITED');

          return (
            <div
              key={participant.id || index}
              className="vcpl-item"
              role="listitem"
              aria-label={`${participant.name}, ${formatRole(participant.role)}, status: ${interpreterStatus.toLowerCase()}`}
            >
              <div className="vcpl-avatar">
                <div
                  className="vcpl-avatar-circle"
                  aria-hidden="true"
                >
                  {participant.name?.charAt(0)?.toUpperCase() || 'U'}
                </div>
                <div
                  className={`vcpl-status-indicator vcpl-status-${participant.status}`}
                  aria-label={`Connection status: ${participant.status}`}
                ></div>
              </div>

              <div className="vcpl-info">
                <div className="vcpl-name-row">
                  <span className="vcpl-name" title={participant.name}>{participant.name}</span>
                  {participant.isLocal && (
                    <span className="vcpl-you-badge" aria-label="This is you">You</span>
                  )}
                </div>
                <div className="vcpl-role-row">
                  <span className={`vcpl-role-badge vcpl-role-${participant.role}`} aria-label={`Role: ${formatRole(participant.role)}`}>
                    {formatRole(participant.role)}
                  </span>
                  {participant.category && (
                    <span className="vcpl-category-badge" aria-label={`Interpreter category: ${participant.category}`}>
                      {participant.category}
                    </span>
                  )}
                </div>
              </div>

              <div className="vcpl-controls" aria-label="Participant status and media controls">
                <div
                  className={`vcpl-connection-badge ${participant.twilioConnected ? 'vcpl-status-joined' : 'vcpl-status-invited'}`}
                  role="status"
                  aria-live="polite"
                >
                  <div className="vcpl-badge-dot" aria-hidden="true"></div>
                  <span className="vcpl-badge-label">
                    {interpreterStatus}
                  </span>
                </div>
                {participant.twilioConnected && (
                  <div className="vcpl-media" aria-label="Media status indicators">
                    <div
                      className="vcpl-media-icon vcpl-audio-on"
                      aria-label="Microphone is on"
                      title="Microphone on"
                    >
                      <FiMic size={10} aria-hidden="true" />
                    </div>
                    <div
                      className="vcpl-media-icon vcpl-video-on"
                      aria-label="Camera is on"
                      title="Camera on"
                    >
                      <FiVideo size={10} aria-hidden="true" />
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}

        {/* Empty state */}
        {allParticipants.length === 0 && (
          <div className="vcpl-empty" role="status" aria-live="polite">
            <FiUsers size={48} aria-hidden="true" />
            <p>No participants yet</p>
          </div>
        )}
      </div>

      {/* Interpreter Selection Modal */}
      {showInviteModal && (
        <InterpreterSelectionModal
          boothId={boothId}
          interpreterCategory={selectedCategory}
          onClose={() => setShowInviteModal(false)}
          onInvite={handleInviteInterpreter}
        />
      )}
    </div>
  );
};

export default ParticipantsList;
