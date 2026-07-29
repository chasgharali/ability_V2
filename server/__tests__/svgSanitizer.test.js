const {
  sanitizeSvgLogo,
  isSvgMimeType,
  isSvgFileName,
  looksLikeSvg
} = require('../utils/svgSanitizer');

describe('svgSanitizer', () => {
  const safeSvg = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle cx="5" cy="5" r="4" fill="blue"/></svg>',
    'utf8'
  );

  test('isSvgMimeType and isSvgFileName detect SVG metadata', () => {
    expect(isSvgMimeType('image/svg+xml')).toBe(true);
    expect(isSvgMimeType('image/png')).toBe(false);
    expect(isSvgFileName('logo.SVG')).toBe(true);
    expect(isSvgFileName('logo.png')).toBe(false);
  });

  test('looksLikeSvg detects svg markup', () => {
    expect(looksLikeSvg(safeSvg)).toBe(true);
    expect(looksLikeSvg(Buffer.from('not an svg'))).toBe(false);
  });

  test('sanitizeSvgLogo keeps safe vector content', () => {
    const result = sanitizeSvgLogo(safeSvg, {
      mimeType: 'image/svg+xml',
      fileName: 'logo.svg'
    });
    const text = result.toString('utf8');
    expect(text).toContain('<svg');
    expect(text).toContain('<circle');
    expect(text).not.toContain('<script');
  });

  test('sanitizeSvgLogo strips script tags and event handlers', () => {
    const dirty = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script><circle r="5"/></svg>',
      'utf8'
    );
    const text = sanitizeSvgLogo(dirty, {
      mimeType: 'image/svg+xml',
      fileName: 'evil.svg'
    }).toString('utf8');

    expect(text).toContain('<circle');
    expect(text).not.toContain('<script');
    expect(text).not.toMatch(/onload=/i);
  });

  test('sanitizeSvgLogo removes foreignObject and external references', () => {
    const dirty = Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg">
        <foreignObject width="100" height="100"><div xmlns="http://www.w3.org/1999/xhtml">x</div></foreignObject>
        <image href="https://evil.example/logo.png"/>
        <a href="javascript:alert(1)"><text>x</text></a>
        <circle r="5"/>
      </svg>`,
      'utf8'
    );
    const text = sanitizeSvgLogo(dirty, {
      mimeType: 'image/svg+xml',
      fileName: 'refs.svg'
    }).toString('utf8');

    expect(text).not.toMatch(/foreignObject/i);
    expect(text).not.toContain('https://evil.example');
    expect(text).not.toContain('javascript:');
    expect(text).toContain('<circle');
  });

  test('sanitizeSvgLogo rejects empty, non-svg, and oversized payloads', () => {
    expect(() => sanitizeSvgLogo(Buffer.alloc(0))).toThrow(/empty/i);
    expect(() =>
      sanitizeSvgLogo(Buffer.from('<html></html>'), { mimeType: 'image/svg+xml', fileName: 'x.svg' })
    ).toThrow(/valid SVG/i);
    expect(() =>
      sanitizeSvgLogo(Buffer.alloc(3 * 1024 * 1024, 61), {
        mimeType: 'image/svg+xml',
        fileName: 'big.svg',
        maxBytes: 2 * 1024 * 1024
      })
    ).toThrow(/size limit/i);
  });

  test('sanitizeSvgLogo rejects script-only svg that has no drawable content after sanitize', () => {
    const dirty = Buffer.from(
      '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
      'utf8'
    );
    expect(() =>
      sanitizeSvgLogo(dirty, { mimeType: 'image/svg+xml', fileName: 'empty.svg' })
    ).toThrow(/no drawable content/i);
  });

  test('sanitizeSvgLogo accepts empty MIME when filename ends with .svg', () => {
    const result = sanitizeSvgLogo(safeSvg, {
      mimeType: '',
      fileName: 'logo.svg'
    });
    expect(result.toString('utf8')).toContain('<circle');
  });
});
