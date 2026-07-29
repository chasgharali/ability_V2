export const LOGO_ACCEPT =
  'image/png,image/jpeg,image/jpg,image/gif,image/webp,image/svg+xml,.svg';

export const LOGO_HELP_TEXT = 'PNG, JPG, GIF, WebP, or SVG (max 2MB)';

export const LOGO_MAX_BYTES = 2 * 1024 * 1024;

const RASTER_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/gif',
  'image/webp',
]);

const RASTER_EXTENSION_PATTERN = /\.(png|jpe?g|gif|webp)$/i;

export function isSvgLogoFile(file) {
  if (!file) return false;
  if (file.type === 'image/svg+xml') return true;
  return /\.svg$/i.test(file.name || '');
}

export function isAllowedLogoFile(file) {
  if (!file) return false;
  if (isSvgLogoFile(file)) return true;
  if (file.type && RASTER_MIME_TYPES.has(file.type.toLowerCase())) return true;
  return RASTER_EXTENSION_PATTERN.test(file.name || '');
}

/**
 * Validate a logo file before upload.
 * @returns {{ ok: true } | { ok: false, message: string }}
 */
export function validateLogoFile(file, { maxBytes = LOGO_MAX_BYTES } = {}) {
  if (!file) {
    return { ok: false, message: 'Please select an image file' };
  }
  if (!isAllowedLogoFile(file)) {
    return {
      ok: false,
      message: 'Please select a PNG, JPG, GIF, WebP, or SVG image',
    };
  }
  if (file.size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, message: `Logo file size must be ${mb}MB or less` };
  }
  return { ok: true };
}

export function getLogoUploadErrorMessage(error, fallback = 'Failed to upload logo') {
  return (
    error?.response?.data?.message ||
    error?.response?.data?.error ||
    error?.message ||
    fallback
  );
}
