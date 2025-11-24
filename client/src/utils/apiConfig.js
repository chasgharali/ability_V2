/**
 * Get the API base URL for the current environment
 * Uses environment variable if set (at build time), otherwise falls back to current origin (runtime)
 */
export const getApiUrl = () => {
    // Check if we have a build-time environment variable
    if (process.env.REACT_APP_API_URL) {
        return process.env.REACT_APP_API_URL;
    }

    // Fallback to current origin (works at runtime in production)
    // This allows the same build to work in dev and production
    // Only use this in browser environment (not SSR)
    if (typeof window !== 'undefined') {
        return window.location.origin;
    }

    // Fallback for server-side rendering or tests
    return 'http://localhost:5000';
};

/**
 * Get the Socket.IO URL for the current environment
 * Uses environment variable if set (at build time), otherwise falls back to current origin (runtime)
 * ALWAYS forces http:// for localhost:5000 to prevent wss:// upgrade issues
 */
export const getSocketUrl = () => {
    let url;
    let source = 'unknown';

    // Check if we have a build-time environment variable
    if (process.env.REACT_APP_SOCKET_URL) {
        url = process.env.REACT_APP_SOCKET_URL;
        source = 'REACT_APP_SOCKET_URL';
    }
    // Use API URL if set
    else if (process.env.REACT_APP_API_URL) {
        url = process.env.REACT_APP_API_URL;
        source = 'REACT_APP_API_URL';
    }
    // In browser environment
    else if (typeof window !== 'undefined') {
        // Always use http://localhost:5000 for local development
        const isLocalDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            process.env.NODE_ENV === 'development' ||
            !process.env.NODE_ENV;

        if (isLocalDev) {
            url = 'http://localhost:5000';
            source = 'local-dev-fallback';
        } else {
            // In production, use current origin
            url = window.location.origin;
            source = 'window.location.origin';
        }
    }
    // Fallback for server-side rendering or tests
    else {
        url = 'http://localhost:5000';
        source = 'ssr-fallback';
    }

    // CRITICAL: Always normalize localhost:5000 to http:// regardless of input protocol
    // This prevents Socket.IO from trying to use wss:// when the URL came in as https://
    if (url && (url.includes('localhost:5000') || url.includes('127.0.0.1:5000'))) {
        const originalUrl = url;
        // Replace any protocol (http:// or https://) with http://
        url = url.replace(/^https?:\/\//, 'http://');
        // Ensure it starts with http://
        if (!url.startsWith('http://')) {
            url = 'http://' + url;
        }
        // Debug log if we had to normalize
        if (originalUrl !== url) {
            console.warn(`⚠️ Socket URL normalized from ${originalUrl} to ${url} (source: ${source})`);
        }
    }

    // Final safety check - if somehow we still have https://localhost:5000, force http://
    if (url && url.includes('localhost:5000') && url.startsWith('https://')) {
        console.error('❌ CRITICAL: Detected https://localhost:5000 - forcing http://');
        url = url.replace(/^https:\/\//, 'http://');
    }

    if (process.env.NODE_ENV === 'development') {
        console.log(`🔌 Socket URL: ${url} (source: ${source}, NODE_ENV: ${process.env.NODE_ENV})`);
    }

    return url;
};

