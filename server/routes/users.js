const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const Booth = require('../models/Booth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * DELETE /api/users/me
 * Deactivate current authenticated user's account
 */
router.delete('/me', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const User = require('../models/User');
        const targetUser = await User.findById(user._id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The current user does not exist'
            });
        }

        targetUser.isActive = false;
        targetUser.refreshTokens = [];
        await targetUser.save();

        logger.info(`User self-deactivated: ${targetUser.email}`);
        res.json({ message: 'Your account has been deactivated' });
    } catch (error) {
        logger.error('Self delete account error:', error);
        res.status(500).json({
            error: 'Failed to delete account',
            message: 'An error occurred while deleting your account'
        });
    }
});
/**
 * GET /api/users/me
 * Get current authenticated user's profile
 */
router.get('/me', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const targetUser = await User.findById(user._id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The current user does not exist'
            });
        }

        res.json({
            user: targetUser.getPublicProfile(),
            profile: targetUser.metadata?.profile || null
        });
    } catch (error) {
        logger.error('Get current user error:', error);
        res.status(500).json({
            error: 'Failed to retrieve current user',
            message: 'An error occurred while retrieving the current user'
        });
    }
});

/**
 * PUT /api/users/me
 * Update current authenticated user's basic profile and job seeker profile details
 */
router.put('/me', authenticateToken, [
    body('name').optional().trim().isLength({ min: 2, max: 100 }).withMessage('Name must be between 2 and 100 characters'),
    body('phoneNumber').optional().trim().isLength({ min: 7, max: 30 }).withMessage('Phone number must be 7-30 chars'),
    body('state').optional().trim().isLength({ max: 100 }).withMessage('State too long'),
    body('city').optional().trim().isLength({ max: 100 }).withMessage('City too long'),
    body('country').optional().trim().isLength({ max: 2 }).withMessage('Country must be 2-letter code'),
    // Job seeker profile fields
    body('profile').optional().isObject().withMessage('Profile must be an object'),
    body('profile.headline').optional().isString().isLength({ max: 200 }).withMessage('Headline max 200 chars'),
    body('profile.keywords').optional().isString().isLength({ max: 500 }).withMessage('Keywords max 500 chars'),
    body('profile.primaryExperience').optional().isArray({ max: 2 }).withMessage('Primary experience must be array (max 2)'),
    body('profile.workLevel').optional().isString(),
    body('profile.educationLevel').optional().isString(),
    body('profile.languages').optional().isArray().withMessage('Languages must be array'),
    body('profile.employmentTypes').optional().isArray().withMessage('Employment types must be array'),
    body('profile.clearance').optional().isString(),
    body('profile.veteranStatus').optional().isString()
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { user } = req;
        const targetUser = await User.findById(user._id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The current user does not exist'
            });
        }

        const { name, phoneNumber, state, city, country, profile } = req.body;

        // Update basic fields if provided
        if (name !== undefined) targetUser.name = name;
        if (phoneNumber !== undefined) targetUser.phoneNumber = phoneNumber;
        if (state !== undefined) targetUser.state = state;
        if (city !== undefined) targetUser.city = city;
        if (country !== undefined) targetUser.country = country;

        // Merge job seeker profile into metadata.profile
        if (profile && typeof profile === 'object') {
            const prev = (targetUser.metadata && targetUser.metadata.profile) || {};
            targetUser.metadata = {
                ...(targetUser.metadata || {}),
                profile: {
                    ...prev,
                    ...(profile.headline !== undefined ? { headline: profile.headline } : {}),
                    ...(profile.keywords !== undefined ? { keywords: profile.keywords } : {}),
                    ...(profile.primaryExperience !== undefined ? { primaryExperience: profile.primaryExperience } : {}),
                    ...(profile.workLevel !== undefined ? { workLevel: profile.workLevel } : {}),
                    ...(profile.educationLevel !== undefined ? { educationLevel: profile.educationLevel } : {}),
                    ...(profile.languages !== undefined ? { languages: profile.languages } : {}),
                    ...(profile.employmentTypes !== undefined ? { employmentTypes: profile.employmentTypes } : {}),
                    ...(profile.clearance !== undefined ? { clearance: profile.clearance } : {}),
                    ...(profile.veteranStatus !== undefined ? { veteranStatus: profile.veteranStatus } : {}),
                    updatedAt: new Date()
                }
            };
        }

        await targetUser.save();

        logger.info(`Self profile updated: ${targetUser.email}`);
        res.json({
            message: 'Profile updated successfully',
            user: targetUser.getPublicProfile(),
            profile: targetUser.metadata?.profile || null
        });
    } catch (error) {
        logger.error('Update current user error:', error);
        res.status(500).json({
            error: 'Failed to update profile',
            message: 'An error occurred while updating the profile'
        });
    }
});
/**
 * GET /api/users
 * Get list of users (Admin/GlobalSupport only)
 */
