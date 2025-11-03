import React, { useState, useEffect } from 'react';
import { FiX, FiUser, FiMail, FiPhone, FiMapPin, FiFileText, FiAward, FiBriefcase, FiGlobe, FiCalendar, FiDollarSign, FiCheckCircle, FiLoader } from 'react-icons/fi';
import { getUser } from '../../services/users';
import './JobSeekerProfileCall.css';

const JobSeekerProfileCall = ({ jobSeeker, onClose }) => {
  const [fullJobSeekerData, setFullJobSeekerData] = useState(jobSeeker);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Fetch complete job seeker data if we only have basic info
  useEffect(() => {
    const fetchCompleteData = async () => {
      if (!jobSeeker) return;
      
      // Check if we have minimal data and need to fetch more
      // Try both _id and id fields, and check if metadata is missing or empty
      const userId = jobSeeker._id || jobSeeker.id;
      
      if (!userId) {
        console.warn('No user ID found in job seeker data:', jobSeeker);
        setFullJobSeekerData(jobSeeker);
        return;
      }
      
      const hasMinimalMetadata = !jobSeeker.metadata || Object.keys(jobSeeker.metadata || {}).length === 0;
      const hasMinimalProfile = !jobSeeker.jobSeekerProfile || Object.keys(jobSeeker.jobSeekerProfile || {}).length === 0;
      // Always fetch if we only have basic fields (id, name, email)
      const hasOnlyBasicFields = Object.keys(jobSeeker).length <= 5;
      const shouldFetchComplete = userId && (hasMinimalMetadata || hasMinimalProfile || hasOnlyBasicFields);
      
      if (shouldFetchComplete) {
        setLoading(true);
        try {
          const response = await getUser(userId);
          // API returns {user: {...}}, extract the user object
          const completeData = response.user || response;
          setFullJobSeekerData(completeData);
          setError(null);
        } catch (err) {
          console.error('Failed to fetch complete job seeker data:', err);
          // Don't show error if we have basic data to display
          if (jobSeeker.name || jobSeeker.firstName || jobSeeker.email) {
            setError(null); // Hide error since we have basic info
          } else {
            setError('Failed to load complete profile information');
          }
          // Keep using the basic data we have
          setFullJobSeekerData(jobSeeker);
        } finally {
          setLoading(false);
        }
      } else {
        setFullJobSeekerData(jobSeeker);
      }
    };

    fetchCompleteData();
  }, [jobSeeker]);

  if (!jobSeeker) {
    return (
      <div className="profile-panel-call" role="dialog" aria-labelledby="profile-title" aria-modal="true">
        <div className="profile-header-call">
          <div className="profile-title-call" id="profile-title">
            <FiUser size={20} aria-hidden="true" />
            <span>Job Seeker Profile</span>
          </div>
          <button 
            className="close-button-call" 
            onClick={onClose}
            aria-label="Close job seeker profile"
          >
            <FiX size={20} aria-hidden="true" />
          </button>
        </div>
        <div className="profile-content-call">
          <div className="no-data-message">
            <FiUser size={48} aria-hidden="true" />
            <p>No job seeker information available</p>
          </div>
        </div>
      </div>
    );
  }

  // Use the full data if available, fallback to original
  const currentJobSeeker = fullJobSeekerData || jobSeeker;
  
  // Get metadata from jobSeeker object - check multiple possible locations
  // Note: metadata.profile contains the job seeker profile information
  const metadata = currentJobSeeker.metadata?.profile || currentJobSeeker.metadata || currentJobSeeker.jobSeekerProfile || {};
  const profile = currentJobSeeker.jobSeekerProfile || currentJobSeeker.metadata?.profile || {};
  
  // Helper function to format arrays
  const formatArray = (arr) => {
    if (!arr) return null;
    if (Array.isArray(arr)) return arr.join(', ');
    // If it's already a string, return it as-is
    if (typeof arr === 'string') return arr;
    return null;
  };
  
  // Helper function to ensure we have an array (handle string or array input)
  const ensureArray = (value) => {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    if (typeof value === 'string') {
      // Split by comma, semicolon, or pipe and trim whitespace
      return value.split(/[,;|]/).map(item => item.trim()).filter(Boolean);
    }
    return [];
  };
  
  // Get profile picture URL
  const profilePicUrl = currentJobSeeker.avatarUrl || null;
  
  // Helper function to get display name
  const getDisplayName = () => {
    if (currentJobSeeker.name) return currentJobSeeker.name;
    if (currentJobSeeker.firstName && currentJobSeeker.lastName) {
      return `${currentJobSeeker.firstName} ${currentJobSeeker.lastName}`.trim();
    }
    if (currentJobSeeker.firstName) return currentJobSeeker.firstName;
    if (currentJobSeeker.lastName) return currentJobSeeker.lastName;
    return 'Unknown User';
  };
  
  // Helper function to get location string
  const getLocationString = () => {
    const locationParts = [
      currentJobSeeker.city,
      currentJobSeeker.state,
      currentJobSeeker.country
    ].filter(Boolean);
    return locationParts.length > 0 ? locationParts.join(', ') : null;
  };

  return (
    <div className="profile-panel-call" role="dialog" aria-labelledby="profile-title" aria-modal="true">
      {/* Header */}
      <div className="profile-header-call">
        <div className="profile-title-call" id="profile-title">
          <FiUser size={20} aria-hidden="true" />
          <span>Job Seeker Profile</span>
        </div>
        <button 
          className="close-button-call"
          onClick={onClose}
          aria-label="Close job seeker profile"
        >
          <FiX size={20} aria-hidden="true" />
        </button>
      </div>

      {/* Profile Content */}
      <div className="profile-content-call">
        {/* Loading State */}
        {loading && (
          <div className="loading-state" role="status" aria-live="polite">
            <FiLoader className="loading-spinner" size={32} aria-hidden="true" />
            <p>Loading complete profile information...</p>
          </div>
        )}
        
        {/* Error State - Only show if not loading and we have an error */}
        {error && !loading && (
          <div className="error-state" role="alert">
            <p className="error-message">{error}</p>
          </div>
        )}
        
        {/* Profile Content - Show even during loading for better UX */}
        <div className={`profile-sections ${loading ? 'loading' : ''}`}>
        {/* Basic Information */}
        <div className="profile-section">
          <div className="profile-header-section">
            <div className="profile-avatar">
              {profilePicUrl ? (
                <img 
                  src={profilePicUrl} 
                  alt={jobSeeker.name || 'Profile'}
                  className="avatar-image"
                  onError={(e) => {
                    e.target.style.display = 'none';
                    const initials = getDisplayName().charAt(0).toUpperCase();
                    e.target.insertAdjacentHTML('afterend', `<div class="avatar-circle large">${initials}</div>`);
                  }}
                />
              ) : (
                <div className="avatar-circle large">
                  {getDisplayName().charAt(0).toUpperCase()}
                </div>
              )}
            </div>
            <div className="profile-header-info">
              <h2 className="profile-name">{getDisplayName()}</h2>
              {(metadata.professionalHeadline || metadata.headline) && (
                <p className="professional-headline">{metadata.professionalHeadline || metadata.headline}</p>
              )}
            </div>
          </div>
          <div className="basic-info">
            <div className="contact-info">
              <p className="profile-email">
                <FiMail size={16} aria-hidden="true" />
                <span>{currentJobSeeker.email || 'No email provided'}</span>
              </p>
              {currentJobSeeker.phoneNumber && (
                <p className="profile-phone">
                  <FiPhone size={16} aria-hidden="true" />
                  <span>{currentJobSeeker.phoneNumber}</span>
                </p>
              )}
              {getLocationString() && (
                <p className="profile-location">
                  <FiMapPin size={16} aria-hidden="true" />
                  <span>{getLocationString()}</span>
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Professional Summary */}
        {(metadata.professionalSummary || metadata.summary) && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiFileText size={18} aria-hidden="true" />
              Professional Summary
            </h3>
            <div className="summary-text" role="region" aria-label="Professional summary">
              {metadata.professionalSummary || metadata.summary}
            </div>
          </div>
        )}

        {/* Experience */}
        {(metadata.experience || metadata.yearsOfExperience || metadata.currentJobTitle || metadata.currentEmployer || metadata.employmentTypes) && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiBriefcase size={18} aria-hidden="true" />
              Experience & Employment
            </h3>
            <div className="info-grid">
              {metadata.yearsOfExperience && (
                <div className="info-card">
                  <strong>Years of Experience:</strong>
                  <span>{metadata.yearsOfExperience}</span>
                </div>
              )}
              {metadata.currentJobTitle && (
                <div className="info-card">
                  <strong>Current Job Title:</strong>
                  <span>{metadata.currentJobTitle}</span>
                </div>
              )}
              {metadata.currentEmployer && (
                <div className="info-card">
                  <strong>Current Employer:</strong>
                  <span>{metadata.currentEmployer}</span>
                </div>
              )}
              {metadata.employmentTypes && (
                <div className="info-card">
                  <strong>Employment Types:</strong>
                  <span>{Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes.join(', ') : metadata.employmentTypes}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Skills */}
        {(metadata.skills || metadata.keywords) && (() => {
          const skills = ensureArray(metadata.skills || metadata.keywords);
          return skills.length > 0 ? (
            <div className="profile-section">
              <h3 className="section-title">
                <FiAward size={18} aria-hidden="true" />
                Skills & Expertise
              </h3>
              <div className="skills-list" role="list" aria-label="Skills and expertise">
                {skills.map((skill, index) => (
                  <span key={index} className="skill-tag" role="listitem">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          ) : null;
        })()}

        {/* Education */}
        {(metadata.education || metadata.highestEducation || metadata.fieldOfStudy || metadata.certifications) && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiAward size={18} aria-hidden="true" />
              Education & Qualifications
            </h3>
            <div className="info-grid">
              {metadata.highestEducation && (
                <div className="info-card">
                  <strong>Highest Education:</strong>
                  <span>{metadata.highestEducation}</span>
                </div>
              )}
              {metadata.fieldOfStudy && (
                <div className="info-card">
                  <strong>Field of Study:</strong>
                  <span>{metadata.fieldOfStudy}</span>
                </div>
              )}
              {metadata.certifications && (
                <div className="info-card full-width">
                  <strong>Certifications:</strong>
                  <span>{formatArray(metadata.certifications)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Accessibility Needs */}
        {(currentJobSeeker.needsASL || currentJobSeeker.needsCaptions || currentJobSeeker.usesScreenReader || currentJobSeeker.usesScreenMagnifier || currentJobSeeker.needsOther) && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiCheckCircle size={18} aria-hidden="true" />
              Accessibility Needs
            </h3>
            <div className="accessibility-badges">
              {currentJobSeeker.needsASL && (
                <span className="accessibility-badge">ASL Required</span>
              )}
              {currentJobSeeker.needsCaptions && (
                <span className="accessibility-badge">Captions Required</span>
              )}
              {currentJobSeeker.usesScreenReader && (
                <span className="accessibility-badge">Screen Reader</span>
              )}
              {currentJobSeeker.usesScreenMagnifier && (
                <span className="accessibility-badge">Screen Magnifier</span>
              )}
              {currentJobSeeker.needsOther && (
                <span className="accessibility-badge">Other Needs</span>
              )}
            </div>
          </div>
        )}

        {/* Languages */}
        {metadata.languages && metadata.languages.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiGlobe size={18} aria-hidden="true" />
              Languages
            </h3>
            <div className="languages-badges">
              {metadata.languages.map((lang, index) => (
                <span key={index} className="language-badge">
                  {typeof lang === 'string' ? lang : lang.name}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Job Preferences */}
        {(metadata.willingToRelocate || metadata.desiredSalary || metadata.availableStartDate || metadata.preferredJobTypes || metadata.preferredLocations) && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiBriefcase size={18} aria-hidden="true" />
              Job Preferences
            </h3>
            <div className="info-grid">
              {metadata.willingToRelocate !== undefined && (
                <div className="info-card">
                  <strong>Willing to Relocate:</strong>
                  <span>{metadata.willingToRelocate ? 'Yes' : 'No'}</span>
                </div>
              )}
              {metadata.desiredSalary && (
                <div className="info-card">
                  <FiDollarSign size={14} aria-hidden="true" />
                  <strong>Desired Salary:</strong>
                  <span>{metadata.desiredSalary}</span>
                </div>
              )}
              {metadata.availableStartDate && (
                <div className="info-card">
                  <FiCalendar size={14} aria-hidden="true" />
                  <strong>Available Start Date:</strong>
                  <span>{metadata.availableStartDate}</span>
                </div>
              )}
              {metadata.preferredJobTypes && (
                <div className="info-card full-width">
                  <strong>Preferred Job Types:</strong>
                  <span>{formatArray(metadata.preferredJobTypes)}</span>
                </div>
              )}
              {metadata.preferredLocations && (
                <div className="info-card full-width">
                  <strong>Preferred Locations:</strong>
                  <span>{formatArray(metadata.preferredLocations)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Resume Link */}
        {currentJobSeeker.resumeUrl && (
          <div className="profile-section">
            <div className="resume-section">
              <a 
                href={currentJobSeeker.resumeUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="resume-link"
                aria-label="View job seeker's resume (opens in new tab)"
              >
                <FiFileText size={18} aria-hidden="true" />
                View Resume
              </a>
            </div>
          </div>
        )}
        

        {/* No Information Available */}
        {!loading && !error && !metadata.professionalSummary && !metadata.summary && !metadata.skills && !metadata.keywords && !metadata.experience && !metadata.yearsOfExperience && !currentJobSeeker.resumeUrl && (
          <div className="profile-section">
            <div className="no-additional-info">
              <FiFileText size={48} aria-hidden="true" />
              <h4>Limited Profile Information</h4>
              <p>This job seeker hasn't completed their detailed profile yet. Basic contact information is available above.</p>
            </div>
          </div>
        )}
        
        </div>
      </div>
    </div>
  );
};

export default JobSeekerProfileCall;
