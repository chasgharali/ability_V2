import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import { interpreterCategoriesAPI } from '../../services/interpreterCategories';
import { boothQueueAPI } from '../../services/boothQueue';
import { legalPagesAPI } from '../../services/legalPages';
import { announceToScreenReader } from '../Accessibility/FocusManager';
import {
  isBoothClosed,
  isBoothLinkExpired,
  isEventEnded,
  formatAvailabilityDate
} from '../../utils/availability';
import './BoothQueueEntry.css';
import AdminHeader from '../Layout/AdminHeader';
import '../Dashboard/Dashboard.css';

/** Blocked states share one screen; the heading tells the job seeker which gate stopped them. */
const buildBlockedState = (event, booth) => {
  if (isBoothLinkExpired(booth)) {
    return {
      heading: 'Booth Link Expired',
      message: `This booth link expired on ${formatAvailabilityDate(booth.expireLinkTime)}. You are unable to join this queue.`
    };
  }
  if (isEventEnded(event)) {
    return {
      heading: 'Event Has Ended',
      message: `This event ended on ${formatAvailabilityDate(event.end)}. You are unable to join this queue.`
    };
  }
  if (isBoothClosed(booth)) {
    return {
      heading: 'Booth Closed',
      message: `This booth closed on ${formatAvailabilityDate(booth.closeTime)}. You are unable to join this queue.`
    };
  }
  return null;
};

const BLOCKED_HEADINGS_BY_ERROR_CODE = {
  BOOTH_EXPIRED: 'Booth Link Expired',
  EVENT_ENDED: 'Event Has Ended',
  BOOTH_CLOSED: 'Booth Closed'
};

