/**
 * Local backend origin for development.
 * Port 5050 is used instead of 5000 because macOS AirPlay Receiver occupies port 5000.
 */
const LOCAL_BACKEND_ORIGIN = 'http://localhost:5050';

/** Matches http(s)://localhost:<port> and http(s)://127.0.0.1:<port> */
const LOCAL_ORIGIN_PATTERN = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i;

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
    return LOCAL_BACKEND_ORIGIN;
};

/**
 * Get the Socket.IO URL for the current environment
 * Uses environment variable if set (at build time), otherwise falls back to current origin (runtime)
 * ALWAYS forces http:// for local origins to prevent wss:// upgrade issues
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
        // Always use the local backend origin for local development
        const isLocalDev = window.location.hostname === 'localhost' ||
            window.location.hostname === '127.0.0.1' ||
            process.env.NODE_ENV === 'development' ||
            !process.env.NODE_ENV;

        if (isLocalDev) {
            url = LOCAL_BACKEND_ORIGIN;
            source = 'local-dev-fallback';
        } else {
            // In production, use current origin
            url = window.location.origin;
            source = 'window.location.origin';
        }
    }
    // Fallback for server-side rendering or tests
    else {
        url = LOCAL_BACKEND_ORIGIN;
        source = 'ssr-fallback';
    }

    // CRITICAL: Always normalize local origins to http:// regardless of input protocol
    // This prevents Socket.IO from trying to use wss:// when the URL came in as https://
    if (url && LOCAL_ORIGIN_PATTERN.test(url)) {
        const originalUrl = url;
        url = url.replace(/^https:\/\//i, 'http://');
        if (originalUrl !== url) {
            console.warn(`⚠️ Socket URL normalized from ${originalUrl} to ${url} (source: ${source})`);
        }
    }

    return url;
};

