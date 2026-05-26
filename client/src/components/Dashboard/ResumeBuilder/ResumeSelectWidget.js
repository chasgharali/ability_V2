import React, { useEffect, useState } from 'react';
import { listResumes } from '../../../services/resumes';
import './ResumeBuilder.css';

/**
 * Compact resume picker used inside the event RegistrationWizard.
 * Props:
 *   selectedResumeId  – currently selected resume _id (or null)
 *   onChange(id|null) – called when selection changes
 *   description       – optional helper text for this context
 *   skipLabel         – optional label for selecting no saved resume
 */
export default function ResumeSelectWidget({
  selectedResumeId,
  onChange,
  description = 'Select a saved resume to share with recruiters at this event, or skip and use your uploaded resume.',
  skipLabel = 'Skip — use my uploaded resume file only'
}) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);
  const groupLabelId = 'resume-select-widget-title';
  const groupDescId = 'resume-select-widget-description';

  useEffect(() => {
    listResumes()
      .then(d => setResumes(d.resumes || []))
      .catch(() => setResumes([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="rb-select-section">
        <p role="status" aria-live="polite">Loading saved resumes…</p>
      </div>
    );
  }

  return (
    <div className="rb-select-section">
      <h4 id={groupLabelId}>Attach a Resume from Resume Builder</h4>
      <p id={groupDescId}>{description}</p>

      <div className="rb-select-list" role="radiogroup" aria-labelledby={groupLabelId} aria-describedby={groupDescId}>
        {resumes.map(r => (
          <label
            key={r._id}
            className={`rb-select-item ${selectedResumeId === r._id ? 'selected' : ''}`}
          >
            <input
              type="radio"
              name="selectedResume"
              value={r._id}
              checked={selectedResumeId === r._id}
              onChange={() => onChange(r._id)}
            />
            <div className="rb-select-item-info">
              <div className="rb-select-item-title">
                {r.title || 'Untitled Resume'}
                {r.isDefault && <span style={{ marginLeft: 6, fontSize: '0.72rem', color: '#6b7280' }}>(default)</span>}
              </div>
              <div className="rb-select-item-meta">
                Updated {new Date(r.updatedAt).toLocaleDateString()}
                {r.content?.name ? ` · ${r.content.name}` : ''}
              </div>
            </div>
          </label>
        ))}
      </div>

      <label className={`rb-select-none ${!selectedResumeId ? 'selected' : ''}`}>
        <input
          type="radio"
          name="selectedResume"
          value=""
          checked={!selectedResumeId}
          onChange={() => onChange(null)}
        />
        {skipLabel}
      </label>

      {resumes.length === 0 && (
        <div className="rb-select-link">
          No saved resumes yet.{' '}
          <a href="/dashboard/resume-builder" target="_blank" rel="noopener noreferrer">
            Open Resume Builder
          </a>{' '}
          to create one.
        </div>
      )}
    </div>
  );
}
