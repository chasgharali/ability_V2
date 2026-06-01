import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { uploadImageToS3 } from '../../services/uploads';
import AdminHeader from '../Layout/AdminHeader';
import AdminSidebar from '../Layout/AdminSidebar';
import EmployerLayoutRenderer from './EmployerLayoutRenderer';
import './EmployerPageTemplateEditor.css';

const BOOTH_FORM_DRAFT_KEY = 'boothManagement_formDraft';
const BOOTH_FORM_RESTORE_FLAG_KEY = 'boothManagement_restoreDraft';

const SECTION_KEYS = ['about', 'program', 'video', 'gallery', 'jobs', 'benefits', 'contact', 'social'];
const SECTION_TITLES = {
  about: 'About / Brand Identity',
  program: 'Special Programs',
  video: 'Hosted Video',
  gallery: 'Image Gallery',
  jobs: 'Open Positions',
  benefits: 'Benefits',
  contact: 'Call to Action',
  social: 'Social Links',
};

const DEFAULT_CONTENT_DATA = {
  about: {
    logoImageUrl: '', heroImageUrl: '', heroImageAlt: '', brandImage1Url: '', brandImage2Url: '',
    companyName: '', tagline: '', aboutText: '', bgColor: '', headingColor: '', textColor: '',
  },
  program: { programImageUrl: '', programImageAlt: '', programTitle: '', programText: '', bgColor: '', headingColor: '', textColor: '' },
  video: { videoUrl: '', videoTitle: '', bgColor: '', headingColor: '', textColor: '' },
  gallery: { galleryTitle: 'Life at the Company', images: Array(5).fill(null).map(() => ({ url: '', alt: '' })), bgColor: '', headingColor: '', textColor: '' },
  contact: { primaryBtnText: 'Join Our Talent Community', primaryBtnUrl: '#', secondaryBtnText: 'View Our Open Positions', secondaryBtnUrl: '#', ctaHeadline: 'Ready to explore a career with us?', bgColor: '', headingColor: '', textColor: '' },
  jobs: { jobsList: [], locationsText: '', bgColor: '', headingColor: '', textColor: '' },
  benefits: { benefitsList: [], bgColor: '', headingColor: '', textColor: '' },
  social: {
    links: ['FB', 'IN', 'IG', 'TH', 'YT', 'TT', 'BS', 'X'].map((p) => ({ platform: p, url: '' })),
    copyrightText: '',
    bgColor: '',
    headingColor: '',
    textColor: '',
  },
};

const LAYOUTS = [
  { id: 'layout-a', label: 'A — Centered Classic' },
  { id: 'layout-b', label: 'B — Split / Square' },
  { id: 'layout-c', label: 'C — Editorial / Mosaic' },
  { id: 'layout-d', label: 'D — Compact / Inline' },
];

function normalizeSectionTitle(title = '') {
  return String(title).replace(/\s+section\s*$/i, '').trim();
}

function normalizeSections(source = []) {
  return SECTION_KEYS.map((key, index) => {
    const existing = source.find((s) => s.key === key);
    const normalizedTitle = normalizeSectionTitle(existing?.title || '');
    return {
      key,
      title: normalizedTitle || SECTION_TITLES[key],
      contentHtml: existing?.contentHtml || '',
      contentData: existing?.contentData || { ...DEFAULT_CONTENT_DATA[key] },
      isActive: existing?.isActive !== false,
      order: typeof existing?.order === 'number' ? existing.order : index,
    };
  });
}

