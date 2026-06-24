const S3_HOST_PATTERN = /(^|\.)(s3[.-][a-z0-9-]+|s3)\.amazonaws\.com$/i;

function encodeKeyForPath(key) {
    return encodeURIComponent(key).replace(/%2F/g, '/');
}

function extractS3KeyFromUrl(value, bucketName = '') {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    // Already a raw key
    if (/^(image|booth-logo|organization-logo|avatar|resume|resumes|jobseeker)\//.test(trimmed)) {
        return trimmed;
    }

    let parsed;
    try {
        parsed = new URL(trimmed);
    } catch (_error) {
        return null;
    }

    if (!S3_HOST_PATTERN.test(parsed.hostname)) {
        return null;
    }

    const pathname = decodeURIComponent((parsed.pathname || '').replace(/^\/+/, ''));
    if (!pathname) return null;

    const bucket = (bucketName || '').trim();
    if (bucket && pathname.startsWith(`${bucket}/`)) {
        return pathname.slice(bucket.length + 1);
    }

    return pathname;
}

function safeDecode(value) {
    if (typeof value !== 'string') return value;
    try {
        return decodeURIComponent(value);
    } catch (_error) {
        return value;
    }
}

/**
 * Extract a clean S3 key from a stream URL key param, including malformed values
 * where a JWT was appended without a proper &token= separator.
 */
function extractVideoAudioKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;

    const decoded = safeDecode(rawKey.trim());

    const withExtension = decoded.match(
        /((?:video|audio)\/[^?&#\s]+\/[^?&#\s]+?\.(?:mp4|mov|webm|ogg|mp3|wav|m4a|aac))/i
    );
    if (withExtension) {
        return withExtension[1];
    }

    if (/^(video|audio)\/[^/]+\/[^?&#\s]+$/.test(decoded)) {
        return decoded.split(/[?&#]/)[0];
    }

    return null;
}

const STREAM_URL_PATTERN = /\/api\/uploads\/stream\?key=([^"'&\s]+)(?:(?:&amp;|&)token=[^"'&\s]*)?/gi;

/**
 * Rewrite RTE stream URLs to stable public media URLs for booth/event HTML content.
 */
function hydrateStreamMediaUrlsInHtml(html) {
    if (!html || typeof html !== 'string') return html;

    return html.replace(STREAM_URL_PATTERN, (_match, encodedKey) => {
        const mediaKey = extractVideoAudioKey(encodedKey);
        if (mediaKey) {
            return `/api/uploads/public/${encodeKeyForPath(mediaKey)}`;
        }
        return _match;
    });
}

function toStablePublicImageUrl(value, bucketName = process.env.AWS_S3_BUCKET) {
    if (!value || typeof value !== 'string') return value;

    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    if (trimmed.startsWith('/api/uploads/public/')) return trimmed;
    if (trimmed.startsWith('/api/uploads/rte-content/')) return trimmed;

    const key = extractS3KeyFromUrl(trimmed, bucketName);
    if (!key) return trimmed;
    if (!/^(image|booth-logo|organization-logo|avatar)\//.test(key)) return trimmed;

    return `/api/uploads/public/${encodeKeyForPath(key)}`;
}

module.exports = {
    extractS3KeyFromUrl,
    extractVideoAudioKey,
    hydrateStreamMediaUrlsInHtml,
    toStablePublicImageUrl,
    encodeKeyForPath
};
