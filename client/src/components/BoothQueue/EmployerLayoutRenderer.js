import React, { useRef } from 'react';
import {
  FaFacebookF,
  FaHashtag,
  FaInstagram,
  FaLinkedinIn,
  FaTwitter,
} from 'react-icons/fa';
import './EmployerLayoutRenderer.css';

/* ================================================================
   EmployerLayoutRenderer
   Props:
     layoutId   : 'layout-a' | 'layout-b' | 'layout-c' | 'layout-d'
     sections   : Section[]  (key, contentData, title, …)
     isEditMode : boolean
     onUpdateField(sectionKey, fieldName, value)  — called on blur
     onUploadImage(sectionKey, fieldName, file)    — called when user picks a file
     uploadingFields : Set of 'sectionKey.fieldName' strings currently uploading
   ================================================================ */
export default function EmployerLayoutRenderer({
  layoutId,
  sections = [],
  isEditMode = false,
  onUpdateField,
  onUploadImage,
  uploadingFields = new Set(),
}) {
  const getSec = (key) => sections.find((s) => s.key === key) || { key, contentData: null };
  const cd = (key) => getSec(key).contentData || {};

  const commonProps = { isEditMode, onUpdateField, onUploadImage, uploadingFields };

  const layoutMap = {
    'layout-a': (
      <LayoutA cd={cd} getSec={getSec} {...commonProps} />
    ),
    'layout-b': (
      <LayoutB cd={cd} getSec={getSec} {...commonProps} />
    ),
    'layout-c': (
      <LayoutC cd={cd} getSec={getSec} {...commonProps} />
    ),
    'layout-d': (
      <LayoutD cd={cd} getSec={getSec} {...commonProps} />
    ),
  };

  return (
    <div className={`elr-wrap${isEditMode ? ' elr-edit-mode' : ''}`}>
      {layoutMap[layoutId] || layoutMap['layout-a']}
    </div>
  );
}

/* ================================================================
   Shared sub-components
   ================================================================ */

/** Clickable image zone: shows image or placeholder; in edit mode lets user upload */
function ImgZone({ sectionKey, fieldName, url, alt, label, className, style, isEditMode, onUploadImage, uploadingFields }) {
  const inputRef = useRef(null);
  const uploadKey = `${sectionKey}.${fieldName}`;
  const isUploading = uploadingFields.has(uploadKey);

  // In live view, do not render empty image placeholders.
  if (!isEditMode && !url) {
    return null;
  }

  const handleClick = () => {
    if (isEditMode) inputRef.current?.click();
  };
  const handleKeyDown = (e) => {
    if (isEditMode && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      inputRef.current?.click();
    }
  };
  const handleChange = (e) => {
    const file = e.target.files?.[0];
    if (file && onUploadImage) onUploadImage(sectionKey, fieldName, file);
    e.target.value = '';
  };

  if (url) {
    return (
      <div
        className={`elr-img-zone${className ? ` ${className}` : ''}`}
        style={style}
        onClick={isEditMode ? handleClick : undefined}
        onKeyDown={isEditMode ? handleKeyDown : undefined}
        role={isEditMode ? 'button' : undefined}
        tabIndex={isEditMode ? 0 : undefined}
        aria-label={isEditMode ? `Change ${label} image` : alt || label}
      >
        <img src={url} alt={alt || label} />
        {isEditMode && (
          <div className="elr-img-overlay" aria-hidden="true">
            <div className="elr-img-overlay-icon">✎</div>
            <span className="elr-img-overlay-text">Change image</span>
          </div>
        )}
        {isUploading && (
          <div className="elr-img-uploading">
            <div className="elr-spinner" />
          </div>
        )}
        {isEditMode && (
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            style={{ display: 'none' }}
            onChange={handleChange}
          />
        )}
      </div>
    );
  }

  return (
    <div
      className={`elr-ph${className ? ` ${className}` : ''}`}
      style={style}
      onClick={isEditMode ? handleClick : undefined}
      onKeyDown={isEditMode ? handleKeyDown : undefined}
      role={isEditMode ? 'button' : undefined}
      tabIndex={isEditMode ? 0 : undefined}
      aria-label={isEditMode ? `Upload ${label} image` : label}
    >
      <span className="elr-ph-label">{label}</span>
      {isUploading && (
        <div className="elr-img-uploading">
          <div className="elr-spinner" />
        </div>
      )}
      {isEditMode && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={handleChange}
        />
      )}
    </div>
  );
}

/** Inline editable text span */
function TXT({ sectionKey, fieldName, value, placeholder, className, style, tagName, isEditMode, onUpdateField }) {
  const Tag = tagName || 'span';
  const hasValue = typeof value === 'string' && value.trim().length > 0;

  const syncEditableEmptyState = (el) => {
    const isEmpty = !(el.textContent || '').trim();
    el.setAttribute('data-empty', isEmpty ? 'true' : 'false');
  };

  if (isEditMode) {
    return (
      <Tag
        className={`elr-text-editable${!hasValue ? ' elr-text-empty' : ''}${className ? ` ${className}` : ''}`}
        style={style}
        contentEditable
        suppressContentEditableWarning
        onInput={(e) => syncEditableEmptyState(e.currentTarget)}
        onFocus={(e) => syncEditableEmptyState(e.currentTarget)}
        onBlur={(e) => {
          syncEditableEmptyState(e.currentTarget);
          onUpdateField && onUpdateField(sectionKey, fieldName, e.currentTarget.textContent || '');
        }}
        data-placeholder={placeholder}
        data-empty={hasValue ? 'false' : 'true'}
        aria-label={placeholder}
      >
        {value || ''}
      </Tag>
    );
  }
  return (
    <Tag className={className} style={style}>
      {value || <span style={{ color: '#aaa', fontStyle: 'italic' }}>{placeholder}</span>}
    </Tag>
  );
}

/** Video embed or placeholder */
function VideoZone({ sectionKey, url, isEditMode, onUpdateField, className }) {
  if (url) {
    const embedUrl = getYouTubeEmbedUrl(url) || url;
    return (
      <div className={`elr-a-video-zone${className ? ` ${className}` : ''}`} style={{ position: 'relative' }}>
        <iframe
          src={embedUrl}
          title="Employer video"
          width="100%"
          height="100%"
          style={{ position: 'absolute', inset: 0, border: 'none' }}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        />
        {isEditMode && (
          <div style={{ position: 'absolute', top: 0, right: 0, background: 'rgba(0,0,0,0.5)', borderRadius: '0 0 0 6px', padding: '4px 8px', zIndex: 10 }}>
            <span style={{ color: '#fff', fontSize: 11, fontFamily: 'monospace' }}>Click URL below to edit</span>
          </div>
        )}
      </div>
    );
  }
  return (
    <div className={`elr-ph${className ? ` ${className}` : ''}`} style={{ width: '100%', aspectRatio: '16/9', maxWidth: 800, margin: '0 auto', position: 'relative' }}>
      <span className="elr-ph-label">
        {isEditMode
          ? 'Paste a YouTube URL in the Video URL field below'
          : 'YouTube Video Embed · 16:9'}
      </span>
      <div className="elr-play-btn" aria-hidden="true">
        <div className="elr-play-arrow" />
      </div>
    </div>
  );
}

