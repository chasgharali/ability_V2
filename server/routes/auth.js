const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const Booth = require('../models/Booth');
const { authenticateToken, validateRefreshToken } = require('../middleware/auth');
const logger = require('../utils/logger');
const { sendVerificationEmail, sendPasswordResetEmail } = require('../utils/mailer');

const router = express.Router();

/**
 * Generate JWT tokens for a user
 * @param {Object} user - User object
 * @returns {Object} - Access and refresh tokens
 */
const generateTokens = (user) => {
    const payload = {
        userId: user._id,
        email: user.email,
        role: user.role
    };

    // Generate lifetime tokens (no expiry)
    // Tokens will never expire unless explicitly set via environment variables
    const accessTokenOptions = {};
    const refreshTokenOptions = {};
    
    // Only set expiry if explicitly configured via environment variables
    if (process.env.JWT_EXPIRES_IN) {
        accessTokenOptions.expiresIn = process.env.JWT_EXPIRES_IN;
    }
    
    if (process.env.JWT_REFRESH_EXPIRES_IN) {
        refreshTokenOptions.expiresIn = process.env.JWT_REFRESH_EXPIRES_IN;
    }

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, accessTokenOptions);
    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, refreshTokenOptions);

    return { accessToken, refreshToken };
};

/**
 * POST /api/auth/register
 * Register a new user
 */
