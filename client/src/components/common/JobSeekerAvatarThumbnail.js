import React, { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import './JobSeekerAvatarThumbnail.css';

function getInitials(name) {
  if (!name || typeof name !== 'string') return '?';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
  return `${parts[0].charAt(0)}${parts[parts.length - 1].charAt(0)}`.toUpperCase();
}

function AvatarLightbox({ avatarUrl, name, onClose }) {
  const label = name ? `Profile photo of ${name}` : 'Job seeker profile photo';

  useEffect(() => {
    const onKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = prevOverflow;
    };
  }, [onClose]);

  return createPortal(
    <div
      className="js-avatar-lightbox"
      role="dialog"
      aria-modal="true"
      aria-label={label}
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClose();
      }}
    >
      <div
        className="js-avatar-lightbox__content"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <button
          type="button"
          className="js-avatar-lightbox__close"
          onClick={onClose}
          aria-label="Close photo preview"
        >
          ×
        </button>
        {name ? <p className="js-avatar-lightbox__name">{name}</p> : null}
        <img src={avatarUrl} alt={label} className="js-avatar-lightbox__image" />
      </div>
    </div>,
    document.body
  );
}

/**
 * Small circular profile image for Syncfusion grid rows.
 * Falls back to initials when avatarUrl is missing or fails to load.
 * Clicking a real photo opens a lightbox popup.
 */
export default function JobSeekerAvatarThumbnail({
  avatarUrl,
  name = '',
  size = 36,
  className = ''
}) {
  const [loadError, setLoadError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const showImage = Boolean(avatarUrl) && !loadError;
  const initials = getInitials(name);
  const label = name ? `Profile photo of ${name}` : 'Job seeker profile photo';

  const openLightbox = useCallback((e) => {
    e.stopPropagation();
    e.preventDefault();
    if (!showImage) return;
    setLightboxOpen(true);
  }, [showImage]);

  const closeLightbox = useCallback(() => {
    setLightboxOpen(false);
  }, []);

  return (
    <>
      <button
        type="button"
        className={`js-avatar-thumb ${showImage ? 'js-avatar-thumb--clickable' : ''} ${className}`.trim()}
        style={{ width: size, height: size }}
        onClick={openLightbox}
        disabled={!showImage}
        title={showImage ? `View photo${name ? ` of ${name}` : ''}` : (name || 'No profile photo')}
        aria-label={showImage ? `View ${label}` : (name ? `${name}, no profile photo` : 'No profile photo')}
      >
        {showImage ? (
          <img
            src={avatarUrl}
            alt=""
            className="js-avatar-thumb__image"
            onError={() => setLoadError(true)}
          />
        ) : (
          <span className="js-avatar-thumb__placeholder" aria-hidden="true">
            {initials}
          </span>
        )}
      </button>
      {lightboxOpen && showImage ? (
        <AvatarLightbox avatarUrl={avatarUrl} name={name} onClose={closeLightbox} />
      ) : null}
    </>
  );
}

/**
 * Syncfusion grid cell template helper — returns a centered thumbnail.
 * Accepts either a flat avatarUrl/name or a nested jobSeeker / jobseekerId object.
 */
export function jobSeekerAvatarCellTemplate(props, {
  avatarUrl,
  name,
  size = 36
} = {}) {
  const row = props || {};
  const jobSeeker =
    row.jobSeeker ||
    row.jobseekerId ||
    row.jobSeekerId ||
    null;

  const resolvedUrl =
    avatarUrl ||
    row.avatarUrl ||
    row.jobSeekerAvatarUrl ||
    (jobSeeker && typeof jobSeeker === 'object' ? jobSeeker.avatarUrl : '') ||
    '';

  const resolvedName =
    name ||
    row.jobSeekerName ||
    row.name ||
    [row.firstName, row.lastName].filter(Boolean).join(' ') ||
    (jobSeeker && typeof jobSeeker === 'object' ? jobSeeker.name : '') ||
    '';

  return (
    <div className="js-avatar-thumb-cell">
      <JobSeekerAvatarThumbnail
        avatarUrl={resolvedUrl}
        name={resolvedName}
        size={size}
      />
    </div>
  );
}
