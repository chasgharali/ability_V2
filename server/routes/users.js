const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

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
        .withMessage('Availability must be boolean')
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
        const { name, email, role, isActive, languages, isAvailable } = req.body;
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
 * Deactivate user account (Admin/GlobalSupport only)
 */
router.delete('/:id', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
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

        // Prevent self-deactivation
        if (id === user._id.toString()) {
            return res.status(400).json({
                error: 'Cannot deactivate self',
                message: 'You cannot deactivate your own account'
            });
        }

        // Deactivate user instead of deleting
        targetUser.isActive = false;
        targetUser.refreshTokens = []; // Invalidate all refresh tokens
        await targetUser.save();

        logger.info(`User deactivated: ${targetUser.email} by ${user.email}`);

        res.json({
            message: 'User account deactivated successfully'
        });
    } catch (error) {
        logger.error('Deactivate user error:', error);
        res.status(500).json({
            error: 'Failed to deactivate user',
            message: 'An error occurred while deactivating the user account'
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