router.post('/register', [
    body('name')
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long'),
    body('role')
        .optional()
        .isIn(['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
        .withMessage('Invalid role specified'),
    body('phoneNumber')
        .optional({ nullable: true, checkFalsy: true })
        .customSanitizer(v => typeof v === 'string' ? v.trim() : v)
        .custom((value) => {
            if (!value) return true; // allow empty after trim
            // Accept common international patterns including E.164-like and formatted numbers
            const pattern = /^\+?[0-9\-\s()]{7,20}$/;
            return pattern.test(value);
        })
        .withMessage('Please provide a valid phone number'),
    body('languages')
        .optional()
        .isArray()
        .withMessage('Languages must be an array')
    ,
    body('assignedBooth')
        .optional()
        .isMongoId()
        .withMessage('assignedBooth must be a valid ID'),
    body('subscribeAnnouncements')
        .optional()
        .isBoolean()
        .withMessage('subscribeAnnouncements must be boolean')
        .toBoolean()
], async (req, res) => {
    try {
        const { name, email, password, role = 'JobSeeker', phoneNumber, languages, assignedBooth, subscribeAnnouncements, redirectPath } = req.body;

        // Check for validation errors, but separate email format validation
        const errors = validationResult(req);
        const emailErrors = errors.array().filter(err => err.path === 'email');
        
        // If email format is valid (no email validation errors), check if user already exists BEFORE other validations
        // This ensures "user already exists" error takes priority over password/other validation errors
        if (email && emailErrors.length === 0) {
            // The email from req.body is already normalized by express-validator's normalizeEmail()
            // User model stores emails in lowercase (due to lowercase: true), so we ensure it matches
            const normalizedEmail = typeof email === 'string' ? email.toLowerCase().trim() : email;
            const existingUser = await User.findOne({ email: normalizedEmail });
            if (existingUser) {
                return res.status(409).json({
                    error: 'User already exists',
                    message: 'An account with this email address already exists'
                });
            }
        }

        // Now check for all validation errors (including email format errors if any)
        if (!errors.isEmpty()) {
            const errorArray = errors.array();
            // Get the first error message as the main message for better UX
            const firstError = errorArray[0];
            const mainMessage = firstError?.msg || 'Please check your input data';
            
            return res.status(400).json({
                error: 'Validation failed',
                message: mainMessage,
                details: errorArray
            });
        }

        // Validate assignedBooth based on role
        if (['Recruiter', 'BoothAdmin', 'Support'].includes(role)) {
            // Booth is REQUIRED for Recruiter, BoothAdmin, and Support
            if (!assignedBooth) {
                return res.status(400).json({
                    error: 'Validation failed',
                    message: 'Assigned booth is required for recruiters, booth admins, and booth support'
                });
            }
            const boothExists = await Booth.findById(assignedBooth).select('_id');
            if (!boothExists) {
                return res.status(400).json({
                    error: 'Invalid booth',
                    message: 'Assigned booth does not exist'
                });
            }
        } else if (role === 'Interpreter' && assignedBooth) {
            // Booth is OPTIONAL for Interpreter, but validate if provided
            const boothExists = await Booth.findById(assignedBooth).select('_id');
            if (!boothExists) {
                return res.status(400).json({
                    error: 'Invalid booth',
                    message: 'Assigned booth does not exist'
                });
            }
        }

        // Create new user
        const user = new User({
            name,
            email,
            hashedPassword: password, // Will be hashed by pre-save middleware
            role,
            phoneNumber,
            languages: role === 'Interpreter' || role === 'GlobalInterpreter' ? languages : undefined,
            assignedBooth: ['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(role) ? assignedBooth : undefined,
            subscribeAnnouncements: subscribeAnnouncements !== undefined ? subscribeAnnouncements : false,
            // Store redirect path in metadata if provided (for event registration redirect after email verification)
            metadata: redirectPath ? { pendingRedirectPath: redirectPath } : {}
        });

        // Generate email verification token (24h expiry)
        const token = crypto.randomBytes(32).toString('hex');
        user.emailVerificationToken = token;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);

        await user.save();

        // If recruiter/booth admin/support, add them to the booth's administrators array
        if (['Recruiter', 'BoothAdmin', 'Support'].includes(role) && assignedBooth) {
            try {
                const booth = await Booth.findById(assignedBooth);
                if (booth && !booth.administrators.includes(user._id)) {
                    booth.administrators.push(user._id);
                    await booth.save();
                    logger.info(`Added user ${user.email} as administrator to booth ${booth.name}`);
                }
            } catch (error) {
                logger.error(`Failed to add user ${user.email} to booth administrators:`, error);
                // Don't fail the registration if booth update fails
            }
        }

        // Send verification email (always send, regardless of phone number or announcements preference)
        try {
            // Determine the correct base URLs
            let appBase = process.env.APP_BASE_URL;
            if (!appBase) {
                appBase = process.env.CORS_ORIGIN;
            }
            if (!appBase) {
                appBase = 'http://localhost:3000';
                if (process.env.NODE_ENV === 'production') {
                    logger.warn('⚠️ APP_BASE_URL not set in production! Using localhost fallback.');
                }
            }
            
            let apiBase = process.env.API_BASE_URL;
            if (!apiBase) {
                apiBase = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || `http://localhost:${process.env.PORT || 5000}`;
            }
            
            // Verification link points to API endpoint which will redirect to app
            // Include redirectPath in verification link if it exists
            let verifyLink = `${apiBase}/api/auth/verify-email?token=${encodeURIComponent(token)}`;
            if (redirectPath) {
                verifyLink += `&redirect=${encodeURIComponent(redirectPath)}`;
            }
            const ok = await sendVerificationEmail(user.email, verifyLink);
            if (!ok) {
                logger.warn(`Failed to send verification email to ${user.email} (phoneNumber: ${phoneNumber ? 'provided' : 'not provided'}, subscribeAnnouncements: ${subscribeAnnouncements})`);
            } else {
                logger.info(`Verification email sent successfully to ${user.email} (phoneNumber: ${phoneNumber ? 'provided' : 'not provided'}, subscribeAnnouncements: ${subscribeAnnouncements})`);
            }
        } catch (e) {
            logger.error(`sendVerificationEmail error for ${user.email} (phoneNumber: ${phoneNumber ? 'provided' : 'not provided'}, subscribeAnnouncements: ${subscribeAnnouncements}):`, e);
            // Don't fail registration if email fails, but log the error
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        user.refreshTokens.push({ token: refreshToken });
        await user.save();

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        logger.info(`New user registered: ${email} with role: ${role}`);

        res.status(201).json({
            message: 'User registered successfully. Check your email to verify your address.',
            user: user.getPublicProfile(),
            tokens: {
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        
        // Handle duplicate email error (MongoDB unique constraint)
        if (error.code === 11000) {
            return res.status(409).json({
                error: 'User already exists',
                message: 'An account with this email address already exists'
            });
        }
        
        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const validationMessages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                error: 'Validation failed',
                message: validationMessages[0] || 'Invalid input data',
                details: validationMessages
            });
        }
        
        // Handle other specific errors with their actual messages
        const errorMessage = error.message || 'An error occurred during registration';
        res.status(500).json({
            error: 'Registration failed',
            message: errorMessage
        });
    }
});

/**
 * POST /api/auth/login
 * Login user with email and password
 */
router.post('/login', [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address'),
    body('password')
        .notEmpty()
        .withMessage('Password is required'),
    body('loginType')
        .optional()
        .isIn(['jobseeker', 'company'])
        .withMessage('Invalid login type')
], async (req, res) => {
    try {
        // Check if MongoDB is connected
        if (mongoose.connection.readyState !== 1) {
            logger.error('MongoDB not connected. ReadyState:', mongoose.connection.readyState);
            return res.status(503).json({
                error: 'Service unavailable',
                message: 'Database connection is not available. Please try again later.'
            });
        }

        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { email, password, loginType } = req.body;

        // Find user by email (include legacyPassword for migrated users)
        // Populate assignedBooth to avoid issues in getPublicProfile()
        const user = await User.findOne({ email }).select('+legacyPassword').populate('assignedBooth', 'name company');
        if (!user) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        // Check if account is active
        if (!user.isActive) {
            return res.status(401).json({
                error: 'Account deactivated',
                message: 'Your account has been deactivated. Please contact support.'
            });
        }

        // Verify password
        const isPasswordValid = await user.comparePassword(password);
        if (!isPasswordValid) {
            return res.status(401).json({
                error: 'Invalid credentials',
                message: 'Email or password is incorrect'
            });
        }

        // Role-based gate based on selected login tab
        if (loginType === 'jobseeker' && user.role !== 'JobSeeker') {
            return res.status(403).json({
                error: 'Role not allowed',
                message: 'Please use the Company & Staff login for this account.'
            });
        }
        if (loginType === 'company' && user.role === 'JobSeeker') {
            return res.status(403).json({
                error: 'Role not allowed',
                message: 'Please use the Job Seeker login for this account.'
            });
        }

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        user.refreshTokens.push({ token: refreshToken });

        // Update last login - use updateOne to bypass validation for migrated users
        // This is necessary because some migrated users may have validation issues
        try {
            await User.updateOne(
                { _id: user._id },
                {
                    $set: {
                        lastLogin: new Date(),
                        updatedAt: new Date()
                    },
                    $push: {
                        refreshTokens: { token: refreshToken, createdAt: new Date() }
                    }
                }
            );
        } catch (updateError) {
            // If update fails, log but don't fail login (user is already authenticated)
            logger.warn(`Failed to update last login and refresh token for ${email}:`, updateError.message);
        }

        logger.info(`User logged in: ${email}`);

        res.json({
            message: 'Login successful',
            user: user.getPublicProfile(),
            tokens: {
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        // Enhanced error logging
        logger.error('Login error:', {
            message: error.message,
            stack: error.stack,
            name: error.name,
            code: error.code,
            email: req.body?.email || 'unknown'
        });
        
        // Log to console as well for immediate visibility
        console.error('=== LOGIN ERROR ===');
        console.error('Error:', error.message);
        console.error('Stack:', error.stack);
        console.error('==================');
        
        res.status(500).json({
            error: 'Login failed',
            message: 'An error occurred during login',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', validateRefreshToken, async (req, res) => {
    try {
        const { user, refreshToken } = req;

        // Generate new tokens
        const { accessToken, newRefreshToken } = generateTokens(user);

        // Remove old refresh token and add new one
        user.refreshTokens = user.refreshTokens.filter(token => token.token !== refreshToken);
        user.refreshTokens.push({ token: newRefreshToken });

        await user.save();

        logger.info(`Token refreshed for user: ${user.email}`);

        res.json({
            message: 'Token refreshed successfully',
            tokens: {
                accessToken,
                refreshToken: newRefreshToken
            }
        });
    } catch (error) {
        logger.error('Token refresh error:', error);
        res.status(500).json({
            error: 'Token refresh failed',
            message: 'An error occurred while refreshing the token'
        });
    }
});

/**
 * POST /api/auth/logout
 * Logout user and invalidate refresh token
 */
router.post('/logout', authenticateToken, async (req, res) => {
    try {
        const { refreshToken } = req.body;
        const { user } = req;

        // Remove user from queue if they are a JobSeeker
        if (user.role === 'JobSeeker') {
            try {
                const BoothQueue = require('../models/BoothQueue');

                // Find all active queue entries for this user (including in_meeting status)
                const activeQueues = await BoothQueue.find({
                    jobSeeker: user._id,
                    status: { $in: ['waiting', 'invited', 'in_meeting'] }
                });

                // Leave all active queues
                for (const queueEntry of activeQueues) {
                    await queueEntry.leaveQueue();

                    // Notify booth management about queue update
                    const io = req.app.get('io');
                    if (io) {
                        const updateData = {
                            boothId: queueEntry.booth,
                            action: 'left',
                            queueEntry: {
                                _id: queueEntry._id,
                                jobSeeker: user.getPublicProfile(),
                                position: queueEntry.position,
                                status: 'left'
                            }
                        };
                        io.to(`booth_${queueEntry.booth}`).emit('queue-updated', updateData);
                        io.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', updateData);
                    }

                    logger.info(`Removed user ${user.email} from queue for booth ${queueEntry.booth} on logout`);
                }
            } catch (error) {
                logger.error('Error removing user from queue on logout:', error);
                // Don't fail logout if queue removal fails
            }
        }

        if (refreshToken) {
            // Remove specific refresh token
            user.refreshTokens = user.refreshTokens.filter(token => token.token !== refreshToken);
            await user.save();
        } else {
            // Remove all refresh tokens (logout from all devices)
            user.refreshTokens = [];
            await user.save();
        }

        logger.info(`User logged out: ${user.email}`);

        res.json({
            message: 'Logout successful'
        });
    } catch (error) {
        logger.error('Logout error:', error);
        res.status(500).json({
            error: 'Logout failed',
            message: 'An error occurred during logout'
        });
    }
});

/**
 * GET /api/auth/me
 * Get current user information
 */
router.get('/me', authenticateToken, (req, res) => {
    res.json({
        user: req.user.getPublicProfile()
    });
});

/**
 * PUT /api/auth/profile
 * Update user profile
 */
router.put('/profile', authenticateToken, [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('phoneNumber')
        .optional({ nullable: true, checkFalsy: true })
        .customSanitizer(v => typeof v === 'string' ? v.trim() : v)
        .custom((value) => {
            if (!value) return true; // allow empty after trim
            const pattern = /^\+?[0-9\-\s()]{7,20}$/;
            return pattern.test(value);
        })
        .withMessage('Please provide a valid phone number'),
    body('state')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage('State must be a string up to 100 characters'),
    body('city')
        .optional()
        .isString()
        .isLength({ max: 100 })
        .withMessage('City must be a string up to 100 characters'),
    body('country')
        .optional()
        .isString()
        .isLength({ min: 2, max: 2 })
        .withMessage('Country must be a 2-letter code'),
    body('languages')
        .optional()
        .isArray()
        .withMessage('Languages must be an array'),
    body('isAvailable')
        .optional()
        .isBoolean()
        .withMessage('Availability must be a boolean value')
    ,
    body('usesScreenMagnifier').optional().isBoolean().withMessage('usesScreenMagnifier must be boolean').toBoolean(true),
    body('usesScreenReader').optional().isBoolean().withMessage('usesScreenReader must be boolean').toBoolean(true),
    body('needsASL').optional().isBoolean().withMessage('needsASL must be boolean').toBoolean(true),
    body('needsCaptions').optional().isBoolean().withMessage('needsCaptions must be boolean').toBoolean(true),
    body('needsOther').optional().isBoolean().withMessage('needsOther must be boolean').toBoolean(true),
    body('subscribeAnnouncements').optional().isBoolean().withMessage('subscribeAnnouncements must be boolean').toBoolean(true)
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

        const { name, phoneNumber, state, city, country, languages, isAvailable,
            usesScreenMagnifier, usesScreenReader, needsASL, needsCaptions, needsOther, subscribeAnnouncements } = req.body;
        const { user } = req;

        // Update allowed fields
        if (name !== undefined) user.name = name;
        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
        if (state !== undefined) user.state = state;
        if (city !== undefined) user.city = city;
        if (country !== undefined) user.country = country;
        if (languages !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(user.role)) {
            user.languages = languages;
        }
        if (isAvailable !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(user.role)) {
            user.isAvailable = isAvailable;
        }
        if (usesScreenMagnifier !== undefined) user.usesScreenMagnifier = usesScreenMagnifier;
        if (usesScreenReader !== undefined) user.usesScreenReader = usesScreenReader;
        if (needsASL !== undefined) user.needsASL = needsASL;
        if (needsCaptions !== undefined) user.needsCaptions = needsCaptions;
        if (needsOther !== undefined) user.needsOther = needsOther;
        if (subscribeAnnouncements !== undefined) user.subscribeAnnouncements = subscribeAnnouncements;

        await user.save();

        logger.info(`User profile updated: ${user.email}`);

        res.json({
            message: 'Profile updated successfully',
            user: user.getPublicProfile()
        });
    } catch (error) {
        logger.error('Profile update error:', error);
        res.status(500).json({
            error: 'Profile update failed',
            message: 'An error occurred while updating your profile'
        });
    }
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticateToken, [
    body('currentPassword')
        .notEmpty()
        .withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 })
        .withMessage('New password must be at least 8 characters long')
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

        const { currentPassword, newPassword } = req.body;
        
        // Re-fetch user with password fields (authenticateToken middleware excludes them)
        const user = await User.findById(req.user._id).select('+hashedPassword +legacyPassword');
        if (!user) {
            return res.status(404).json({
                error: 'User not found',
                message: 'User account not found'
            });
        }

        // Verify current password
        const isCurrentPasswordValid = await user.comparePassword(currentPassword);
        if (!isCurrentPasswordValid) {
            return res.status(401).json({
                error: 'Invalid current password',
                message: 'The current password you entered is incorrect'
            });
        }

        // Update password
        user.hashedPassword = newPassword; // Will be hashed by pre-save middleware
        // Clear legacy password for legacy users (so they use the new bcrypt password)
        // This ensures legacy users can login with the new password
        if (user.legacyPassword) {
            user.legacyPassword = null;
        }
        await user.save();

        // Invalidate all refresh tokens (force re-login on all devices)
        user.refreshTokens = [];
        await user.save();

        logger.info(`Password changed for user: ${user.email}`);

        res.json({
            message: 'Password changed successfully. Please log in again.'
        });
    } catch (error) {
        logger.error('Password change error:', error);
        res.status(500).json({
            error: 'Password change failed',
            message: 'An error occurred while changing your password'
        });
    }
});

/**
 * GET /api/auth/survey
 * Get current user's job seeker survey
 */
router.get('/survey', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'JobSeeker') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Survey is only available for JobSeeker accounts'
            });
        }
        return res.json({ survey: req.user.survey || {} });
    } catch (error) {
        logger.error('Get survey error:', error);
        res.status(500).json({ error: 'Failed to retrieve survey' });
    }
});

