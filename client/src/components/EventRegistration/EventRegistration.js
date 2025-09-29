import React, { useEffect, useState } from 'react';
import { useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import { getEventBySlug } from '../../services/events';

export default function EventRegistration() {
  const { slug } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user, loading } = useAuth();

  const [event, setEvent] = useState(null);
  const [fetching, setFetching] = useState(true);

  // Fetch event details by slug
  useEffect(() => {
    (async () => {
      try {
        const res = await getEventBySlug(slug);
        setEvent(res?.event || null);
      } catch (e) {
        console.error('Failed to load event by slug', e);
      } finally {
        setFetching(false);
      }
    })();
  }, [slug]);

  // Redirect unauthenticated users to register first, with redirect back
  useEffect(() => {
    if (loading) return;
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/register?redirect=${redirect}`, { replace: true });
    }
  }, [user, loading, location, navigate]);

  if (loading || fetching) {
    return <div className="dashboard"><div className="dashboard-layout"><main className="dashboard-main"><div>Loading…</div></main></div></div>;
  }

  if (!event) {
    return <div className="dashboard"><div className="dashboard-layout"><main className="dashboard-main"><div>Event not found.</div></main></div></div>;
  }

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            <div className="bm-header">
              <h2>Register for: {event.name}</h2>
            </div>
            <div className="account-form" style={{ maxWidth: 720 }}>
              <p>You're signed in as a Job Seeker. Continue to complete event registration for <strong>{event.name}</strong>.</p>
              {/* Placeholder for actual event-specific registration fields */}
              <button className="dashboard-button" style={{ width: 'auto' }} onClick={() => navigate('/dashboard')}>Go to Dashboard</button>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
