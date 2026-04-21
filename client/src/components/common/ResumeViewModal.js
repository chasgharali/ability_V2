import React, { useState, useEffect } from 'react';
import { getAdminResume } from '../../services/resumes';
import './ResumeViewModal.css';

export default function ResumeViewModal({ resumeId, resumeUrl, resumeTitle, onClose }) {
  const [resume, setResume] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!resumeId) return;
    setLoading(true);
    setError(null);
    getAdminResume(resumeId)
      .then(data => setResume(data.resume))
      .catch(() => setError('Failed to load resume.'))
      .finally(() => setLoading(false));
  }, [resumeId]);

  const c = resume?.content || {};

  return (
    <div className="rvm-overlay">
      {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions */}
      <div className="rvm-backdrop" onClick={onClose} />
      <div role="dialog" aria-modal="true" aria-label="View Resume" className="rvm-dialog">
        <div className="rvm-header">
          <h2 className="rvm-title">{resume?.title || resumeTitle || 'Resume'}</h2>
          <button className="rvm-close" onClick={onClose} aria-label="Close resume viewer">&times;</button>
        </div>

        <div className="rvm-body">
          {loading && <p className="rvm-loading">Loading resume…</p>}
          {error && <p className="rvm-error">{error}</p>}

          {!loading && !error && resumeId && resume && (
            <div className="rvm-doc">
              <header className="rb-doc-header">
                <h1>{c.name || '—'}</h1>
                <div className="rb-doc-contact">
                  {c.email && <span>{c.email}</span>}
                  {c.phone && <span>{c.phone}</span>}
                  {c.location && <span>{c.location}</span>}
                  {c.linkedIn && <span>{c.linkedIn}</span>}
                  {c.website && <span>{c.website}</span>}
                </div>
              </header>

              {c.summary && (
                <section className="rb-doc-section">
                  <h2>Professional Summary</h2>
                  <p>{c.summary}</p>
                </section>
              )}

              {c.experience?.length > 0 && (
                <section className="rb-doc-section">
                  <h2>Experience</h2>
                  {c.experience.map((exp, i) => (
                    <div key={i} className="rb-doc-entry">
                      <div className="rb-doc-entry-header">
                        <strong>{exp.title}</strong>
                        <span>{exp.company}{exp.location ? ` — ${exp.location}` : ''}</span>
                        <span className="rb-doc-dates">
                          {exp.startDate}{exp.startDate && (exp.endDate || exp.current) ? ' – ' : ''}
                          {exp.current ? 'Present' : exp.endDate}
                        </span>
                      </div>
                      {exp.bullets?.filter(Boolean).length > 0 && (
                        <ul>{exp.bullets.filter(Boolean).map((b, j) => <li key={j}>{b}</li>)}</ul>
                      )}
                    </div>
                  ))}
                </section>
              )}

              {c.education?.length > 0 && (
                <section className="rb-doc-section">
                  <h2>Education</h2>
                  {c.education.map((edu, i) => (
                    <div key={i} className="rb-doc-entry">
                      <div className="rb-doc-entry-header">
                        <strong>{edu.degree}{edu.field ? ` in ${edu.field}` : ''}</strong>
                        <span>{edu.institution}</span>
                        <span className="rb-doc-dates">{edu.graduationDate}</span>
                      </div>
                      {edu.gpa && <p>GPA: {edu.gpa}</p>}
                    </div>
                  ))}
                </section>
              )}

              {c.skills?.filter(Boolean).length > 0 && (
                <section className="rb-doc-section">
                  <h2>Skills</h2>
                  <p>{c.skills.filter(Boolean).join(' · ')}</p>
                </section>
              )}

              {c.languages?.filter(Boolean).length > 0 && (
                <section className="rb-doc-section">
                  <h2>Languages</h2>
                  <p>{c.languages.filter(Boolean).join(' · ')}</p>
                </section>
              )}

              {c.certifications?.filter(x => x.name).length > 0 && (
                <section className="rb-doc-section">
                  <h2>Certifications</h2>
                  {c.certifications.filter(x => x.name).map((cert, i) => (
                    <div key={i} className="rb-doc-entry">
                      <strong>{cert.name}</strong>
                      {cert.issuer && <span> — {cert.issuer}</span>}
                      {cert.date && <span className="rb-doc-dates"> {cert.date}</span>}
                    </div>
                  ))}
                </section>
              )}

              {c.awards?.filter(Boolean).length > 0 && (
                <section className="rb-doc-section">
                  <h2>Awards &amp; Honors</h2>
                  <ul>{c.awards.filter(Boolean).map((a, i) => <li key={i}>{a}</li>)}</ul>
                </section>
              )}

              {c.customSections?.filter(s => s.title).map((sec, i) => (
                <section key={i} className="rb-doc-section">
                  <h2>{sec.title}</h2>
                  <p style={{ whiteSpace: 'pre-wrap' }}>{sec.content}</p>
                </section>
              ))}
            </div>
          )}

          {!loading && !error && !resumeId && resumeUrl && (
            <div className="rvm-file-resume">
              <p>This resume is an uploaded file.</p>
              <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-resume rvm-open-btn">
                Open Resume File
              </a>
            </div>
          )}
        </div>

        <div className="rvm-footer">
          {resumeUrl && (
            <a href={resumeUrl} target="_blank" rel="noopener noreferrer" className="btn-resume">
              Open File
            </a>
          )}
          <button className="ajf-btn ajf-btn-outline" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
