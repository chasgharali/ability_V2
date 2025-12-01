import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resolveBoothInvite } from '../../services/booths';
import { useAuth } from '../../contexts/AuthContext';

export default function QueueInviteResolver() {
  const { inviteSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        setLoading(true);
        setError('');

        // Step 1: Check if user is logged in
        if (!user) {
          // Store the invite slug in sessionStorage to redirect back after login
          sessionStorage.setItem('pendingQueueInvite', inviteSlug);
          navigate('/login', { 
            state: { 
              from: `/queue/${inviteSlug}`,
              message: 'Please log in to join the booth queue'
            } 
          });
          return;
        }
        
        // Step 2: Resolve the booth invite
        const data = await resolveBoothInvite(inviteSlug);
        console.log('Invite resolve response:', data);
        
        const boothId = data?.boothId || data?.booth?._id;
        const event = data?.event;
        const eventSlug = event?.slug;
        const isRegistered = data?.isRegistered || false;
        const isEventUpcoming = data?.isEventUpcoming || false;
        const canJoinQueue = data?.canJoinQueue || false;
        
        console.log('Extracted boothId:', boothId);
        console.log('Extracted eventSlug:', eventSlug);
        console.log('Is registered:', isRegistered);
        console.log('Is event upcoming:', isEventUpcoming);
        console.log('Can join queue:', canJoinQueue);
        
        // Step 3: Check if event is assigned to booth
        if (!event || !eventSlug) {
          setError('This booth is not assigned to any event. You are unable to join this booth.');
          setLoading(false);
          return;
        }

        // Step 4: Check if user is registered for the event
        if (!isRegistered) {
          // Step 5: If not registered, check if event is upcoming
          if (isEventUpcoming) {
            // Navigate to event registration page
            navigate(`/events/${encodeURIComponent(eventSlug)}/register`, { replace: true });
            return;
          } else {
            // Event is not upcoming, show error
            setError('You are unable to join this booth. Please register for the event first.');
            setLoading(false);
            return;
          }
        }

        // Step 6: User is registered - check if they can join queue
        if (!canJoinQueue) {
          // Provide more specific error message based on event status
          const eventStatus = event?.status;
          const eventEnd = event?.end ? new Date(event.end) : null;
          const now = new Date();
          const hasEnded = eventEnd && eventEnd < now;
          
          if (hasEnded) {
            setError('This event has ended. You are unable to join this booth.');
          } else if (eventStatus !== 'published' && eventStatus !== 'active') {
            setError('This event is not currently available. You are unable to join this booth.');
          } else {
            setError('You are unable to join this booth at this time. Please contact support if you believe this is an error.');
          }
          setLoading(false);
          return;
        }

        // Step 7: User is registered and can join - navigate to queue entry
        if (!boothId || !eventSlug) {
          setError('Invalid or expired invite link.');
          setLoading(false);
          return;
        }
        
        const targetUrl = `/booth-queue/${encodeURIComponent(eventSlug)}/${encodeURIComponent(boothId)}/entry`;
        console.log('Navigating to:', targetUrl);
        
        navigate(targetUrl, { replace: true });
      } catch (e) {
        if (!cancelled) {
          console.error('QueueInviteResolver error:', e);
          const errorMsg = e?.response?.data?.message || e?.message || 'Failed to open queue link.';
          setError(errorMsg);
          setLoading(false);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [inviteSlug, navigate, user]);

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: '0 auto' }}>
      <h2>Opening Queue…</h2>
      {loading && !error ? (
        <p>Please wait while we verify your registration and take you to the booth queue.</p>
      ) : error ? (
        <div className="alert-box" style={{ 
          background: '#ffe8e8', 
          borderColor: '#f5c2c7', 
          color: '#842029',
          padding: '1rem',
          borderRadius: '8px',
          marginTop: '1rem'
        }}>
          <p style={{ margin: '0 0 1rem 0', fontWeight: 500 }}>{error}</p>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            <button 
              className="dashboard-button" 
              style={{ width: 'auto', marginTop: '0' }} 
              onClick={() => navigate('/events')}
            >
              Back to Events
            </button>
            <button 
              className="dashboard-button" 
              style={{ width: 'auto', marginTop: '0' }} 
              onClick={() => window.location.reload()}
            >
              Try Again
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
