import React from 'react';
import { FiX, FiUser, FiMail, FiPhone, FiMapPin, FiFileText, FiAward, FiBriefcase } from 'react-icons/fi';
import './JobSeekerProfile.css';

const JobSeekerProfile = ({ jobSeeker, onClose }) => {
  if (!jobSeeker) {
    return (
      <div className="profile-panel">
        <div className="profile-header">
          <div className="profile-title">
            <FiUser size={20} />
            <span>Job Seeker Profile</span>
          </div>
          <button className="close-button" onClick={onClose}>
            <FiX size={20} />
          </button>
        </div>
        <div className="profile-content">
          <p>No job seeker information available</p>
        </div>
      </div>
    );
  }

  const profile = jobSeeker.jobSeekerProfile || {};

  return (
    <div className="profile-panel">
      {/* Header */}
      <div className="profile-header">
        <div className="profile-title">
          <FiUser size={20} />
          <span>Job Seeker Profile</span>
        </div>
        <button 
          className="close-button"
          onClick={onClose}
          aria-label="Close profile"
        >
          <FiX size={20} />
        </button>
      </div>

      {/* Profile Content */}
      <div className="profile-content">
        {/* Basic Information */}
        <div className="profile-section">
          <div className="profile-avatar">
            <div className="avatar-circle large">
              {jobSeeker.name?.charAt(0)?.toUpperCase() || 'U'}
            </div>
          </div>
          
          <div className="basic-info">
            <h2 className="profile-name">{jobSeeker.name || 'Unknown User'}</h2>
            <p className="profile-email">
              <FiMail size={16} />
              {jobSeeker.email || 'No email provided'}
            </p>
            {profile.phone && (
              <p className="profile-phone">
                <FiPhone size={16} />
                {profile.phone}
              </p>
            )}
            {profile.location && (
              <p className="profile-location">
                <FiMapPin size={16} />
                {profile.location}
              </p>
            )}
          </div>
        </div>

        {/* Professional Summary */}
        {profile.summary && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiFileText size={18} />
              Professional Summary
            </h3>
            <p className="summary-text">{profile.summary}</p>
          </div>
        )}

        {/* Experience */}
        {profile.experience && profile.experience.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiBriefcase size={18} />
              Experience
            </h3>
            <div className="experience-list">
              {profile.experience.map((exp, index) => (
                <div key={index} className="experience-item">
                  <h4 className="job-title">{exp.title}</h4>
                  <p className="company-name">{exp.company}</p>
                  <p className="job-duration">
                    {exp.startDate} - {exp.endDate || 'Present'}
                  </p>
                  {exp.description && (
                    <p className="job-description">{exp.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Skills */}
        {profile.skills && profile.skills.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">
              <FiAward size={18} />
              Skills
            </h3>
            <div className="skills-list">
              {profile.skills.map((skill, index) => (
                <span key={index} className="skill-tag">
                  {skill}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Education */}
        {profile.education && profile.education.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">Education</h3>
            <div className="education-list">
              {profile.education.map((edu, index) => (
                <div key={index} className="education-item">
                  <h4 className="degree">{edu.degree}</h4>
                  <p className="institution">{edu.institution}</p>
                  <p className="graduation-year">{edu.graduationYear}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Accessibility Needs */}
        {profile.accessibilityNeeds && profile.accessibilityNeeds.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">Accessibility Needs</h3>
            <div className="accessibility-list">
              {profile.accessibilityNeeds.map((need, index) => (
                <div key={index} className="accessibility-item">
                  <span className="need-type">{need.type}</span>
                  {need.description && (
                    <p className="need-description">{need.description}</p>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Languages */}
        {profile.languages && profile.languages.length > 0 && (
          <div className="profile-section">
            <h3 className="section-title">Languages</h3>
            <div className="languages-list">
              {profile.languages.map((lang, index) => (
                <div key={index} className="language-item">
                  <span className="language-name">{lang.language}</span>
                  <span className="proficiency-level">({lang.proficiency})</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Additional Information */}
        <div className="profile-section">
          <h3 className="section-title">Additional Information</h3>
          <div className="additional-info">
            {profile.workAuthorization && (
              <div className="info-item">
                <strong>Work Authorization:</strong> {profile.workAuthorization}
              </div>
            )}
            {profile.availableStartDate && (
              <div className="info-item">
                <strong>Available Start Date:</strong> {profile.availableStartDate}
              </div>
            )}
            {profile.salaryExpectation && (
              <div className="info-item">
                <strong>Salary Expectation:</strong> {profile.salaryExpectation}
              </div>
            )}
            {profile.jobType && (
              <div className="info-item">
                <strong>Job Type Preference:</strong> {profile.jobType}
              </div>
            )}
          </div>
        </div>

        {/* Resume Link */}
        {profile.resumeUrl && (
          <div className="profile-section">
            <div className="resume-section">
              <a 
                href={profile.resumeUrl} 
                target="_blank" 
                rel="noopener noreferrer"
                className="resume-link"
              >
                <FiFileText size={18} />
                View Resume
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default JobSeekerProfile;
