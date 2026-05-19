import React, { useState, useEffect } from 'react';
import { FiX, FiUser, FiMail, FiPhone, FiMapPin, FiFileText, FiAward, FiBriefcase, FiCalendar, FiDollarSign, FiLoader } from 'react-icons/fi';
import { FaLinkedin } from 'react-icons/fa';
import { getUser } from '../../services/users';
import { openResumeInNewTab } from '../../utils/resumeViewer';
import { getResolvedResumeRefs } from '../../utils/jobSeekerResume';
import {
  JOB_CATEGORY_LIST,
  JOB_TYPE_LIST,
  EXPERIENCE_LEVEL_LIST,
  EDUCATION_LEVEL_LIST,
  LANGUAGE_LIST,
  MILITARY_EXPERIENCE_LIST
} from '../../constants/options';
import './JobSeekerProfileCall.css';

const parseMetadata = (raw) => {
  if (!raw) return {};
  if (typeof raw === 'object' && !Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
};

const getLabelFromValue = (value, optionsList) => {
  if (!value) return 'Not specified';
  const option = optionsList.find((opt) => opt.value === value);
  return option ? option.name : value;
};

const getLabelsFromValues = (values, optionsList) => {
  if (!values || values.length === 0) return [];
  return values.map((value) => getLabelFromValue(value, optionsList));
};

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
          // Resume-builder resumes come back on the top-level response
          if (response.resolvedResume) {
            completeData.resolvedResume = response.resolvedResume;
          }
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
  
  const parsedMetadata = parseMetadata(currentJobSeeker.metadata);
  const metadata = {
    ...parsedMetadata,
    ...(currentJobSeeker.jobSeekerProfile && typeof currentJobSeeker.jobSeekerProfile === 'object'
      ? currentJobSeeker.jobSeekerProfile
      : {})
  };
  const profile = (
    parsedMetadata.profile &&
    typeof parsedMetadata.profile === 'object' &&
    !Array.isArray(parsedMetadata.profile)
  )
    ? parsedMetadata.profile
    : {};
  const { resumeId, resumeUrl, hasResume } = getResolvedResumeRefs(currentJobSeeker, metadata);

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

  const primaryJob = metadata.primaryJob || metadata.primaryJobTitle || metadata.primaryRole || metadata.currentJobTitle;
  const hasExperienceOrSkills = Boolean(
    metadata.experience ||
    metadata.yearsOfExperience ||
    metadata.currentJobTitle ||
    metadata.currentEmployer ||
    metadata.employmentTypes ||
    primaryJob ||
    metadata.skills ||
    metadata.keywords
  );
  const skills = ensureArray(metadata.skills || metadata.keywords);
  const educationValues = ensureArray(metadata.education);
  const jobExperienceValues = ensureArray(
    profile.primaryExperience || metadata.primaryExperience || metadata.primaryJobExperience || metadata.primaryJob
  );
  const employmentTypeValues = ensureArray(
    profile.employmentTypes || metadata.employmentTypes || metadata.employmentType || metadata.preferredJobTypes
  );
  const languageValues = ensureArray(profile.languages || metadata.languages || currentJobSeeker.languages);
  const experienceLevel = getLabelFromValue(
    profile.workLevel || metadata.workLevel || metadata.experienceLevel,
    EXPERIENCE_LEVEL_LIST
  );
  const educationLevel = getLabelFromValue(
    profile.educationLevel || metadata.educationLevel || metadata.highestEducation,
    EDUCATION_LEVEL_LIST
  );
  const veteranStatus = getLabelFromValue(
    profile.veteranStatus || metadata.veteranStatus || metadata.militaryStatus,
    MILITARY_EXPERIENCE_LIST
  );
  const hasCareerSnapshot = Boolean(
    jobExperienceValues.length > 0 ||
    employmentTypeValues.length > 0 ||
    languageValues.length > 0 ||
    profile.workLevel ||
    metadata.workLevel ||
    metadata.experienceLevel ||
    profile.educationLevel ||
    metadata.educationLevel ||
    metadata.highestEducation ||
    profile.veteranStatus ||
    metadata.veteranStatus ||
    metadata.militaryStatus
  );

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
              {(currentJobSeeker.linkedInUrl || hasResume) && (
                <div className="profile-top-actions">
                  {currentJobSeeker.linkedInUrl && (
                    <a
                      href={currentJobSeeker.linkedInUrl.startsWith('http') ? currentJobSeeker.linkedInUrl : `https://${currentJobSeeker.linkedInUrl}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="resume-link compact"
                      aria-label="View LinkedIn profile (opens in new tab)"
                    >
                      <FaLinkedin size={16} aria-hidden="true" />
                      LinkedIn
                    </a>
                  )}
                  {hasResume && (
                    <button
                      type="button"
                      className="resume-link compact"
                      onClick={() => openResumeInNewTab(resumeId, resumeUrl)}
                      aria-label="View job seeker resume"
                    >
                      <FiFileText size={16} aria-hidden="true" />
                      Resume
                    </button>
                  )}
                </div>
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
              {(profile.headline || metadata.professionalHeadline || metadata.headline) && (
                <p className="professional-headline">
                  {profile.headline || metadata.professionalHeadline || metadata.headline}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Keywords + Experience */}
        {hasExperienceOrSkills && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiAward size={18} aria-hidden="true" />
              Keywords (Skills & Experience)
            </h3>
            {skills.length > 0 && (
              <div className="skills-list" role="list" aria-label="Skills and expertise">
                {skills.map((skill, index) => (
                  <span key={index} className="skill-tag" role="listitem">
                    {skill}
                  </span>
                ))}
              </div>
            )}
            <div className="info-grid compact-grid">
              {primaryJob && (
                <div className="info-card">
                  <strong>Primary Job:</strong>
                  <span>{primaryJob}</span>
                </div>
              )}
              {metadata.yearsOfExperience && (
                <div className="info-card">
                  <strong>Years of Experience:</strong>
                  <span>{metadata.yearsOfExperience}</span>
                </div>
              )}
              {metadata.currentEmployer && (
                <div className="info-card">
                  <strong>Current Employer:</strong>
                  <span>{metadata.currentEmployer}</span>
                </div>
              )}
              {metadata.employmentTypes && (
                <div className="info-card full-width">
                  <strong>Employment Types:</strong>
                  <span>{Array.isArray(metadata.employmentTypes) ? metadata.employmentTypes.join(', ') : metadata.employmentTypes}</span>
                </div>
              )}
              {metadata.experience && (
                <div className="info-card full-width">
                  <strong>Experience:</strong>
                  <span>{formatArray(metadata.experience) || metadata.experience}</span>
                </div>
              )}
            </div>
          </div>
        )}

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
              {educationValues.length > 0 && (
                <div className="info-card full-width">
                  <strong>Education:</strong>
                  <span>{educationValues.join(', ')}</span>
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

        {/* Career Snapshot */}
        {hasCareerSnapshot && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiBriefcase size={18} aria-hidden="true" />
              Career Snapshot
            </h3>
            <div className="info-grid compact-grid">
              {jobExperienceValues.length > 0 && (
                <div className="info-card full-width">
                  <strong>Job Experience:</strong>
                  <span>{getLabelsFromValues(jobExperienceValues, JOB_CATEGORY_LIST).join(', ')}</span>
                </div>
              )}
              <div className="info-card">
                <strong>Experience Level:</strong>
                <span>{experienceLevel}</span>
              </div>
              <div className="info-card">
                <strong>Education:</strong>
                <span>{educationLevel}</span>
              </div>
              {employmentTypeValues.length > 0 && (
                <div className="info-card full-width">
                  <strong>Employment Types:</strong>
                  <span>{getLabelsFromValues(employmentTypeValues, JOB_TYPE_LIST).join(', ')}</span>
                </div>
              )}
              {languageValues.length > 0 && (
                <div className="info-card full-width">
                  <strong>Language:</strong>
                  <span>{getLabelsFromValues(languageValues, LANGUAGE_LIST).join(', ')}</span>
                </div>
              )}
              <div className="info-card">
                <strong>Veteran Status:</strong>
                <span>{veteranStatus}</span>
              </div>
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

        {/* No Information Available */}
        {!loading && !error && !metadata.professionalSummary && !metadata.summary && !metadata.skills && !metadata.keywords && !metadata.experience && !metadata.yearsOfExperience && !metadata.education && !metadata.highestEducation && !hasCareerSnapshot && !hasResume && !currentJobSeeker.linkedInUrl && (
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
