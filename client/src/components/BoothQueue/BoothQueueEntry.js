import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { interpreterCategoriesAPI } from '../../services/interpreterCategories';
import { boothQueueAPI } from '../../services/boothQueue';
import './BoothQueueEntry.css';

export default function BoothQueueEntry() {
  const { eventSlug, boothId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [booth, setBooth] = useState(null);
  const [interpreterCategories, setInterpreterCategories] = useState([]);
  const [selectedInterpreter, setSelectedInterpreter] = useState('none');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, [eventSlug, boothId]);

  const loadData = async () => {
    try {
      setLoading(true);
      
      // Load event, booth, and interpreter categories
      const [eventRes, boothRes, interpreterRes] = await Promise.all([
        fetch(`/api/events/slug/${eventSlug}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        fetch(`/api/booths/${boothId}`, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        }),
        interpreterCategoriesAPI.getActive()
      ]);

      const eventData = await eventRes.json();
      const boothData = await boothRes.json();

      if (eventData.success) setEvent(eventData.event);
      if (boothData.success) setBooth(boothData.booth);
      if (interpreterRes.success) setInterpreterCategories(interpreterRes.categories);

    } catch (error) {
      console.error('Error loading data:', error);
      setError('Failed to load event and booth information');
    } finally {
      setLoading(false);
    }
  };

  const handleJoinQueue = async () => {
    if (!agreedToTerms) {
      setError('Please agree to the Terms of Use and Privacy Policy');
      return;
    }

    try {
      setJoining(true);
      setError('');

      const queueData = {
        eventId: event._id,
        boothId: booth._id,
        interpreterCategory: selectedInterpreter !== 'none' ? selectedInterpreter : null,
        agreedToTerms: true
      };

      const response = await boothQueueAPI.joinQueue(queueData);
      
      if (response.success) {
        // Navigate to waiting area with queue token
        navigate(`/booth-queue/${eventSlug}/${boothId}/waiting`, {
          state: { queueToken: response.queueToken, queuePosition: response.position }
        });
      } else {
        setError(response.message || 'Failed to join queue');
      }
    } catch (error) {
      console.error('Error joining queue:', error);
      setError(error.response?.data?.message || 'Failed to join queue');
    } finally {
      setJoining(false);
    }
  };

  const handleExit = () => {
    navigate(`/events/registered/${eventSlug}`);
  };

  if (loading) {
    return (
      <div className="booth-queue-entry">
        <div className="loading-container">
          <div className="loading-spinner"></div>
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="booth-queue-entry">
        <div className="error-container">
          <h2>Error</h2>
          <p>{error}</p>
          <button onClick={handleExit} className="btn-exit">
            Return to Event
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="booth-queue-entry">
      <div className="entry-modal">
        <div className="modal-header">
          <h1 className="event-title">{event?.name || 'Event'}</h1>
          <div className="event-logo">
            {event?.logo && (
              <img src={event.logo} alt={`${event.name} logo`} />
            )}
          </div>
        </div>

        <div className="booth-info">
          <div className="booth-logo">
            {booth?.companyLogo && (
              <img src={booth.companyLogo} alt={`${booth.company} logo`} />
            )}
          </div>
          <div className="booth-details">
            <h2>{booth?.company || 'Company'}</h2>
            <p>{booth?.description}</p>
          </div>
        </div>

        <div className="interpreter-selection">
          <label htmlFor="interpreter-select">
            Choose sign language interpreter for <span className="required">Deaf & non-verbal *</span>
          </label>
          <select
            id="interpreter-select"
            value={selectedInterpreter}
            onChange={(e) => setSelectedInterpreter(e.target.value)}
            className="interpreter-dropdown"
          >
            <option value="none">none</option>
            {interpreterCategories.map(category => (
              <option key={category._id} value={category._id}>
                {category.name} ({category.code})
              </option>
            ))}
          </select>
        </div>

        <div className="terms-agreement">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={agreedToTerms}
              onChange={(e) => setAgreedToTerms(e.target.checked)}
            />
            <span>I agree to </span>
            <a href="/terms-of-use" target="_blank" rel="noopener noreferrer">
              Terms of Use
            </a>
            <span> and </span>
            <a href="/privacy-policy" target="_blank" rel="noopener noreferrer">
              Privacy Policy
            </a>
            <span className="required"> *</span>
          </label>
        </div>

        {error && (
          <div className="error-message">
            {error}
          </div>
        )}

        <div className="modal-actions">
          <button
            onClick={handleJoinQueue}
            disabled={joining || !agreedToTerms}
            className="btn-join"
          >
            {joining ? 'Joining...' : 'Join'}
          </button>
          <button
            onClick={handleExit}
            className="btn-exit"
          >
            Exit
          </button>
        </div>
      </div>
    </div>
  );
}
