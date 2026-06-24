/**
 * Video Content Processor
 * Handles compression and decompression of video content in rich text
 * to avoid exceeding character limits in database fields
 */

/**
 * Extract video information from HTML content and replace with compact references
 * @param {string} htmlContent - The HTML content containing video elements
 * @returns {object} - { compressedHtml, videos }
 */
export function compressVideoContent(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return { compressedHtml: htmlContent, videos: [] };
    }

    const videos = [];
    let compressedHtml = htmlContent;
    let videoIndex = 0;

    // Match video wrapper spans with data-videosrc attribute
    const videoWrapperRegex = /<span[^>]*class="e-video-wrap"[^>]*data-videosrc="([^"]*)"[^>]*>.*?<\/span>/gs;
    
    compressedHtml = compressedHtml.replace(videoWrapperRegex, (match, videoSrc) => {
        // Extract video information
        const videoId = `video_${videoIndex++}`;
        
        // Parse the video source URL to extract key and token
        const urlMatch = videoSrc.match(/key=([^&]+).*?token=([^&]+)/);
        if (urlMatch) {
            const [, key, token] = urlMatch;
            
            videos.push({
                id: videoId,
                key: decodeURIComponent(key),
                token: decodeURIComponent(token),
                src: videoSrc
            });
            
            // Replace with compact reference
            return `[VIDEO:${videoId}]`;
        }
        
        // Fallback: store the full src if we can't parse it
        videos.push({
            id: videoId,
            src: videoSrc
        });
        
        return `[VIDEO:${videoId}]`;
    });

    return { compressedHtml, videos };
}

/**
 * Restore video content from compressed HTML and video references
 * @param {string} compressedHtml - The compressed HTML with video references
 * @param {Array} videos - Array of video objects
 * @returns {string} - The full HTML with video elements restored
 */
export function decompressVideoContent(compressedHtml, videos = []) {
    if (!compressedHtml || typeof compressedHtml !== 'string' || !videos.length) {
        return compressedHtml;
    }

    let restoredHtml = compressedHtml;

    // Replace video references with full HTML
    videos.forEach(video => {
        const videoRef = `[VIDEO:${video.id}]`;
        
        if (restoredHtml.includes(videoRef)) {
            // Reconstruct the video HTML
            const videoHtml = createVideoHtml(video);
            restoredHtml = restoredHtml.replace(videoRef, videoHtml);
        }
    });

    return restoredHtml;
}

/**
 * Create video HTML element from video data
 * @param {object} video - Video object with src, key, token
 * @returns {string} - HTML string for the video element
 */
function createVideoHtml(video) {
    const { src, key } = video;
    const mediaKey = key || extractVideoAudioKey(src);
    const videoSrc = mediaKey
        ? `/api/uploads/public/${encodeKeyForPath(mediaKey)}`
        : (src || '');
    
    // Determine video type from the key or src
    let videoType = 'video/mp4'; // default
    if (key) {
        if (key.includes('.mov')) videoType = 'video/quicktime';
        else if (key.includes('.webm')) videoType = 'video/webm';
        else if (key.includes('.ogg')) videoType = 'video/ogg';
    }
    
    return `<span class="e-video-wrap" contenteditable="false" data-videosrc="${videoSrc}">
        <video class="e-rte-video e-video-inline" controls="" style="max-width: 100%;" data-videosrc="${videoSrc}">
            <source src="${videoSrc}" type="${videoType}" />
        </video>
    </span>`;
}

/**
 * Inject the current viewer's auth token into stream URLs embedded in HTML.
 * RTE booth/event videos use the public media proxy (no auth) because query-string
 * JWTs break inside HTML attributes (& is parsed as an entity).
 * @param {string} html - HTML content with optional /api/uploads/stream URLs
 * @returns {string} - HTML with playback-safe media URLs
 */
const encodeKeyForPath = (key) => encodeURIComponent(key).replace(/%2F/g, '/');

function extractVideoAudioKey(rawKey) {
    if (!rawKey || typeof rawKey !== 'string') return null;

    let decoded = rawKey.trim();
    try {
        decoded = decodeURIComponent(decoded);
    } catch (_e) {
        // keep raw value
    }

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

export function hydrateStreamMediaUrls(html) {
    if (!html || typeof html !== 'string') {
        return html;
    }

    return html.replace(STREAM_URL_PATTERN, (_match, encodedKey) => {
        const mediaKey = extractVideoAudioKey(encodedKey);
        if (mediaKey) {
            return `/api/uploads/public/${encodeKeyForPath(mediaKey)}`;
        }
        return _match;
    });
}

/**
 * Fix media elements already mounted in the DOM (e.g. after dangerouslySetInnerHTML).
 */
export function hydrateStreamMediaElements(root = document) {
    if (!root || typeof root.querySelectorAll !== 'function') {
        return;
    }

    const selector = 'video, audio, source, [data-videosrc], [data-audiosrc]';
    root.querySelectorAll(selector).forEach((el) => {
        ['src', 'data-videosrc', 'data-audiosrc'].forEach((attr) => {
            const value = el.getAttribute(attr);
            if (!value || !value.includes('/api/uploads/stream')) {
                return;
            }
            const fixed = hydrateStreamMediaUrls(value);
            if (fixed !== value) {
                el.setAttribute(attr, fixed);
            }
        });
    });
}

/**
 * Check if content contains video elements
 * @param {string} htmlContent - The HTML content to check
 * @returns {boolean} - True if content contains videos
 */
export function hasVideoContent(htmlContent) {
    if (!htmlContent || typeof htmlContent !== 'string') {
        return false;
    }
    
    return htmlContent.includes('e-video-wrap') || htmlContent.includes('[VIDEO:');
}

/**
 * Get character count of content after video compression
 * @param {string} htmlContent - The HTML content
 * @returns {number} - Character count after compression
 */
export function getCompressedCharacterCount(htmlContent) {
    const { compressedHtml } = compressVideoContent(htmlContent);
    return compressedHtml ? compressedHtml.length : 0;
}

/**
 * Validate that compressed content is within character limit
 * @param {string} htmlContent - The HTML content
 * @param {number} limit - Character limit (default 1000)
 * @returns {object} - { isValid, characterCount, compressedCount }
 */
export function validateContentLength(htmlContent, limit = 1000) {
    const originalCount = htmlContent ? htmlContent.length : 0;
    const compressedCount = getCompressedCharacterCount(htmlContent);
    
    return {
        isValid: compressedCount <= limit,
        characterCount: originalCount,
        compressedCount,
        limit
    };
}