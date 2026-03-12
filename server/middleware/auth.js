const jwt = require('jsonwebtoken');
const User = require('../models/User');
const logger = require('../utils/logger');

// Roles that have global (cross-org) access
const GLOBAL_ROLES = ['SuperAdmin'];

// Roles that are scoped to an organization
const ORG_SCOPED_ROLES = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport'];

/**
 * Returns true if the user's role has global (cross-org) platform access.
 */
const isGlobalRole = (role) => GLOBAL_ROLES.includes(role);

/**
 * Middleware to authenticate JWT tokens.
 * Verifies the token and attaches user information to req.user.
 * Also sets req.orgId from the user's organizationId (if any).
 */
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                error: 'Access token required',
                message: 'Please provide a valid access token'
            });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.userId)
            .select('-hashedPassword -refreshTokens')
            .populate('organizationId', 'name slug logoUrl isActive limits');

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

        req.user = user;
        // Convenience accessor — null for SuperAdmin / JobSeeker
        req.orgId = user.organizationId?._id || user.organizationId || null;
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
 * Middleware to check if user has required role(s).
 * SuperAdmin automatically passes any role check that includes at least one of the
 * org-scoped admin roles (Admin, AdminEvent) — SuperAdmin is a superset of all.
 * @param {string|string[]} roles - Required role(s)
 * @param {boolean} superAdminBypass - If true, SuperAdmin always passes (default: true)
 */
const requireRole = (roles, superAdminBypass = true) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please authenticate first'
            });
        }

        const userRole = req.user.role;
        const allowedRoles = Array.isArray(roles) ? roles : [roles];

        // SuperAdmin bypasses all role checks by default
        if (superAdminBypass && userRole === 'SuperAdmin') {
            return next();
        }

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
 * Middleware that restricts access to SuperAdmin only.
 */
const requireSuperAdmin = requireRole(['SuperAdmin'], false);

/**
 * Middleware to verify that the requesting user belongs to the same organization
 * as the resource they are trying to access.
 *
 * Usage: attach after authenticateToken.
 * The organization ID to check against is resolved from:
 *   1. req.params[orgParam] if provided
 *   2. Otherwise req.orgId (the user's own org)
 *
 * SuperAdmin always passes this check.
 *
 * @param {string} [orgParam] - Optional param name containing target orgId (e.g. 'orgId')
 */
const requireOrgAccess = (orgParam = null) => {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                error: 'Authentication required',
                message: 'Please authenticate first'
            });
        }

        // SuperAdmin has global access — no org check
        if (req.user.role === 'SuperAdmin') {
            return next();
        }

        const targetOrgId = orgParam
            ? req.params[orgParam]
            : (req.orgId ? req.orgId.toString() : null);

        const userOrgId = req.orgId ? req.orgId.toString() : null;

        if (!userOrgId) {
            return res.status(403).json({
                error: 'No organization assigned',
                message: 'Your account is not associated with any organization'
            });
        }

        if (!targetOrgId) {
            // No specific org requested — user is accessing their own org scope
            return next();
        }

        if (userOrgId !== targetOrgId) {
            return res.status(403).json({
                error: 'Organization access denied',
                message: 'You do not have permission to access this organization\'s resources'
            });
        }

        next();
    };
};

/**
 * Middleware to check if user can access a specific resource.
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

            let hasAccess = false;

            switch (resourceType) {
                case 'event':
                    hasAccess = resource.canUserAccess(req.user);
                    break;
                case 'booth':
                    hasAccess = resource.canUserManage(req.user);
                    break;
                case 'queue': {
                    const Booth = require('../models/Booth');
                    const booth = await Booth.findById(resource.boothId);
                    hasAccess = booth ? booth.canUserManage(req.user) : false;
                    break;
                }
            }

            if (!hasAccess) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: `You don't have permission to access this ${resourceType}`
                });
            }

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
 * Middleware to check if user is the owner of a resource.
 * SuperAdmin and Admin have global ownership bypass.
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

        // SuperAdmin, Admin and GlobalSupport can access any user's resources
        if (['SuperAdmin', 'Admin', 'GlobalSupport'].includes(req.user.role)) {
            return next();
        }

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
 * Optional authentication middleware — does not fail if no token is provided.
 */
const optionalAuth = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (token) {
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId)
                .select('-hashedPassword -refreshTokens')
                .populate('organizationId', 'name slug logoUrl isActive');

            if (user && user.isActive) {
                req.user = user;
                req.orgId = user.organizationId?._id || user.organizationId || null;
            }
        }

        next();
    } catch (error) {
        next();
    }
};

/**
 * Middleware to validate refresh token.
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

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);

        const user = await User.findById(decoded.userId);

        if (!user) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'User not found'
            });
        }

        const { isTokenExpired } = require('../utils/tokenCleanup');
        const tokenObj = user.refreshTokens.find(t => t.token === refreshToken);

        if (!tokenObj) {
            return res.status(401).json({
                error: 'Invalid refresh token',
                message: 'Refresh token not found'
            });
        }

        if (isTokenExpired(tokenObj)) {
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
    requireSuperAdmin,
    requireOrgAccess,
    requireResourceAccess,
    requireOwnership,
    optionalAuth,
    validateRefreshToken,
    isGlobalRole,
    GLOBAL_ROLES,
    ORG_SCOPED_ROLES
};
