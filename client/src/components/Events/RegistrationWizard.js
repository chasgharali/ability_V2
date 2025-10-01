import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useLocation } from 'react-router-dom';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import '../Dashboard/Dashboard.css';
import './RegistrationWizard.css';
import { getEventBySlug, registerForEvent } from '../../services/events';
import EditProfileResume from '../Dashboard/EditProfileResume';
import SurveyForm from '../Dashboard/SurveyForm';
import { useAuth } from '../../contexts/AuthContext';
import MyAccountInline from '../Account/MyAccountInline';
import { termsConditionsAPI } from '../../services/termsConditions';

export default function RegistrationWizard() {
  const { slug } = useParams();
  const { user, loading, updateProfile } = useAuth();
  const [event, setEvent] = useState(null);
  const [fetching, setFetching] = useState(true);
  const [step, setStep] = useState(1);
  const [saving, setSaving] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState({});
  const [announcementsOptIn, setAnnouncementsOptIn] = useState(!!user?.subscribeAnnouncements);
  const [termsDocuments, setTermsDocuments] = useState([]);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const liveRef = useRef(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await getEventBySlug(slug);
        console.log('Event data:', res?.event); // Debug log
        setEvent(res?.event || null);
        
        // Fetch terms documents if event has termsIds
        if (res?.event?.termsIds?.length) {
          console.log('Event has termsIds:', res.event.termsIds); // Debug log
          setLoadingTerms(true);
          try {
            const termsPromises = res.event.termsIds.map(id => 
              termsConditionsAPI.getById(id).then(response => {
                console.log(`Terms document ${id}:`, response); // Debug log
                // Handle backend response structure: { terms: { ... } }
                if (response.terms) {
                  return response.terms;
                } else if (response.data?.terms) {
                  return response.data.terms;
                } else if (response._id || response.id) {
                  return response;
                } else {
                  console.warn(`Unexpected response structure for terms ${id}:`, response);
                  return { _id: id, title: `Terms Document ${id}`, content: 'Unable to load terms content.', isRequired: true };
                }
              }).catch(err => {
                console.warn(`Failed to fetch terms ${id}:`, err);
                return { _id: id, title: `Terms Document ${id}`, content: 'Unable to load terms content.', isRequired: true };
              })
            );
            const terms = await Promise.all(termsPromises);
            console.log('All terms documents:', terms); // Debug log
            setTermsDocuments(terms.filter(Boolean));
          } catch (error) {
            console.error('Error fetching terms:', error);
          } finally {
            setLoadingTerms(false);
          }
        } else {
          console.log('Event has no termsIds or empty array'); // Debug log
          // Try to fetch active terms as fallback
          try {
            const activeTermsResponse = await termsConditionsAPI.getActive();
            console.log('Active terms fallback:', activeTermsResponse); // Debug log
            // Handle response structure: { terms: { ... } }
            if (activeTermsResponse?.terms) {
              setTermsDocuments([activeTermsResponse.terms]);
            } else if (activeTermsResponse?.data?.terms) {
              setTermsDocuments([activeTermsResponse.data.terms]);
            }
          } catch (error) {
            console.warn('Failed to fetch active terms:', error);
          }
        }
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
    if (!allTermsAccepted) return;
    setSaving(true);
    try {
      // Save terms acceptance data to user profile
      const termsAcceptanceData = {
        acceptedTerms: termsAccepted,
        acceptedAt: new Date().toISOString(),
        eventSlug: slug
      };
      
      // Update user profile with terms acceptance
      await updateProfile({ 
        termsAcceptance: termsAcceptanceData,
        subscribeAnnouncements: announcementsOptIn 
      });
      
      // Register for the event
      await registerForEvent(slug);
      
      // Navigate to registered list
      navigate('/events/registered', { replace: true });
    } catch (e) {
      console.error('Registration error:', e);
      // no-op; could surface toast later
    } finally {
      setSaving(false);
    }
  };

  const handleTermsAcceptance = (termId, accepted) => {
    setTermsAccepted(prev => ({
      ...prev,
      [termId]: accepted
    }));
  };

  const allTermsAccepted = useMemo(() => {
    if (!termsDocuments.length) {
      // If no terms documents, check for general terms acceptance
      return termsAccepted.general === true;
    }
    // Only check required terms
    const requiredTerms = termsDocuments.filter(doc => doc.isRequired !== false);
    return requiredTerms.every(doc => {
      const docId = doc._id || doc.id;
      return termsAccepted[docId] === true;
    });
  }, [termsDocuments, termsAccepted]);

  const termsBlocks = useMemo(() => {
    if (!termsDocuments.length) return null;
    return (
      <div className="terms-documents">
        {termsDocuments.map(doc => {
          const docId = doc._id || doc.id;
          const docTitle = doc.title || doc.name || 'Terms & Conditions';
          const docContent = doc.content || doc.description || '';
          const isRequired = doc.isRequired !== false;
          
          console.log('Rendering terms document:', { docId, docTitle, docContent: docContent.substring(0, 100) + '...', isRequired }); // Debug log
          
          return (
            <div key={docId} className="terms-document-option" data-required={isRequired}>
              <div className="terms-content-preview">
                <div className="terms-content">
                  {docContent ? (
                    <div dangerouslySetInnerHTML={{ __html: docContent }} />
                  ) : (
                    <div>
                      <p><strong>Terms content not available.</strong></p>
                      <p>Please contact support to review the full terms and conditions for this event.</p>
                    </div>
                  )}
                </div>
              </div>
              <div className="terms-checkbox-wrapper">
                <label className="checkbox-label">
                  <input 
                    type="checkbox" 
                    checked={termsAccepted[docId] || false}
                    onChange={(e) => handleTermsAcceptance(docId, e.target.checked)}
                    className="checkbox-input"
                    required={isRequired}
                  />
                  <span className="checkbox-custom"></span>
                  <span className="checkbox-text">
                    <strong>I accept the {docTitle}</strong>
                    <small>{isRequired ? 'Required to complete registration' : 'Optional'}</small>
                  </span>
                </label>
              </div>
            </div>
          );
        })}
      </div>
    );
  }, [termsDocuments, termsAccepted]);

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

            <nav aria-label="Registration steps" className="wizard-nav">
              <div className="wizard-progress">
                <div className="wizard-progress-bar" style={{ width: `${(step / 3) * 100}%` }}></div>
              </div>
              <ol className="wizard-steps">
                <li className={`wizard-step ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`}>
                  <button 
                    className="wizard-step-btn" 
                    aria-current={step === 1 ? 'step' : undefined} 
                    onClick={() => setStep(1)}
                    disabled={step < 1}
                  >
                    <span className="wizard-step-number">1</span>
                    <div className="wizard-step-content">
                      <span className="wizard-step-title">My Account</span>
                      <span className="wizard-step-desc">Personal information</span>
                    </div>
                  </button>
                </li>
                <li className={`wizard-step ${step >= 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}`}>
                  <button 
                    className="wizard-step-btn" 
                    aria-current={step === 2 ? 'step' : undefined} 
                    onClick={() => setStep(2)}
                    disabled={step < 2}
                  >
                    <span className="wizard-step-number">2</span>
                    <div className="wizard-step-content">
                      <span className="wizard-step-title">Profile & Resume</span>
                      <span className="wizard-step-desc">Professional details</span>
                    </div>
                  </button>
                </li>
                <li className={`wizard-step ${step >= 3 ? 'completed' : ''} ${step === 3 ? 'active' : ''}`}>
                  <button 
                    className="wizard-step-btn" 
                    aria-current={step === 3 ? 'step' : undefined} 
                    onClick={() => setStep(3)}
                    disabled={step < 3}
                  >
                    <span className="wizard-step-number">3</span>
                    <div className="wizard-step-content">
                      <span className="wizard-step-title">Survey & Terms</span>
                      <span className="wizard-step-desc">Final requirements</span>
                    </div>
                  </button>
                </li>
              </ol>
              <div aria-live="polite" ref={liveRef} className="sr-only" />
            </nav>

            {step === 1 && (
              <MyAccountInline user={user} updateProfile={updateProfile} onDone={next} />
            )}

            {step === 2 && (
              <section aria-labelledby="profile-h">
                <h3 id="profile-h">Edit Profile & Resume</h3>
                <EditProfileResume />
                <div className="form-actions form-actions-split">
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
                <div className="terms-section">
                  <h3 className="terms-section-title">Agreements to Terms and Privacy Policy (Required)</h3>
                  {loadingTerms ? (
                    <div className="terms-loading">Loading terms and conditions...</div>
                  ) : termsBlocks ? (
                    termsBlocks
                  ) : (
                    <div className="terms-fallback">
                      <div className="terms-document-option" data-required="true">
                        <div className="terms-content-preview">
                          <h4 className="terms-title">Terms & Conditions</h4>
                          <div className="terms-content">
                            <p><strong>Terms content not available.</strong></p>
                            <p>By proceeding with registration, you agree to our Terms of Service and Privacy Policy. Please contact support if you need to review the full terms and conditions.</p>
                          </div>
                        </div>
                        <div className="terms-checkbox-wrapper">
                          <label className="checkbox-label">
                            <input 
                              type="checkbox" 
                              checked={termsAccepted.general || false}
                              onChange={(e) => handleTermsAcceptance('general', e.target.checked)}
                              className="checkbox-input"
                              required
                            />
                            <span className="checkbox-custom"></span>
                            <span className="checkbox-text">
                              <strong>I accept the Terms & Conditions</strong>
                              <small>Required to complete registration</small>
                            </span>
                          </label>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="announcements-section">
                  <h3 className="announcements-section-title">Communication Preferences</h3>
                  <div className="announcements-option">
                    <label className="checkbox-label">
                      <input 
                        type="checkbox" 
                        checked={announcementsOptIn} 
                        onChange={(e) => handleAnnouncementsToggle(e.target.checked)}
                        className="checkbox-input"
                      />
                      <span className="checkbox-custom"></span>
                      <span className="checkbox-text">
                        <strong>Subscribe to Job Seeker Announcements</strong>
                        <small>Receive updates about upcoming career fairs and events</small>
                      </span>
                    </label>
                  </div>
                </div>
                <div className="form-actions form-actions-split">
                  <button className="ajf-btn ajf-btn-outline" onClick={prev}>Previous</button>
                  <button className="ajf-btn ajf-btn-dark" onClick={handleComplete} disabled={!allTermsAccepted || saving}>{saving ? 'Completing…' : 'Complete Registration'}</button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
