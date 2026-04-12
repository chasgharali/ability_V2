/**
 * URL path for a static file in `public/` (Create React App).
 * Honors `PUBLIC_URL` when the app is hosted under a subpath.
 */
export function publicUrl(relativePath) {
  const name = String(relativePath || '').replace(/^\/+/, '');
  if (!name) return '/';
  const base = (process.env.PUBLIC_URL || '').replace(/\/$/, '');
  return base ? `${base}/${name}` : `/${name}`;
}