function getYouTubeEmbedUrl(url) {
  if (!url) return null;
  const videoId = extractYouTubeVideoId(url);
  if (!videoId) return null;
  // Build a clean embed URL to avoid carrying problematic query params.
  return `https://www.youtube-nocookie.com/embed/${videoId}`;
}

function extractYouTubeVideoId(rawUrl) {
  const fallbackMatch = String(rawUrl).match(
    /(?:youtu\.be\/|youtube(?:-nocookie)?\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([a-zA-Z0-9_-]{11})/
  );

  try {
    const parsed = new URL(String(rawUrl).trim());
    const host = parsed.hostname.replace(/^www\./, '');
    const path = parsed.pathname || '';

    if (host === 'youtu.be') {
      const id = path.replace('/', '').split('/')[0];
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
    }

    const isYouTubeHost = host.includes('youtube.com') || host.includes('youtube-nocookie.com');
    if (!isYouTubeHost) return fallbackMatch?.[1] || null;

    if (path === '/watch') {
      const id = parsed.searchParams.get('v');
      if (/^[a-zA-Z0-9_-]{11}$/.test(id || '')) return id;
    }

    const pathMatch = path.match(/\/(?:embed|shorts|live)\/([a-zA-Z0-9_-]{11})/);
    if (pathMatch) return pathMatch[1];

    return fallbackMatch?.[1] || null;
  } catch {
    return fallbackMatch?.[1] || null;
  }
  return null;
}

function getDefaultCopyrightText() {
  return `© ${new Date().getFullYear()} Employer. All Rights Reserved.`;
}

/* ================================================================
   Section color controls
   ================================================================ */
const BG_PRESETS = [
  { label: 'White', value: '#ffffff' },
  { label: 'Off-white', value: '#f4f2ee' },
  { label: 'Light blue', value: '#eef2f9' },
  { label: 'Light gray', value: '#f3f4f6' },
  { label: 'Warm gray', value: '#e8e6e1' },
  { label: 'Dark navy', value: '#1c2533' },
  { label: 'Black', value: '#111827' },
];

const TEXT_PRESETS = [
  { label: 'Dark', value: '#1a1a1a' },
  { label: 'Gray', value: '#555555' },
  { label: 'White', value: '#ffffff' },
  { label: 'Blue', value: '#2563eb' },
  { label: 'Muted', value: '#6b7280' },
];

function getSectionStyle(data) {
  const s = {};
  if (data?.bgColor) s.background = data.bgColor;
  if (data?.textColor) s.color = data.textColor;
  return s;
}

/** Thin color control bar shown at the top of each section in edit mode */
function ColorBar({ sectionKey, data, onUpdateField }) {
  const bgColor = data?.bgColor || '';
  const textColor = data?.textColor || '';
  const hasCustom = bgColor || textColor;
  return (
    <div className="elr-color-bar" role="toolbar" aria-label={`Color settings for ${sectionKey} section`}>
      <span className="elr-color-bar-label">BG</span>
      {BG_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`elr-color-swatch${bgColor === p.value ? ' elr-swatch-active' : ''}`}
          style={{ background: p.value }}
          title={p.label}
          onClick={() => onUpdateField(sectionKey, 'bgColor', bgColor === p.value ? '' : p.value)}
          aria-label={`Background: ${p.label}`}
          aria-pressed={bgColor === p.value}
        />
      ))}
      <label className="elr-color-custom-wrap" title="Custom background color">
        <span
          className="elr-color-swatch elr-color-custom-swatch"
          style={{ background: bgColor && !BG_PRESETS.find((p) => p.value === bgColor) ? bgColor : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
          aria-hidden="true"
        />
        <input
          type="color"
          value={bgColor || '#ffffff'}
          onChange={(e) => onUpdateField(sectionKey, 'bgColor', e.target.value)}
          aria-label="Custom background color"
        />
      </label>

      <span className="elr-color-bar-sep" aria-hidden="true" />

      <span className="elr-color-bar-label">Text</span>
      {TEXT_PRESETS.map((p) => (
        <button
          key={p.value}
          type="button"
          className={`elr-color-swatch${textColor === p.value ? ' elr-swatch-active' : ''}`}
          style={{ background: p.value }}
          title={p.label}
          onClick={() => onUpdateField(sectionKey, 'textColor', textColor === p.value ? '' : p.value)}
          aria-label={`Text: ${p.label}`}
          aria-pressed={textColor === p.value}
        />
      ))}
      <label className="elr-color-custom-wrap" title="Custom text color">
        <span
          className="elr-color-swatch elr-color-custom-swatch"
          style={{ background: textColor && !TEXT_PRESETS.find((p) => p.value === textColor) ? textColor : 'conic-gradient(red, yellow, lime, cyan, blue, magenta, red)' }}
          aria-hidden="true"
        />
        <input
          type="color"
          value={textColor || '#1a1a1a'}
          onChange={(e) => onUpdateField(sectionKey, 'textColor', e.target.value)}
          aria-label="Custom text color"
        />
      </label>

      {hasCustom && (
        <button
          type="button"
          className="elr-color-reset"
          onClick={() => { onUpdateField(sectionKey, 'bgColor', ''); onUpdateField(sectionKey, 'textColor', ''); }}
          title="Reset to default colors"
        >
          ↺
        </button>
      )}
    </div>
  );
}

/**
 * Wrapper that applies per-section bg/text color overrides and renders the
 * ColorBar in edit mode. Use `as` prop to control the HTML element (default: div).
 */
function SecWrap({ sectionKey, cd, isEditMode, onUpdateField, id, className, style, children, as: Tag = 'section', ...rest }) {
  const data = cd(sectionKey);
  const colorStyle = getSectionStyle(data);
  return (
    <Tag
      id={id}
      className={className}
      style={{ ...colorStyle, ...(style || {}) }}
      {...rest}
    >
      {isEditMode && (
        <ColorBar sectionKey={sectionKey} data={data} onUpdateField={onUpdateField} />
      )}
      {children}
    </Tag>
  );
}