router.get('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { role, isActive, page = 1, limit = 50, search } = req.query;

        // Build query
        let query = {};

        if (role) {
            query.role = role;
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { email: { $regex: search, $options: 'i' } }
            ];
        }

        // Find users
        const users = await User.find(query)
            .select('-hashedPassword -refreshTokens')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const totalCount = await User.countDocuments(query);

        res.json({
            users: users.map(user => user.getPublicProfile()),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get users error:', error);
        res.status(500).json({
            error: 'Failed to retrieve users',
            message: 'An error occurred while retrieving users'
        });
    }
});

/**
 * GET /api/users/interpreters
 * Get available interpreters
 */
router.get('/interpreters', authenticateToken, async (req, res) => {
    try {
        const { language, available } = req.query;

        // Build query
        let query = {
            role: { $in: ['Interpreter', 'GlobalInterpreter'] },
            isActive: true
        };

        if (available === 'true') {
            query.isAvailable = true;
        }

        if (language) {
            query.languages = { $in: [new RegExp(language, 'i')] };
        }

        const interpreters = await User.find(query)
            .select('name email role languages isAvailable avatarUrl')
            .sort({ name: 1 });

        res.json({
            interpreters: interpreters.map(interpreter => ({
                _id: interpreter._id,
                name: interpreter.name,
                email: interpreter.email,
                role: interpreter.role,
                languages: interpreter.languages,
                isAvailable: interpreter.isAvailable,
                avatarUrl: interpreter.avatarUrl
            }))
        });
    } catch (error) {
        logger.error('Get interpreters error:', error);
        res.status(500).json({
            error: 'Failed to retrieve interpreters',
            message: 'An error occurred while retrieving interpreters'
        });
    }
});

/**
 * GET /api/users/:id
 * Get user details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        // Users can only view their own profile unless they're admin
        if (id !== user._id.toString() && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only view your own profile'
            });
        }

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        res.json({
            user: targetUser.getPublicProfile()
        });
    } catch (error) {
        logger.error('Get user error:', error);
        res.status(500).json({
            error: 'Failed to retrieve user',
            message: 'An error occurred while retrieving the user'
        });
    }
});

/**
 * PUT /api/users/:id
 * Update user details (Admin/GlobalSupport only)
 */
router.put('/:id', authenticateToken, requireRole(['Admin', 'GlobalSupport']), [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .optional()
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('role')
        .optional()
        .isIn(['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
        .withMessage('Invalid role specified'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('Active status must be boolean'),
    body('languages')
        .optional()
        .isArray()
        .withMessage('Languages must be an array'),
    body('isAvailable')
        .optional()
        .isBoolean()
        .withMessage('Availability must be boolean'),
    body('assignedBooth')
        .optional()
        .isMongoId()
        .withMessage('assignedBooth must be a valid ID')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const { name, email, role, isActive, languages, isAvailable, assignedBooth } = req.body;
        const { user } = req;

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        // Update allowed fields
        if (name !== undefined) targetUser.name = name;
        if (email !== undefined) targetUser.email = email;
        if (role !== undefined) targetUser.role = role;
        if (isActive !== undefined) targetUser.isActive = isActive;
        if (languages !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(targetUser.role)) {
            targetUser.languages = languages;
        }
        if (isAvailable !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(targetUser.role)) {
            targetUser.isAvailable = isAvailable;
        }

        // Handle assignedBooth updates and validation for recruiter/booth admin
        const effectiveRole = role !== undefined ? role : targetUser.role;
        if (['Recruiter', 'BoothAdmin'].includes(effectiveRole)) {
            if (assignedBooth === undefined && !targetUser.assignedBooth) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: 'Assigned booth is required for recruiters and booth admins'
                });
            }
            if (assignedBooth !== undefined) {
                const boothExists = await Booth.findById(assignedBooth).select('_id');
                if (!boothExists) {
                    return res.status(400).json({
                        error: 'Invalid booth',
                        message: 'Assigned booth does not exist'
                    });
                }
                targetUser.assignedBooth = assignedBooth;
            }
        } else if (assignedBooth !== undefined) {
            // Non-recruiter roles should not carry assignedBooth
            targetUser.assignedBooth = null;
        }

        await targetUser.save();

        logger.info(`User updated: ${targetUser.email} by ${user.email}`);

        res.json({
            message: 'User updated successfully',
            user: targetUser.getPublicProfile()
        });
    } catch (error) {
        logger.error('Update user error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Email already exists',
                message: 'An account with this email address already exists'
            });
        }

        res.status(500).json({
            error: 'Failed to update user',
            message: 'An error occurred while updating the user'
        });
    }
});

