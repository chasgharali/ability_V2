import React, { useState, useEffect } from 'react';
import { FiX, FiUser, FiCheck } from 'react-icons/fi';
import axios from 'axios';
import './InterpreterSelectionModal.css';

const InterpreterSelectionModal = ({ onClose, onInvite, boothId, interpreterCategory }) => {
  const [interpreters, setInterpreters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);

  useEffect(() => {
    fetchAvailableInterpreters();
  }, [boothId]);

  const fetchAvailableInterpreters = async () => {
    try {
      setLoading(true);
      setError('');
      
      console.log('Fetching interpreters for booth:', boothId);
      
      if (!boothId) {
        console.error('No boothId provided');
        setError('Booth information not available');
        setLoading(false);
        return;
      }
      
      const token = localStorage.getItem('token');
      const response = await axios.get(`/api/video-call/available-interpreters/${boothId}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      console.log('Interpreters response:', response.data);
      
      const fetchedInterpreters = response.data.interpreters || [];
      console.log('Found interpreters:', fetchedInterpreters.length);
      console.log('Booth interpreters:', response.data.boothCount);
      console.log('Global interpreters:', response.data.globalCount);
      
      setInterpreters(fetchedInterpreters);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching interpreters:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to load available interpreters');
      setLoading(false);
    }
  };

  const handleInvite = () => {
    if (selectedInterpreter) {
      onInvite(selectedInterpreter, interpreterCategory);
      onClose();
    }
  };

  return (
    <div className="interpreter-selection-overlay">
      <div className="interpreter-selection-modal">
        {/* Header */}
        <div className="modal-header">
          <h3>Invite Interpreter</h3>
          <button
            className="close-button"
            onClick={onClose}
            aria-label="Close"
          >
            <FiX size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="modal-content">
          {loading ? (
            <div className="loading-state">
              <div className="spinner"></div>
              <p>Loading available interpreters...</p>
            </div>
          ) : error ? (
            <div className="error-state">
              <p>{error}</p>
              <button onClick={fetchAvailableInterpreters} className="retry-button">
                Retry
              </button>
            </div>
          ) : interpreters.length === 0 ? (
            <div className="empty-state">
              <FiUser size={48} />
              <p>No interpreters are currently available</p>
              {!boothId && (
                <p style={{ fontSize: '0.875rem', color: '#f44336', marginTop: '0.5rem' }}>
                  Missing booth information - cannot load interpreters
                </p>
              )}
              {boothId && (
                <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                  Booth ID: {boothId}
                </p>
              )}
              <button onClick={fetchAvailableInterpreters} className="refresh-button">
                Refresh
              </button>
            </div>
          ) : (
            <>
              <p className="instruction-text">
                Select an interpreter to invite to the call:
              </p>

              <div className="interpreters-list">
                {interpreters.map((interpreter) => (
                  <div
                    key={interpreter._id}
                    className={`interpreter-item ${selectedInterpreter?._id === interpreter._id ? 'selected' : ''}`}
                    onClick={() => setSelectedInterpreter(interpreter)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        setSelectedInterpreter(interpreter);
                      }
                    }}
                    role="button"
                    tabIndex={0}
                    aria-pressed={selectedInterpreter?._id === interpreter._id}
                  >
                    <div className="interpreter-avatar">
                      <div className="avatar-circle">
                        {interpreter.name?.charAt(0)?.toUpperCase() || 'I'}
                      </div>
                      <div className={`status-dot ${interpreter.isAvailable ? 'online' : 'offline'}`}></div>
                    </div>

                    <div className="interpreter-info">
                      <div className="interpreter-name">
                        {interpreter.name}
                      </div>
                      <div className="interpreter-meta">
                        <span className={`role-badge ${interpreter.role === 'GlobalInterpreter' ? 'global' : 'booth'}`}>
                          {interpreter.role === 'GlobalInterpreter' ? 'Global Interpreter' : 'Booth Interpreter'}
                        </span>
                        {interpreter.isAvailable && (
                          <span className="availability-badge online">
                            Online
                          </span>
                        )}
                      </div>
                      {interpreter.languages && interpreter.languages.length > 0 && (
                        <div className="interpreter-languages">
                          {interpreter.languages.slice(0, 3).join(', ')}
                          {interpreter.languages.length > 3 && ` +${interpreter.languages.length - 3} more`}
                        </div>
                      )}
                    </div>

                    {selectedInterpreter?._id === interpreter._id && (
                      <div className="selected-indicator">
                        <FiCheck size={20} />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Actions */}
        {!loading && !error && interpreters.length > 0 && (
          <div className="modal-actions">
            <button
              className="cancel-button"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              className="invite-button"
              onClick={handleInvite}
              disabled={!selectedInterpreter}
            >
              Send Invitation
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default InterpreterSelectionModal;