/** Jobs list — editable as a textarea in edit mode */
function JobsList({ sectionKey, jobsList, isEditMode, onUpdateField }) {
  const items = Array.isArray(jobsList) ? jobsList : [];
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);

  if (isEditMode) {
    return (
      <div>
        <p style={{ fontFamily: 'Arial,sans-serif', fontSize: 13, color: '#888', marginBottom: 6 }}>
          Edit jobs (one per line):
        </p>
        <textarea
          defaultValue={items.join('\n')}
          rows={8}
          style={{
            width: '100%',
            fontFamily: 'Arial,sans-serif',
            fontSize: 14,
            border: '1px solid #d1d5db',
            borderRadius: 4,
            padding: '8px 10px',
            resize: 'vertical',
            lineHeight: 1.6,
          }}
          onBlur={(e) => {
            const lines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
            onUpdateField && onUpdateField(sectionKey, 'jobsList', lines);
          }}
          aria-label="Job listings (one per line)"
        />
      </div>
    );
  }

  if (items.length === 0) {
    return <p className="elr-body" style={{ color: '#aaa', fontStyle: 'italic' }}>No positions listed yet.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem 3rem' }}>
      <ul className="elr-jobs-list" aria-label="Open positions column 1">
        {col1.map((j, i) => <li key={i}>{j}</li>)}
      </ul>
      <ul className="elr-jobs-list" aria-label="Open positions column 2">
        {col2.map((j, i) => <li key={i}>{j}</li>)}
      </ul>
    </div>
  );
}

/** Benefits list — editable as textarea */
function BenefitsList({ sectionKey, benefitsList, isEditMode, onUpdateField }) {
  const items = Array.isArray(benefitsList) ? benefitsList : [];
  const half = Math.ceil(items.length / 2);
  const col1 = items.slice(0, half);
  const col2 = items.slice(half);

  if (isEditMode) {
    return (
      <div>
        <p style={{ fontFamily: 'Arial,sans-serif', fontSize: 13, color: '#aaa', marginBottom: 6 }}>
          Edit benefits (one per line):
        </p>
        <textarea
          defaultValue={items.join('\n')}
          rows={6}
          style={{
            width: '100%',
            fontFamily: 'Arial,sans-serif',
            fontSize: 14,
            border: '1px solid #2d3d55',
            borderRadius: 4,
            padding: '8px 10px',
            background: '#162030',
            color: '#d0d8e8',
            resize: 'vertical',
            lineHeight: 1.6,
          }}
          onBlur={(e) => {
            const lines = e.target.value.split('\n').map((l) => l.trim()).filter(Boolean);
            onUpdateField && onUpdateField(sectionKey, 'benefitsList', lines);
          }}
          aria-label="Benefits list (one per line)"
        />
      </div>
    );
  }

  if (items.length === 0) {
    return <p style={{ color: '#aaa', fontStyle: 'italic', fontFamily: 'Arial,sans-serif', fontSize: 14 }}>No benefits listed yet.</p>;
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0 3rem' }}>
      <ul className="elr-ben-list" aria-label="Benefits column 1">
        {col1.map((b, i) => (
          <li key={i}><span className="elr-ben-dot" aria-hidden="true" />{b}</li>
        ))}
      </ul>
      <ul className="elr-ben-list" aria-label="Benefits column 2">
        {col2.map((b, i) => (
          <li key={i}><span className="elr-ben-dot" aria-hidden="true" />{b}</li>
        ))}
      </ul>
    </div>
  );
}

/** Social footer links */
function SocialFooter({ sectionKey, links, bgColor, textColor, isEditMode, onUpdateField }) {
  const PLATFORMS = ['FB', 'IN', 'IG', 'BS', 'TH', 'X'];
  const platformLabels = { FB: 'Facebook', IN: 'LinkedIn', IG: 'Instagram', BS: 'Bluesky', TH: 'Threads', X: 'X (Twitter)' };
  const safeLinks = Array.isArray(links) ? links : PLATFORMS.map((p) => ({ platform: p, url: '' }));
  const platformIcons = {
    FB: FaFacebookF,
    IN: FaLinkedinIn,
    IG: FaInstagram,
    BS: FaHashtag,
    TH: FaHashtag,
    X: FaTwitter,
  };

  const renderPlatformIcon = (platform) => {
    const Icon = platformIcons[platform];
    if (!Icon) return <span className="elr-social-icon-label">{platform}</span>;
    return <Icon className="elr-social-icon-svg" aria-hidden="true" focusable="false" />;
  };
  const socialIconStyle = {
    background: textColor || '#e8e6e1',
    color: bgColor || '#555',
    borderColor: textColor || '#ccc',
  };

  if (isEditMode) {
    return (
      <div>
        <div className="elr-social-icons" style={{ marginBottom: 12 }}>
          {safeLinks.map((l) => (
            <a key={l.platform} href={l.url || '#'} className="elr-social-icon" style={socialIconStyle} aria-label={platformLabels[l.platform] || l.platform} target="_blank" rel="noopener noreferrer">
              {renderPlatformIcon(l.platform)}
            </a>
          ))}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {safeLinks.map((l, idx) => (
            <div key={l.platform} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontFamily: 'monospace', fontSize: 11, width: 28, color: '#888' }}>{l.platform}</span>
              <input
                type="url"
                defaultValue={l.url || ''}
                placeholder={`https://${l.platform.toLowerCase()}.com/company/...`}
                style={{ flex: 1, border: '1px solid #d1d5db', borderRadius: 4, padding: '4px 8px', fontSize: 12 }}
                onBlur={(e) => {
                  const updated = [...safeLinks];
                  updated[idx] = { ...updated[idx], url: e.target.value };
                  onUpdateField && onUpdateField(sectionKey, 'links', updated);
                }}
                aria-label={`${platformLabels[l.platform] || l.platform} URL`}
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const activeLinks = safeLinks.filter((l) => l.url);
  if (activeLinks.length === 0) return null;
  return (
    <nav className="elr-social-icons" aria-label="Social media links">
      {activeLinks.map((l) => (
        <a key={l.platform} href={l.url} className="elr-social-icon" style={socialIconStyle} aria-label={platformLabels[l.platform] || l.platform} target="_blank" rel="noopener noreferrer">
          {renderPlatformIcon(l.platform)}
        </a>
      ))}
    </nav>
  );
}

/** CTA buttons section (contact) */
function CtaButtons({ sectionKey, contentData, isEditMode, onUpdateField, className }) {
  const {
    primaryBtnText = 'Join Our Talent Community',
    primaryBtnUrl = '#',
    secondaryBtnText = 'View Our Open Positions',
    secondaryBtnUrl = '#',
  } = contentData;
  const accentColor = contentData?.textColor || 'currentColor';
  const primaryBtnStyle = {
    background: accentColor,
    borderColor: accentColor,
  };
  const outlineBtnStyle = {
    color: accentColor,
    borderColor: accentColor,
  };

  if (isEditMode) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
          <input
            type="text"
            defaultValue={primaryBtnText}
            placeholder="Primary button text"
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 14 }}
            onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'primaryBtnText', e.target.value)}
            aria-label="Primary button text"
          />
          <input
            type="url"
            defaultValue={primaryBtnUrl !== '#' ? primaryBtnUrl : ''}
            placeholder="Primary button URL"
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 14 }}
            onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'primaryBtnUrl', e.target.value || '#')}
            aria-label="Primary button URL"
          />
          <input
            type="text"
            defaultValue={secondaryBtnText}
            placeholder="Secondary button text"
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 14 }}
            onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'secondaryBtnText', e.target.value)}
            aria-label="Secondary button text"
          />
          <input
            type="url"
            defaultValue={secondaryBtnUrl !== '#' ? secondaryBtnUrl : ''}
            placeholder="Secondary button URL"
            style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 14 }}
            onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'secondaryBtnUrl', e.target.value || '#')}
            aria-label="Secondary button URL"
          />
        </div>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginTop: 4 }}>
          <span className="elr-btn-primary" style={primaryBtnStyle}>{primaryBtnText}</span>
          <span className="elr-btn-outline" style={outlineBtnStyle}>{secondaryBtnText}</span>
        </div>
      </div>
    );
  }

  return (
    <div className={`${className || ''}`} style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
      <a href={primaryBtnUrl} className="elr-btn-primary" style={primaryBtnStyle} target="_blank" rel="noopener noreferrer">
        {primaryBtnText}
      </a>
      <a href={secondaryBtnUrl} className="elr-btn-outline" style={outlineBtnStyle} target="_blank" rel="noopener noreferrer">
        {secondaryBtnText}
      </a>
    </div>
  );
}