/**
 * DELETE /api/users/:id
 * Deactivate or permanently delete user account (Admin/GlobalSupport only)
 */
router.delete('/:id', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { id } = req.params;
        const { permanent } = req.query;
        const { user } = req;

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        // Prevent self-deletion/deactivation
        if (id === user._id.toString()) {
            return res.status(400).json({
                error: 'Cannot delete/deactivate self',
                message: 'You cannot delete or deactivate your own account'
            });
        }

        if (permanent === 'true') {
            // Permanent deletion - only allow for inactive users
            if (targetUser.isActive) {
                return res.status(400).json({
                    error: 'Cannot permanently delete active user',
                    message: 'User must be deactivated before permanent deletion'
                });
            }

            // Permanently delete the user
            await User.findByIdAndDelete(id);
            
            logger.info(`User permanently deleted: ${targetUser.email} by ${user.email}`);

            res.json({
                message: 'User account permanently deleted successfully'
            });
        } else {
            // Deactivate user instead of deleting
            targetUser.isActive = false;
            targetUser.refreshTokens = []; // Invalidate all refresh tokens
            await targetUser.save();

            logger.info(`User deactivated: ${targetUser.email} by ${user.email}`);

            res.json({
                message: 'User account deactivated successfully'
            });
        }
    } catch (error) {
        logger.error('Delete/deactivate user error:', error);
        res.status(500).json({
            error: 'Failed to delete/deactivate user',
            message: 'An error occurred while processing the user account'
        });
    }
});

/**
 * POST /api/users/:id/reactivate
 * Reactivate user account (Admin/GlobalSupport only)
 */
router.post('/:id/reactivate', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        // Reactivate user
        targetUser.isActive = true;
        await targetUser.save();

        logger.info(`User reactivated: ${targetUser.email} by ${user.email}`);

        res.json({
            message: 'User account reactivated successfully',
            user: targetUser.getPublicProfile()
        });
    } catch (error) {
        logger.error('Reactivate user error:', error);
        res.status(500).json({
            error: 'Failed to reactivate user',
            message: 'An error occurred while reactivating the user account'
        });
    }
});

/**
 * GET /api/users/stats/overview
 * Get user statistics overview (Admin/GlobalSupport only)
 */
router.get('/stats/overview', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get user statistics
        const userStats = await User.aggregate([
            { $match: dateFilter },
            {
                $group: {
                    _id: '$role',
                    count: { $sum: 1 },
                    activeCount: { $sum: { $cond: ['$isActive', 1, 0] } }
                }
            }
        ]);

        // Get total counts
        const totalUsers = await User.countDocuments(dateFilter);
        const activeUsers = await User.countDocuments({ ...dateFilter, isActive: true });

        // Format statistics
        const roleStats = userStats.reduce((acc, stat) => {
            acc[stat._id] = {
                total: stat.count,
                active: stat.activeCount
            };
            return acc;
        }, {});

        res.json({
            overview: {
                totalUsers,
                activeUsers,
                inactiveUsers: totalUsers - activeUsers
            },
            byRole: roleStats
        });
    } catch (error) {
        logger.error('Get user stats error:', error);
        res.status(500).json({
            error: 'Failed to retrieve user statistics',
            message: 'An error occurred while retrieving user statistics'
        });
    }
});

module.exports = router;
