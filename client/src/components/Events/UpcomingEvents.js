import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './UpcomingEvents.css';
import { listUpcomingEvents, listRegisteredEvents } from '../../services/events';
import { useAuth } from '../../contexts/AuthContext';

export default function UpcomingEvents() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState([]);
  const [fetching, setFetching] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (!user) return;
    (async () => {
      try {
        // Fetch both upcoming and registered events
        const [upcomingRes, registeredRes] = await Promise.all([
          listUpcomingEvents({ page: 1, limit: 50 }),
          listRegisteredEvents({ page: 1, limit: 50 })
        ]);

        const upcoming = upcomingRes?.events || [];
        const registered = registeredRes?.events || [];

        // Filter out events user is already registered for
        const registeredSlugs = new Set(registered.map(e => e.slug));
        const filteredUpcoming = upcoming
          .filter(e => !registeredSlugs.has(e.slug))
          // Exclude the permanent demo event from the Upcoming Events list
          .filter(e => !(e?.isDemo || e?.slug === 'demonstration'));

        setEvents(filteredUpcoming);
      } finally {
        setFetching(false);
      }
    })();
  }, [loading, user]);

  if (loading) return null;
  if (!user) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    const day = date.toLocaleDateString('en-US', { day: 'numeric' });
    const year = date.toLocaleDateString('en-US', { year: 'numeric' });
    const hours = date.getHours();
    const minutes = date.getMinutes();
    const period = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    return `${month} ${day}, ${year}, ${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`;
  };

  const getEventStatus = (event) => {
    if (event.isDemo) {
      return { text: 'Demo', color: '#6366f1', className: 'demo' };
    }

    const now = new Date();
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    if (now < start) return { text: 'Upcoming', color: '#3b82f6', className: 'upcoming' };
    if (now > end) return { text: 'Closed', color: '#6b7280', className: 'closed' };
    return { text: 'Active', color: '#10b981', className: 'active' };
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="upcoming-events-container">
              <header className="upcoming-events-header">
                <h1>Upcoming Events</h1>
                <p className="subtitle">
                  {events.length > 0 
                    ? `${events.length} upcoming ${events.length === 1 ? 'event' : 'events'} available`
                    : 'No upcoming job fairs at the moment'
                  }
                </p>
              </header>

              {fetching && (
                <div className="loading-state" role="status" aria-live="polite">
                  <div className="loading-spinner" aria-hidden="true"></div>
                  <p className="loading-text">Loading upcoming events...</p>
                </div>
              )}

              {!fetching && events.length === 0 && (
                <div className="empty-state" role="status">
                  <div className="empty-state-icon" aria-hidden="true">📅</div>
                  <h3>No Upcoming Events</h3>
                  <p>Check back soon for new job fair opportunities.</p>
                </div>
              )}

              {!fetching && events.length > 0 && (
                <ul className="events-grid" aria-label="Upcoming job fairs">
                  {events.map(evt => {
                    const status = getEventStatus(evt);
                    return (
                      <li key={evt._id} className="event-card">
                        <div className="event-card-header">
                          <div className="event-card-title">
                            <h3>{evt.name}</h3>
                            <span className="event-slug" aria-label="Event identifier">{evt.slug}</span>
                          </div>
                          <span 
                            className={`event-status-badge ${status.className}`}
                            aria-label={`Event status: ${status.text}`}
                          >
                            {status.text}
                          </span>
                        </div>

                        {evt.description && (
                          <div 
                            className="event-description" 
                            dangerouslySetInnerHTML={{ __html: evt.description }}
                          />
                        )}

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

                        <div className="event-meta" aria-label="Event metadata">
                          <div className="event-meta-item">
                            <span className="icon" aria-hidden="true">🎯</span>
                            <span>Status: {status.text}</span>
                          </div>
                          <div className="event-meta-item">
                            <span className="icon" aria-hidden="true">🏢</span>
                            <span>{evt.boothCount || 0} Booths</span>
                          </div>
                        </div>

                        <div className="event-actions">
                          <button 
                            className="btn-view-event"
                            onClick={() => navigate(`/event/${encodeURIComponent(evt.slug || evt._id)}`)}
                            aria-label={`View details for ${evt.name}`}
                          >
                            <span aria-hidden="true">ℹ️</span>
                            View Details
                          </button>
                          <button 
                            className="btn-register-event"
                            onClick={() => navigate(`/event/${encodeURIComponent(evt.slug || evt._id)}/register`)}
                            aria-label={`Register for ${evt.name}`}
                          >
                            <span aria-hidden="true">✓</span>
                            Register
                          </button>
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
  );
}