/** Video URL editor row (shown in edit mode below video zone) */
function VideoUrlEditor({ sectionKey, videoUrl, videoTitle, isEditMode, onUpdateField }) {
  if (!isEditMode) return null;
  return (
    <div style={{ padding: '8px 12px', background: '#f8fafc', borderTop: '1px solid #e5e7eb' }}>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: 8 }}>
        <input
          type="text"
          defaultValue={videoTitle || ''}
          placeholder="Video section title"
          style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}
          onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'videoTitle', e.target.value)}
          aria-label="Video title"
        />
        <input
          type="url"
          defaultValue={videoUrl || ''}
          placeholder="YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
          style={{ border: '1px solid #d1d5db', borderRadius: 4, padding: '5px 8px', fontSize: 13 }}
          onBlur={(e) => onUpdateField && onUpdateField(sectionKey, 'videoUrl', e.target.value)}
          aria-label="YouTube video URL"
        />
      </div>
    </div>
  );
}

/* ================================================================
   LAYOUT A — Centered Classic
   ================================================================ */
function LayoutA({ cd, isEditMode, onUpdateField, onUploadImage, uploadingFields }) {
  const about = cd('about');
  const program = cd('program');
  const video = cd('video');
  const gallery = cd('gallery');
  const contact = cd('contact');
  const jobs = cd('jobs');
  const benefits = cd('benefits');
  const social = cd('social');
  const copyrightText = social.copyrightText || getDefaultCopyrightText();
  const galleryImages = Array.isArray(gallery.images) ? gallery.images : Array(4).fill(null);
  const imgProps = { isEditMode, onUploadImage, uploadingFields };

  return (
    <>
      {/* Header */}
      <header className="elr-a-header elr-bg-white" style={getSectionStyle(about)} role="banner">
        <ImgZone sectionKey="about" fieldName="logoImageUrl" url={about.logoImageUrl} alt={about.companyName || 'Company logo'} label="Company Logo · 240 × 100" className="elr-a-logo-zone" {...imgProps} />
        <nav className="elr-a-nav" aria-label="Page sections">
          {['About', 'Programs', 'Video', 'Gallery', 'Careers', 'Benefits', 'Contact'].map((label) => (
            <a key={label} href={`#a-${label.toLowerCase()}`} className="elr-nav-link">{label}</a>
          ))}
        </nav>
      </header>

      <main>
        {/* §2 About */}
        <SecWrap sectionKey="about" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-about" className="elr-bg-white" aria-label="About section">
          <div style={{ padding: '2rem 3rem 0.5rem', display: 'flex', justifyContent: 'center' }}>
            <ImgZone sectionKey="about" fieldName="heroImageUrl" url={about.heroImageUrl} alt={about.heroImageAlt || 'Hero banner'} label="Hero / Banner Image · 800 × 280" className="elr-a-hero-zone" {...imgProps} />
          </div>
          <div className="elr-sec" style={{ paddingTop: '2rem', textAlign: 'center' }}>
            <div style={{ maxWidth: 720, margin: '0 auto' }}>
              <TXT sectionKey="about" fieldName="companyName" value={about.companyName} placeholder="Company Name" className="elr-h1" tagName="h1" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <div style={{ marginTop: '0.75rem' }} />
              <TXT sectionKey="about" fieldName="tagline" value={about.tagline} placeholder="Mission Statement / Tagline" className="elr-h2" style={{ fontSize: '1.2rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <div style={{ marginTop: '1rem' }} />
              <TXT sectionKey="about" fieldName="aboutText" value={about.aboutText} placeholder="About Us paragraph..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §3 Program */}
        <SecWrap sectionKey="program" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-programs" className="elr-sec elr-bg-blue" aria-label="Programs section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', maxWidth: 660, margin: '0 auto', textAlign: 'center' }}>
            <ImgZone sectionKey="program" fieldName="programImageUrl" url={program.programImageUrl} alt={program.programImageAlt || 'Program image'} label="Program Image · 600 × 400" style={{ width: '100%', maxWidth: 560, aspectRatio: '3/2' }} {...imgProps} />
            <TXT sectionKey="program" fieldName="programTitle" value={program.programTitle} placeholder="Special Program Title" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            <TXT sectionKey="program" fieldName="programText" value={program.programText} placeholder="Describe your special hiring initiative or program..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §4 Video */}
        <SecWrap sectionKey="video" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-video" className="elr-sec elr-bg-white" aria-label="Video section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <TXT sectionKey="video" fieldName="videoTitle" value={video.videoTitle} placeholder="Executive Welcome Video" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            <VideoZone sectionKey="video" url={video.videoUrl} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <VideoUrlEditor sectionKey="video" videoUrl={video.videoUrl} videoTitle={video.videoTitle} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §5 Gallery */}
        <SecWrap sectionKey="gallery" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-gallery" className="elr-sec elr-bg-light" aria-label="Gallery section">
          <TXT sectionKey="gallery" fieldName="galleryTitle" value={gallery.galleryTitle} placeholder="Life at the Company" className="elr-h2" tagName="h2" style={{ textAlign: 'center', marginBottom: '2rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          <div className="elr-a-gallery">
            {[0, 1, 2, 3].map((i) => { const img = galleryImages[i] || {}; return (<ImgZone key={i} sectionKey="gallery" fieldName={`images.${i}`} url={img.url} alt={img.alt || `Gallery image ${i + 1}`} label={`Gallery Image ${i + 1} · 600 × 400`} {...imgProps} />); })}
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §6 Contact / CTA */}
        <SecWrap sectionKey="contact" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-contact" className="elr-sec elr-bg-white" aria-label="Contact section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem', textAlign: 'center' }}>
            <h2 className="elr-h2">Contact</h2>
            <CtaButtons sectionKey="contact" contentData={contact} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §7 Jobs */}
        <SecWrap sectionKey="jobs" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-careers" className="elr-sec elr-bg-light" aria-label="Careers section">
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <h2 className="elr-h2" style={{ marginBottom: '1.5rem' }}>Open Positions</h2>
            <JobsList sectionKey="jobs" jobsList={jobs.jobsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
            {!isEditMode && jobs.locationsText && (<div style={{ marginTop: '2.5rem' }}><h3 className="elr-h3" style={{ marginBottom: '0.5rem' }}>Locations</h3><p className="elr-body">{jobs.locationsText}</p></div>)}
            {isEditMode && (<div style={{ marginTop: 12 }}><label style={{ fontFamily: 'Arial,sans-serif', fontSize: 13, color: '#555' }}>Locations:</label><input type="text" defaultValue={jobs.locationsText || ''} placeholder="e.g. New York, San Francisco, Remote" style={{ width: '100%', marginTop: 4, border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 14 }} onBlur={(e) => onUpdateField && onUpdateField('jobs', 'locationsText', e.target.value)} aria-label="Locations" /></div>)}
          </div>
        </SecWrap>

        {/* §8 Benefits */}
        <SecWrap sectionKey="benefits" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="a-benefits" className="elr-sec elr-bg-dark" aria-label="Benefits section">
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <h2 className="elr-h2" style={{ marginBottom: '1.5rem' }}>Benefits</h2>
            <BenefitsList sectionKey="benefits" benefitsList={benefits.benefitsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
        </SecWrap>
      </main>

      {/* Footer / Social */}
      <SecWrap sectionKey="social" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} className="elr-sec-sm elr-bg-white" style={{ textAlign: 'center', borderTop: '1px solid #e8e5e0' }} as="footer" role="contentinfo">
        <SocialFooter sectionKey="social" links={social.links} bgColor={social.bgColor} textColor={social.textColor} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        <TXT
          sectionKey="social"
          fieldName="copyrightText"
          value={copyrightText}
          placeholder="Copyright text"
          tagName="p"
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaa', marginTop: 12 }}
          isEditMode={isEditMode}
          onUpdateField={onUpdateField}
        />
      </SecWrap>
    </>
  );
}

/* ================================================================
   LAYOUT B — Split / Square Images
   ================================================================ */
function LayoutB({ cd, isEditMode, onUpdateField, onUploadImage, uploadingFields }) {
  const about = cd('about');
  const program = cd('program');
  const video = cd('video');
  const gallery = cd('gallery');
  const contact = cd('contact');
  const jobs = cd('jobs');
  const benefits = cd('benefits');
  const social = cd('social');
  const copyrightText = social.copyrightText || getDefaultCopyrightText();
  const galleryImages = Array.isArray(gallery.images) ? gallery.images : Array(4).fill(null);
  const imgProps = { isEditMode, onUploadImage, uploadingFields };

  return (
    <>
      {/* Header: logo left, nav right */}
      <header className="elr-b-header elr-bg-white" style={getSectionStyle(about)} role="banner">
        <div className="elr-b-logo-col">
          <ImgZone sectionKey="about" fieldName="logoImageUrl" url={about.logoImageUrl} alt={about.companyName || 'Company logo'} label="Logo · 150 × 80" className="elr-b-logo-zone" {...imgProps} />
        </div>
        <div className="elr-b-nav-col">
          <nav className="elr-b-nav" aria-label="Page sections">
            {['About', 'Programs', 'Video', 'Gallery', 'Careers', 'Benefits', 'Contact'].map((label) => (
              <a key={label} href={`#b-${label.toLowerCase()}`} className="elr-nav-link">{label}</a>
            ))}
          </nav>
        </div>
      </header>

      <main>
        {/* Dual brand images */}
        <div className="elr-dual-images elr-bg-white" role="group" aria-label="Company identity images">
          <ImgZone sectionKey="about" fieldName="brandImage1Url" url={about.brandImage1Url} alt="Brand image 1" label="Brand Image 1 · 600 × 400" {...imgProps} />
          <ImgZone sectionKey="about" fieldName="brandImage2Url" url={about.brandImage2Url} alt="Brand image 2" label="Brand Image 2 · 600 × 400" {...imgProps} />
        </div>

        {/* §2 About */}
        <SecWrap sectionKey="about" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-about" className="elr-bg-white" aria-label="About section">
          <div className="elr-b-about-row">
            <ImgZone sectionKey="about" fieldName="heroImageUrl" url={about.heroImageUrl} alt={about.heroImageAlt || 'Company image'} label="Company Image · ~340 × 340 square" className="elr-b-about-img-zone" {...imgProps} />
            <div className="elr-b-about-txt">
              <TXT sectionKey="about" fieldName="companyName" value={about.companyName} placeholder="Company Name" className="elr-h1" tagName="h1" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="about" fieldName="tagline" value={about.tagline} placeholder="Mission Statement / Tagline" className="elr-h2" style={{ fontSize: '1.15rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="about" fieldName="aboutText" value={about.aboutText} placeholder="About Us paragraph..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §3 Program */}
        <SecWrap sectionKey="program" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-programs" className="elr-bg-blue" aria-label="Programs section">
          <div className="elr-b-prog-row">
            <div className="elr-b-prog-txt">
              <TXT sectionKey="program" fieldName="programTitle" value={program.programTitle} placeholder="Special Program Title" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="program" fieldName="programText" value={program.programText} placeholder="Describe your special hiring initiative..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
            <ImgZone sectionKey="program" fieldName="programImageUrl" url={program.programImageUrl} alt={program.programImageAlt || 'Program image'} label="Program Image · ~300 × 300 square" className="elr-b-prog-img-zone" {...imgProps} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §4 Video */}
        <SecWrap sectionKey="video" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-video" className="elr-sec elr-bg-white" aria-label="Video section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <TXT sectionKey="video" fieldName="videoTitle" value={video.videoTitle} placeholder="Executive Welcome Video" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            <VideoZone sectionKey="video" url={video.videoUrl} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <VideoUrlEditor sectionKey="video" videoUrl={video.videoUrl} videoTitle={video.videoTitle} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §5 Gallery */}
        <SecWrap sectionKey="gallery" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-gallery" className="elr-bg-light" aria-label="Gallery section">
          <div style={{ padding: '1.5rem 3rem 0.75rem' }}>
            <TXT sectionKey="gallery" fieldName="galleryTitle" value={gallery.galleryTitle} placeholder="Life at the Company" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <div className="elr-b-gal-row">
            {[0, 1, 2, 3].map((i) => { const img = galleryImages[i] || {}; return (<ImgZone key={i} sectionKey="gallery" fieldName={`images.${i}`} url={img.url} alt={img.alt || `Gallery image ${i + 1}`} label={`Image ${i + 1} · ~260 × 260`} {...imgProps} />); })}
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §6 CTA */}
        <SecWrap sectionKey="contact" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-contact" className="elr-sec elr-bg-blue" aria-label="Contact section">
          <h2 className="elr-h2" style={{ marginBottom: '1.5rem' }}>Contact</h2>
          <CtaButtons sectionKey="contact" contentData={contact} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §7 + §8 side by side */}
        <div className="elr-b-jobs-ben">
          <SecWrap sectionKey="jobs" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-careers" className="elr-sec elr-bg-light" aria-label="Careers section">
            <h2 className="elr-h2" style={{ marginBottom: '1.25rem' }}>Open Positions</h2>
            <JobsList sectionKey="jobs" jobsList={jobs.jobsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
            {!isEditMode && jobs.locationsText && (<div style={{ marginTop: '1.5rem' }}><h3 className="elr-h3" style={{ marginBottom: '0.4rem' }}>Locations</h3><p className="elr-body" style={{ fontSize: '0.9rem' }}>{jobs.locationsText}</p></div>)}
            {isEditMode && (<div style={{ marginTop: 10 }}><input type="text" defaultValue={jobs.locationsText || ''} placeholder="Locations" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 13 }} onBlur={(e) => onUpdateField && onUpdateField('jobs', 'locationsText', e.target.value)} aria-label="Locations" /></div>)}
          </SecWrap>
          <SecWrap sectionKey="benefits" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="b-benefits" className="elr-b-ben-col elr-bg-dark" aria-label="Benefits section">
            <h2 className="elr-h2" style={{ marginBottom: '1.25rem' }}>Benefits</h2>
            <BenefitsList sectionKey="benefits" benefitsList={benefits.benefitsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </SecWrap>
        </div>
      </main>

      <SecWrap sectionKey="social" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} className="elr-sec-sm elr-bg-white" style={{ textAlign: 'center', borderTop: '1px solid #e8e5e0' }} as="footer" role="contentinfo">
        <SocialFooter sectionKey="social" links={social.links} bgColor={social.bgColor} textColor={social.textColor} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        <TXT
          sectionKey="social"
          fieldName="copyrightText"
          value={copyrightText}
          placeholder="Copyright text"
          tagName="p"
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaa', marginTop: 12 }}
          isEditMode={isEditMode}
          onUpdateField={onUpdateField}
        />
      </SecWrap>
    </>
  );
}

