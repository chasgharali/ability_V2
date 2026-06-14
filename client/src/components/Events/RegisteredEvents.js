import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from 'react-helmet-async';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import PageInstructionBanner from '../common/PageInstructionBanner';
import '../Dashboard/Dashboard.css';
import './RegisteredEvents.css';
import { listRegisteredEvents } from '../../services/events';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisteredEvents() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState([]);
  const [selectedOrganization, setSelectedOrganization] = useState('all');
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    (async () => {
      try {
        const res = await listRegisteredEvents({ page: 1, limit: 50 });
        const registered = res?.events || [];
        // Hide the permanent demo event from the registered events list
        const filtered = registered.filter(
          e => !(e?.isDemo || e?.slug === 'demonstration')
        );
        setEvents(filtered);
      } finally {
        setFetching(false);
      }
    })();
  }, [loading, user]);

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.toLocaleDateString('en-US', { day: 'numeric' });
    const year = date.toLocaleDateString('en-US', { year: 'numeric' });
    const time = date.toLocaleString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${month} ${day}, ${year}, ${time}`;
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    if (now < start) return { text: 'Upcoming', color: '#3b82f6' };
    if (now > end) return { text: 'Closed', color: '#6b7280' };
    return { text: 'Active', color: '#10b981' };
  };

  const organizationFilterOptions = useMemo(() => {
    const map = new Map();
    events.forEach((evt) => {
      const name = evt?.organization?.name?.trim();
      if (!name) return;
      const key = name.toLowerCase();
      if (!map.has(key)) {
        map.set(key, name);
      }
    });

    return Array.from(map.entries())
      .map(([value, label]) => ({ value, label }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [events]);

  const hasEventsWithoutOrganization = useMemo(
    () => events.some((evt) => !evt?.organization?.name),
    [events]
  );

  const filteredEvents = useMemo(() => {
    if (selectedOrganization === 'all') return events;
    if (selectedOrganization === '__none__') {
      return events.filter((evt) => !evt?.organization?.name);
    }
    return events.filter(
      (evt) => (evt?.organization?.name || '').trim().toLowerCase() === selectedOrganization
    );
  }, [events, selectedOrganization]);

  if (loading) return null;
  if (!user) return null;

  return (
    <>
      <Helmet>
        <title>Current Registrations - abilityconnect</title>
      </Helmet>
      <div className="dashboard">
        <a href="#main-content" className="skip-link">Skip to main content</a>
        <AdminHeader />
        <div className="dashboard-layout">
          <AdminSidebar active="events" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="Current Registrations - main content">
          <div className="dashboard-content">
            <PageInstructionBanner screen="registered-events" />
            <div className="registered-events-container">
              <header className="registered-events-header">
                <h1>My Current Registrations</h1>
                <p className="subtitle">
                  {filteredEvents.length > 0
                    ? `You are registered for ${filteredEvents.length} ${filteredEvents.length === 1 ? 'event' : 'events'}`
                    : 'Manage your job fair registrations'
                  }
                </p>
                {!fetching && events.length > 0 && (
                  <div className="organization-filter-row">
                    <label htmlFor="registered-organization-filter" className="organization-filter-label">
                      Organization
                    </label>
                    <select
                      id="registered-organization-filter"
                      className="organization-filter-select"
                      value={selectedOrganization}
                      onChange={(e) => setSelectedOrganization(e.target.value)}
                      aria-label="Filter registered events by organization"
                    >
                      <option value="all">All Organizations</option>
                      {organizationFilterOptions.map((org) => (
                        <option key={org.value} value={org.value}>
                          {org.label}
                        </option>
                      ))}
                      {hasEventsWithoutOrganization && (
                        <option value="__none__">No Organization</option>
                      )}
                    </select>
                  </div>
                )}
              </header>

              {fetching && (
                <div className="loading-state" role="status" aria-live="polite">
                  <div className="loading-spinner" aria-hidden="true"></div>
                  <p className="loading-text">Loading your registrations...</p>
                </div>
              )}

              {!fetching && filteredEvents.length === 0 && (
                <div className="empty-state" role="status">
                  <div className="empty-state-icon" aria-hidden="true">📋</div>
                  <h2>{events.length === 0 ? 'No Registrations Yet' : 'No Matching Registrations'}</h2>
                  <p>
                    {events.length === 0
                      ? "You haven't registered for any job fairs. Browse available events to get started."
                      : 'No registered events match the selected organization.'}
                  </p>
                  {events.length === 0 && (
                    <button
                      className="btn-browse-events"
                      onClick={() => navigate('/events')}
                      aria-label="Browse available job fairs"
                    >
                      Browse Job Fairs
                    </button>
                  )}
                </div>
              )}

              {!fetching && filteredEvents.length > 0 && (
                <ul className="events-grid" aria-label="Your registered job fairs">
                  {filteredEvents.map(evt => {
                    const status = getEventStatus(evt);
                    return (
                      <li key={evt._id} className="event-card">
                        <div className="event-card-header">
                          <div className="event-card-title">
                            <h2>{evt.name}</h2>
                          </div>
                          <span
                            className="registration-status-badge"
                            aria-label="Registration status: Registered"
                          >
                            ✓ Registered
                          </span>
                        </div>

                        {evt.description && (
                          <div 
                            className="event-description" 
                            dangerouslySetInnerHTML={{ __html: evt.description }}
                          />
                        )}

                        <div className="event-card-bottom">
                          <div className="event-details-grid">
                            <div className="event-detail-item">
                              <span className="event-detail-label">Opens</span>
                              <div className="event-detail-value date-time">
                                <span className="icon" aria-hidden="true">📅</span>
                                <time dateTime={evt.start}>{formatDate(evt.start)}</time>
                              </div>
                            </div>
                            <div className="event-detail-item">
                              <span className="event-detail-label">Closes</span>
                              <div className="event-detail-value date-time">
                                <span className="icon" aria-hidden="true">🕐</span>
                                <time dateTime={evt.end}>{formatDate(evt.end)}</time>
                              </div>
                            </div>
                            {evt.location && (
                              <div className="event-detail-item">
                                <span className="event-detail-label">Location</span>
                                <div className="event-detail-value">
                                  <span className="icon" aria-hidden="true">📍</span>
                                  {evt.location}
                                </div>
                              </div>
                            )}
                            {evt.eventType && (
                              <div className="event-detail-item">
                                <span className="event-detail-label">Type</span>
                                <div className="event-detail-value">{evt.eventType}</div>
                              </div>
                            )}
                          </div>

                          <div className="event-card-footer">
                            <div className="event-meta" aria-label="Event metadata">
                              {evt.status && (
                                <div className="event-meta-item">
                                  <span className="icon" aria-hidden="true">🎯</span>
                                  <span>Status: {status.text}</span>
                                </div>
                              )}
                              <div className="event-meta-item">
                                <span className="icon" aria-hidden="true">🏢</span>
                                <span>{evt.boothCount || 0} Booths</span>
                              </div>
                              {evt.organization && (
                                <div className="event-meta-item">
                                  {evt.organization.logoUrl && (
                                    <img
                                      src={evt.organization.logoUrl}
                                      alt={evt.organization.logoAltText || evt.organization.name}
                                      style={{ height: '20px', width: 'auto', marginRight: '6px', verticalAlign: 'middle' }}
                                    />
                                  )}
                                  <span>Organized by: <strong>{evt.organization.name}</strong></span>
                                </div>
                              )}
                            </div>

                            <div className="event-actions">
                              <button 
                                className="btn-view-event"
                                onClick={() => navigate(`/event/${encodeURIComponent(evt.slug)}`)}
                                aria-label={`View details and explore ${evt.name}`}
                              >
                                <span aria-hidden="true">🎪</span>
                                View Job Fair
                              </button>
                            </div>
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
    </>
  );
}
