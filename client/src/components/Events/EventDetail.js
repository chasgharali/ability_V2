import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import { getEvent, getEventBooths, listRegisteredEvents } from '../../services/events';
import { useAuth } from '../../contexts/AuthContext';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';

export default function EventDetail() {
  const { slug } = useParams();
  const { user, loading } = useAuth();
  const { getMessage } = useRoleMessages();
  const [event, setEvent] = useState(null);
  const [booths, setBooths] = useState([]);
  const [fetching, setFetching] = useState(true);
  const [serverIsRegistered, setServerIsRegistered] = useState(false);
  const registrationInstruction = getMessage('event-registration', 'registration-instruction') || '';
  const navigate = useNavigate();

  // Determine if current user is already registered for this event
  // Use server-side verification as primary source, fallback to client metadata
  const isRegistered = useMemo(() => {
    if (!user || !event) return false;
    
    // Primary: Use server-side verification if available
    if (serverIsRegistered !== null) {
      return serverIsRegistered;
    }
    
    // Fallback: Use client-side metadata
    const regs = user.metadata?.registeredEvents || [];
    return regs.some(r => (
      (r.id && event._id && r.id.toString() === event._id.toString()) ||
      (r.slug && event.slug && r.slug === event.slug)
    ));
  }, [user, event, serverIsRegistered]);

  useEffect(() => {
    if (loading) return;
    (async () => {
      try {
        const res = await getEvent(slug);
        const evt = res?.event || null;
        setEvent(evt);
        if (evt?._id) {
          const b = await getEventBooths(evt._id);
          setBooths(b?.booths || []);
        }

        // Also verify registration status from server
        try {
          const regRes = await listRegisteredEvents({ page: 1, limit: 100 });
          const regs = regRes?.events || [];
          const match = regs.some(e => (
            (evt?._id && e._id && String(e._id) === String(evt._id)) ||
            (evt?.slug && e.slug && e.slug === evt.slug)
          ));
          setServerIsRegistered(match);
        } catch (e) {
          // ignore, fallback to client metadata
          setServerIsRegistered(false);
        }
      } finally {
        setFetching(false);
      }
    })();
  }, [slug, loading]);


  if (loading) return null;

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            {fetching && <div>Loading…</div>}
            {!fetching && !event && <div>Event not found.</div>}
            {!fetching && event && (
              <>
                {/* Title */}
                <h1 style={{ textAlign: 'center', textTransform: 'uppercase', letterSpacing: 0.5 }}>{event.name}</h1>

                {/* Banner note */}
                {!isRegistered && registrationInstruction && (
                  <div className="alert-box" role="status" aria-live="polite" style={{ maxWidth: 860, margin: '0 auto 16px' }}>
                    <p>{registrationInstruction}</p>
                  </div>
                )}
                {isRegistered && (
                  <div className="alert-box" role="status" aria-live="polite" style={{ maxWidth: 860, margin: '0 auto 16px' }}>
                    <p>You are registered for this event. You can manage your registration and mark employer interest below.</p>
                  </div>
                )}

                {/* Content card */}
                <section aria-labelledby="evt-info" style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: 8, padding: 16, maxWidth: 860, margin: '0 auto' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                    <dl style={{ margin: 0 }} aria-label="Event date and time">
                      <div style={{ marginBottom: 6 }}>
                        <dt style={{ fontWeight: 700, display: 'inline' }}>Date: </dt>
                        <dd style={{ display: 'inline', marginInlineStart: 4 }}>{event.start ? (() => {
                          const d = new Date(event.start);
                          return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
                        })() : '-'}</dd>
                      </div>
                      <div>
                        <dt style={{ fontWeight: 700, display: 'inline' }}>Time: </dt>
                        <dd style={{ display: 'inline', marginInlineStart: 4 }}>{event.start ? (() => {
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
                        })() : '-'}</dd>
                      </div>
                    </dl>
                    {event.logoUrl && (
                      <img src={event.logoUrl} alt={`${event.name} logo`} style={{ height: 64, maxWidth: 260, objectFit: 'contain' }} />
                    )}
                  </div>

                  {/* Event information */}
                  <div style={{ marginTop: 16 }}>
                    <h3 id="evt-info" style={{ marginBottom: 8 }}>Event Information</h3>
                    {event.description ? (
                      <div
                        className="muted"
                        style={{ lineHeight: 1.6 }}
                        dangerouslySetInnerHTML={{ __html: event.description }}
                      />
                    ) : (
                      <p className="muted">Details will be provided soon.</p>
                    )}
                  </div>

                  {/* Divider with centered label */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8, marginTop: 16, color: '#374151' }}>
                    <hr style={{ border: 0, borderTop: '1px solid #d1d5db' }} />
                    <span style={{ fontWeight: 600, fontSize: 14 }}>Participating Employers</span>
                    <hr style={{ border: 0, borderTop: '1px solid #d1d5db' }} />
                  </div>

                  <p className="muted" style={{ marginTop: 12 }}>Visit Employers below for more information.</p>

                  {/* Employers grid */}
                  {booths.length === 0 ? (
                    <div className="alert-box" style={{ marginTop: 8 }}>Employers will appear here when available.</div>
                  ) : (
                    <ul aria-label="Participating employers" style={{ listStyle: 'none', padding: 0, margin: 0, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 12 }}>
                      {booths.map((b) => {
                        const boothLink = b.companyPage || b.link || b.website || null;
                        const content = (
                          <>
                            <div style={{ height: 70, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 8 }}>
                              {b.logoUrl ? (
                                <img src={b.logoUrl} alt={`${b.name} logo`} style={{ maxHeight: 60, maxWidth: '100%', objectFit: 'contain' }} />
                              ) : (
                                <div className="muted" aria-hidden="true">No logo</div>
                              )}
                            </div>
                            <div style={{ fontSize: 14 }}>{b.name}</div>
                          </>
                        );
                        return (
                          <li key={b._id} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: 6, padding: 12, textAlign: 'center' }}>
                            {boothLink ? (
                              <a href={boothLink} target="_blank" rel="noopener noreferrer" aria-label={`Open ${b.name} company page in a new tab`} title={`${b.name} – opens in a new tab`} style={{ color: 'inherit', textDecoration: 'none' }}>
                                {content}
                              </a>
                            ) : content}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </section>

                {/* Bottom CTA */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', maxWidth: 860, margin: '16px auto 0' }}>
                  {isRegistered ? (
                    <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                      <button
                        className="ajf-btn ajf-btn-disabled"
                        disabled
                        aria-label="Already registered for this event"
                        style={{ cursor: 'not-allowed' }}
                      >
                        Already Registered
                      </button>
                      <button
                        className="ajf-btn ajf-btn-dark"
                        onClick={() => navigate(`/events/registered/${encodeURIComponent(event.slug || event._id)}`)}
                        aria-label={`View registration for ${event.name}`}
                      >
                        View My Registration
                      </button>
                    </div>
                  ) : (
                    <button
                      className="ajf-btn ajf-btn-dark"
                      onClick={() => navigate(`/event/${encodeURIComponent(event.slug || event._id)}/register`)}
                      aria-label={`Register for ${event.name}`}
                    >
                      Register for the Job Fair
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
