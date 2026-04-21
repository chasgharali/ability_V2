import React, { useEffect, useState } from 'react';
import { listResumes } from '../../../services/resumes';
import './ResumeBuilder.css';

/**
 * Compact resume picker used inside the event RegistrationWizard.
 * Props:
 *   selectedResumeId  – currently selected resume _id (or null)
 *   onChange(id|null) – called when selection changes
 */
export default function ResumeSelectWidget({ selectedResumeId, onChange }) {
  const [resumes, setResumes] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listResumes()
      .then(d => setResumes(d.resumes || []))
      .catch(() => setResumes([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="rb-select-section"><p>Loading saved resumes…</p></div>;

  return (
    <div className="rb-select-section">
      <h4>Attach a Resume from Resume Builder</h4>
      <p>Select a saved resume to share with recruiters at this event, or skip and use your uploaded resume.</p>

      <div className="rb-select-list">
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
        Skip — use my uploaded resume file only
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
