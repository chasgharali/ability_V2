const express = require('express');
const jwt = require('jsonwebtoken');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, validateRefreshToken } = require('../middleware/auth');
const logger = require('../utils/logger');

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

    const accessToken = jwt.sign(payload, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '15m'
    });

    const refreshToken = jwt.sign(payload, process.env.JWT_REFRESH_SECRET, {
        expiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d'
    });

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
        .withMessage('Password must be at least 8 characters long')
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'),
    body('role')
        .optional()
        .isIn(['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
        .withMessage('Invalid role specified'),
    body('phoneNumber')
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),
    body('languages')
        .optional()
        .isArray()
        .withMessage('Languages must be an array')
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

        const { name, email, password, role = 'JobSeeker', phoneNumber, languages } = req.body;

        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(409).json({
                error: 'User already exists',
                message: 'An account with this email address already exists'
            });
        }

        // Create new user
        const user = new User({
            name,
            email,
            hashedPassword: password, // Will be hashed by pre-save middleware
            role,
            phoneNumber,
            languages: role === 'Interpreter' || role === 'GlobalInterpreter' ? languages : undefined
        });

        await user.save();

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
            message: 'User registered successfully',
            user: user.getPublicProfile(),
            tokens: {
                accessToken,
                refreshToken
            }
        });
    } catch (error) {
        logger.error('Registration error:', error);
        res.status(500).json({
            error: 'Registration failed',
            message: 'An error occurred during registration'
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
        .withMessage('Password is required')
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

        const { email, password } = req.body;

        // Find user by email
        const user = await User.findOne({ email });
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

        // Generate tokens
        const { accessToken, refreshToken } = generateTokens(user);

        // Store refresh token
        user.refreshTokens.push({ token: refreshToken });

        // Update last login
        user.lastLogin = new Date();

        await user.save();

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
        logger.error('Login error:', error);
        res.status(500).json({
            error: 'Login failed',
            message: 'An error occurred during login'
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
        .optional()
        .isMobilePhone()
        .withMessage('Please provide a valid phone number'),
    body('languages')
        .optional()
        .isArray()
        .withMessage('Languages must be an array'),
    body('isAvailable')
        .optional()
        .isBoolean()
        .withMessage('Availability must be a boolean value')
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

        const { name, phoneNumber, languages, isAvailable } = req.body;
        const { user } = req;

        // Update allowed fields
        if (name !== undefined) user.name = name;
        if (phoneNumber !== undefined) user.phoneNumber = phoneNumber;
        if (languages !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(user.role)) {
            user.languages = languages;
        }
        if (isAvailable !== undefined && ['Interpreter', 'GlobalInterpreter'].includes(user.role)) {
            user.isAvailable = isAvailable;
        }

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
        .matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/)
        .withMessage('New password must contain at least one uppercase letter, one lowercase letter, one number, and one special character')
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
        const { user } = req;

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

module.exports = router;