/**
 * PUT /api/auth/survey
 * Update current user's job seeker survey
 */
router.put('/survey', authenticateToken, [
    body('race').optional().isArray().withMessage('Race must be an array of strings'),
    body('genderIdentity').optional().isString().isLength({ max: 100 }).withMessage('Invalid gender identity'),
    body('ageGroup').optional().isString().isLength({ max: 50 }).withMessage('Invalid age group'),
    body('countryOfOrigin').optional().isString().isLength({ max: 100 }).withMessage('Invalid country of origin'),
    body('disabilities').optional().isArray().withMessage('Disabilities must be an array of strings'),
    body('otherDisability').optional().isString().isLength({ max: 200 }).withMessage('Other disability is too long')
], async (req, res) => {
    try {
        if (req.user.role !== 'JobSeeker') {
            return res.status(403).json({
                error: 'Forbidden',
                message: 'Survey is only available for JobSeeker accounts'
            });
        }
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { race, genderIdentity, ageGroup, countryOfOrigin, disabilities, otherDisability } = req.body;
        const { user } = req;

        user.survey = {
            race: Array.isArray(race) ? race : user.survey?.race || [],
            genderIdentity: genderIdentity !== undefined ? genderIdentity : (user.survey?.genderIdentity || ''),
            ageGroup: ageGroup !== undefined ? ageGroup : (user.survey?.ageGroup || ''),
            countryOfOrigin: countryOfOrigin !== undefined ? countryOfOrigin : (user.survey?.countryOfOrigin || ''),
            disabilities: Array.isArray(disabilities) ? disabilities : user.survey?.disabilities || [],
            otherDisability: otherDisability !== undefined ? otherDisability : (user.survey?.otherDisability || ''),
            updatedAt: new Date()
        };

        await user.save();
        logger.info(`Survey updated for user: ${user.email}`);
        return res.json({ message: 'Survey updated successfully', survey: user.survey });
    } catch (error) {
        logger.error('Update survey error:', error);
        res.status(500).json({ error: 'Failed to update survey' });
    }
});

