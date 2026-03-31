import React, { useCallback, useEffect, useState } from 'react';
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
    companyName: '', tagline: '', aboutText: '', bgColor: '', textColor: '',
  },
  program: { programImageUrl: '', programImageAlt: '', programTitle: '', programText: '', bgColor: '', textColor: '' },
  video: { videoUrl: '', videoTitle: '', bgColor: '', textColor: '' },
  gallery: { galleryTitle: 'Life at the Company', images: Array(5).fill(null).map(() => ({ url: '', alt: '' })), bgColor: '', textColor: '' },
  contact: { primaryBtnText: 'Join Our Talent Community', primaryBtnUrl: '#', secondaryBtnText: 'View Our Open Positions', secondaryBtnUrl: '#', ctaHeadline: 'Ready to explore a career with us?', bgColor: '', textColor: '' },
  jobs: { jobsList: [], locationsText: '', bgColor: '', textColor: '' },
  benefits: { benefitsList: [], bgColor: '', textColor: '' },
  social: {
    links: ['FB', 'IN', 'IG', 'BS', 'TH', 'X'].map((p) => ({ platform: p, url: '' })),
    copyrightText: '',
    bgColor: '',
    textColor: '',
  },
};

const LAYOUTS = [
  { id: 'layout-a', label: 'A — Centered Classic' },
  { id: 'layout-b', label: 'B — Split / Square' },
  { id: 'layout-c', label: 'C — Editorial / Mosaic' },
  { id: 'layout-d', label: 'D — Compact / Inline' },
];

function normalizeSections(source = []) {
  return SECTION_KEYS.map((key, index) => {
    const existing = source.find((s) => s.key === key);
    return {
      key,
      title: existing?.title || SECTION_TITLES[key],
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
                {isLiveView ? '👁 Live' : '✎ Edit'}
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
