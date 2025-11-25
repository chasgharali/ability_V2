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
 */
export const getSocketUrl = () => {
    // Check if we have a build-time environment variable
    if (process.env.REACT_APP_SOCKET_URL) {
        return process.env.REACT_APP_SOCKET_URL;
    }

    // Use API URL if set, otherwise fallback to current origin
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