/**
 * GET /api/auth/verify-email?token=...
 * Confirms email verification and redirects to app login
 */
router.get('/verify-email', async (req, res) => {
    try {
        const { token, redirect: redirectPath } = req.query;
        if (!token || typeof token !== 'string') {
            return res.status(400).send('Invalid verification link');
        }
        const user = await User.findOne({
            emailVerificationToken: token,
            emailVerificationExpires: { $gt: new Date() }
        });
        if (!user) {
            return res.status(400).send('Verification link is invalid or has expired');
        }
        
        // Get redirect path from URL parameter or from user metadata (fallback)
        const finalRedirectPath = redirectPath || (user.metadata && user.metadata.pendingRedirectPath) || null;
        
        user.emailVerified = true;
        user.emailVerificationToken = null;
        user.emailVerificationExpires = null;
        // Clear the pending redirect path from metadata after verification
        if (user.metadata && user.metadata.pendingRedirectPath) {
            delete user.metadata.pendingRedirectPath;
        }
        await user.save();

        // Determine the correct base URL for redirect
        let appBase = process.env.APP_BASE_URL;
        if (!appBase) {
            appBase = process.env.CORS_ORIGIN;
        }
        if (!appBase) {
            // Try to construct from request (for production)
            if (req.headers.host && process.env.NODE_ENV !== 'development') {
                const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
                appBase = `${protocol}://${req.headers.host.replace(/:\d+$/, '')}`;
            } else {
                appBase = 'http://localhost:3000';
            }
        }
        // Include redirect path in the email-verified page URL if it exists
        let redirectUrl = `${appBase}/email-verified`;
        if (finalRedirectPath) {
            redirectUrl += `?redirect=${encodeURIComponent(finalRedirectPath)}`;
        }
        return res.redirect(302, redirectUrl);
    } catch (error) {
        logger.error('Verify email error:', error);
        return res.status(500).send('Failed to verify email');
    }
});

