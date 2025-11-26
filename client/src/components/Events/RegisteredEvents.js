import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './RegisteredEvents.css';
import { listRegisteredEvents } from '../../services/events';
import { useAuth } from '../../contexts/AuthContext';

export default function RegisteredEvents() {
  const { user, loading } = useAuth();
  const [events, setEvents] = useState([]);
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

  if (loading) return null;
  if (!user) return null;

  const formatDate = (dateString) => {
    if (!dateString) return 'Not specified';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', { 
      month: 'short', 
      day: 'numeric', 
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getEventStatus = (event) => {
    const now = new Date();
    const start = new Date(event.start);
    const end = new Date(event.end);
    
    if (now < start) return { text: 'Upcoming', color: '#3b82f6' };
    if (now > end) return { text: 'Closed', color: '#6b7280' };
    return { text: 'Active', color: '#10b981' };
  };

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main" tabIndex={-1}>
          <div className="dashboard-content">
            <div className="registered-events-container">
              <header className="registered-events-header">
                <h1>My Current Registrations</h1>
                <p className="subtitle">
                  {events.length > 0 
                    ? `You are registered for ${events.length} ${events.length === 1 ? 'event' : 'events'}`
                    : 'Manage your job fair registrations'
                  }
                </p>
              </header>

              {fetching && (
                <div className="loading-state" role="status" aria-live="polite">
                  <div className="loading-spinner" aria-hidden="true"></div>
                  <p className="loading-text">Loading your registrations...</p>
                </div>
              )}

              {!fetching && events.length === 0 && (
                <div className="empty-state" role="status">
                  <div className="empty-state-icon" aria-hidden="true">📋</div>
                  <h3>No Registrations Yet</h3>
                  <p>You haven't registered for any job fairs. Browse available events to get started.</p>
                  <button 
                    className="btn-browse-events"
                    onClick={() => navigate('/events')}
                    aria-label="Browse available job fairs"
                  >
                    Browse Job Fairs
                  </button>
                </div>
              )}

              {!fetching && events.length > 0 && (
                <ul className="events-grid" aria-label="Your registered job fairs">
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
                            className="registration-status-badge"
                            style={{ background: `${status.color}15`, color: status.color }}
                            aria-label={`Event status: ${status.text}`}
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
