const DOMPurify = require('isomorphic-dompurify');

const DEFAULT_MAX_BYTES = 2 * 1024 * 1024; // 2MB

const SVG_SANITIZE_OPTIONS = {
    USE_PROFILES: { svg: true, svgFilters: true },
    FORBID_TAGS: [
        'script',
        'foreignObject',
        'iframe',
        'object',
        'embed',
        'link',
        'meta',
        'base',
        'form',
        'input',
        'button',
        'textarea',
        'select'
    ],
    FORBID_ATTR: [
        'onload',
        'onerror',
        'onclick',
        'onmouseover',
        'onfocus',
        'onblur',
        'onchange',
        'onsubmit',
        'onkeydown',
        'onkeyup',
        'onkeypress',
        'ontouchstart',
        'ontouchend'
    ],
    ALLOW_UNKNOWN_PROTOCOLS: false,
    SAFE_FOR_TEMPLATES: true
};

const UNSAFE_URL_ATTRS = [
    'href',
    'xlink:href',
    'src',
    'xlink:src',
    'action',
    'formaction',
    'cite',
    'poster',
    'data'
];

function createSvgError(message, code, status = 400) {
    const error = new Error(message);
    error.status = status;
    error.code = code;
    return error;
}

function isSvgMimeType(mimeType) {
    return typeof mimeType === 'string' && mimeType.toLowerCase() === 'image/svg+xml';
}

function isSvgFileName(fileName) {
    return typeof fileName === 'string' && /\.svg$/i.test(fileName);
}

function looksLikeSvg(bufferOrString) {
    const text = Buffer.isBuffer(bufferOrString)
        ? bufferOrString.toString('utf8', 0, Math.min(bufferOrString.length, 4096))
        : String(bufferOrString || '');
    return /<svg[\s>]/i.test(text);
}

function stripUnsafeUrlAttributes(svg) {
    let result = svg;

    for (const attr of UNSAFE_URL_ATTRS) {
        const escaped = attr.replace(':', '\\:');
        const pattern = new RegExp(
            `(\\s${escaped}\\s*=\\s*)([\"'])([^\"']*)\\2`,
            'gi'
        );
        result = result.replace(pattern, (match, prefix, quote, value) => {
            const trimmed = String(value || '').trim();
            if (!trimmed) return `${prefix}${quote}${quote}`;

            // Allow same-document fragment references and relative paths without schemes.
            if (trimmed.startsWith('#')) {
                return `${prefix}${quote}${trimmed}${quote}`;
            }

            const lower = trimmed.toLowerCase();
            if (
                lower.startsWith('javascript:') ||
                lower.startsWith('data:') ||
                lower.startsWith('vbscript:') ||
                lower.startsWith('http:') ||
                lower.startsWith('https:') ||
                lower.startsWith('//')
            ) {
                return `${prefix}${quote}${quote}`;
            }

            return `${prefix}${quote}${trimmed}${quote}`;
        });
    }

    // Strip css url() with remote/data/javascript schemes inside style blocks/attrs.
    result = result.replace(/url\s*\(\s*(['"]?)([^)'"]+)\1\s*\)/gi, (match, _q, value) => {
        const trimmed = String(value || '').trim();
        if (trimmed.startsWith('#')) return `url(${trimmed})`;
        const lower = trimmed.toLowerCase();
        if (
            lower.startsWith('javascript:') ||
            lower.startsWith('data:') ||
            lower.startsWith('vbscript:') ||
            lower.startsWith('http:') ||
            lower.startsWith('https:') ||
            lower.startsWith('//')
        ) {
            return 'url()';
        }
        return match;
    });

    return result;
}

function hasMeaningfulSvgContent(svg) {
    return /<(?:path|circle|rect|ellipse|line|polyline|polygon|text|g|image|use|symbol|defs|style|linearGradient|radialGradient|clipPath|mask|pattern|marker|filter)\b/i.test(
        svg
    );
}

/**
 * Validate and sanitize an SVG logo buffer.
 * Returns sanitized UTF-8 Buffer suitable for S3 storage.
 */
function sanitizeSvgLogo(input, options = {}) {
    const maxBytes = options.maxBytes || DEFAULT_MAX_BYTES;
    const mimeType = options.mimeType;
    const fileName = options.fileName;

    if (mimeType && !isSvgMimeType(mimeType) && !isSvgFileName(fileName)) {
        throw createSvgError(
            'Only SVG images are accepted for sanitized logo upload',
            'INVALID_SVG_MIME'
        );
    }

    const buffer = Buffer.isBuffer(input)
        ? input
        : Buffer.from(String(input || ''), 'utf8');

    if (!buffer.length) {
        throw createSvgError('SVG file is empty', 'EMPTY_SVG');
    }

    if (buffer.length > maxBytes) {
        throw createSvgError(
            `SVG file exceeds the ${Math.round(maxBytes / (1024 * 1024))}MB size limit`,
            'SVG_TOO_LARGE'
        );
    }

    if (!looksLikeSvg(buffer)) {
        throw createSvgError('File does not appear to be a valid SVG', 'INVALID_SVG');
    }

    const raw = buffer.toString('utf8');
    let cleaned = DOMPurify.sanitize(raw, SVG_SANITIZE_OPTIONS);

    if (typeof cleaned !== 'string' || !cleaned.trim()) {
        throw createSvgError('SVG content was rejected by the sanitizer', 'SVG_REJECTED');
    }

    cleaned = stripUnsafeUrlAttributes(cleaned).trim();

    if (!/<svg[\s>]/i.test(cleaned)) {
        throw createSvgError('Sanitized output is not a valid SVG document', 'INVALID_SVG');
    }

    if (!hasMeaningfulSvgContent(cleaned)) {
        throw createSvgError(
            'SVG logo has no drawable content after sanitization',
            'SVG_EMPTY_CONTENT'
        );
    }

    // Ensure XML declaration-free, browser-friendly SVG payload.
    if (!cleaned.startsWith('<svg')) {
        const svgIndex = cleaned.toLowerCase().indexOf('<svg');
        if (svgIndex >= 0) {
            cleaned = cleaned.slice(svgIndex);
        }
    }

    return Buffer.from(cleaned, 'utf8');
}

module.exports = {
    DEFAULT_MAX_BYTES,
    isSvgMimeType,
    isSvgFileName,
    looksLikeSvg,
    sanitizeSvgLogo
};
