import React, { useState, useEffect } from 'react';
import { FiX, FiUser, FiCheck, FiRefreshCw } from 'react-icons/fi';
import { MdCircle } from 'react-icons/md';
import axios from 'axios';
import { useSocket } from '../../contexts/SocketContext';
import './InterpreterSelectionModal.css';

const InterpreterSelectionModal = ({ onClose, onInvite, boothId, interpreterCategory }) => {
  const [interpreters, setInterpreters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedInterpreter, setSelectedInterpreter] = useState(null);
  const { socket } = useSocket();

  // Status colors and labels
  const statusConfig = {
    online: { color: '#48bb78', label: 'Online', canInvite: true },
    away: { color: '#ed8936', label: 'Away', canInvite: false },
    busy: { color: '#f56565', label: 'Busy', canInvite: false },
    offline: { color: '#a0aec0', label: 'Offline', canInvite: false }
  };

  useEffect(() => {
    fetchAvailableInterpreters();
  }, [boothId]);

  // Listen for real-time status changes
  useEffect(() => {
    if (!socket) return;

    const handleStatusChange = (data) => {
      console.log('🔄 Interpreter status changed:', data);
      // Update the interpreter's status in the list
      setInterpreters(prev => prev.map(interpreter => {
        if (interpreter._id === data.interpreterId) {
          const newStatus = data.status;
          return {
            ...interpreter,
            status: newStatus,
            isAvailable: newStatus === 'online' && !interpreter.inMeeting
          };
        }
        return interpreter;
      }));
    };

    socket.on('interpreter-status-changed', handleStatusChange);

    return () => {
      socket.off('interpreter-status-changed', handleStatusChange);
    };
  }, [socket]);

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
      console.log('Available interpreters:', response.data.availableCount);
      console.log('Booth interpreters:', response.data.boothCount);
      console.log('Global interpreters:', response.data.globalCount);

      // Show all interpreters, sorted by availability
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
    if (selectedInterpreter && selectedInterpreter.isAvailable) {
      onInvite(selectedInterpreter, interpreterCategory);
      onClose();
    }
  };

  const getStatusInfo = (interpreter) => {
    const status = interpreter.status || 'offline';
    return statusConfig[status] || statusConfig.offline;
  };

  const canInviteInterpreter = (interpreter) => {
    const statusInfo = getStatusInfo(interpreter);
    return statusInfo.canInvite && interpreter.isAvailable;
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
              <p>No interpreters assigned to this booth</p>
              <p style={{ fontSize: '0.875rem', color: '#666', marginTop: '0.5rem' }}>
                Please contact admin to assign interpreters to this booth.
              </p>
              {!boothId && (
                <p style={{ fontSize: '0.875rem', color: '#f44336', marginTop: '0.5rem' }}>
                  Missing booth information - cannot load interpreters
                </p>
              )}
              <button onClick={fetchAvailableInterpreters} className="ism-refresh-btn">
                <FiRefreshCw size={16} style={{ marginRight: '0.5rem' }} />
                Refresh
              </button>
            </div>
          ) : (
            <>
              <div className="ism-header-actions">
                <p className="ism-instruction">
                  Select an online interpreter to invite to the call:
                </p>
                <button onClick={fetchAvailableInterpreters} className="ism-refresh-btn-small" title="Refresh interpreter list">
                  <FiRefreshCw size={16} />
                </button>
              </div>

              {/* Status Legend */}
              <div className="ism-status-legend">
                {Object.entries(statusConfig).map(([key, config]) => (
                  <div key={key} className="ism-legend-item">
                    <MdCircle size={10} style={{ color: config.color }} />
                    <span>{config.label}</span>
                  </div>
                ))}
              </div>

              <div className="ism-list" role="radiogroup" aria-label="Available interpreters">
                {interpreters.map((interpreter) => {
                  const statusInfo = getStatusInfo(interpreter);
                  const canInvite = canInviteInterpreter(interpreter);

                  return (
                    <div
                      key={interpreter._id}
                      className={`ism-item ${selectedInterpreter?._id === interpreter._id ? 'ism-selected' : ''} ${!canInvite ? 'ism-disabled' : ''}`}
                      onClick={() => {
                        if (canInvite) {
                          setSelectedInterpreter(interpreter);
                        }
                      }}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ' ') && canInvite) {
                          e.preventDefault();
                          setSelectedInterpreter(interpreter);
                        }
                      }}
                      role="radio"
                      tabIndex={canInvite ? 0 : -1}
                      aria-checked={selectedInterpreter?._id === interpreter._id}
                      aria-disabled={!canInvite}
                      aria-label={`${interpreter.name}, ${interpreter.role === 'GlobalInterpreter' ? 'Global Interpreter' : 'Booth Interpreter'}, ${statusInfo.label}`}
                    >
                      <div className="ism-avatar-wrapper">
                        <div className="ism-avatar" aria-hidden="true">
                          {interpreter.name?.charAt(0)?.toUpperCase() || 'I'}
                        </div>
                        <div
                          className="ism-status-dot"
                          style={{ backgroundColor: statusInfo.color }}
                          aria-label={statusInfo.label}
                        ></div>
                      </div>

                      <div className="ism-info">
                        <div className="ism-name">
                          {interpreter.name}
                        </div>
                        <div className="ism-meta">
                          <span className={`ism-role-badge ${interpreter.role === 'GlobalInterpreter' ? 'ism-global' : 'ism-booth'}`}>
                            {interpreter.role === 'GlobalInterpreter' ? 'Global' : 'Booth'}
                          </span>
                          <span 
                            className="ism-availability-badge"
                            style={{ 
                              backgroundColor: `${statusInfo.color}20`,
                              color: statusInfo.color,
                              borderColor: statusInfo.color
                            }}
                          >
                            <MdCircle size={8} style={{ marginRight: '4px' }} />
                            {statusInfo.label}
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
                  );
                })}
              </div>

              {/* No available interpreters message */}
              {!interpreters.some(i => canInviteInterpreter(i)) && (
                <div className="ism-no-available-notice">
                  <p>No interpreters are currently available to invite.</p>
                  <p>Please wait for an interpreter to set their status to "Online".</p>
                </div>
              )}
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