export default function EmployerPageTemplateEditor() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loaded, setLoaded] = useState(false);
  const [boothName, setBoothName] = useState('');
  const [layoutId, setLayoutId] = useState('layout-a');
  const [sections, setSections] = useState(normalizeSections([]));
  const [isLiveView, setIsLiveView] = useState(false);
  const [uploadingFields, setUploadingFields] = useState(new Set());
  const [editingSectionKey, setEditingSectionKey] = useState(null);
  const [editingSectionTitle, setEditingSectionTitle] = useState('');
  const [dragSectionKey, setDragSectionKey] = useState(null);

  // Load draft from sessionStorage on mount
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(BOOTH_FORM_DRAFT_KEY);
      if (!raw) { setLoaded(true); return; }
      const parsed = JSON.parse(raw);
      const form = parsed?.boothForm || {};
      setBoothName(form.boothName || '');
      setLayoutId(form.employerPageTemplateId || 'layout-a');
      setSections(normalizeSections(form.employerPageSections || []));
    } catch (err) {
      console.error('Failed to load employer page draft:', err);
    } finally {
      setLoaded(true);
    }
  }, []);

  // Hash links (e.g. #a-gallery) target section ids inside .elr-editor-scroll; after the ID case fix,
  // scroll the inner pane once the layout DOM exists (initial load + hash / layout changes).
  useEffect(() => {
    if (!loaded) return;
    const raw = location.hash?.replace(/^#/, '');
    if (!raw) return;
    const id = decodeURIComponent(raw);
    const scrollToTarget = () => {
      const el = document.getElementById(id);
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };
    const t1 = window.setTimeout(scrollToTarget, 0);
    const t2 = window.setTimeout(scrollToTarget, 120);
    return () => {
      window.clearTimeout(t1);
      window.clearTimeout(t2);
    };
  }, [loaded, location.hash, layoutId]);

  const handleUpdateField = useCallback((sectionKey, fieldName, value) => {
    setSections((prev) =>
      prev.map((s) => {
        if (s.key !== sectionKey) return s;
        // Handle nested gallery images: "images.0" etc.
        if (fieldName.startsWith('images.')) {
          const idx = parseInt(fieldName.split('.')[1], 10);
          const images = Array.isArray(s.contentData?.images)
            ? [...s.contentData.images]
            : Array(5).fill(null).map(() => ({ url: '', alt: '' }));
          images[idx] = typeof value === 'object' ? value : { ...images[idx], url: value };
          return { ...s, contentData: { ...s.contentData, images } };
        }
        return { ...s, contentData: { ...s.contentData, [fieldName]: value } };
      })
    );
  }, []);

  const handleUploadImage = useCallback(async (sectionKey, fieldName, file) => {
    const uploadKey = `${sectionKey}.${fieldName}`;
    setUploadingFields((prev) => new Set([...prev, uploadKey]));
    try {
      const { downloadUrl } = await uploadImageToS3(file);
      handleUpdateField(sectionKey, fieldName, downloadUrl);
    } catch (err) {
      console.error('Image upload failed:', err);
      alert('Image upload failed. Please try again.');
    } finally {
      setUploadingFields((prev) => {
        const next = new Set(prev);
        next.delete(uploadKey);
        return next;
      });
    }
  }, [handleUpdateField]);

  const handleSetSectionActive = useCallback((sectionKey, isActive) => {
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, isActive } : s)));
  }, []);

  const handleMoveSection = useCallback((sectionKey, direction) => {
    setSections((prev) => {
      const activeOrdered = [...prev]
        .filter((s) => s.isActive !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const currentIndex = activeOrdered.findIndex((s) => s.key === sectionKey);
      const targetIndex = currentIndex + direction;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= activeOrdered.length) return prev;

      const current = activeOrdered[currentIndex];
      const target = activeOrdered[targetIndex];
      const currentOrder = current.order ?? currentIndex;
      const targetOrder = target.order ?? targetIndex;

      return prev.map((s) => {
        if (s.key === current.key) return { ...s, order: targetOrder };
        if (s.key === target.key) return { ...s, order: currentOrder };
        return s;
      });
    });
  }, []);

  const handleBeginRename = useCallback((section) => {
    setEditingSectionKey(section.key);
    setEditingSectionTitle(normalizeSectionTitle(section.title || SECTION_TITLES[section.key] || ''));
  }, []);

  const handleSaveRename = useCallback((sectionKey) => {
    const nextTitle = normalizeSectionTitle(editingSectionTitle) || SECTION_TITLES[sectionKey] || sectionKey;
    setSections((prev) => prev.map((s) => (s.key === sectionKey ? { ...s, title: nextTitle } : s)));
    setEditingSectionKey(null);
    setEditingSectionTitle('');
  }, [editingSectionTitle]);

  const handleCancelRename = useCallback(() => {
    setEditingSectionKey(null);
    setEditingSectionTitle('');
  }, []);

  const handleDropReorder = useCallback((targetSectionKey) => {
    if (!dragSectionKey || dragSectionKey === targetSectionKey) return;
    setSections((prev) => {
      const orderedActive = [...prev]
        .filter((s) => s.isActive !== false)
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const fromIndex = orderedActive.findIndex((s) => s.key === dragSectionKey);
      const toIndex = orderedActive.findIndex((s) => s.key === targetSectionKey);
      if (fromIndex < 0 || toIndex < 0) return prev;

      const moved = [...orderedActive];
      const [item] = moved.splice(fromIndex, 1);
      moved.splice(toIndex, 0, item);
      const nextOrder = new Map(moved.map((s, idx) => [s.key, idx]));

      return prev.map((s) => (nextOrder.has(s.key) ? { ...s, order: nextOrder.get(s.key) } : s));
    });
    setDragSectionKey(null);
  }, [dragSectionKey]);

  const handleResetSectionOrder = useCallback(() => {
    const defaultOrderMap = new Map(SECTION_KEYS.map((key, index) => [key, index]));
    setSections((prev) =>
      prev.map((section) => ({
        ...section,
        order: defaultOrderMap.get(section.key) ?? section.order ?? 0,
      }))
    );
    setDragSectionKey(null);
  }, []);

  const orderedSections = useMemo(
    () => [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)),
    [sections]
  );
  const activeSections = orderedSections.filter((s) => s.isActive !== false);
  const hiddenSections = orderedSections.filter((s) => s.isActive === false);

  const saveAndReturn = () => {
    try {
      const raw = sessionStorage.getItem(BOOTH_FORM_DRAFT_KEY);
      const parsed = raw ? JSON.parse(raw) : {};
      const next = {
        ...parsed,
        boothForm: {
          ...(parsed.boothForm || {}),
          waitingAreaMode: 'employerPage',
          employerPageTemplateId: layoutId,
          employerPageSections: sections,
        },
      };
      sessionStorage.setItem(BOOTH_FORM_DRAFT_KEY, JSON.stringify(next));
      sessionStorage.setItem(BOOTH_FORM_RESTORE_FLAG_KEY, '1');
      navigate('/boothmanagement');
    } catch (err) {
      console.error('Failed to save employer page draft:', err);
    }
  };

  const goBackWithoutSaving = () => {
    sessionStorage.setItem(BOOTH_FORM_RESTORE_FLAG_KEY, '1');
    navigate('/boothmanagement');
  };

  if (!loaded) return null;

  return (
    <>
      <AdminHeader />
      <div className="dashboard-layout">
        <AdminSidebar active="booths" />
        <main id="main-content" className="dashboard-main" tabIndex={-1} aria-label="main content">
        <div className="dashboard-content employer-editor-page">

          {/* Unified sticky topbar */}
          <div className="elr-topbar">
            {/* Left: title + booth name */}
            <div className="elr-topbar-left">
              <span className="elr-topbar-title">Employer Template Editor</span>
              {boothName && (
                <span className="elr-topbar-booth">{boothName}</span>
              )}
            </div>

            {/* Center: layout tabs */}
            <div className="elr-layout-tabs" role="tablist" aria-label="Select layout">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  role="tab"
                  aria-selected={layoutId === l.id}
                  className={`elr-layout-tab${layoutId === l.id ? ' active' : ''}`}
                  onClick={() => setLayoutId(l.id)}
                >
                  {l.label}
                </button>
              ))}
            </div>

            {/* Right: toggle + action buttons */}
            <div className="elr-topbar-right">
              <button
                type="button"
                className={`elr-view-toggle${isLiveView ? ' live' : ' edit'}`}
                onClick={() => setIsLiveView((v) => !v)}
                aria-pressed={isLiveView}
              >
                {isLiveView ? '✎ Edit' : '👁 Preview'}
              </button>
              <div className="elr-topbar-divider" aria-hidden="true" />
              <button type="button" className="elr-topbar-btn-back" onClick={goBackWithoutSaving}>
                Back
              </button>
              <button type="button" className="elr-topbar-btn-save" onClick={saveAndReturn}>
                Save &amp; Return
              </button>
            </div>
          </div>

          {/* Scroll region below toolbar so content never slides under the header */}
          <div className="elr-editor-scroll">
            {!isLiveView && (
              <div className="elr-sections-manager" aria-label="Section visibility manager">
                <div className="elr-sections-head">
                  <div className="elr-sections-label">Sections:</div>
                  <button
                    type="button"
                    className="elr-sections-reset-btn"
                    onClick={handleResetSectionOrder}
                    title="Reset section positions to default"
                  >
                    Reset positions
                  </button>
                </div>
                <div className="elr-sections-row">
                  {activeSections.map((section, index) => (
                    <div
                      key={section.key}
                      className={`elr-section-chip${dragSectionKey === section.key ? ' dragging' : ''}`}
                      draggable
                      onDragStart={() => setDragSectionKey(section.key)}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => handleDropReorder(section.key)}
                    >
                      <span
                        className="elr-chip-grip"
                        title="Drag to reorder"
                        aria-hidden="true"
                      >
                        ::
                      </span>
                      {editingSectionKey === section.key ? (
                        <input
                          type="text"
                          className="elr-chip-input"
                          value={editingSectionTitle}
                          autoFocus
                          onChange={(e) => setEditingSectionTitle(e.target.value)}
                          onBlur={() => handleSaveRename(section.key)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') handleSaveRename(section.key);
                            if (e.key === 'Escape') handleCancelRename();
                          }}
                          aria-label={`Rename ${SECTION_TITLES[section.key] || section.key} section`}
                        />
                      ) : (
                        <button
                          type="button"
                          className="elr-chip-title-btn"
                          onClick={() => handleBeginRename(section)}
                          title="Click to rename"
                        >
                          {section.title || SECTION_TITLES[section.key] || section.key}
                        </button>
                      )}
                      <button
                        type="button"
                        className="elr-chip-mini-btn"
                        disabled={index === 0}
                        onClick={() => handleMoveSection(section.key, -1)}
                        aria-label={`Move ${section.title || section.key} left`}
                        title="Move left"
                      >
                        ←
                      </button>
                      <button
                        type="button"
                        className="elr-chip-mini-btn"
                        disabled={index === activeSections.length - 1}
                        onClick={() => handleMoveSection(section.key, 1)}
                        aria-label={`Move ${section.title || section.key} right`}
                        title="Move right"
                      >
                        →
                      </button>
                      <button
                        type="button"
                        className="elr-chip-hide-btn"
                        onClick={() => handleSetSectionActive(section.key, false)}
                        title="Hide section"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
                {hiddenSections.length > 0 && (
                  <div className="elr-sections-row">
                    <span className="elr-sections-label">Hidden sections:</span>
                    {hiddenSections.map((section) => (
                      <button
                        key={section.key}
                        type="button"
                        className="elr-section-pill hidden"
                        onClick={() => handleSetSectionActive(section.key, true)}
                      >
                        Restore {SECTION_TITLES[section.key] || section.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Edit mode hint */}
            {!isLiveView && (
              <p className="elr-edit-hint">
                Click on any image to upload · Click on any text to edit inline
              </p>
            )}

            {/* Template preview / editor */}
            <div className="elr-editor-canvas">
              <EmployerLayoutRenderer
                layoutId={layoutId}
                sections={sections}
                isEditMode={!isLiveView}
                onUpdateField={handleUpdateField}
                onUploadImage={handleUploadImage}
                uploadingFields={uploadingFields}
              />
            </div>
          </div>

        </div>
        </main>
      </div>
    </>
  );
}
