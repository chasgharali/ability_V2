import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import { getEventBySlug, registerForEvent } from '../../services/events';
import EditProfileResume from '../Dashboard/EditProfileResume';
import SurveyForm from '../Dashboard/SurveyForm';
import { useAuth } from '../../contexts/AuthContext';
import MyAccountInline from '../Account/MyAccountInline';

export default function RegistrationWizard() {
  const { slug } = useParams();
  const { user, loading, updateProfile } = useAuth();
  const [event, setEvent] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [announcementsOptIn, setAnnouncementsOptIn] = useState(!!user?.subscribeAnnouncements);
  const navigate = useNavigate();
  const location = useLocation();
  const liveRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getEventBySlug(slug);
        setEvent(res?.event || null);
      } finally {
        setFetching(false);
      }
    })();
  }, [slug]);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      const redirect = encodeURIComponent(location.pathname + location.search);
      navigate(`/register?redirect=${redirect}`, { replace: true });
    }
  }, [user, loading, location, navigate]);

  useEffect(() => {
    if (liveRef.current) {
      liveRef.current.textContent = `Step ${step} of 3`;
    }
  }, [step]);

  const next = () => setStep(s => Math.min(3, s + 1));
  const prev = () => setStep(s => Math.max(1, s - 1));

  const handleAnnouncementsToggle = async (checked) => {
    setAnnouncementsOptIn(checked);
    try {
      await updateProfile({ subscribeAnnouncements: !!checked });
    } catch { }
  };

  const handleComplete = async () => {
    if (!termsAccepted) return;
    setSaving(true);
    try {
      await registerForEvent(slug);
      // Navigate to registered list
      navigate('/events/registered', { replace: true });
    } catch (e) {
      // no-op; could surface toast later
    } finally {
      setSaving(false);
    }
  };

  const termsBlocks = useMemo(() => {
    const ids = event?.termsIds || [];
    if (!ids.length) return null;
    return (
      <ul style={{ paddingLeft: '1rem' }}>
        {ids.map(id => (
          <li key={id}><span>Terms document id: {id}</span></li>
        ))}
      </ul>
    );
  }, [event]);

  if (loading || fetching) {
    return <div className="dashboard"><div className="dashboard-layout"><main className="dashboard-main"><div>Loading…</div></main></div></div>;
  }
  if (!user) return null;

  return (
    <div className="dashboard">
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="events" />
        <main id="dashboard-main" className="dashboard-main">
          <div className="dashboard-content">
            <h2>{event?.name || 'Event Registration'}</h2>
            <div className="alert-box"><p>Continue Registration by editing and submitting all three pages of registration.</p></div>

            <nav aria-label="Registration steps" style={{ marginBottom: '1rem' }}>
              <ol style={{ display: 'flex', gap: 8, listStyle: 'none', padding: 0, margin: 0 }}>
                <li><button className={`ajf-btn ${step === 1 ? 'ajf-btn-dark' : 'ajf-btn-outline'}`} aria-current={step === 1 ? 'step' : undefined} onClick={() => setStep(1)}>Step 1: My Account</button></li>
                <li><button className={`ajf-btn ${step === 2 ? 'ajf-btn-dark' : 'ajf-btn-outline'}`} aria-current={step === 2 ? 'step' : undefined} onClick={() => setStep(2)}>Step 2: Edit Profile & Resume</button></li>
                <li><button className={`ajf-btn ${step === 3 ? 'ajf-btn-dark' : 'ajf-btn-outline'}`} aria-current={step === 3 ? 'step' : undefined} onClick={() => setStep(3)}>Step 3: Survey & Terms</button></li>
              </ol>
              <div aria-live="polite" ref={liveRef} style={{ position: 'absolute', left: -99999 }} />
            </nav>

            {step === 1 && (
              <MyAccountInline user={user} updateProfile={updateProfile} onDone={next} />
            )}

            {step === 2 && (
              <section aria-labelledby="profile-h">
                <h3 id="profile-h">Edit Profile & Resume</h3>
                <EditProfileResume />
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ajf-btn ajf-btn-outline" onClick={prev}>Previous</button>
                  <button className="ajf-btn ajf-btn-dark" onClick={next}>Next</button>
                </div>
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="survey-h">
                <h3 id="survey-h">Survey</h3>
                <SurveyForm />
                <hr />
                <h3>Agreements to Terms and Privacy Policy (Required)</h3>
                {termsBlocks}
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={termsAccepted} onChange={(e) => setTermsAccepted(e.target.checked)} /> I accept the Terms & Conditions.
                  </label>
                </div>
                <h3>Announcements</h3>
                <div className="form-group">
                  <label>
                    <input type="checkbox" checked={announcementsOptIn} onChange={(e) => handleAnnouncementsToggle(e.target.checked)} /> Please keep me informed with announcements and reminders of upcoming career fairs and events.
                  </label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ajf-btn ajf-btn-outline" onClick={prev}>Previous</button>
                  <button className="ajf-btn ajf-btn-dark" onClick={handleComplete} disabled={!termsAccepted || saving}>{saving ? 'Completing…' : 'Complete Registration'}</button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
