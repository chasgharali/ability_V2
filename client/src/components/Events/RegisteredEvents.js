import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
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
        setEvents(res?.events || []);
      } finally {
        setFetching(false);
      }
    })();
  }, [loading, user]);

  if (loading) return null;
  if (!user) return null;

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            <h2>My Current Registrations</h2>
            {fetching && <div>Loading…</div>}
            {!fetching && events.length === 0 && (
              <div className="alert-box" role="status" aria-live="polite">No registrations yet.</div>
            )}
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }} aria-label="Registered events list">
              {events.map(evt => (
                <li key={evt._id} style={{ border: '1px solid #e5e7eb', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
                  <h3 style={{ marginTop: 0 }}>{evt.name}</h3>
                  <p><strong>Open:</strong> {evt.start ? new Date(evt.start).toLocaleString() : '-'}</p>
                  <p><strong>Close:</strong> {evt.end ? new Date(evt.end).toLocaleString() : '-'}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    <button className="ajf-btn ajf-btn-outline" onClick={() => navigate(`/event/${encodeURIComponent(evt.slug)}`)} aria-label={`View details for ${evt.name}`}>View Job Fair Information</button>
                    <button className="ajf-btn ajf-btn-dark" onClick={() => navigate(`/event/${encodeURIComponent(evt.slug)}/register`)} aria-label={`Continue registration for ${evt.name}`}>Continue Registration</button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </main>
      </div>
    </div>
  );
}
