const S3_HOST_PATTERN = /(^|\.)(s3[.-][a-z0-9-]+|s3)\.amazonaws\.com$/i;

function encodeKeyForPath(key) {
    return encodeURIComponent(key).replace(/%2F/g, '/');
}

function extractS3KeyFromUrl(value, bucketName = '') {
    if (!value || typeof value !== 'string') return null;

    const trimmed = value.trim();
    if (!trimmed) return null;

    // Already a raw key
    if (/^(image|booth-logo|organization-logo)\//.test(trimmed)) {
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

function toStablePublicImageUrl(value, bucketName = process.env.AWS_S3_BUCKET) {
    if (!value || typeof value !== 'string') return value;

    const trimmed = value.trim();
    if (!trimmed) return trimmed;

    if (trimmed.startsWith('/api/uploads/public/')) return trimmed;
    if (trimmed.startsWith('/api/uploads/rte-content/')) return trimmed;

    const key = extractS3KeyFromUrl(trimmed, bucketName);
    if (!key) return trimmed;
    if (!/^(image|booth-logo|organization-logo)\//.test(key)) return trimmed;

    return `/api/uploads/public/${encodeKeyForPath(key)}`;
}

module.exports = {
    extractS3KeyFromUrl,
    toStablePublicImageUrl,
    encodeKeyForPath
};
