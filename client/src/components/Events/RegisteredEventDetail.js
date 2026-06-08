import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './RegisteredEventDetail.css';
import { getEvent, getEventBooths } from '../../services/events';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { useAuth } from '../../contexts/AuthContext';
import { announceToScreenReader } from '../Accessibility/FocusManager';

export default function RegisteredEventDetail() {
  const { slug } = useParams();
  const [searchParams] = useSearchParams();
  const isPreview = searchParams.get('preview') === '1';
  const { user, loading } = useAuth();
  const [event, setEvent] = useState(null);
  const [booths, setBooths] = useState([]);
  const [interests, setInterests] = useState({});
  const [fetching, setFetching] = useState(true);
  const [savingInterest, setSavingInterest] = useState({});
  const navigate = useNavigate();
  const mainContentRef = useRef(null);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const res = await getEvent(slug);
        const evt = res?.event || null;
        setEvent(evt);
        
        if (evt?._id) {
          // Fetch booths
          const boothsRes = await getEventBooths(evt._id);
          const eventBooths = boothsRes?.booths || [];
          setBooths(eventBooths);
          
          // Fetch existing interests (only for JobSeekers)
          if (user?.role === 'JobSeeker') {
            try {
              const interestsRes = await jobSeekerInterestsAPI.getMyInterests(evt._id);
              const interestMap = {};
              interestsRes.interests?.forEach(interest => {
                interestMap[interest.booth._id] = interest;
              });
              setInterests(interestMap);
            } catch (error) {
              // Only log if it's not a 403 (forbidden) error, as that's expected for non-JobSeekers
              if (error.response?.status !== 403) {
                console.warn('Failed to fetch interests:', error);
              }
            }
          }
        }
      } catch (error) {
        // A 404 simply means the event slug/id doesn't exist; render the
        // "Event not found" state rather than crashing with an unhandled
        // rejection (which triggers the dev error overlay).
        if (error.response?.status !== 404) {
          console.error('Failed to load registered event:', error);
        }
        setEvent(null);
      } finally {
        setFetching(false);
      }
    })();
  }, [slug, loading, user]);

  // Announce the real event title once data loads so JAWS/NVDA speak the
  // correct page context (GlobalRouteObserver fires before the API call resolves).
  useEffect(() => {
    if (event?.name) {
      announceToScreenReader(`You are registered for ${event.name} - abilityconnect`);
    }
  }, [event?.name]);

  const handleInterestToggle = async (booth) => {
    if (!event || !user || user.role !== 'JobSeeker') return;
    
    const boothId = booth._id;
    setSavingInterest(prev => ({ ...prev, [boothId]: true }));
    
    try {
      const currentInterest = interests[boothId];
      const newInterestState = !currentInterest?.isInterested;
      
      const interestData = {
        eventId: event._id,
        boothId: boothId,
        company: booth.name,
        companyLogo: booth.logoUrl,
        isInterested: newInterestState,
        interestLevel: 'medium'
      };
      
      const response = await jobSeekerInterestsAPI.createOrUpdateInterest(interestData);
      
      if (response.success) {
        setInterests(prev => ({
          ...prev,
          [boothId]: {
            ...response.interest,
            booth: { _id: boothId }
          }
        }));
      }
    } catch (error) {
      console.error('Failed to update interest:', error);
      // Could show toast notification here
    } finally {
      setSavingInterest(prev => ({ ...prev, [boothId]: false }));
    }
  };

  if (loading) return null;

  return (
    <div className="dashboard">
      <a href="#main-content" className="skip-link">Skip to main content</a>
      <Helmet>
        <title>{event?.name ? (isPreview ? `Preview: ${event.name}` : `You are registered for ${event.name}`) : 'Registered Event'} - abilityconnect</title>
      </Helmet>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="my-current-registrations" />
        <main
          id="main-content"
          ref={mainContentRef}
          className="dashboard-main"
          tabIndex={-1}
          aria-label={event?.name ? `You are registered for ${event.name} - main content` : 'Registered event - main content'}
        >
          <div className="dashboard-content">
            {fetching && <div>Loading…</div>}
            {!fetching && !event && <div>Event not found.</div>}
            {!fetching && event && (
              <>
                {/* Preview-mode notice (admin viewing the job seeker page) */}
                {isPreview && (
                  <>
                    <div className="registered-event-actions" style={{ marginBottom: '1rem' }}>
                      <button
                        type="button"
                        className="ajf-btn ajf-btn-dark"
                        onClick={() => navigate('/eventmanagement')}
                        aria-label="Back to Event Management"
                      >
                        ← Back to Event Management
                      </button>
                    </div>
                    <div className="alert-box registered-event-banner" role="status" aria-live="polite">
                      <p><strong>Preview mode:</strong> This is how the registration page appears to a registered job seeker. Interactive actions (I'm interested, Join Queue) are disabled here.</p>
                    </div>
                  </>
                )}

                {/* Title */}
                <h1 className="registered-event-title">
                  {isPreview ? `Preview: ${event.name}` : `You are registered for ${event.name}`}
                </h1>

                {/* Registration confirmation banner */}
                <div className="alert-box registered-event-banner" role="status" aria-live="polite">
                  <p>Visit participating employers by clicking each employer link below. Be sure to alert employers of your interest by clicking the "I'm interested" box in the employer area.</p>
                </div>

                {/* Event details card */}
                <section className="registered-event-details" aria-labelledby="evt-info">
                  <div className="event-info-header">
                    <div className="event-datetime">
                      <div className="datetime-item">
                        <span className="datetime-label">Date:</span>
                        <span className="datetime-value">
                          {event.start ? (() => {
                            const d = new Date(event.start);
                            return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                          })() : '-'}
                        </span>
                      </div>
                      <div className="datetime-item">
                        <span className="datetime-label">Time:</span>
                        <span className="datetime-value">
                          {event.start ? (() => {
                            const d = new Date(event.start);
                            return d.toLocaleString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            });
                          })() : '-'} - {event.end ? (() => {
                            const d = new Date(event.end);
                            return d.toLocaleString('en-US', {
                              hour: 'numeric',
                              minute: '2-digit',
                              hour12: true
                            });
                          })() : '-'}
                        </span>
                      </div>
                    </div>
                    {event.logoUrl && (
                      <img 
                        src={event.logoUrl} 
                        alt={event.logoAltText || `${event.name} logo`} 
                        className="event-logo" 
                      />
                    )}
                  </div>

                  {/* Event information */}
                  <div className="event-description">
                    <h3 id="evt-info">Event Information</h3>
                    {event.description ? (
                      <div
                        className="event-description-content"
                        dangerouslySetInnerHTML={{ __html: event.description }}
                      />
                    ) : (
                      <p className="muted">This event is for testing purposes only.</p>
                    )}
                    <p className="muted">Please see test employers below.</p>
                  </div>

                  {/* Participating Employers Section */}
                  <div className="participating-employers">
                    <div className="section-divider">
                      <hr />
                      <span className="section-label">Participating Employers</span>
                      <hr />
                    </div>

                    <p className="employers-instruction">
                      ☑ Select the employers you are interested in meeting by checking their "I'm interested" box below. These selected employers will have access to your profile and resume.
                    </p>

                    {/* Employers grid */}
                    {booths.length === 0 ? (
                      <div className="alert-box">Employers will appear here when available.</div>
                    ) : (
                      <div className="employers-grid">
                        {booths.map((booth) => {
                          const boothLink = booth.companyPage || booth.link || booth.website || null;
                          const isInterested = interests[booth._id]?.isInterested || false;
                          const isSaving = savingInterest[booth._id] || false;
                          
                          return (
                            <div key={booth._id} className="employer-card">
                              <div className="employer-logo-container">
                                {boothLink ? (
                                  <a 
                                    href={boothLink} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    className="employer-logo-link"
                                    aria-label={`Visit ${booth.name} company page`}
                                  >
                                    {booth.logoUrl ? (
                                      <img 
                                        src={booth.logoUrl} 
                                        alt={booth.logoAltText || `${booth.name} logo`} 
                                        className="employer-logo"
                                      />
                                    ) : (
                                      <div className="employer-logo-placeholder">
                                        {booth.name.charAt(0)}
                                      </div>
                                    )}
                                  </a>
                                ) : (
                                  <>
                                    {booth.logoUrl ? (
                                      <img 
                                        src={booth.logoUrl} 
                                        alt={booth.logoAltText || `${booth.name} logo`} 
                                        className="employer-logo"
                                      />
                                    ) : (
                                      <div className="employer-logo-placeholder">
                                        {booth.name.charAt(0)}
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                              
                              <div className="employer-name">{booth.name}</div>
                              
                              <div className="employer-actions">
                                <label className="interest-checkbox-label">
                                  <input 
                                    type="checkbox" 
                                    checked={isInterested}
                                    onChange={() => handleInterestToggle(booth)}
                                    disabled={isSaving || isPreview}
                                    className="interest-checkbox"
                                  />
                                  <span className="checkbox-custom"></span>
                                  <span className="checkbox-text">
                                    {isSaving ? 'Saving...' : "I'm interested"}
                                  </span>
                                </label>
                                
                                <button
                                  className="join-queue-btn"
                                  disabled={isPreview}
                                  onClick={() => {
                                    if (isPreview) return;
                                    // Employer-page booths should always enter the queue flow.
                                    if (booth.waitingAreaMode === 'employerPage') {
                                      navigate(`/booth-queue/${event.slug}/${booth._id}/entry`);
                                      return;
                                    }

                                    // For non-employer-page booths, allow optional custom button link.
                                    const customLink = booth.joinBoothButtonLink;
                                    if (customLink) {
                                      // Check if it's an external URL
                                      if (customLink.startsWith('http://') || customLink.startsWith('https://')) {
                                        window.location.href = customLink;
                                      } else {
                                        // Internal path
                                        navigate(customLink);
                                      }
                                    } else {
                                      // Default behavior
                                      navigate(`/booth-queue/${event.slug}/${booth._id}/entry`);
                                    }
                                  }}
                                >
                                  Join Queue
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </section>

                {/* Bottom actions */}
                <div className="registered-event-actions">
                  {event.link ? (
                    <a 
                      href={event.link}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ajf-btn ajf-btn-dark"
                      aria-label={`Go to ${event.name} event page (opens in new tab)`}
                    >
                      Go To Event
                    </a>
                  ) : (
                    <button
                      className="ajf-btn ajf-btn-disabled"
                      disabled
                      aria-label="Event link not available"
                      style={{ cursor: 'not-allowed' }}
                    >
                      Event Link Not Available
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
