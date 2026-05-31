import React, { useEffect, useState } from 'react';
import { FaLinkedin } from 'react-icons/fa';
import { useNavigate } from 'react-router-dom';
import { listResumes } from '../../services/resumes';
import './Dashboard.css';
import {
  JOB_CATEGORY_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  LANGUAGE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';
import { useRoleMessages } from '../../contexts/RoleMessagesContext';

function getNameInitials(displayName) {
  if (!displayName || !String(displayName).trim()) return '?';
  const parts = String(displayName).trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }
  return parts[0].slice(0, 2).toUpperCase();
}

export default function ViewProfile() {
  const { getMessage } = useRoleMessages();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [avatarLoadError, setAvatarLoadError] = useState(false);
  const [builderResumes, setBuilderResumes] = useState([]);
  const profileNotice = getMessage('view-profile', 'profile-notice') || '';

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
    listResumes().then(data => setBuilderResumes(data?.resumes || data || [])).catch(() => {});
  }, []);

  const avatarUrl = user?.avatarUrl || '';

  useEffect(() => {
    setAvatarLoadError(false);
  }, [avatarUrl]);

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

  const name = user?.name || '';
  const email = user?.email || '';
  const phone = user?.phoneNumber || '';
  const location = [user?.city, user?.state].filter(Boolean).join(', ');
  const country = user?.country || '';
  const resumeUrl = user?.resumeUrl || '';
  const linkedInUrl = user?.linkedInUrl || '';

  const headline = profile?.headline || '';
  const keywords = profile?.keywords || '';
  const primaryExperience = Array.isArray(profile?.primaryExperience) ? profile.primaryExperience : [];
  const employmentTypes = Array.isArray(profile?.employmentTypes) ? profile.employmentTypes : [];
  const workLevel = profile?.workLevel || '';
  const educationLevel = profile?.educationLevel || '';
  const languages = Array.isArray(profile?.languages) ? profile.languages : [];
  const veteranStatus = profile?.veteranStatus || '';

  // Build value->name maps from centralized options
  const toMap = (list) => Object.fromEntries((list || []).map(o => [o.value, o.name]));
  const JOB_CATEGORY_MAP = toMap(JOB_CATEGORY_LIST);
  const JOB_TYPE_MAP = toMap(JOB_TYPE_LIST);
  const EXP_MAP = toMap(EXPERIENCE_LEVEL_LIST);
  const EDU_MAP = toMap(EDUCATION_LEVEL_LIST);
  const LANG_MAP = toMap(LANGUAGE_LIST);
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
  const heroContactTextStyle = { color: '#111827', fontWeight: 600 };

  return (
    <div className="dashboard-content profile-view">
      <div className="profile-header-section">
        <h1 className="profile-title">Job Seeker Profile</h1>
        {profileNotice && (
          <div className="profile-notice">
            <p>{profileNotice}</p>
          </div>
        )}
      </div>

      <div className="profile-container">
        {/* Profile Header Card */}
        <section className="profile-hero-card" aria-labelledby="profile-hero-heading">
          <div className="profile-hero-content">
            <div className="profile-avatar-section">
              <div
                className="profile-avatar"
                role="img"
                aria-label={
                  avatarUrl && !avatarLoadError
                    ? `Profile photo of ${name || 'user'}`
                    : `Avatar for ${name || 'user'}`
                }
              >
                {avatarUrl && !avatarLoadError ? (
                  <img
                    src={avatarUrl}
                    alt=""
                    className="profile-avatar-img"
                    onError={() => setAvatarLoadError(true)}
                  />
                ) : (
                  <span className="profile-avatar-initials">{getNameInitials(name)}</span>
                )}
              </div>
              <div className="profile-status-indicator" aria-label="Profile active"></div>
            </div>
            
            <div className="profile-identity">
              <h2 id="profile-hero-heading" className="profile-name">{name || 'Name not provided'}</h2>
              <div className="profile-contact">
                <p className="profile-email" style={heroContactTextStyle}>{email || 'Email not provided'}</p>
                {phone && <p className="profile-phone" style={heroContactTextStyle}>{phone}</p>}
                <p className="profile-location" style={heroContactTextStyle}>{[location, country].filter(Boolean).join(', ') || 'Location not specified'}</p>
              </div>
            </div>

            <div className="profile-actions">
              {linkedInUrl && (
                <a
                  href={linkedInUrl.startsWith('http') ? linkedInUrl : `https://${linkedInUrl}`}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="profile-btn profile-btn-outline"
                  aria-label="View LinkedIn profile"
                >
                  <FaLinkedin size={20} aria-hidden="true" style={{ marginRight: '8px' }} />
                  LinkedIn
                </a>
              )}
              {(() => {
                const defaultBuilderResume = builderResumes.find(r => r.isDefault) || builderResumes[0];
                if (resumeUrl) {
                  return (
                    <a href={resumeUrl} target="_blank" rel="noreferrer" className="profile-btn profile-btn-primary" aria-describedby="resume-help">
                      <span className="btn-icon">📄</span>
                      View Uploaded Resume
                    </a>
                  );
                }
                if (defaultBuilderResume) {
                  return (
                    <button
                      type="button"
                      className="profile-btn profile-btn-primary"
                      onClick={() => navigate('/dashboard/resume-builder', { state: { openResumeId: defaultBuilderResume._id } })}
                    >
                      <span className="btn-icon">📄</span>
                      {defaultBuilderResume.title || 'View Resume'}
                    </button>
                  );
                }
                return (
                  <div className="profile-btn profile-btn-disabled" aria-label="No resume uploaded">
                    <span className="btn-icon">📄</span>
                    No Resume Available
                  </div>
                );
              })()}
              <p id="resume-help" className="sr-only">Opens resume in a new tab</p>
            </div>
          </div>
        </section>

        {/* Profile Details Grid */}
        <section className="profile-details-section" aria-labelledby="profile-details-heading">
          <h2 id="profile-details-heading" className="section-title">Professional Details</h2>
          
          <div className="profile-details-grid">
            {(headline || keywords) && (
              <div className="profile-detail-card">
                <div className="detail-header">
                  <h3 className="detail-title">Professional Summary</h3>
                </div>
                <div className="detail-content">
                  {headline && (
                    <div className="detail-item">
                      <h4 className="detail-label">Professional Headline</h4>
                      <div className="detail-value">{headline}</div>
                    </div>
                  )}
                  {keywords && (
                    <div className="detail-item">
                      <h4 className="detail-label">Keywords & Skills</h4>
                      <div className="detail-value">{keywords}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(primaryExperienceNames.length > 0 || employmentTypeNames.length > 0 || (workLevel && mapValue(workLevel, EXP_MAP) !== workLevel)) && (
              <div className="profile-detail-card">
                <div className="detail-header">
                  <h3 className="detail-title">Experience & Employment</h3>
                </div>
                <div className="detail-content">
                  {primaryExperienceNames.length > 0 && (
                    <div className="detail-item">
                      <h4 className="detail-label">Primary Job Experience</h4>
                      <div className="detail-value"><Chips items={primaryExperienceNames} /></div>
                    </div>
                  )}
                  {employmentTypeNames.length > 0 && (
                    <div className="detail-item">
                      <h4 className="detail-label">Employment Types</h4>
                      <div className="detail-value"><Chips items={employmentTypeNames} /></div>
                    </div>
                  )}
                  {workLevel && mapValue(workLevel, EXP_MAP) !== workLevel && (
                    <div className="detail-item">
                      <h4 className="detail-label">Experience Level</h4>
                      <div className="detail-value">{mapValue(workLevel, EXP_MAP)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(educationLevel && mapValue(educationLevel, EDU_MAP) !== educationLevel) && (
              <div className="profile-detail-card">
                <div className="detail-header">
                  <h3 className="detail-title">Education & Qualifications</h3>
                </div>
                <div className="detail-content">
                  {educationLevel && mapValue(educationLevel, EDU_MAP) !== educationLevel && (
                    <div className="detail-item">
                      <h4 className="detail-label">Highest Education Level</h4>
                      <div className="detail-value">{mapValue(educationLevel, EDU_MAP)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {(languageNames.length > 0 || (veteranStatus && mapValue(veteranStatus, VET_MAP) !== veteranStatus)) && (
              <div className="profile-detail-card">
                <div className="detail-header">
                  <h3 className="detail-title">Additional Information</h3>
                </div>
                <div className="detail-content">
                  {languageNames.length > 0 && (
                    <div className="detail-item">
                      <h4 className="detail-label">Languages</h4>
                      <div className="detail-value"><Chips items={languageNames} /></div>
                    </div>
                  )}
                  {veteranStatus && mapValue(veteranStatus, VET_MAP) !== veteranStatus && (
                    <div className="detail-item">
                      <h4 className="detail-label">Veteran/Military Status</h4>
                      <div className="detail-value">{mapValue(veteranStatus, VET_MAP)}</div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {!headline && !keywords && !primaryExperienceNames.length && !employmentTypeNames.length && !languageNames.length && (
              <div className="profile-detail-card" style={{ gridColumn: '1 / -1' }}>
                <div className="detail-content" style={{ textAlign: 'center', padding: '24px', color: '#9ca3af' }}>
                  <p style={{ margin: 0 }}>Professional details not yet added. <button type="button" className="profile-btn profile-btn-outline" style={{ marginLeft: 8, padding: '4px 12px', fontSize: '13px' }} onClick={() => navigate('/dashboard/edit-profile')}>Edit Profile</button></p>
                </div>
              </div>
            )}
          </div>
        </section>

        {/* Resume Builder Resumes */}
        {builderResumes.length > 0 && (
          <section className="profile-details-section" aria-labelledby="resumes-heading">
            <h2 id="resumes-heading" className="section-title">My Resumes</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {builderResumes.map(r => (
                <div key={r._id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', border: `1px solid ${r.isDefault ? '#1d4ed8' : '#e5e7eb'}`, borderRadius: '8px', background: r.isDefault ? '#eff6ff' : '#fff' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontSize: '20px' }}>📄</span>
                    <div>
                      <div style={{ fontWeight: r.isDefault ? 600 : 400, fontSize: '14px', color: r.isDefault ? '#1d4ed8' : '#111827' }}>
                        {r.title || 'Untitled Resume'}
                      </div>
                      {r.lastAiGenerated && (
                        <div style={{ fontSize: '12px', color: '#374151', fontWeight: 500 }}>AI generated</div>
                      )}
                    </div>
                    {r.isDefault && (
                      <span style={{ fontSize: '11px', background: '#1d4ed8', color: '#fff', borderRadius: '999px', padding: '2px 8px' }}>Profile Resume</span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="profile-btn profile-btn-outline"
                    style={{ padding: '6px 14px', fontSize: '13px' }}
                    onClick={() => navigate('/dashboard/resume-builder', { state: { openResumeId: r._id } })}
                  >
                    View / Edit
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
