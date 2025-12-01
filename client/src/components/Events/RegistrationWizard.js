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
  const [isAlreadyRegistered, setIsAlreadyRegistered] = useState(false);
  const [stepValidation, setStepValidation] = useState({
    step1: false,
    step2: false,
    step3: false
  });
  const [validationErrors, setValidationErrors] = useState({});
  const [currentFormData, setCurrentFormData] = useState(null);
  const [step1FormData, setStep1FormData] = useState(null);
  const navigate = useNavigate();
  const location = useLocation();
  const liveRef = useRef(null);

  // Check if user is already registered for this event
  const checkRegistrationStatus = (event, user) => {
    if (!event || !user) return false;
    const registeredEvents = user.metadata?.registeredEvents || [];
    return registeredEvents.some(reg =>
      (reg.id && reg.id.toString() === event._id?.toString()) ||
      (reg.slug && reg.slug === event.slug)
    );
  };

  useEffect(() => {
    (async () => {
      try {
        const res = await getEventBySlug(slug);
        console.log('Event data:', res?.event); // Debug log
        const eventData = res?.event || null;
        setEvent(eventData);

        // Check if already registered
        if (eventData && user) {
          const alreadyRegistered = checkRegistrationStatus(eventData, user);
          setIsAlreadyRegistered(alreadyRegistered);
          console.log('Already registered:', alreadyRegistered); // Debug log
        }

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
  }, [slug, user]);

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
    // Scroll to top whenever step changes
    window.scrollTo({ top: 0, behavior: 'smooth' });
    // Also scroll main content area if it exists
    const mainContent = document.getElementById('dashboard-main') || document.querySelector('.dashboard-main');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [step]);

  // Validate step 2 when form data changes
  useEffect(() => {
    if (currentFormData && step === 2) {
      validateStep2();
    }
  }, [currentFormData, step]);


  // Validation functions for each step
  const validateStep1 = (formDataOverride = null) => {
    if (!user) return false;
    const errors = {};
    let isValid = true;

    // Use formDataOverride if provided (from form submission), then step1FormData, then user object
    const city = formDataOverride?.city || step1FormData?.city || user.city || '';
    const state = formDataOverride?.state || step1FormData?.state || user.state || '';
    const country = formDataOverride?.country || step1FormData?.country || user.country || '';

    // Required fields for step 1: city, state, country
    if (!city || city.trim() === '') {
      errors.city = 'City is required';
      isValid = false;
    }
    if (!state || state.trim() === '') {
      errors.state = 'State is required';
      isValid = false;
    }
    if (!country || country.trim() === '') {
      errors.country = 'Country is required';
      isValid = false;
    }

    setValidationErrors(prev => ({ ...prev, step1: errors }));
    setStepValidation(prev => ({ ...prev, step1: isValid }));
    return isValid;
  };

  const validateStep2 = () => {
    if (!currentFormData) {
      return false;
    }

    const errors = {};
    let isValid = true;

    // All fields are required for step 2
    const requiredFields = [
      'headline', 'keywords', 'primaryExperience', 'workLevel',
      'educationLevel', 'languages', 'employmentTypes'
    ];

    requiredFields.forEach(field => {
      const value = currentFormData[field];

      if (!value || (Array.isArray(value) && value.length === 0) || (typeof value === 'string' && value.trim() === '')) {
        errors[field] = `${field.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase())} is required`;
        isValid = false;
      }
    });

    // Check if resume is uploaded (check both form data and user object)
    const hasResumeInForm = currentFormData.hasResume || currentFormData.resumeUrl;
    const hasResumeInUser = user?.resumeUrl;

    if (!hasResumeInForm && !hasResumeInUser) {
      errors.resume = 'Resume upload is required';
      isValid = false;
    }

    setValidationErrors(prev => ({ ...prev, step2: errors }));
    setStepValidation(prev => ({ ...prev, step2: isValid }));
    return isValid;
  };

  const validateStep3 = () => {
    if (!user || !user.metadata?.survey) return false;
    const errors = {};
    let isValid = true;

    // Required fields for step 3: race, gender, age group, country of origin
    if (!user.metadata.survey.race || user.metadata.survey.race.length === 0) {
      errors.race = 'Race selection is required';
      isValid = false;
    }
    if (!user.metadata.survey.genderIdentity || user.metadata.survey.genderIdentity.trim() === '') {
      errors.genderIdentity = 'Gender identity is required';
      isValid = false;
    }
    if (!user.metadata.survey.ageGroup || user.metadata.survey.ageGroup.trim() === '') {
      errors.ageGroup = 'Age group is required';
      isValid = false;
    }
    if (!user.metadata.survey.countryOfOrigin || user.metadata.survey.countryOfOrigin.trim() === '') {
      errors.countryOfOrigin = 'Country of origin is required';
      isValid = false;
    }

    // Check terms acceptance
    if (!allTermsAccepted) {
      errors.terms = 'Terms and conditions acceptance is required';
      isValid = false;
    }

    setValidationErrors(prev => ({ ...prev, step3: errors }));
    setStepValidation(prev => ({ ...prev, step3: isValid }));
    return isValid;
  };

  const next = (formDataOverride = null) => {
    let canProceed = false;

    switch (step) {
      case 1:
        canProceed = validateStep1(formDataOverride);
        break;
      case 2:
        canProceed = validateStep2();
        break;
      case 3:
        canProceed = validateStep3();
        break;
      default:
        canProceed = false;
    }

    if (canProceed) {
      setStep(s => Math.min(3, s + 1));
      setValidationErrors(prev => ({ ...prev, [`step${step}`]: {} }));
      // Scroll to top when moving to next step
      window.scrollTo({ top: 0, behavior: 'smooth' });
      // Also scroll main content area if it exists
      const mainContent = document.getElementById('dashboard-main') || document.querySelector('.dashboard-main');
      if (mainContent) {
        mainContent.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } else {
      // Announce validation errors to screen readers
      if (liveRef.current) {
        const currentStepErrors = validationErrors[`step${step}`];
        if (currentStepErrors) {
          const errorMessages = Object.values(currentStepErrors).join(', ');
          liveRef.current.textContent = `Validation errors: ${errorMessages}`;
        }
      }
    }
  };

  const prev = () => {
    setStep(s => Math.max(1, s - 1));
    // Scroll to top when going back
    window.scrollTo({ top: 0, behavior: 'smooth' });
    const mainContent = document.getElementById('dashboard-main') || document.querySelector('.dashboard-main');
    if (mainContent) {
      mainContent.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

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

  // Validate step 3 when user survey data changes
  useEffect(() => {
    if (user && step === 3) {
      validateStep3();
    }
  }, [user, step, allTermsAccepted]);

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
            <h2 style={{ textAlign: 'center', marginBottom: '1.5rem' }}>{event?.name || 'Event Registration'}</h2>
            {isAlreadyRegistered ? (
              <div className="alert-box" style={{ background: '#fef3c7', borderColor: '#f59e0b', color: '#92400e' }}>
                <p><strong>You are already registered for this event.</strong> You can view your registration details in "My Current Registrations".</p>
                <div style={{ marginTop: '1rem' }}>
                  <button
                    className="ajf-btn ajf-btn-dark"
                    onClick={() => navigate(`/events/registered/${encodeURIComponent(event.slug || event._id)}`)}
                    style={{ marginRight: '0.5rem' }}
                  >
                    View My Registration
                  </button>
                  <button
                    className="ajf-btn ajf-btn-outline"
                    onClick={() => navigate('/events/registered')}
                  >
                    My Current Registrations
                  </button>
                </div>
              </div>
            ) : (
              <div className="alert-box"><p>Continue Registration by editing and submitting all three pages of registration.</p></div>
            )}

            <nav aria-label="Registration steps" className="wizard-nav">
              <div className="wizard-progress" role="progressbar" aria-valuenow={step} aria-valuemin="1" aria-valuemax="3" aria-label={`Step ${step} of 3`}>
                <div className="wizard-progress-bar" style={{ width: `${(step / 3) * 100}%` }}></div>
              </div>
              <ol className="wizard-steps">
                <li className={`wizard-step ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`}>
                  <button
                    className="wizard-step-btn"
                    aria-current={step === 1 ? 'step' : undefined}
                    onClick={() => setStep(1)}
                    disabled={step < 1 || isAlreadyRegistered}
                    aria-label="Step 1: My Account - Personal information"
                  >
                    <span className="wizard-step-number" aria-hidden="true">1</span>
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
                    disabled={step < 2 || isAlreadyRegistered}
                    aria-label="Step 2: Profile & Resume - Professional details"
                  >
                    <span className="wizard-step-number" aria-hidden="true">2</span>
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
                    disabled={step < 3 || isAlreadyRegistered}
                    aria-label="Step 3: Survey & Terms - Final requirements"
                  >
                    <span className="wizard-step-number" aria-hidden="true">3</span>
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
              <section aria-labelledby="account-h">
                <h3 id="account-h">My Account Information</h3>
                {validationErrors.step1 && Object.keys(validationErrors.step1).length > 0 && (
                  <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7', color: '#721c24' }} role="alert" aria-live="polite">
                    <h4>Please complete all required fields:</h4>
                    <ul>
                      {Object.entries(validationErrors.step1).map(([field, error]) => (
                        <li key={field}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <MyAccountInline 
                  user={user} 
                  updateProfile={updateProfile} 
                  onDone={(formData) => {
                    // Store the form data for future reference
                    if (formData) {
                      setStep1FormData(formData);
                    }
                    // Pass formData directly to next() so validation uses it immediately
                    next(formData);
                  }} 
                />
              </section>
            )}

            {step === 2 && (
              <section aria-labelledby="profile-h">
                <h3 id="profile-h">Edit Profile & Resume</h3>
                {validationErrors.step2 && Object.keys(validationErrors.step2).length > 0 && (
                  <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7', color: '#721c24' }} role="alert" aria-live="polite">
                    <h4>Please complete all required fields:</h4>
                    <ul>
                      {Object.entries(validationErrors.step2).map(([field, error]) => (
                        <li key={field}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <EditProfileResume
                  onValidationChange={() => validateStep2()}
                  onFormDataChange={setCurrentFormData}
                  onDone={next}
                  onPrev={prev}
                />
              </section>
            )}

            {step === 3 && (
              <section aria-labelledby="survey-h">
                <h3 id="survey-h">Survey & Final Requirements</h3>
                {validationErrors.step3 && Object.keys(validationErrors.step3).length > 0 && (
                  <div className="alert-box" style={{ background: '#fdecea', borderColor: '#f5c2c7', color: '#721c24' }} role="alert" aria-live="polite">
                    <h4>Please complete all required fields:</h4>
                    <ul>
                      {Object.entries(validationErrors.step3).map(([field, error]) => (
                        <li key={field}>{error}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <SurveyForm onValidationChange={() => validateStep3()} />
                <hr />
                <div className="terms-section">
                  <h3 className="terms-section-title">Agreements to Terms and Privacy Policy (Required)</h3>
                  {validationErrors.step3?.terms && (
                    <div className="field-error" role="alert" aria-live="polite">
                      {validationErrors.step3.terms}
                    </div>
                  )}
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
                              onChange={(e) => {
                                handleTermsAcceptance('general', e.target.checked);
                                validateStep3(); // Re-validate after terms change
                              }}
                              className="checkbox-input"
                              required
                              aria-describedby={validationErrors.step3?.terms ? "terms-error" : undefined}
                            />
                            <span className="checkbox-custom"></span>
                            <span className="checkbox-text">
                              <strong>I accept the Terms & Conditions</strong>
                              <small>Required to complete registration</small>
                            </span>
                          </label>
                          {validationErrors.step3?.terms && (
                            <div id="terms-error" className="field-error" role="alert" aria-live="polite">
                              {validationErrors.step3.terms}
                            </div>
                          )}
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
                <div className="form-actions form-actions-split" style={{ marginBottom: '3rem' }}>
                  <button className="ajf-btn ajf-btn-outline" onClick={prev} disabled={isAlreadyRegistered} aria-label="Go to previous step">Previous</button>
                  <button
                    className={`ajf-btn ${isAlreadyRegistered ? 'ajf-btn-disabled' : 'ajf-btn-dark'}`}
                    onClick={handleComplete}
                    disabled={!allTermsAccepted || saving || isAlreadyRegistered}
                    aria-label="Complete registration"
                  >
                    {isAlreadyRegistered ? 'Already Registered' : (saving ? 'Completing…' : 'Complete Registration')}
                  </button>
                </div>
              </section>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
