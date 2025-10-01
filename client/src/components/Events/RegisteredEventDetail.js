import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './RegisteredEventDetail.css';
import { getEvent, getEventBooths } from '../../services/events';
import { jobSeekerInterestsAPI } from '../../services/jobSeekerInterests';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisteredEventDetail() {
  const { slug } = useParams();
  const { user, loading } = useAuth();
  const [event, setEvent] = useState(null);
  const [booths, setBooths] = useState([]);
  const [interests, setInterests] = useState({});
  const [fetching, setFetching] = useState(true);
  const [savingInterest, setSavingInterest] = useState({});
  const navigate = useNavigate();

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
          
          // Fetch existing interests
          try {
            const interestsRes = await jobSeekerInterestsAPI.getMyInterests(evt._id);
            const interestMap = {};
            interestsRes.interests?.forEach(interest => {
              interestMap[interest.booth._id] = interest;
            });
            setInterests(interestMap);
          } catch (error) {
            console.warn('Failed to fetch interests:', error);
          }
        }
      } finally {
        setFetching(false);
      }
    })();
  }, [slug, loading]);

  const handleInterestToggle = async (booth) => {
    if (!event || !user) return;
    
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
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="my-current-registrations" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            {fetching && <div>Loading…</div>}
            {!fetching && !event && <div>Event not found.</div>}
            {!fetching && event && (
              <>
                {/* Title */}
                <h1 className="registered-event-title">
                  You are registered for {event.name}
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
                          {event.start ? new Date(event.start).toLocaleDateString(undefined, { 
                            weekday: 'long', 
                            month: 'long', 
                            day: 'numeric', 
                            year: 'numeric' 
                          }) : '-'}
                        </span>
                      </div>
                      <div className="datetime-item">
                        <span className="datetime-label">Time:</span>
                        <span className="datetime-value">
                          {event.start ? new Date(event.start).toLocaleTimeString([], { 
                            hour: 'numeric', 
                            minute: '2-digit' 
                          }) : '-'} - {event.end ? new Date(event.end).toLocaleTimeString([], { 
                            hour: 'numeric', 
                            minute: '2-digit' 
                          }) : '-'}
                        </span>
                      </div>
                    </div>
                    {event.logoUrl && (
                      <img 
                        src={event.logoUrl} 
                        alt={`${event.name} logo`} 
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
                                        alt={`${booth.name} logo`} 
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
                                        alt={`${booth.name} logo`} 
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
                                    disabled={isSaving}
                                    className="interest-checkbox"
                                  />
                                  <span className="checkbox-custom"></span>
                                  <span className="checkbox-text">
                                    {isSaving ? 'Saving...' : "I'm interested"}
                                  </span>
                                </label>
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
                  <a 
                    href={`/event/${encodeURIComponent(event.slug || event._id)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="ajf-btn ajf-btn-dark"
                    aria-label={`Go to ${event.name} event page (opens in new tab)`}
                  >
                    Go To Event
                  </a>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
