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
      // Filter to only show online interpreters (available and not in a meeting)
      const onlineInterpreters = fetchedInterpreters.filter(
        interpreter => interpreter.isAvailable === true && !interpreter.inMeeting
      );

      console.log('Found interpreters:', fetchedInterpreters.length);
      console.log('Online interpreters:', onlineInterpreters.length);
      console.log('Booth interpreters:', response.data.boothCount);
      console.log('Global interpreters:', response.data.globalCount);

      setInterpreters(onlineInterpreters);
      setLoading(false);
    } catch (err) {
      console.error('Error fetching interpreters:', err);
      console.error('Error details:', err.response?.data || err.message);
      setError(err.response?.data?.error || 'Failed to load available interpreters');
      setLoading(false);
    }
  };

  const handleInvite = () => {
    if (selectedInterpreter && selectedInterpreter.isAvailable && !selectedInterpreter.inMeeting) {
      onInvite(selectedInterpreter, interpreterCategory);
      onClose();
    }
  };

  return (
    <div className="ism-overlay" role="dialog" aria-modal="true" aria-labelledby="ism-title">
      <div className="ism-modal">
        {/* Header */}
        <div className="ism-header">
          <h3 id="ism-title">Invite Interpreter</h3>
          <button
            className="ism-close-btn"
            onClick={onClose}
            aria-label="Close interpreter selection dialog"
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>

        {/* Content */}
        <div className="ism-content">
          {loading ? (
            <div className="ism-loading" role="status" aria-live="polite">
              <div className="ism-spinner" aria-hidden="true"></div>
              <p>Loading available interpreters...</p>
            </div>
          ) : error ? (
            <div className="ism-error" role="alert">
              <p>{error}</p>
              <button onClick={fetchAvailableInterpreters} className="ism-retry-btn">
                Retry
              </button>
            </div>
          ) : interpreters.length === 0 ? (
            <div className="ism-empty" role="status">
              <FiUser size={48} aria-hidden="true" />
              <p>No online interpreters are currently available</p>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                Please wait for an interpreter to come online or try again later.
              </p>
              {!boothId && (
                <p style={{ fontSize: '0.875rem', color: '#f44336', marginTop: '0.5rem' }}>
                  Missing booth information - cannot load interpreters
                </p>
              )}
              <button onClick={fetchAvailableInterpreters} className="ism-refresh-btn">
                Refresh
              </button>
            </div>
          ) : (
            <>
              <p className="ism-instruction">
                Select an interpreter to invite to the call:
              </p>

              <div className="ism-list" role="radiogroup" aria-label="Available interpreters">
                {interpreters.map((interpreter) => (
                  <div
                    key={interpreter._id}
                    className={`ism-item ${selectedInterpreter?._id === interpreter._id ? 'ism-selected' : ''}`}
                    onClick={() => {
                      if (interpreter.isAvailable && !interpreter.inMeeting) {
                        setSelectedInterpreter(interpreter);
                      }
                    }}
                    onKeyDown={(e) => {
                      if ((e.key === 'Enter' || e.key === ' ') && interpreter.isAvailable && !interpreter.inMeeting) {
                        e.preventDefault();
                        setSelectedInterpreter(interpreter);
                      }
                    }}
                    role="radio"
                    tabIndex={interpreter.isAvailable && !interpreter.inMeeting ? 0 : -1}
                    aria-checked={selectedInterpreter?._id === interpreter._id}
                    aria-disabled={!interpreter.isAvailable || interpreter.inMeeting}
                    aria-label={`${interpreter.name}, ${interpreter.role === 'GlobalInterpreter' ? 'Global Interpreter' : 'Booth Interpreter'}, Online`}
                  >
                    <div className="ism-avatar-wrapper">
                      <div className="ism-avatar" aria-hidden="true">
                        {interpreter.name?.charAt(0)?.toUpperCase() || 'I'}
                      </div>
                      <div
                        className={`ism-status-dot ${interpreter.isAvailable ? 'ism-online' : 'ism-offline'}`}
                        aria-label={interpreter.isAvailable ? 'Online' : 'Offline'}
                      ></div>
                    </div>

                    <div className="ism-info">
                      <div className="ism-name">
                        {interpreter.name}
                      </div>
                      <div className="ism-meta">
                        <span className={`ism-role-badge ${interpreter.role === 'GlobalInterpreter' ? 'ism-global' : 'ism-booth'}`}>
                          {interpreter.role === 'GlobalInterpreter' ? 'Global Interpreter' : 'Booth Interpreter'}
                        </span>
                        <span className="ism-availability-badge">
                          Online
                        </span>
                      </div>
                      {interpreter.languages && interpreter.languages.length > 0 && (
                        <div className="ism-languages">
                          {interpreter.languages.slice(0, 3).join(', ')}
                          {interpreter.languages.length > 3 && ` +${interpreter.languages.length - 3} more`}
                        </div>
                      )}
                    </div>

                    {selectedInterpreter?._id === interpreter._id && (
                      <div className="ism-check" aria-hidden="true">
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
          <div className="ism-actions">
            <button
              className="ism-cancel-btn"
              onClick={onClose}
              aria-label="Cancel interpreter selection"
            >
              Cancel
            </button>
            <button
              className="ism-invite-btn"
              onClick={handleInvite}
              disabled={!selectedInterpreter}
              aria-label={selectedInterpreter ? `Send invitation to ${selectedInterpreter.name}` : 'Select an interpreter first'}
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
