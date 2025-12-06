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

        // Get profile data - check both metadata.profile (new format) and metadata.resume (migrated format)
        let profile = targetUser.metadata?.profile || null;

        // If profile doesn't exist but resume data exists (migrated user), transform it
        if (!profile && targetUser.metadata?.resume) {
            const resumeData = targetUser.metadata.resume;
            profile = {
                headline: resumeData.headline || null,
                keywords: Array.isArray(resumeData.keywords) ? resumeData.keywords.join(', ') : (resumeData.keywords || null),
                primaryExperience: resumeData.primaryJobExperiences || [],
                workLevel: resumeData.workExperienceLevel || null,
                educationLevel: resumeData.highestEducationLevel || null,
                languages: resumeData.languages || [],
                employmentTypes: resumeData.employmentTypes || [],
                clearance: resumeData.securityClearance || null,
                veteranStatus: resumeData.veteranStatus || resumeData.militaryStatus || null
            };

            // Remove null/empty values
            Object.keys(profile).forEach(key => {
                if (profile[key] === null || profile[key] === undefined ||
                    (Array.isArray(profile[key]) && profile[key].length === 0)) {
                    delete profile[key];
                }
            });

            // If profile has data, save it to metadata.profile for future use
            if (Object.keys(profile).length > 0) {
                targetUser.metadata = {
                    ...(targetUser.metadata || {}),
                    profile: profile
                };
                await targetUser.save();
            }
        }

        res.json({
            user: targetUser.getPublicProfile(),
            profile: profile
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
    body('avatarUrl').optional().custom((value) => value === null || value === '' || typeof value === 'string').withMessage('avatarUrl must be null, empty string, or a string'),
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

        const { name, phoneNumber, state, city, country, avatarUrl, profile } = req.body;

        // Update basic fields if provided
        if (name !== undefined) targetUser.name = name;
        if (phoneNumber !== undefined) targetUser.phoneNumber = phoneNumber;
        if (state !== undefined) targetUser.state = state;
        if (city !== undefined) targetUser.city = city;
        if (country !== undefined) targetUser.country = country;
        // Allow removing avatar by setting to null or empty string
        if (avatarUrl !== undefined) {
            targetUser.avatarUrl = (avatarUrl === null || avatarUrl === '') ? null : avatarUrl;
        }

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
        } else {
            // When no role filter is provided, exclude JobSeekers by default
            // JobSeekers have their own management page
            query.role = { $ne: 'JobSeeker' };
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

        // Find users and populate booth information
        const users = await User.find(query)
            .select('-hashedPassword -refreshTokens')
            .populate('assignedBooth', 'name company')
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

        // Users can view their own profile, admins can view any profile
        // Recruiters and booth admins can view job seeker profiles
        const canViewProfile =
            id === user._id.toString() ||
            ['Admin', 'GlobalSupport'].includes(user.role) ||
            (['Recruiter', 'BoothAdmin'].includes(user.role));

        if (!canViewProfile) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this profile'
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
    body('password')
        .optional()
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),
    body('phoneNumber')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ min: 7, max: 30 })
        .withMessage('Phone number must be 7-30 characters'),
    body('city')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('City too long'),
    body('state')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('State too long'),
    body('country')
        .optional({ nullable: true, checkFalsy: true })
        .trim()
        .isLength({ max: 100 })
        .withMessage('Country too long'),
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
        .withMessage('assignedBooth must be a valid ID'),
    // JobSeeker specific fields (but NOT survey)
    body('phoneNumber')
        .optional()
        .trim()
        .isLength({ min: 7, max: 30 })
        .withMessage('Phone number must be 7-30 chars'),
    body('state')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('State too long'),
    body('city')
        .optional()
        .trim()
        .isLength({ max: 100 })
        .withMessage('City too long'),
    body('country')
        .optional()
        .trim()
        .isLength({ max: 2 })
        .withMessage('Country must be 2-letter code'),
    body('avatarUrl')
        .optional()
        .custom((value) => value === null || value === '' || typeof value === 'string')
        .withMessage('avatarUrl must be null, empty string, or a string'),
    // Accessibility fields
    body('usesScreenMagnifier').optional().isBoolean().withMessage('usesScreenMagnifier must be boolean'),
    body('usesScreenReader').optional().isBoolean().withMessage('usesScreenReader must be boolean'),
    body('needsASL').optional().isBoolean().withMessage('needsASL must be boolean'),
    body('needsCaptions').optional().isBoolean().withMessage('needsCaptions must be boolean'),
    body('needsOther').optional().isBoolean().withMessage('needsOther must be boolean'),
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
    body('profile.workAuthorization').optional().isString(),
    body('profile.veteranStatus').optional().isString()
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
        const { name, email, password, phoneNumber, city, state, country, role, isActive, languages, isAvailable, assignedBooth, avatarUrl, resumeUrl,
            usesScreenMagnifier, usesScreenReader, needsASL, needsCaptions, needsOther, profile } = req.body;
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
        if (phoneNumber !== undefined) targetUser.phoneNumber = phoneNumber;
        if (city !== undefined) targetUser.city = city;
        if (state !== undefined) targetUser.state = state;
        if (country !== undefined) targetUser.country = country;
        if (role !== undefined) targetUser.role = role;
        if (isActive !== undefined) targetUser.isActive = isActive;
        if (languages !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(targetUser.role)) {
            targetUser.languages = languages;
        }
        if (isAvailable !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(targetUser.role)) {
            targetUser.isAvailable = isAvailable;
        }

        // Update password if provided (admin can change user passwords)
        if (password !== undefined && password !== null && password.trim() !== '') {
            targetUser.hashedPassword = password; // Will be hashed by pre-save middleware
            // Clear legacy password for legacy users (so they use the new bcrypt password)
            // This ensures legacy users can login with the new password
            if (targetUser.legacyPassword) {
                targetUser.legacyPassword = null;
            }
            // Invalidate all refresh tokens when password is changed (force re-login on all devices)
            targetUser.refreshTokens = [];
        }

        // Update JobSeeker specific fields (but NOT survey - survey should never be updated by admin)
        if (phoneNumber !== undefined) targetUser.phoneNumber = phoneNumber;
        if (state !== undefined) targetUser.state = state;
        if (city !== undefined) targetUser.city = city;
        if (country !== undefined) targetUser.country = country;
        // Allow removing avatar by setting to null or empty string
        if (avatarUrl !== undefined) {
            targetUser.avatarUrl = (avatarUrl === null || avatarUrl === '') ? null : avatarUrl;
        }
        // Allow removing resume by setting to null or empty string
        if (resumeUrl !== undefined) {
            targetUser.resumeUrl = (resumeUrl === null || resumeUrl === '') ? null : resumeUrl;
        }

        // Update accessibility fields for JobSeekers
        if (usesScreenMagnifier !== undefined) targetUser.usesScreenMagnifier = usesScreenMagnifier;
        if (usesScreenReader !== undefined) targetUser.usesScreenReader = usesScreenReader;
        if (needsASL !== undefined) targetUser.needsASL = needsASL;
        if (needsCaptions !== undefined) targetUser.needsCaptions = needsCaptions;
        if (needsOther !== undefined) targetUser.needsOther = needsOther;

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
                    ...(profile.workAuthorization !== undefined ? { workAuthorization: profile.workAuthorization } : {}),
                    ...(profile.veteranStatus !== undefined ? { veteranStatus: profile.veteranStatus } : {}),
                    updatedAt: new Date()
                }
            };
        }

        // Handle assignedBooth updates and validation for recruiter/booth admin/support/interpreter
        const effectiveRole = role !== undefined ? role : targetUser.role;
        if (['Recruiter', 'BoothAdmin', 'Support'].includes(effectiveRole)) {
            // Booth is REQUIRED for Recruiter, BoothAdmin, and Support
            if (assignedBooth === undefined && !targetUser.assignedBooth) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: 'Assigned booth is required for recruiters, booth admins, and booth support'
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
        } else if (effectiveRole === 'Interpreter') {
            // Booth is OPTIONAL for Interpreter (booth-specific or global)
            if (assignedBooth !== undefined) {
                if (assignedBooth === null || assignedBooth === '') {
                    // Explicitly clear booth (make global interpreter)
                    targetUser.assignedBooth = null;
                } else {
                    // Validate and assign booth (booth-specific interpreter)
                    const boothExists = await Booth.findById(assignedBooth).select('_id');
                    if (!boothExists) {
                        return res.status(400).json({
                            error: 'Invalid booth',
                            message: 'Assigned booth does not exist'
                        });
                    }
                    targetUser.assignedBooth = assignedBooth;
                }
            }
        } else if (assignedBooth !== undefined) {
            // Other roles should not have assignedBooth
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

/**
 * POST /api/users/:id/verify-email
 * Admin manually verify user's email (Admin/GlobalSupport only)
 */
router.post('/:id/verify-email', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user: currentUser } = req;

        // Find the target user
        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        // Check if email is already verified
        if (targetUser.emailVerified) {
            return res.status(400).json({
                error: 'Email already verified',
                message: 'This user\'s email is already verified'
            });
        }

        // Manually verify the email
        targetUser.emailVerified = true;
        targetUser.emailVerificationToken = null;
        targetUser.emailVerificationExpires = null;
        await targetUser.save();

        logger.info(`Admin ${currentUser.email} manually verified email for user ${targetUser.email}`);

        res.json({
            message: 'Email verified successfully',
            user: targetUser.getPublicProfile()
        });
    } catch (error) {
        logger.error('Admin verify email error:', error);
        res.status(500).json({
            error: 'Failed to verify email',
            message: 'An error occurred while verifying the email'
        });
    }
});

module.exports = router;
