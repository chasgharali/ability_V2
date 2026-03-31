import React, { useMemo } from 'react';
import EmployerLayoutRenderer from './EmployerLayoutRenderer';
import './EmployerPageTemplate.css';

const SECTION_DEFS = [
  { key: 'about', label: 'About' },
  { key: 'program', label: 'Programs' },
  { key: 'video', label: 'Video' },
  { key: 'gallery', label: 'Gallery' },
  { key: 'jobs', label: 'Careers' },
  { key: 'benefits', label: 'Benefits' },
  { key: 'contact', label: 'Contact' },
  { key: 'social', label: 'Social' },
];

const EMPTY_SECTION_HTML = {
  about: '<p>Tell job seekers about your company mission and values.</p>',
  program: '<p>Highlight your hiring programs, internships, or initiatives.</p>',
  video: '<p>Add a hosted video embed to introduce your team.</p>',
  gallery: '<p>Share workplace photos to show culture and environment.</p>',
  jobs: '<p>List open roles and key hiring locations.</p>',
  benefits: '<p>Describe compensation, benefits, and growth opportunities.</p>',
  contact: '<p>Add your call to action and career links.</p>',
  social: '<p>Link your social channels and employer brand profiles.</p>',
};

/**
 * Renders the employer page in the job-seeker waiting area.
 * Uses EmployerLayoutRenderer when contentData is available for any section,
 * otherwise falls back to the legacy HTML-card layout.
 */
export default function EmployerPageTemplate({ booth }) {
  const sections = useMemo(() => {
    return Array.isArray(booth?.employerPageSections)
      ? booth.employerPageSections.filter((s) => s?.isActive !== false)
      : [];
  }, [booth]);

  // Determine if we have structured contentData (new format) or only contentHtml (old format)
  const hasContentData = useMemo(
    () => sections.some((s) => s.contentData && Object.keys(s.contentData).length > 0),
    [sections]
  );

  const layoutId = booth?.employerPageTemplateId || 'layout-a';

  // New format: use EmployerLayoutRenderer
  if (hasContentData) {
    return (
      <section className="employer-page-template" aria-label="Employer page waiting area">
        <EmployerLayoutRenderer
          layoutId={layoutId}
          sections={sections}
          isEditMode={false}
        />
      </section>
    );
  }

  // Legacy fallback: render sections as HTML cards (backward compatibility)
  const sectionsByKey = new Map();
  sections.forEach((s) => { if (s?.key) sectionsByKey.set(s.key, s); });

  return (
    <section className="employer-page-template" aria-label="Employer page waiting area">
      <header className="employer-page-header">
        <div className="employer-page-logo-wrap">
          {booth?.logoUrl ? (
            <img src={booth.logoUrl} alt={`${booth?.name || 'Company'} logo`} className="employer-page-logo" />
          ) : (
            <div className="employer-page-logo-placeholder" aria-hidden="true">
              {(booth?.name || 'Company').slice(0, 1)}
            </div>
          )}
          <div>
            <h2 className="employer-page-title">{booth?.name || 'Employer Profile'}</h2>
            <p className="employer-page-subtitle">Waiting Area Employer Page</p>
          </div>
        </div>
        <nav className="employer-page-nav" aria-label="Employer page sections">
          {SECTION_DEFS.map((section) => (
            <a key={section.key} href={`#employer-${section.key}`}>{section.label}</a>
          ))}
        </nav>
      </header>

      <div className="employer-page-content">
        {SECTION_DEFS.map((sectionDef) => {
          const section = sectionsByKey.get(sectionDef.key);
          const html = section?.contentHtml?.trim() ? section.contentHtml : EMPTY_SECTION_HTML[sectionDef.key];
          return (
            <article id={`employer-${sectionDef.key}`} key={sectionDef.key} className="employer-page-section-card">
              <h3>{section?.title || sectionDef.label}</h3>
              <div className="employer-page-section-body" dangerouslySetInnerHTML={{ __html: html }} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
