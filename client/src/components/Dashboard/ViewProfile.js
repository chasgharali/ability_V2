import React, { useEffect, useState } from 'react';
import './Dashboard.css';
import {
  JOB_CATEGORY_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  LANGUAGE_LIST,
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';

export default function ViewProfile() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);

  const getToken = () => localStorage.getItem('token');

  useEffect(() => {
    const run = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch('/api/users/me', {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${getToken()}`
          }
        });
        if (!res.ok) throw new Error('Failed to load profile');
        const data = await res.json();
        setUser(data?.user || null);
        setProfile(data?.profile || null);
      } catch (e) {
        setError(e.message || 'Failed to load profile');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, []);

  if (loading) {
    return (
      <div className="dashboard-loading">
        <div className="loading-spinner"/>
        <p>Loading profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="dashboard-content">
        <div className="alert-box" style={{ background: '#ffe8e8' }}>{error}</div>
      </div>
    );
  }

  const avatarUrl = user?.avatarUrl || '';
  const name = user?.name || '';
  const email = user?.email || '';
  const phone = user?.phoneNumber || '';
  const location = [user?.city, user?.state].filter(Boolean).join(', ');
  const country = user?.country || '';
  const resumeUrl = user?.resumeUrl || '';

  const headline = profile?.headline || '';
  const keywords = profile?.keywords || '';
  const primaryExperience = Array.isArray(profile?.primaryExperience) ? profile.primaryExperience : [];
  const employmentTypes = Array.isArray(profile?.employmentTypes) ? profile.employmentTypes : [];
  const workLevel = profile?.workLevel || '';
  const educationLevel = profile?.educationLevel || '';
  const languages = Array.isArray(profile?.languages) ? profile.languages : [];
  const clearance = profile?.clearance || '';
  const veteranStatus = profile?.veteranStatus || '';

  // Build value->name maps from centralized options
  const toMap = (list) => Object.fromEntries((list || []).map(o => [o.value, o.name]));
  const JOB_CATEGORY_MAP = toMap(JOB_CATEGORY_LIST);
  const JOB_TYPE_MAP = toMap(JOB_TYPE_LIST);
  const EXP_MAP = toMap(EXPERIENCE_LEVEL_LIST);
  const EDU_MAP = toMap(EDUCATION_LEVEL_LIST);
  const LANG_MAP = toMap(LANGUAGE_LIST);
  const CLEAR_MAP = toMap(SECURITY_CLEARANCE_LIST);
  const VET_MAP = toMap(MILITARY_EXPERIENCE_LIST);

  const mapValue = (val, map) => map[val] || val || '—';
  const mapArray = (vals, map) => {
    if (!Array.isArray(vals) || vals.length === 0) return [];
    return vals.map(v => map[v] || v).filter(Boolean);
  };

  // Pretty chips for arrays
  const Chips = ({ items }) => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
      {items.map((t, i) => (
        <span key={`${t}-${i}`} style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 8px', borderRadius: 999, fontSize: 12 }}>{t}</span>
      ))}
    </div>
  );

  const primaryExperienceNames = mapArray(primaryExperience, JOB_CATEGORY_MAP);
  const employmentTypeNames = mapArray(employmentTypes, JOB_TYPE_MAP);
  const languageNames = mapArray(languages, LANG_MAP);

  return (
    <div className="dashboard-content profile-view">
      <div className="profile-header-section">
        <h1 className="profile-title">Job Seeker Profile</h1>
        <div className="profile-notice">
          <p>This is the profile that recruiters will see. It will only be shared with companies you show interest in and the booths you visit.</p>
        </div>
      </div>

      <div className="profile-container">
        {/* Profile Header Card */}
        <section className="profile-hero-card" aria-labelledby="profile-hero-heading">
          <div className="profile-hero-content">
            <div className="profile-avatar-section">
              <div 
                className="profile-avatar" 
                style={{ backgroundImage: avatarUrl ? `url(${avatarUrl})` : undefined }}
                role="img"
                aria-label={`Profile photo of ${name || 'user'}`}
              />
              <div className="profile-status-indicator" aria-label="Profile active"></div>
            </div>
            
            <div className="profile-identity">
              <h2 id="profile-hero-heading" className="profile-name">{name || 'Name not provided'}</h2>
              <div className="profile-contact">
                <p className="profile-email">{email || 'Email not provided'}</p>
                {phone && <p className="profile-phone">{phone}</p>}
                <p className="profile-location">{[location, country].filter(Boolean).join(', ') || 'Location not specified'}</p>
              </div>
            </div>

            <div className="profile-actions">
              {resumeUrl ? (
                <a 
                  href={resumeUrl} 
                  target="_blank" 
                  rel="noreferrer" 
                  className="profile-btn profile-btn-primary"
                  aria-describedby="resume-help"
                >
                  <span className="btn-icon">📄</span>
                  View Complete Resume
                </a>
              ) : (
                <div className="profile-btn profile-btn-disabled" aria-label="No resume uploaded">
                  <span className="btn-icon">📄</span>
                  No Resume Available
                </div>
              )}
              <p id="resume-help" className="sr-only">Opens resume in a new tab</p>
            </div>
          </div>
        </section>

        {/* Profile Details Grid */}
        <section className="profile-details-section" aria-labelledby="profile-details-heading">
          <h2 id="profile-details-heading" className="section-title">Professional Details</h2>
          
          <div className="profile-details-grid">
            <div className="profile-detail-card">
              <div className="detail-header">
                <h3 className="detail-title">Professional Summary</h3>
              </div>
              <div className="detail-content">
                <div className="detail-item">
                  <label className="detail-label">Professional Headline</label>
                  <div className="detail-value">{headline || <span className="empty-state">No headline provided</span>}</div>
                </div>
                <div className="detail-item">
                  <label className="detail-label">Keywords & Skills</label>
                  <div className="detail-value">{keywords || <span className="empty-state">No keywords specified</span>}</div>
                </div>
              </div>
            </div>

            <div className="profile-detail-card">
              <div className="detail-header">
                <h3 className="detail-title">Experience & Employment</h3>
              </div>
              <div className="detail-content">
                <div className="detail-item">
                  <label className="detail-label">Primary Job Experience</label>
                  <div className="detail-value">
                    {primaryExperienceNames.length ? <Chips items={primaryExperienceNames} /> : <span className="empty-state">No experience specified</span>}
                  </div>
                </div>
                <div className="detail-item">
                  <label className="detail-label">Employment Types</label>
                  <div className="detail-value">
                    {employmentTypeNames.length ? <Chips items={employmentTypeNames} /> : <span className="empty-state">No employment types specified</span>}
                  </div>
                </div>
                <div className="detail-item">
                  <label className="detail-label">Experience Level</label>
                  <div className="detail-value">{mapValue(workLevel, EXP_MAP) === workLevel ? <span className="empty-state">Not specified</span> : mapValue(workLevel, EXP_MAP)}</div>
                </div>
              </div>
            </div>

            <div className="profile-detail-card">
              <div className="detail-header">
                <h3 className="detail-title">Education & Qualifications</h3>
              </div>
              <div className="detail-content">
                <div className="detail-item">
                  <label className="detail-label">Highest Education Level</label>
                  <div className="detail-value">{mapValue(educationLevel, EDU_MAP) === educationLevel ? <span className="empty-state">Not specified</span> : mapValue(educationLevel, EDU_MAP)}</div>
                </div>
                <div className="detail-item">
                  <label className="detail-label">Security Clearance</label>
                  <div className="detail-value">{mapValue(clearance, CLEAR_MAP) === clearance ? <span className="empty-state">None</span> : mapValue(clearance, CLEAR_MAP)}</div>
                </div>
              </div>
            </div>

            <div className="profile-detail-card">
              <div className="detail-header">
                <h3 className="detail-title">Additional Information</h3>
              </div>
              <div className="detail-content">
                <div className="detail-item">
                  <label className="detail-label">Languages</label>
                  <div className="detail-value">
                    {languageNames.length ? <Chips items={languageNames} /> : <span className="empty-state">No languages specified</span>}
                  </div>
                </div>
                <div className="detail-item">
                  <label className="detail-label">Veteran/Military Status</label>
                  <div className="detail-value">{mapValue(veteranStatus, VET_MAP) === veteranStatus ? <span className="empty-state">Not specified</span> : mapValue(veteranStatus, VET_MAP)}</div>
                </div>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
