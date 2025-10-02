import React, { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { resolveBoothInvite } from '../../services/booths';
import { useAuth } from '../../contexts/AuthContext';

export default function QueueInviteResolver() {
  const { inviteSlug } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        if (!user) {
          navigate('/login');
          return;
        }
        
        const data = await resolveBoothInvite(inviteSlug);
        console.log('Invite resolve response:', data);
        
        const boothId = data?.boothId || data?.booth?._id;
        const eventSlug = data?.event?.slug;
        
        console.log('Extracted boothId:', boothId);
        console.log('Extracted eventSlug:', eventSlug);
        
        if (!boothId || !eventSlug) {
          setError('Invalid or expired invite link.');
          return;
        }
        
        const targetUrl = `/booth-queue/${encodeURIComponent(eventSlug)}/${encodeURIComponent(boothId)}/entry`;
        console.log('Navigating to:', targetUrl);
        
        navigate(targetUrl, { replace: true });
      } catch (e) {
        if (!cancelled) {
          console.error('QueueInviteResolver error:', e);
          const errorMsg = e?.response?.data?.message || e?.message || 'Failed to open queue link.';
          setError(`${errorMsg} (Slug: ${inviteSlug})`);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, [inviteSlug, navigate, user]);

  return (
    <div style={{ padding: '2rem' }}>
      <h2>Opening Queue…</h2>
      {!error ? (
        <p>Please wait while we take you to the booth queue.</p>
      ) : (
        <div className="alert-box" style={{ background: '#ffe8e8', borderColor: '#f5c2c7', color: '#842029' }}>
          <p>{error}</p>
          <button className="dashboard-button" style={{ width: 'auto', marginTop: '0.75rem' }} onClick={() => navigate('/events')}>Back to Events</button>
        </div>
      )}
    </div>
  );
}