/* ================================================================
   LAYOUT C — Editorial / Mosaic
   ================================================================ */
function LayoutC({ cd, isEditMode, onUpdateField, onUploadImage, uploadingFields }) {
  const about = cd('about');
  const program = cd('program');
  const video = cd('video');
  const gallery = cd('gallery');
  const contact = cd('contact');
  const jobs = cd('jobs');
  const benefits = cd('benefits');
  const social = cd('social');
  const copyrightText = social.copyrightText || getDefaultCopyrightText();
  const galleryImages = Array.isArray(gallery.images) ? gallery.images : Array(5).fill(null);
  const imgProps = { isEditMode, onUploadImage, uploadingFields };

  return (
    <>
      {/* Header: logo + nav inline */}
      <header className="elr-c-header elr-bg-white" style={getSectionStyle(about)} role="banner">
        <ImgZone sectionKey="about" fieldName="logoImageUrl" url={about.logoImageUrl} alt={about.companyName || 'Company logo'} label="Logo · 110 × 48" className="elr-c-logo-zone" {...imgProps} />
        <nav className="elr-c-nav" aria-label="Page sections">
          {['About', 'Programs', 'Video', 'Gallery', 'Careers', 'Benefits', 'Contact'].map((label) => (
            <a key={label} href={`#c-${label.toLowerCase()}`} className="elr-nav-link">{label}</a>
          ))}
        </nav>
      </header>

      <main>
        {/* Dual brand images */}
        <div className="elr-dual-images elr-bg-white" role="group" aria-label="Company identity images">
          <ImgZone sectionKey="about" fieldName="brandImage1Url" url={about.brandImage1Url} alt="Brand image 1" label="Brand Image 1 · 600 × 400" {...imgProps} />
          <ImgZone sectionKey="about" fieldName="brandImage2Url" url={about.brandImage2Url} alt="Brand image 2" label="Brand Image 2 · 600 × 400" {...imgProps} />
        </div>

        {/* §2 About */}
        <SecWrap sectionKey="about" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-about" className="elr-sec elr-bg-white" aria-label="About section">
          <div className="elr-c-about-row">
            <div>
              <TXT sectionKey="about" fieldName="companyName" value={about.companyName} placeholder="Company Name" className="elr-h1" tagName="h1" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <div style={{ marginTop: '0.75rem' }} />
              <TXT sectionKey="about" fieldName="tagline" value={about.tagline} placeholder="Mission Statement / Tagline" className="elr-h2" style={{ fontSize: '1.15rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <div style={{ marginTop: '1rem' }} />
              <TXT sectionKey="about" fieldName="aboutText" value={about.aboutText} placeholder="About Us paragraph..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
            <ImgZone sectionKey="about" fieldName="heroImageUrl" url={about.heroImageUrl} alt={about.heroImageAlt || 'Accent portrait'} label="Accent Portrait · 3:4" className="elr-c-about-portrait" {...imgProps} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §3 Program */}
        <SecWrap sectionKey="program" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-programs" className="elr-bg-light" aria-label="Programs section">
          <div style={{ position: 'relative' }}>
            <ImgZone sectionKey="program" fieldName="programImageUrl" url={program.programImageUrl} alt={program.programImageAlt || 'Program image'} label="Program Image · Full Width × 320px" className="elr-c-prog-full" {...imgProps} />
            <div className="elr-c-prog-overlay">
              <TXT sectionKey="program" fieldName="programTitle" value={program.programTitle} placeholder="Special Program Title" className="elr-h2" tagName="h2" style={{ color: '#fff', marginBottom: '0.5rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="program" fieldName="programText" value={program.programText} placeholder="Describe your special initiative..." style={{ fontFamily: 'Arial,sans-serif', fontSize: 14, color: '#b8c8e0', lineHeight: 1.6, maxWidth: 680, display: 'block' }} tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
          </div>
        </SecWrap>

        {/* §4 Video */}
        <SecWrap sectionKey="video" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-video" className="elr-sec elr-bg-white" aria-label="Video section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <TXT sectionKey="video" fieldName="videoTitle" value={video.videoTitle} placeholder="Executive Welcome Video" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            <VideoZone sectionKey="video" url={video.videoUrl} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <VideoUrlEditor sectionKey="video" videoUrl={video.videoUrl} videoTitle={video.videoTitle} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §5 Mosaic gallery */}
        <SecWrap sectionKey="gallery" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-gallery" className="elr-sec elr-bg-blue" aria-label="Gallery section">
          <TXT sectionKey="gallery" fieldName="galleryTitle" value={gallery.galleryTitle} placeholder="Life at the Company" className="elr-h2" tagName="h2" style={{ marginBottom: '1.5rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          <div className="elr-c-mosaic">
            <ImgZone sectionKey="gallery" fieldName="images.0" url={galleryImages[0]?.url} alt={galleryImages[0]?.alt || 'Gallery 1'} label="Image 1 — Large · ~460 × 360" className="elr-c-mosaic-big" {...imgProps} />
            <ImgZone sectionKey="gallery" fieldName="images.1" url={galleryImages[1]?.url} alt="Gallery 2" label="Image 2 · ~220 × 175" className="elr-c-mosaic-sm" {...imgProps} />
            <ImgZone sectionKey="gallery" fieldName="images.2" url={galleryImages[2]?.url} alt="Gallery 3" label="Image 3 · ~220 × 175" className="elr-c-mosaic-sm" {...imgProps} />
            <ImgZone sectionKey="gallery" fieldName="images.3" url={galleryImages[3]?.url} alt="Gallery 4" label="Image 4 · ~220 × 175" className="elr-c-mosaic-land" {...imgProps} />
            <ImgZone sectionKey="gallery" fieldName="images.4" url={galleryImages[4]?.url} alt="Gallery 5" label="Image 5 · ~220 × 175" className="elr-c-mosaic-land" {...imgProps} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §6 CTA dark banner */}
        <SecWrap sectionKey="contact" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-contact" className="elr-sec elr-bg-dark" aria-label="Contact section">
          <div style={{ textAlign: 'center' }}>
            <h2 className="elr-h2" style={{ marginBottom: '0.75rem' }}>Ready to Join Our Team?</h2>
            <p className="elr-body" style={{ marginBottom: '1.5rem', maxWidth: 480, marginLeft: 'auto', marginRight: 'auto' }}>Explore open roles or connect with our talent team.</p>
            <CtaButtons sectionKey="contact" contentData={{ ...contact, primaryBtnText: contact.primaryBtnText || 'Join Our Talent Community', secondaryBtnText: contact.secondaryBtnText || 'View Our Open Positions' }} isEditMode={isEditMode} onUpdateField={onUpdateField} className="justify-center" />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §7 Jobs */}
        <SecWrap sectionKey="jobs" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-careers" className="elr-sec elr-bg-light" aria-label="Careers section">
          <div style={{ maxWidth: 860 }}>
            <h2 className="elr-h2" style={{ marginBottom: '1.5rem' }}>Open Positions</h2>
            <JobsList sectionKey="jobs" jobsList={jobs.jobsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
            {!isEditMode && jobs.locationsText && (<div style={{ marginTop: '2rem' }}><h3 className="elr-h3" style={{ marginBottom: '0.4rem' }}>Locations</h3><p className="elr-body">{jobs.locationsText}</p></div>)}
            {isEditMode && (<div style={{ marginTop: 10 }}><input type="text" defaultValue={jobs.locationsText || ''} placeholder="Locations" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 13 }} onBlur={(e) => onUpdateField && onUpdateField('jobs', 'locationsText', e.target.value)} aria-label="Locations" /></div>)}
          </div>
        </SecWrap>

        {/* §8 Benefits */}
        <SecWrap sectionKey="benefits" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="c-benefits" className="elr-sec elr-bg-dark" aria-label="Benefits section">
          <div style={{ maxWidth: 860, margin: '0 auto' }}>
            <h2 className="elr-h2" style={{ marginBottom: '1.5rem' }}>Benefits</h2>
            <BenefitsList sectionKey="benefits" benefitsList={benefits.benefitsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
        </SecWrap>
      </main>

      <SecWrap sectionKey="social" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} className="elr-sec-sm elr-bg-white" style={{ textAlign: 'center', borderTop: '1px solid #e8e5e0' }} as="footer" role="contentinfo">
        <SocialFooter sectionKey="social" links={social.links} bgColor={social.bgColor} textColor={social.textColor} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        <TXT
          sectionKey="social"
          fieldName="copyrightText"
          value={copyrightText}
          placeholder="Copyright text"
          tagName="p"
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaa', marginTop: 12 }}
          isEditMode={isEditMode}
          onUpdateField={onUpdateField}
        />
      </SecWrap>
    </>
  );
}

/* ================================================================
   LAYOUT D — Compact / Inline
   ================================================================ */
function LayoutD({ cd, isEditMode, onUpdateField, onUploadImage, uploadingFields }) {
  const about = cd('about');
  const program = cd('program');
  const video = cd('video');
  const gallery = cd('gallery');
  const contact = cd('contact');
  const jobs = cd('jobs');
  const benefits = cd('benefits');
  const social = cd('social');
  const copyrightText = social.copyrightText || getDefaultCopyrightText();
  const galleryImages = Array.isArray(gallery.images) ? gallery.images : Array(4).fill(null);
  const imgProps = { isEditMode, onUploadImage, uploadingFields };

  return (
    <>
      {/* Dark header */}
      <header className="elr-d-header" style={getSectionStyle(about)} role="banner">
        <ImgZone sectionKey="about" fieldName="logoImageUrl" url={about.logoImageUrl} alt={about.companyName || 'Company logo'} label="Logo · 95 × 40" className="elr-d-logo-zone" style={{ background: '#2d3a50', borderColor: '#445' }} {...imgProps} />
        <nav className="elr-d-nav" aria-label="Page sections">
          {['About', 'Programs', 'Video', 'Gallery', 'Careers', 'Benefits', 'Contact'].map((label) => (
            <a key={label} href={`#d-${label.toLowerCase()}`}>{label}</a>
          ))}
        </nav>
      </header>

      <main>
        {/* §2 Identity */}
        <SecWrap sectionKey="about" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-about" className="elr-bg-white" aria-label="About section">
          <div className="elr-d-identity">
            <ImgZone sectionKey="about" fieldName="heroImageUrl" url={about.heroImageUrl} alt={about.heroImageAlt || 'Identity image'} label="Identity Image · ~300 × 280" className="elr-d-id-img-zone" {...imgProps} />
            <div className="elr-d-id-txt">
              <TXT sectionKey="about" fieldName="companyName" value={about.companyName} placeholder="Company Name" className="elr-h1" tagName="h1" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="about" fieldName="tagline" value={about.tagline} placeholder="Mission Statement / Tagline" className="elr-h2" style={{ fontSize: '1.05rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="about" fieldName="aboutText" value={about.aboutText} placeholder="About Us paragraph..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
          </div>
        </SecWrap>

        {/* Dual brand images */}
        <div className="elr-dual-images elr-bg-white" style={{ paddingTop: '1rem' }} role="group" aria-label="Additional company images">
          <ImgZone sectionKey="about" fieldName="brandImage1Url" url={about.brandImage1Url} alt="Brand image 1" label="Brand Image 1 · 600 × 400" {...imgProps} />
          <ImgZone sectionKey="about" fieldName="brandImage2Url" url={about.brandImage2Url} alt="Brand image 2" label="Brand Image 2 · 600 × 400" {...imgProps} />
        </div>

        <hr className="elr-divider" />

        {/* §3 Program */}
        <SecWrap sectionKey="program" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-programs" className="elr-sec elr-bg-blue" aria-label="Programs section">
          <div className="elr-d-prog-row">
            <div className="elr-d-prog-txt">
              <TXT sectionKey="program" fieldName="programTitle" value={program.programTitle} placeholder="Special Program Title" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
              <TXT sectionKey="program" fieldName="programText" value={program.programText} placeholder="Describe your special initiative..." className="elr-body" tagName="p" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            </div>
            <ImgZone sectionKey="program" fieldName="programImageUrl" url={program.programImageUrl} alt={program.programImageAlt || 'Program image'} label="Program Image · Landscape 4:3" className="elr-d-prog-img-zone" {...imgProps} />
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §4 Video */}
        <SecWrap sectionKey="video" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-video" className="elr-sec elr-bg-white" aria-label="Video section">
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.5rem' }}>
            <TXT sectionKey="video" fieldName="videoTitle" value={video.videoTitle} placeholder="Executive Welcome Video" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
            <VideoZone sectionKey="video" url={video.videoUrl} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <VideoUrlEditor sectionKey="video" videoUrl={video.videoUrl} videoTitle={video.videoTitle} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §5 Gallery */}
        <SecWrap sectionKey="gallery" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-gallery" className="elr-bg-light" aria-label="Gallery section">
          <div style={{ padding: '1.5rem 3rem 0.5rem' }}>
            <TXT sectionKey="gallery" fieldName="galleryTitle" value={gallery.galleryTitle} placeholder="Life at the Company" className="elr-h2" tagName="h2" isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </div>
          <div className="elr-d-gal-row">
            {[0, 1, 2, 3].map((i) => { const img = galleryImages[i] || {}; return (<ImgZone key={i} sectionKey="gallery" fieldName={`images.${i}`} url={img.url} alt={img.alt || `Gallery image ${i + 1}`} label={`Image ${i + 1} · ~300 × 200`} {...imgProps} />); })}
          </div>
        </SecWrap>

        <hr className="elr-divider" />

        {/* §6 CTA inline banner */}
        <SecWrap sectionKey="contact" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-contact" className="elr-d-cta-banner elr-bg-blue" aria-label="Contact section">
          <TXT sectionKey="contact" fieldName="ctaHeadline" value={contact.ctaHeadline} placeholder="Ready to explore a career with us?" className="elr-h2" tagName="h2" style={{ fontSize: '1.15rem' }} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          <CtaButtons sectionKey="contact" contentData={contact} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        </SecWrap>

        <hr className="elr-divider" />

        {/* §7 + §8 Jobs + Benefits */}
        <div className="elr-d-jobs-ben">
          <SecWrap sectionKey="jobs" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-careers" className="elr-sec elr-bg-light" aria-label="Careers section">
            <h2 className="elr-h2" style={{ marginBottom: '1.25rem' }}>Open Positions</h2>
            <JobsList sectionKey="jobs" jobsList={jobs.jobsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
            {!isEditMode && jobs.locationsText && (<div style={{ marginTop: '1.5rem' }}><h3 className="elr-h3" style={{ marginBottom: '0.4rem' }}>Locations</h3><p className="elr-body" style={{ fontSize: '0.9rem' }}>{jobs.locationsText}</p></div>)}
            {isEditMode && (<div style={{ marginTop: 10 }}><input type="text" defaultValue={jobs.locationsText || ''} placeholder="Locations" style={{ width: '100%', border: '1px solid #d1d5db', borderRadius: 4, padding: '6px 10px', fontSize: 13 }} onBlur={(e) => onUpdateField && onUpdateField('jobs', 'locationsText', e.target.value)} aria-label="Locations" /></div>)}
          </SecWrap>
          <SecWrap sectionKey="benefits" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} id="d-benefits" className="elr-d-ben-col" aria-label="Benefits section">
            <h2 className="elr-h2" style={{ marginBottom: '1rem' }}>Benefits</h2>
            <BenefitsList sectionKey="benefits" benefitsList={benefits.benefitsList} isEditMode={isEditMode} onUpdateField={onUpdateField} />
          </SecWrap>
        </div>
      </main>

      <SecWrap sectionKey="social" cd={cd} isEditMode={isEditMode} onUpdateField={onUpdateField} className="elr-sec-sm elr-bg-white" style={{ textAlign: 'center', borderTop: '1px solid #e8e5e0' }} as="footer" role="contentinfo">
        <SocialFooter sectionKey="social" links={social.links} bgColor={social.bgColor} textColor={social.textColor} isEditMode={isEditMode} onUpdateField={onUpdateField} />
        <TXT
          sectionKey="social"
          fieldName="copyrightText"
          value={copyrightText}
          placeholder="Copyright text"
          tagName="p"
          style={{ fontFamily: 'monospace', fontSize: 12, color: '#aaa', marginTop: 12 }}
          isEditMode={isEditMode}
          onUpdateField={onUpdateField}
        />
      </SecWrap>
    </>
  );
}
