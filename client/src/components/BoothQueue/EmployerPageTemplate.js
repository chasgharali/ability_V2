import React, { useMemo } from 'react';
import EmployerLayoutRenderer from './EmployerLayoutRenderer';
import { hydrateStreamMediaUrls } from '../../utils/videoContentProcessor';
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
  const visibleSections = SECTION_DEFS
    .map((sectionDef) => {
      const section = sectionsByKey.get(sectionDef.key);
      const html = section?.contentHtml?.trim() || '';
      return {
        sectionDef,
        section,
        html,
      };
    })
    .filter(({ html }) => html.length > 0);

  return (
    <section className="employer-page-template" aria-label="Employer page waiting area">
      <header className="employer-page-header">
        <div className="employer-page-logo-wrap">
          {booth?.logoUrl ? (
            <img src={booth.logoUrl} alt={`${booth?.name || 'Company'} logo`} className="employer-page-logo" />
          ) : null}
          <div>
            <h2 className="employer-page-title">{booth?.name || 'Employer Profile'}</h2>
            <p className="employer-page-subtitle">Waiting Area Employer Page</p>
          </div>
        </div>
        <nav className="employer-page-nav" aria-label="Employer page sections">
          {visibleSections.map(({ sectionDef }) => (
            <a key={sectionDef.key} href={`#employer-${sectionDef.key}`}>{sectionDef.label}</a>
          ))}
        </nav>
      </header>

      <div className="employer-page-content">
        {visibleSections.map(({ sectionDef, section, html }) => {
          return (
            <article id={`employer-${sectionDef.key}`} key={sectionDef.key} className="employer-page-section-card">
              <h3>{section?.title || sectionDef.label}</h3>
              <div className="employer-page-section-body" dangerouslySetInnerHTML={{ __html: hydrateStreamMediaUrls(html) }} />
            </article>
          );
        })}
      </div>
    </section>
  );
}