/**
 * POST /api/auth/forgot-password
 * Request password reset - sends reset email
 */
router.post('/forgot-password', [
    body('email')
        .isEmail()
        .normalizeEmail()
        .withMessage('Please provide a valid email address')
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

        const { email } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
        
        // Always return success message (security best practice - don't reveal if email exists)
        // But only send email if user exists
        if (user) {
            // Generate password reset token (1 hour expiry)
            const resetToken = crypto.randomBytes(32).toString('hex');
            user.passwordResetToken = resetToken;
            user.passwordResetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
            await user.save();

            // Send password reset email
            // Determine the correct base URL for the reset link
            let appBase = process.env.APP_BASE_URL;
            
            // If APP_BASE_URL is not set, try CORS_ORIGIN
            if (!appBase) {
                appBase = process.env.CORS_ORIGIN;
            }
            
            // If still not set, try to construct from request (for production)
            if (!appBase && req.headers.host) {
                const protocol = req.secure || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
                // Only use request-based URL if we're not in development
                if (process.env.NODE_ENV !== 'development') {
                    appBase = `${protocol}://${req.headers.host.replace(/:\d+$/, '')}`;
                }
            }
            
            // Last resort: use localhost (only for development)
            if (!appBase) {
                appBase = 'http://localhost:3000';
                if (process.env.NODE_ENV === 'production') {
                    logger.warn('⚠️ APP_BASE_URL not set in production! Using localhost fallback. Please set APP_BASE_URL environment variable.');
                }
            }
            
            const resetLink = `${appBase}/reset-password?token=${encodeURIComponent(resetToken)}`;
            logger.info(`Password reset link generated: ${resetLink} (appBase: ${appBase})`);
            
            try {
                const ok = await sendPasswordResetEmail(user.email, resetLink);
                if (!ok) {
                    logger.warn(`Failed to send password reset email to ${user.email}`);
                } else {
                    logger.info(`Password reset email sent successfully to ${user.email}`);
                }
            } catch (emailError) {
                logger.error(`Error sending password reset email to ${user.email}:`, emailError);
                // Don't fail the request if email fails
            }
        }

        // Always return success (security best practice)
        res.json({
            message: 'If an account with that email exists, a password reset link has been sent.'
        });
    } catch (error) {
        logger.error('Forgot password error:', error);
        res.status(500).json({
            error: 'Password reset request failed',
            message: 'An error occurred while processing your request'
        });
    }
});

