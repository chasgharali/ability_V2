import {
  LOGO_ACCEPT,
  isAllowedLogoFile,
  isSvgLogoFile,
  validateLogoFile,
  getLogoUploadErrorMessage,
} from './logoUpload';

describe('logoUpload utils', () => {
  test('detects SVG by MIME or extension', () => {
    expect(isSvgLogoFile({ type: 'image/svg+xml', name: 'x.bin' })).toBe(true);
    expect(isSvgLogoFile({ type: '', name: 'logo.SVG' })).toBe(true);
    expect(isSvgLogoFile({ type: 'image/png', name: 'logo.png' })).toBe(false);
  });

  test('accepts supported logo formats including empty-MIME SVG', () => {
    expect(isAllowedLogoFile({ type: 'image/png', name: 'a.png' })).toBe(true);
    expect(isAllowedLogoFile({ type: '', name: 'logo.svg' })).toBe(true);
    expect(isAllowedLogoFile({ type: 'application/pdf', name: 'a.pdf' })).toBe(false);
  });

  test('validateLogoFile enforces type and size', () => {
    expect(validateLogoFile({ type: 'image/png', name: 'a.png', size: 100 }).ok).toBe(true);
    expect(validateLogoFile({ type: '', name: 'logo.svg', size: 100 }).ok).toBe(true);
    expect(validateLogoFile({ type: 'text/plain', name: 'a.txt', size: 100 }).ok).toBe(false);
    expect(
      validateLogoFile({ type: 'image/png', name: 'big.png', size: 3 * 1024 * 1024 }).message
    ).toMatch(/2MB/i);
  });

  test('LOGO_ACCEPT includes svg', () => {
    expect(LOGO_ACCEPT).toContain('image/svg+xml');
    expect(LOGO_ACCEPT).toContain('.svg');
  });

  test('getLogoUploadErrorMessage prefers server message', () => {
    expect(
      getLogoUploadErrorMessage({
        response: { data: { message: 'SVG rejected' } },
      })
    ).toBe('SVG rejected');
    expect(getLogoUploadErrorMessage({ message: 'network' }, 'fallback')).toBe('network');
    expect(getLogoUploadErrorMessage({}, 'fallback')).toBe('fallback');
  });
});
