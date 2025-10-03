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

  const allParticipants = [];
  
  // Add main participants
  if (participants?.recruiter) {
    allParticipants.push({
      ...participants.recruiter,
      role: 'recruiter',
      status: 'connected'
    });
  }
  
  if (participants?.jobSeeker) {
    allParticipants.push({
      ...participants.jobSeeker,
      role: 'jobseeker',
      status: 'connected'
    });
  }

  // Add interpreters
  if (participants?.interpreters) {
    participants.interpreters.forEach(interpreterEntry => {
      if (interpreterEntry.interpreter) {
        allParticipants.push({
          ...interpreterEntry.interpreter,
          role: 'interpreter',
          status: interpreterEntry.status,
          category: interpreterEntry.category
        });
      }
    });
  }

  return (
    <div className="participants-panel">
      {/* Header */}
      <div className="participants-header">
        <div className="participants-title">
          <FiUsers size={20} />
          <span>Participants</span>
          <span className="participant-count">({allParticipants.length})</span>
        </div>
        <button 
          className="close-button"
          onClick={onClose}
          aria-label="Close participants"
        >
          <FiX size={20} />
        </button>
      </div>

      {/* Participants List */}
      <div className="participants-list">
        {allParticipants.map((participant, index) => (
          <div key={participant.id || index} className="participant-item">
            <div className="participant-avatar">
              <div className="avatar-circle">
                {participant.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className={`status-indicator ${participant.status}`}></div>
            </div>
            
            <div className="participant-info">
              <div className="participant-name">
                {participant.name || 'Unknown User'}
              </div>
              <div className="participant-role">
                {formatRole(participant.role)}
                {participant.category && (
                  <span className="interpreter-category">
                    ({participant.category})
                  </span>
                )}
              </div>
              <div className="participant-status">
                {participant.status === 'connected' ? 'Connected' : 
                 participant.status === 'invited' ? 'Invited' :
                 participant.status === 'declined' ? 'Declined' :
                 participant.status}
              </div>
            </div>

            <div className="participant-controls">
              {/* Audio/Video status indicators */}
              <div className="media-status">
                <div className="media-indicator audio enabled">
                  <FiMic size={14} />
                </div>
                <div className="media-indicator video enabled">
                  <FiVideo size={14} />
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Empty state */}
        {allParticipants.length === 0 && (
          <div className="no-participants">
            <FiUsers size={48} />
            <p>No participants yet</p>
          </div>
        )}
      </div>

      {/* Invite Interpreter Section */}
      {userRole === 'recruiter' && (
        <div className="invite-section">
          <div className="section-header">
            <h4>Interpreter Support</h4>
          </div>
          
          {interpreterRequested ? (
            <div className="interpreter-status">
              <p className="status-text">Interpreter has been requested</p>
              <div className="status-indicator pending"></div>
            </div>
          ) : (
            <button
              className="invite-interpreter-button"
              onClick={() => setShowInviteModal(true)}
            >
              <FiUserPlus size={18} />
              <span>Invite Interpreter</span>
            </button>
          )}
        </div>
      )}

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
