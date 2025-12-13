const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

/**
 * Middleware to authenticate JWT tokens
 * Verifies the token and attaches user information to req.user
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid access token'
            });
        }

        // Verify the token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // Find the user
        const user = await User.findById(decoded.userId).select('-hashedPassword -refreshTokens');

        if (!user) {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'User not found'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated'
            });
        }

        // Attach user to request
        req.user = user;
        next();
    } catch (error) {
        logger.error('Authentication error:', error);

        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                error: 'Invalid token',
                message: 'The provided token is invalid'
            });
        }

        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Token expired',
                message: 'Please refresh your token'
            });
        }

        return res.status(500).json({
            error: 'Authentication failed',
            message: 'An error occurred during authentication'
        });
    }
};

/**
 * Middleware to check if user has required role(s)
 * @param {string|array} roles - Required role(s)
 */
const requireRole = (roles) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please authenticate first'
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        if (!allowedRoles.includes(userRole)) {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: `This action requires one of the following roles: ${allowedRoles.join(', ')}`
            });
        }

        next();
    };
};

/**
 * Middleware to check if user can access a specific resource
 * @param {string} resourceType - Type of resource (event, booth, etc.)
 * @param {string} paramName - Name of the parameter containing the resource ID
 */
const requireResourceAccess = (resourceType, paramName) => {
    return async (req, res, next) => {
        try {
            if (!req.user) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Please authenticate first'
                });
            }

            const resourceId = req.params[paramName];
            if (!resourceId) {
                return res.status(400).json({
                    error: 'Resource ID required',
                    message: `Please provide a valid ${resourceType} ID`
                });
            }

            // Import models dynamically to avoid circular dependencies
            let Resource;
            switch (resourceType) {
                case 'event':
                    Resource = require('../models/Event');
                    break;
                case 'booth':
                    Resource = require('../models/Booth');
                    break;
                case 'queue':
                    Resource = require('../models/Queue');
                    break;
                default:
                    return res.status(500).json({
                        error: 'Invalid resource type',
                        message: 'Internal server error'
                    });
            }

            const resource = await Resource.findById(resourceId);
            if (!resource) {
                return res.status(404).json({
                    error: 'Resource not found',
                    message: `${resourceType} not found`
                });
            }

            // Check access based on resource type
            let hasAccess = false;

            switch (resourceType) {
                case 'event':
                    hasAccess = resource.canUserAccess(req.user);
                    break;
                case 'booth':
                    hasAccess = resource.canUserManage(req.user);
                    break;
                case 'queue':
                    // For queues, check booth access
                    const Booth = require('../models/Booth');
                    const booth = await Booth.findById(resource.boothId);
                    hasAccess = booth ? booth.canUserManage(req.user) : false;
                    break;
            }

            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: `You don't have permission to access this ${resourceType}`
                });
            }

            // Attach resource to request for use in route handlers
            req[resourceType] = resource;
            next();
        } catch (error) {
            logger.error(`Resource access check error for ${resourceType}:`, error);
            return res.status(500).json({
                error: 'Access check failed',
                message: 'An error occurred while checking access permissions'
            });
        }
    };
};

/**
 * Middleware to check if user is the owner of a resource
 * @param {string} paramName - Name of the parameter containing the user ID
 */
const requireOwnership = (paramName = 'userId') => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please authenticate first'
            });
        }

        const resourceUserId = req.params[paramName];

        // Admin and GlobalSupport can access any user's resources
        if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            return next();
        }

        // Check if user is accessing their own resource
        if (req.user._id.toString() !== resourceUserId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only access your own resources'
            });
        }

        next();
    };
};

/**
 * Optional authentication middleware
 * Similar to authenticateToken but doesn't fail if no token is provided
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('-hashedPassword -refreshTokens');

            if (user && user.isActive) {
                req.user = user;
            }
        }

        next();
    } catch (error) {
        // Ignore authentication errors for optional auth
        next();
    }
};

/**
 * Middleware to validate refresh token
 */
const validateRefreshToken = async (req, res, next) => {
    try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
            return res.status(401).json({
                error: 'Refresh token required',
                message: 'Please provide a refresh token'
            });
        }

        // Verify the refresh token
        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        // Find the user and check if refresh token exists
        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'User not found'
            });
        }

        // Find the token and check if it's expired (7 days)
        const { isTokenExpired } = require('../utils/tokenCleanup');
        const tokenObj = user.refreshTokens.find(t => t.token === refreshToken);

        if (!tokenObj) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'Refresh token not found'
            });
        }

        // Check if token is expired (older than 7 days)
        if (isTokenExpired(tokenObj)) {
            // Remove the expired token
            user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
            await user.save();
            
            return res.status(401).json({
                error: 'Refresh token expired',
                message: 'Your refresh token has expired. Please log in again.'
            });
        }

        if (!user.isActive) {
            return res.status(401).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated'
            });
        }

        req.user = user;
        req.refreshToken = refreshToken;
        next();
    } catch (error) {
        logger.error('Refresh token validation error:', error);

        if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'The provided refresh token is invalid or expired'
            });
        }

        return res.status(500).json({
            error: 'Token validation failed',
            message: 'An error occurred during token validation'
        });
    }
};

module.exports = {
    authenticateToken,
    requireRole,
    requireResourceAccess,
    requireOwnership,
    optionalAuth,
    validateRefreshToken
};