/**
 * POST /api/auth/reset-password
 * Reset password using token from email
 */
router.post('/reset-password', [
    body('token')
        .notEmpty()
        .withMessage('Reset token is required'),
    body('password')
        .isLength({ min: 8 })
        .withMessage('Password must be at least 8 characters long')
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

        const { token, password } = req.body;

        // Find user with valid reset token
        const user = await User.findOne({
            passwordResetToken: token,
            passwordResetExpires: { $gt: new Date() }
        });

        if (!user) {
            return res.status(400).json({
                error: 'Invalid or expired token',
                message: 'Password reset link is invalid or has expired. Please request a new one.'
            });
        }

        // Update password
        user.hashedPassword = password; // Will be hashed by pre-save middleware
        user.passwordResetToken = null;
        user.passwordResetExpires = null;
        
        // Invalidate all refresh tokens (force re-login on all devices)
        user.refreshTokens = [];
        
        await user.save();

        logger.info(`Password reset successful for user: ${user.email}`);

        res.json({
            message: 'Password has been reset successfully. Please log in with your new password.'
        });
    } catch (error) {
        logger.error('Reset password error:', error);
        res.status(500).json({
            error: 'Password reset failed',
            message: 'An error occurred while resetting your password'
        });
    }
});

module.exports = router;
