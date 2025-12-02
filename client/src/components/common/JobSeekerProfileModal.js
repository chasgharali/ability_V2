import React, { useState, useEffect } from 'react';
import { getUser } from '../../services/users';
import {
  JOB_CATEGORY_LIST,
  LANGUAGE_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  SECURITY_CLEARANCE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';
import './JobSeekerProfileModal.css';

export default function JobSeekerProfileModal({ isOpen, onClose, jobSeeker }) {
  const [fullJobSeekerData, setFullJobSeekerData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Helper function to get label from value using options list
  const getLabelFromValue = (value, optionsList) => {
    if (!value) return 'Not provided';
    const option = optionsList.find(opt => opt.value === value);
    return option ? option.name : value;
  };

  // Fetch full job seeker data when modal opens
  useEffect(() => {
    if (!isOpen || !jobSeeker) {
      setFullJobSeekerData(null);
      return;
    }

    const fetchFullData = async () => {
      setLoading(true);
      setError(null);

      try {
        // Get job seeker ID from different possible structures
        const jobSeekerId = jobSeeker._id || 
                           jobSeeker.jobSeeker?._id || 
                           jobSeeker.jobSeekerId ||
                           (typeof jobSeeker.jobSeeker === 'string' ? jobSeeker.jobSeeker : null);

        if (!jobSeekerId) {
          // If we have basic data, use it directly
          setFullJobSeekerData(jobSeeker.jobSeeker || jobSeeker);
          setLoading(false);
          return;
        }

        // Fetch complete user data
        const response = await getUser(jobSeekerId);
        const userData = response.user || response;
        setFullJobSeekerData(userData);
      } catch (err) {
        console.error('Error fetching job seeker data:', err);
        // Use available data as fallback
        setFullJobSeekerData(jobSeeker.jobSeeker || jobSeeker);
        setError('Some details may not be available');
      } finally {
        setLoading(false);
      }
    };

    fetchFullData();
  }, [isOpen, jobSeeker]);

  // Handle keyboard events - must be before early returns
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Use full data if available, otherwise use provided data
  const js = fullJobSeekerData || jobSeeker?.jobSeeker || jobSeeker;
  if (!js) return null;

  const metadata = js.metadata || {};
  const profile = metadata.profile || {};
  const firstName = js.firstName || js.name?.split(' ')[0] || '';
  const lastName = js.lastName || js.name?.split(' ').slice(1).join(' ') || '';
  const fullName = js.name || `${firstName} ${lastName}`.trim() || 'Unknown';
  const email = js.email || '';
  const phone = js.phone || js.phoneNumber || '';
  const city = js.city || '';
  const state = js.state || '';
  const country = js.country || 'US';

  return (
    <div 
      className="modal-overlay job-seeker-profile-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          onClose();
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape' || (e.key === 'Enter' && e.target === e.currentTarget)) {
          onClose();
        }
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="job-seeker-profile-title"
      tabIndex={-1}
    >
      <div className="modal-content job-seeker-profile-modal">
        <div className="modal-header">
          <h3 id="job-seeker-profile-title">Job Seeker Profile</h3>
          <button
            className="modal-close"
            onClick={onClose}
            aria-label="Close job seeker profile"
            type="button"
          >
            ×
          </button>
        </div>

        <div className="profile-body">
          {loading ? (
            <div className="profile-loading">
              <div className="loading-spinner"></div>
              <p>Loading profile details...</p>
            </div>
          ) : error ? (
            <div className="profile-error">
              <p>{error}</p>
            </div>
          ) : null}

          {/* Profile Header */}
          <div className="profile-header">
            <div className="profile-avatar">
              {js.avatarUrl ? (
                <img src={js.avatarUrl} alt={fullName} />
              ) : (
                <div className="avatar-placeholder">
                  {fullName.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="profile-info">
              <h2 className="profile-name">{fullName}</h2>
              <p className="profile-email">{email || 'No email provided'}</p>
              {phone && (
                <p className="profile-phone">{phone}</p>
              )}
              {(city || state) && (
                <p className="profile-location">
                  {[city, state, country].filter(Boolean).join(', ')}
                </p>
              )}
              <div className="profile-actions">
                {js.resumeUrl ? (
                  <a
                    href={js.resumeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="btn-resume"
                  >
                    📄 View Complete Resume
                  </a>
                ) : (
                  <button className="btn-resume" disabled>
                    📄 No Resume Available
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Professional Details */}
          <div className="professional-details">
            <h3>Professional Details</h3>

            <div className="details-grid">
              {/* Professional Summary */}
              <div className="detail-section">
                <h4>Professional Summary</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">PROFESSIONAL HEADLINE</span>
                    <p>{profile.headline || metadata.professionalHeadline || metadata.headline || 'Not provided'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">KEYWORDS & SKILLS</span>
                    <p>{profile.keywords || metadata.skills || metadata.keywords || 'Not provided'}</p>
                  </div>
                </div>
              </div>

              {/* Experience & Employment */}
              <div className="detail-section">
                <h4>Experience & Employment</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">PRIMARY JOB EXPERIENCE</span>
                    <p>{getLabelFromValue(
                      profile.primaryExperience?.[0] || 
                      metadata.primaryJobExperience || 
                      metadata.primaryExperience?.[0], 
                      JOB_CATEGORY_LIST
                    )}</p>
                    {(profile.primaryExperience?.[1] || metadata.secondaryJobExperience || metadata.primaryExperience?.[1]) && (
                      <p>{getLabelFromValue(
                        profile.primaryExperience?.[1] || 
                        metadata.secondaryJobExperience || 
                        metadata.primaryExperience?.[1], 
                        JOB_CATEGORY_LIST
                      )}</p>
                    )}
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">EMPLOYMENT TYPES</span>
                    <div className="tags">
                      {(profile.employmentTypes || metadata.employmentTypes || metadata.employmentType) ? 
                        (Array.isArray(profile.employmentTypes) ? profile.employmentTypes : 
                         Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes : 
                         Array.isArray(metadata.employmentType) ? metadata.employmentType : 
                         [profile.employmentTypes || metadata.employmentTypes || metadata.employmentType]).map((type, index) => (
                          <span key={index} className="tag">
                            {getLabelFromValue(type, JOB_TYPE_LIST)}
                          </span>
                        )) : <span>Not provided</span>}
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">EXPERIENCE LEVEL</span>
                    <p>{getLabelFromValue(
                      profile.workLevel || 
                      metadata.experienceLevel || 
                      metadata.workLevel, 
                      EXPERIENCE_LEVEL_LIST
                    )}</p>
                  </div>
                </div>
              </div>

              {/* Education & Qualifications */}
              <div className="detail-section">
                <h4>Education & Qualifications</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">HIGHEST EDUCATION LEVEL</span>
                    <p>{getLabelFromValue(
                      profile.educationLevel || 
                      metadata.education || 
                      metadata.educationLevel, 
                      EDUCATION_LEVEL_LIST
                    )}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">SECURITY CLEARANCE</span>
                    <p>{getLabelFromValue(
                      profile.clearance || 
                      metadata.securityClearance || 
                      metadata.clearance, 
                      SECURITY_CLEARANCE_LIST
                    )}</p>
                  </div>
                </div>
              </div>

              {/* Additional Information */}
              <div className="detail-section">
                <h4>Additional Information</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">LANGUAGES</span>
                    <div className="tags">
                      {(profile.languages || metadata.languages || js.languages) ? 
                        (profile.languages || metadata.languages || js.languages).map((lang, index) => (
                          <span key={index} className="tag">
                            {getLabelFromValue(lang, LANGUAGE_LIST)}
                          </span>
                        )) : <span>Not provided</span>}
                    </div>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">WORK AUTHORIZATION</span>
                    <p>{profile.workAuthorization || metadata.workAuthorization || metadata.workAuth || 'Not provided'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">VETERAN/MILITARY STATUS</span>
                    <p>{getLabelFromValue(
                      profile.veteranStatus || 
                      metadata.veteranStatus || 
                      metadata.militaryStatus, 
                      MILITARY_EXPERIENCE_LIST
                    )}</p>
                  </div>
                </div>
              </div>

              {/* Accessibility Needs */}
              <div className="detail-section">
                <h4>Accessibility Needs</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">SCREEN MAGNIFIER</span>
                    <p>{js.usesScreenMagnifier ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">SCREEN READER</span>
                    <p>{js.usesScreenReader ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">ASL INTERPRETER</span>
                    <p>{js.needsASL ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">CAPTIONS</span>
                    <p>{js.needsCaptions ? 'Yes' : 'No'}</p>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">OTHER ACCOMMODATIONS</span>
                    <p>{js.needsOther ? 'Yes' : 'No'}</p>
                  </div>
                </div>
              </div>

              {/* Account Details */}
              <div className="detail-section">
                <h4>Account Details</h4>
                <div className="detail-content">
                  <div className="detail-item">
                    <span className="detail-label">STATUS</span>
                    <span className={`status-badge ${js.isActive !== false ? 'active' : 'inactive'}`}>
                      {js.isActive !== false ? 'ACTIVE' : 'INACTIVE'}
                    </span>
                  </div>
                  <div className="detail-item">
                    <span className="detail-label">EMAIL VERIFIED</span>
                    <span className={`status-badge ${js.emailVerified ? 'verified' : 'unverified'}`}>
                      {js.emailVerified ? 'YES' : 'NO'}
                    </span>
                  </div>
                  {js.createdAt && (
                    <div className="detail-item">
                      <span className="detail-label">CREATED</span>
                      <p>{new Date(js.createdAt).toLocaleDateString()}</p>
                    </div>
                  )}
                  {js.lastLogin && (
                    <div className="detail-item">
                      <span className="detail-label">LAST LOGIN</span>
                      <p>{new Date(js.lastLogin).toLocaleDateString()}</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

