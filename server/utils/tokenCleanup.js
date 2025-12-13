/**
 * Token Cleanup Utility
 * 
 * Cleans up expired refresh tokens from User documents.
 * This replaces the problematic MongoDB TTL index that was deleting entire users.
 */

const User = require('../models/User');
const logger = require('./logger');

// Token expiration time: 7 days in milliseconds
const TOKEN_EXPIRATION_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Clean up expired refresh tokens from all users
 * This removes only the expired tokens, not the users themselves.
 */
const cleanupExpiredTokens = async () => {
    try {
        const expirationDate = new Date(Date.now() - TOKEN_EXPIRATION_MS);
        
        // Remove expired tokens from all users
        const result = await User.updateMany(
            { 'refreshTokens.createdAt': { $lt: expirationDate } },
            {
                $pull: {
                    refreshTokens: {
                        createdAt: { $lt: expirationDate }
                    }
                }
            }
        );
        
        if (result.modifiedCount > 0) {
            logger.info(`Token cleanup: Removed expired refresh tokens from ${result.modifiedCount} users`);
        }
        
        return result.modifiedCount;
    } catch (error) {
        logger.error('Token cleanup error:', error);
        return 0;
    }
};

/**
 * Start the periodic token cleanup job
 * Runs every 24 hours to clean up expired tokens
 */
const startTokenCleanup = () => {
    // Run immediately on startup
    cleanupExpiredTokens();
    
    // Run every 24 hours
    const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;
    setInterval(cleanupExpiredTokens, CLEANUP_INTERVAL_MS);
    
    logger.info('Token cleanup job started - running every 24 hours');
};

/**
 * Check if a refresh token is expired
 * @param {Object} tokenObj - The token object with createdAt field
 * @returns {boolean} - True if token is expired
 */
const isTokenExpired = (tokenObj) => {
    if (!tokenObj || !tokenObj.createdAt) {
        return true;
    }
    const tokenAge = Date.now() - new Date(tokenObj.createdAt).getTime();
    return tokenAge > TOKEN_EXPIRATION_MS;
};

module.exports = {
    cleanupExpiredTokens,
    startTokenCleanup,
    isTokenExpired,
    TOKEN_EXPIRATION_MS
};