export default function BoothQueueEntry() {
  const { eventSlug, boothId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [event, setEvent] = useState(null);
  const [booth, setBooth] = useState(null);
  const [interpreterCategories, setInterpreterCategories] = useState([]);
  const [selectedInterpreter, setSelectedInterpreter] = useState('none');
  const [selectedPosition, setSelectedPosition] = useState('');
  const [selectedLocation, setSelectedLocation] = useState('');
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const [blockedState, setBlockedState] = useState(null);
  const [legalLinks, setLegalLinks] = useState({ termsOfUse: null, privacyPolicy: null });

  const openPositions = useMemo(
    () => (Array.isArray(booth?.openPositions) ? booth.openPositions.filter(position => position?.title) : []),
    [booth]
  );
  const positionLocations = useMemo(() => {
    const match = openPositions.find(position => position.title === selectedPosition);
    return Array.isArray(match?.locations) ? match.locations.filter(Boolean) : [];
  }, [openPositions, selectedPosition]);
  const needsLocation = positionLocations.length > 0;
  const positionSelectionComplete = openPositions.length === 0
    || (!!selectedPosition && (!needsLocation || !!selectedLocation));

  // Reset the location whenever it no longer belongs to the selected position
  useEffect(() => {
    if (selectedLocation && !positionLocations.includes(selectedLocation)) {
      setSelectedLocation('');
    }
  }, [positionLocations, selectedLocation]);

  useEffect(() => {
    const boothName = booth?.name || 'Company';
    document.title = `${boothName} Entrance Form - abilityconnect`;
    if (booth?.name) {
      announceToScreenReader(`${booth.name} entrance form`);
    }
  }, [booth?.name]);

  useEffect(() => {
    loadData();
  }, [eventSlug, boothId]);

  useEffect(() => {
    const fetchLegalLinks = async () => {
      try {
        const [termsRes, privacyRes] = await Promise.allSettled([
          legalPagesAPI.getByType('terms-of-use'),
          legalPagesAPI.getByType('privacy-policy')
        ]);
        setLegalLinks({
          termsOfUse: termsRes.status === 'fulfilled' ? '/legal/terms-of-use' : null,
          privacyPolicy: privacyRes.status === 'fulfilled' ? '/legal/privacy-policy' : null
        });
      } catch {
        // Fall back to external links
      }
    };
    fetchLegalLinks();
  }, []);

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

      console.log('Event data:', eventData);
      console.log('Booth data:', boothData);

      // Handle different response structures
      let extractedEvent = null;
      let extractedBooth = null;

      if (eventData.event) {
        extractedEvent = eventData.event;
      } else if (eventData.success && eventData.data) {
        extractedEvent = eventData.data;
      } else if (eventData.name) {
        extractedEvent = eventData;
      }

      if (boothData.booth) {
        extractedBooth = boothData.booth;
      } else if (boothData.success && boothData.data) {
        extractedBooth = boothData.data;
      } else if (boothData.name) {
        extractedBooth = boothData;
      }

      console.log('Extracted event:', extractedEvent);
      console.log('Extracted booth:', extractedBooth);

      // Expired link, ended event, and closed booth all block joining
      const blocked = buildBlockedState(extractedEvent, extractedBooth);
      if (blocked) {
        setError(blocked.message);
        setBlockedState(blocked);
        setBooth(extractedBooth); // Still set booth for display purposes
        setEvent(extractedEvent);
        setLoading(false);
        return; // Stop loading, show error
      }

      setEvent(extractedEvent);
      setBooth(extractedBooth);

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

    if (!event || !booth) {
      setError('Event or booth information is not available. Please try refreshing the page.');
      return;
    }

    if (openPositions.length > 0 && !selectedPosition) {
      setError('Please select the position you are applying for');
      return;
    }

    if (needsLocation && !selectedLocation) {
      setError('Please select a location for the selected position');
      return;
    }

    try {
      setJoining(true);
      setError('');

      const queueData = {
        eventId: event._id,
        boothId: booth._id,
        interpreterCategory: selectedInterpreter !== 'none' ? selectedInterpreter : null,
        appliedPosition: selectedPosition,
        appliedLocation: selectedLocation,
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
      const data = error.response?.data;
      const message = data?.message || 'Failed to join queue';
      setError(message);
      const heading = BLOCKED_HEADINGS_BY_ERROR_CODE[data?.error];
      if (heading) {
        setBlockedState({ heading, message });
      }
    } finally {
      setJoining(false);
    }
  };

  const handleExit = () => {
    // Don't leave queue on exit from entry form - user hasn't joined yet
    // Clear any localStorage data for this booth to prevent restoration logic from triggering
    try {
      
      localStorage.removeItem(`queuePos_${boothId}`);
      localStorage.removeItem(`serving_${boothId}`);
      localStorage.removeItem(`queueToken_${boothId}`);
    } catch (e) {
      // Ignore localStorage errors
    }
    // Use eventSlug from URL params - same as how handleCallEnd and handleLeaveQueue work in BoothQueueWaiting
    // This ensures we navigate to the same event page the user came from
    if (!eventSlug) {
      console.error('Cannot navigate: eventSlug is missing from URL params');
      navigate('/events/registered', { replace: true });
      return;
    }
    // Navigate exactly like handleCallEnd does - no replace, just direct navigation
    navigate(`/events/registered/${eventSlug}`);
  };

  if (loading) {
    return (
      <div className="booth-queue-entry">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <main id="main-content" className="booth-queue-main" tabIndex={-1} aria-label="Booth queue entry content">
          <div className="loading-container">
            <div className="loading-spinner"></div>
            <p>Loading...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error && !event) {
    return (
      <div className="booth-queue-entry">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <main id="main-content" className="booth-queue-main" tabIndex={-1} aria-label="Booth queue entry content">
          <div className="error-container">
            <h2>Error</h2>
            <p>{error}</p>
            <button onClick={handleExit} className="btn-exit">
              Return to Event
            </button>
          </div>
        </main>
      </div>
    );
  }

  // Show error screen when the link expired, the event ended, or the booth closed
  if (blockedState) {
    return (
      <div className="booth-queue-entry">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AdminHeader brandingLogo={event?.logoUrl || ''} brandingLogoAlt={event?.logoAltText || ''} />
        <main id="main-content" className="booth-queue-main" tabIndex={-1} aria-label="Booth queue entry content">
          <div className="entry-modal">
            <div className="modal-header">
              <div className="booth-entrance-row">
                <div className="company-logo">
                  {booth?.logoUrl ? (
                    <img src={booth.logoUrl} alt={`${booth?.name || 'Company'} logo`} />
                  ) : (
                    <div className="logo-placeholder">
                      <span className="logo-text">{booth?.name?.[0] || 'C'}</span>
                    </div>
                  )}
                </div>
                <h1 className="booth-entrance-text">
                  <span className="booth-entrance-label">Booth Entrance</span>
                  <span className="booth-company-name">{booth?.name || 'Company'}</span>
                </h1>
              </div>
              <h2 className="event-name">{event?.name || 'ABILITY Job Fair'}</h2>
            </div>
            <div className="divider" />
            <div className="error-container" role="alert" style={{ 
              background: '#ffe8e8', 
              borderColor: '#f5c2c7', 
              color: '#842029',
              padding: '1.5rem',
              borderRadius: '8px',
              margin: '1rem 0',
              textAlign: 'center'
            }}>
              <h2 style={{ margin: '0 0 0.75rem 0', fontSize: '1.25rem' }}>{blockedState.heading}</h2>
              <p style={{ margin: 0 }}>{blockedState.message}</p>
            </div>
            <div className="modal-actions">
              <button onClick={handleExit} className="btn-exit">
                Return to Event
              </button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="booth-queue-entry">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      {/* Standard header with user status; override branding with event logo */}
      <AdminHeader brandingLogo={event?.logoUrl || ''} brandingLogoAlt={event?.logoAltText || ''} />

      <main id="main-content" className="booth-queue-main" tabIndex={-1} aria-label="Booth queue entry content">
        <div className="entry-modal">
          <div className="modal-header">
            <div className="booth-entrance-row">
              <div className="company-logo">
                {booth?.logoUrl ? (
                  <img src={booth.logoUrl} alt={`${booth?.name || 'Company'} logo`} />
                ) : (
                  <div className="logo-placeholder">
                    <span className="logo-text">{booth?.name?.[0] || 'C'}</span>
                  </div>
                )}
              </div>
              <h1 className="booth-entrance-text">
                <span className="booth-entrance-label">Booth Entrance</span>
                <span className="booth-company-name">{booth?.name || 'Company'}</span>
              </h1>
            </div>
            <h2 className="event-name">{event?.name || 'ABILITY Job Fair'}</h2>
          </div>
  
          <div className="divider" />

          {openPositions.length > 0 && (
            <>
              <div className="interpreter-selection">
                <label htmlFor="position-select">
                  Position you are applying for <span className="required-indicator">*</span>
                </label>
                <select
                  id="position-select"
                  value={selectedPosition}
                  onChange={(e) => {
                    setSelectedPosition(e.target.value);
                    setSelectedLocation('');
                  }}
                  className="interpreter-dropdown"
                  required
                >
                  <option value="">Select a position</option>
                  {openPositions.map((position) => (
                    <option key={position._id || position.title} value={position.title}>
                      {position.title}
                    </option>
                  ))}
                </select>
              </div>

              {needsLocation && (
                <div className="interpreter-selection">
                  <label htmlFor="position-location-select">
                    Location <span className="required-indicator">*</span>
                  </label>
                  <select
                    id="position-location-select"
                    value={selectedLocation}
                    onChange={(e) => setSelectedLocation(e.target.value)}
                    className="interpreter-dropdown"
                    required
                  >
                    <option value="">Select a location</option>
                    {positionLocations.map((location) => (
                      <option key={location} value={location}>
                        {location}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}

          <div className="interpreter-selection">
            <label htmlFor="interpreter-select">
              Choose sign language interpreter for <span className="booth-required-text">Deaf & non-verbal <span className="required-indicator">*</span></span>
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
              <a
                href={legalLinks.termsOfUse || 'https://abilityjobfair.org/terms-of-use/'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Terms of Use (opens in new tab)"
              >
                Terms of Use
              </a>
              <span> and </span>
              <a
                href={legalLinks.privacyPolicy || 'https://abilityjobfair.org/privacy-policy/'}
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Privacy Policy (opens in new tab)"
              >
                Privacy Policy
              </a>
              <span className="required-indicator"> *</span>
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
              disabled={joining || !agreedToTerms || !positionSelectionComplete}
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
      </main>
    </div>
  );
}
