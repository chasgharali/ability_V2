const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const Booth = require('../models/Booth');
const Organization = require('../models/Organization');
const ImportRun = require('../models/ImportRun');
const logger = require('../utils/logger');
const mongoose = require('mongoose');
const { randomUUID } = require('crypto');

const router = express.Router();

/**
 * Normalize email for lookup/comparison purposes ONLY (NOT for storage)
 * This function is used to check for duplicate emails, especially for Gmail addresses
 * where dots in the local part don't matter (e.g., marge.plasmier@gmail.com == margeplasmier@gmail.com)
 * 
 * IMPORTANT: Emails are stored exactly as the user types them (case-sensitive, with dots preserved).
 * This function is ONLY used for duplicate detection, not for storing emails.
 * 
 * @param {string} email - Email address to normalize for comparison
 * @returns {string} - Normalized email for lookup (lowercase, dots removed for Gmail)
 */
const normalizeEmailForLookup = (email) => {
    if (!email || typeof email !== 'string') return email;
    
    // For comparison only: lowercase and trim (emails are stored with original case)
    const trimmed = email.toLowerCase().trim();
    const [localPart, domain] = trimmed.split('@');
    
    // For Gmail addresses, remove dots from local part for comparison
    // This ensures marge.plasmier@gmail.com and margeplasmier@gmail.com match
    if (domain && (domain === 'gmail.com' || domain === 'googlemail.com')) {
        const normalizedLocal = localPart.replace(/\./g, '');
        return `${normalizedLocal}@${domain}`;
    }
    
    // For non-Gmail addresses, just return lowercase trimmed version
    return trimmed;
};

const emitImportEvent = (req, eventName, payload = {}) => {
    const io = req.app.get('io');
    const targetId = req.user?._id?.toString?.();
    if (!io || !targetId) return;
    io.to(`user:${targetId}`).emit(eventName, payload);
};

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
    body('linkedInUrl').optional().custom((value) => value === null || value === '' || typeof value === 'string').withMessage('linkedInUrl must be null, empty string, or a string'),
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

        const { name, phoneNumber, state, city, country, avatarUrl, linkedInUrl, profile } = req.body;

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
        // Allow removing LinkedIn URL by setting to null or empty string
        if (linkedInUrl !== undefined) {
            targetUser.linkedInUrl = (linkedInUrl === null || linkedInUrl === '') ? null : String(linkedInUrl).trim() || null;
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
 * POST /api/users/me/change-email
 * Request email change for current authenticated user (Job Seeker)
 */
router.post('/me/change-email', authenticateToken, [
    body('newEmail')
        .isEmail()
        .trim()
        .withMessage('Please provide a valid email address')
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
        const { newEmail } = req.body;
        // Store email exactly as user typed it (no normalization)
        const trimmedNewEmail = typeof newEmail === 'string' ? newEmail.trim() : newEmail;

        // Re-fetch user to get latest data
        const targetUser = await User.findById(user._id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The current user does not exist'
            });
        }

        // Check if new email is the same as current email (using normalized lookup for duplicate checking)
        const normalizedCurrentEmail = normalizeEmailForLookup(targetUser.email);
        const normalizedNewEmailForLookup = normalizeEmailForLookup(trimmedNewEmail);
        if (normalizedCurrentEmail === normalizedNewEmailForLookup) {
            return res.status(400).json({
                error: 'Invalid email',
                message: 'The new email address is the same as your current email address'
            });
        }

        // Check if new email is already in use (using normalized lookup for duplicate checking only)
        const normalizedNewEmailLookup = normalizeEmailForLookup(trimmedNewEmail);
        const allUsers = await User.find({}).select('email');
        const existingUser = allUsers.find(u => normalizeEmailForLookup(u.email) === normalizedNewEmailLookup);
        if (existingUser) {
            return res.status(409).json({
                error: 'Email already in use',
                message: 'An account with this email address already exists'
            });
        }

        // Check if there's already a pending email change
        if (targetUser.pendingEmail && targetUser.emailChangeExpires && targetUser.emailChangeExpires > new Date()) {
            return res.status(400).json({
                error: 'Email change already pending',
                message: `An email change to ${targetUser.pendingEmail} is already pending. Please verify that email or wait for it to expire.`
            });
        }

        // Generate email change token (24h expiry)
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        targetUser.pendingEmail = trimmedNewEmail;
        targetUser.emailChangeToken = token;
        targetUser.emailChangeExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

        await targetUser.save();

        // Send verification email to new email address
        const { sendEmailChangeVerificationEmail } = require('../utils/mailer');
        
        // Determine the correct base URL for the verification link
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
        const verifyLink = `${apiBase}/api/users/verify-email-change?token=${encodeURIComponent(token)}`;
        
        try {
            const ok = await sendEmailChangeVerificationEmail(normalizedNewEmail, verifyLink);
            if (!ok) {
                logger.warn(`Failed to send email change verification email to ${normalizedNewEmail}`);
            } else {
                logger.info(`Email change verification email sent successfully to ${normalizedNewEmail}`);
            }
        } catch (emailError) {
            logger.error(`Error sending email change verification email to ${normalizedNewEmail}:`, emailError);
            // Don't fail the request if email fails, but log the error
        }

        logger.info(`Email change requested for user: ${targetUser.email} -> ${normalizedNewEmail}`);

        res.json({
            message: 'Verification email sent to your new email address. Please check your inbox and click the verification link to complete the email change.',
            pendingEmail: normalizedNewEmail
        });
    } catch (error) {
        logger.error('Email change request error:', error);
        res.status(500).json({
            error: 'Email change request failed',
            message: 'An error occurred while processing your email change request'
        });
    }
});

/**
 * GET /api/users/verify-email-change?token=...
 * Verify email change and update user's email
 */
router.get('/verify-email-change', async (req, res) => {
    try {
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

        const { token } = req.query;
        if (!token || typeof token !== 'string') {
            const redirectUrl = `${appBase}/email-change-verified?error=${encodeURIComponent('Invalid verification link')}`;
            return res.redirect(302, redirectUrl);
        }

        const user = await User.findOne({
            emailChangeToken: token,
            emailChangeExpires: { $gt: new Date() }
        });

        if (!user) {
            const redirectUrl = `${appBase}/email-change-verified?error=${encodeURIComponent('Email change verification link is invalid or has expired')}`;
            return res.redirect(302, redirectUrl);
        }

        if (!user.pendingEmail) {
            const redirectUrl = `${appBase}/email-change-verified?error=${encodeURIComponent('No pending email change found')}`;
            return res.redirect(302, redirectUrl);
        }

        // Check if pending email is already in use by another user (using normalized lookup for Gmail)
        const normalizedPendingEmail = normalizeEmailForLookup(user.pendingEmail);
        const allUsers = await User.find({ _id: { $ne: user._id } }).select('email');
        const existingUser = allUsers.find(u => normalizeEmailForLookup(u.email) === normalizedPendingEmail);
        if (existingUser) {
            // Clear the pending email change
            user.pendingEmail = null;
            user.emailChangeToken = null;
            user.emailChangeExpires = null;
            await user.save();
            
            const redirectUrl = `${appBase}/email-change-verified?error=${encodeURIComponent('This email address is already in use by another account')}`;
            return res.redirect(302, redirectUrl);
        }

        // Update email
        const oldEmail = user.email;
        user.email = user.pendingEmail;
        user.pendingEmail = null;
        user.emailChangeToken = null;
        user.emailChangeExpires = null;
        // Reset email verification status since it's a new email
        user.emailVerified = false;
        // Generate new email verification token for the new email
        const crypto = require('crypto');
        const newVerificationToken = crypto.randomBytes(32).toString('hex');
        user.emailVerificationToken = newVerificationToken;
        user.emailVerificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000);
        
        await user.save();

        // Send verification email for the new email address
        const { sendVerificationEmail } = require('../utils/mailer');
        
        // Determine the correct base URL for the verification link (reuse appBase from above)
        let apiBase = process.env.API_BASE_URL;
        if (!apiBase) {
            apiBase = process.env.APP_BASE_URL || process.env.CORS_ORIGIN || `http://localhost:${process.env.PORT || 5000}`;
        }
        
        const verifyLink = `${apiBase}/api/auth/verify-email?token=${encodeURIComponent(newVerificationToken)}`;
        
        try {
            const ok = await sendVerificationEmail(user.email, verifyLink);
            if (!ok) {
                logger.warn(`Failed to send verification email to ${user.email} after email change`);
            } else {
                logger.info(`Verification email sent successfully to ${user.email} after email change`);
            }
        } catch (emailError) {
            logger.error(`Error sending verification email to ${user.email} after email change:`, emailError);
        }

        logger.info(`Email changed successfully for user: ${oldEmail} -> ${user.email}`);

        // Redirect to success page (appBase already determined at the top of the function)
        const redirectUrl = `${appBase}/email-change-verified`;
        return res.redirect(302, redirectUrl);
    } catch (error) {
        logger.error('Verify email change error:', error);
        return res.status(500).send('Failed to verify email change');
    }
});

/**
 * GET /api/users
 * Get list of users (Admin/GlobalSupport/Recruiter/BoothAdmin)
 * Recruiters and BoothAdmins can only view JobSeekers from their assigned events
 */
router.get('/', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport', 'Recruiter', 'BoothAdmin']), async (req, res) => {
    try {
        const { role, isActive, page = 1, limit = 50, search, eventId, organizationId: orgFilterId, sortBy = 'createdAt', sortDir = 'desc' } = req.query;
        const currentUser = req.user;
        const requestingJobSeekers = role === 'JobSeeker';

        logger.info(`Get users request - role: ${role}, isActive: ${isActive}, search: ${search}, eventId: ${eventId}, orgFilter: ${orgFilterId}, requestedBy: ${currentUser.email} (${currentUser.role})`);

        // Build query
        let query = {};

        // For Recruiter/BoothAdmin, restrict to JobSeekers only and filter by their assigned events
        if (['Recruiter', 'BoothAdmin'].includes(currentUser.role)) {
            // Recruiters can only view JobSeekers
            if (role && role !== 'JobSeeker') {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You can only view job seekers'
                });
            }
            query.role = 'JobSeeker';
            
            // Get recruiter's assigned events
            const recruiterData = await User.findById(currentUser._id).select('assignedEvents');
            const assignedEvents = recruiterData?.assignedEvents || [];
            
            if (assignedEvents.length > 0) {
                // Filter job seekers by their registered events matching recruiter's assigned events
                const eventFilterConditions = assignedEvents.flatMap(eventId => [
                    { 'metadata.registeredEvents': { $elemMatch: { id: eventId } } },
                    { 'metadata.registeredEvents': { $elemMatch: { id: eventId.toString() } } }
                ]);
                
                if (eventFilterConditions.length > 0) {
                    query.$or = eventFilterConditions;
                }
                logger.info(`Recruiter ${currentUser.email} filtering job seekers by ${assignedEvents.length} assigned events`);
            } else {
                // If no assigned events, recruiter can't see any job seekers
                logger.info(`Recruiter ${currentUser.email} has no assigned events, returning empty result`);
                return res.json({
                    users: [],
                    total: 0,
                    page: parseInt(page),
                    limit: parseInt(limit),
                    stats: { active: 0, inactive: 0, verified: 0 }
                });
            }
        } else {
            // SuperAdmin/Admin/GlobalSupport - normal behavior
            if (role) {
                query.role = role;
            } else {
                // When no role filter is provided, exclude JobSeekers by default
                // JobSeekers have their own management page
                query.role = { $nin: ['JobSeeker', 'SuperAdmin'] };
            }

            // Org scoping: Admin sees only users in their own organization
            // SuperAdmin and GlobalSupport see all users (optionally filtered by orgFilterId).
            // NOTE: JobSeekers are not directly org-assigned; org filtering for JobSeekers is
            // derived from RegisteredJobSeeker below.
            if (currentUser.role === 'Admin' && req.orgId) {
                query.organizationId = req.orgId;
            } else if (['SuperAdmin', 'GlobalSupport'].includes(currentUser.role) && orgFilterId) {
                if (requestingJobSeekers) {
                    // Skip direct organizationId filter for JobSeekers.
                } else if (orgFilterId === 'unassigned') {
                    query.organizationId = null;
                } else {
                    query.organizationId = orgFilterId;
                }
            }
        }

        // Registration-based org scoping for JobSeekers.
        // This enforces: selected organization (+ optional selected event) -> allowed jobSeekerIds.
        if (
            ['SuperAdmin', 'GlobalSupport'].includes(currentUser.role) &&
            requestingJobSeekers &&
            orgFilterId
        ) {
            let allowedJobSeekerIds = [];

            if (orgFilterId !== 'unassigned' && mongoose.Types.ObjectId.isValid(orgFilterId)) {
                const registrationQuery = {
                    organizationId: new mongoose.Types.ObjectId(orgFilterId)
                };

                // If eventId is provided, intersect org + event in registration lookup.
                if (eventId) {
                    if (!mongoose.Types.ObjectId.isValid(eventId)) {
                        logger.info(`Invalid eventId "${eventId}" for org-filtered JobSeekers; returning empty set`);
                        allowedJobSeekerIds = [];
                    } else {
                        registrationQuery.eventId = new mongoose.Types.ObjectId(eventId);
                    }
                }

                if (allowedJobSeekerIds.length === 0 && (!eventId || mongoose.Types.ObjectId.isValid(eventId))) {
                    allowedJobSeekerIds = await RegisteredJobSeeker.distinct('jobSeekerId', registrationQuery);
                }
            }

            if (Object.keys(query).length > 0) {
                query = {
                    $and: [
                        query,
                        { _id: { $in: allowedJobSeekerIds } }
                    ]
                };
            } else {
                query = { _id: { $in: allowedJobSeekerIds } };
            }

            logger.info(
                `Registration-based org filter applied for JobSeekers: org=${orgFilterId}, event=${eventId || 'any'}, matched=${allowedJobSeekerIds.length}`
            );
        }

        if (isActive !== undefined) {
            query.isActive = isActive === 'true';
        }

        // Build search query at MongoDB level for better performance
        const searchTerm = search && search.trim() ? search.trim() : null;
        
        if (searchTerm) {
            // Escape special regex characters in search term to prevent regex injection
            const escapedSearchTerm = searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            
            // Use simple contains matching for all fields (case-insensitive)
            // This allows partial matches (e.g., "lori" will match "Gloria", "Lori", "Valorie")
            const containsRegex = new RegExp(escapedSearchTerm, 'i');
            
            // Build search conditions - search across all relevant fields with contains matching
            const searchConditions = [
                // Primary fields
                { name: containsRegex },
                { email: containsRegex },
                { phoneNumber: containsRegex },
                
                // Location fields
                { city: containsRegex },
                { state: containsRegex },
                { country: containsRegex },
                
                // Profile fields
                { 'metadata.profile.headline': containsRegex },
                { 'metadata.profile.keywords': containsRegex },
                { 'metadata.profile.workLevel': containsRegex },
                { 'metadata.profile.educationLevel': containsRegex },
                { 'metadata.profile.clearance': containsRegex },
                { 'metadata.profile.veteranStatus': containsRegex },
                { 'metadata.profile.workAuthorization': containsRegex },
                
                // Array fields (MongoDB will check any array element)
                { 'metadata.profile.employmentTypes': containsRegex },
                { 'metadata.profile.languages': containsRegex },
                { 'metadata.profile.primaryExperience': containsRegex },
                
                // Survey fields
                { 'survey.race': containsRegex },
                { 'survey.genderIdentity': containsRegex },
                { 'survey.ageGroup': containsRegex },
                { 'survey.countryOfOrigin': containsRegex },
                { 'survey.disabilities': containsRegex },
                { 'survey.otherDisability': containsRegex }
            ];
            
            // Combine search conditions with existing query using $and
            if (Object.keys(query).length > 0) {
                query = {
                    $and: [
                        query,
                        { $or: searchConditions }
                    ]
                };
            } else {
                query = { $or: searchConditions };
            }
            
            logger.info(`Optimized search query built for term: "${searchTerm}"`);
            logger.info(`Search query structure: ${JSON.stringify(query, null, 2)}`);
            logger.info(`Number of search conditions: ${searchConditions.length}`);
        }

        // Filter by event registration (metadata-based path).
        // Skip this when JobSeekers are already org-filtered via RegisteredJobSeeker, because
        // org+event intersection is handled in the registration lookup above.
        const shouldApplyMetadataEventFilter = !(requestingJobSeekers && orgFilterId);
        if (eventId && shouldApplyMetadataEventFilter) {
            // Convert to ObjectId if it's a valid MongoDB ID
            if (mongoose.Types.ObjectId.isValid(eventId)) {
                const objectId = new mongoose.Types.ObjectId(eventId);
                const objectIdString = objectId.toString();
                
                // For Mixed schema fields, ObjectIds might be stored as ObjectId or converted to string
                // We need to match both formats. The most reliable way is to use $expr with aggregation
                // or use multiple conditions with $or
                // First, let's try a simpler approach that should work for both ObjectId and string formats
                const eventFilterCondition = {
                    'metadata.registeredEvents': {
                        $elemMatch: {
                            $or: [
                                // Match ObjectId format (BSON ObjectId) - try direct comparison
                                { id: objectId },
                                // Match string format - try as string
                                { id: eventId },
                                // Match ObjectId.toString() format
                                { id: objectIdString },
                                // Also try matching the id field converted to string
                                { $expr: { $eq: [{ $toString: '$id' }, objectIdString] } },
                                // Also match by slug as additional fallback
                                { slug: eventId }
                            ]
                        }
                    }
                };
                
                // However, $expr inside $elemMatch might not work, so let's use a different approach
                // Use $or at the top level with separate $elemMatch conditions
                const eventFilterConditions = [
                    // Match ObjectId format (BSON ObjectId)
                    {
                        'metadata.registeredEvents': {
                            $elemMatch: {
                                id: objectId
                            }
                        }
                    },
                    // Match string format (when ObjectId is stored as string)
                    {
                        'metadata.registeredEvents': {
                            $elemMatch: {
                                id: eventId
                            }
                        }
                    },
                    // Match ObjectId.toString() format
                    {
                        'metadata.registeredEvents': {
                            $elemMatch: {
                                id: objectIdString
                            }
                        }
                    },
                    // Match by slug as fallback
                    {
                        'metadata.registeredEvents': {
                            $elemMatch: {
                                slug: eventId
                            }
                        }
                    }
                ];
                
                // Add event filter to query
                if (Object.keys(query).length > 0) {
                    query = {
                        $and: [
                            query,
                            { $or: eventFilterConditions }
                        ]
                    };
                } else {
                    query = { $or: eventFilterConditions };
                }
                logger.info(`Filtering users by event ID: ${eventId} (ObjectId: ${objectIdString})`);
                logger.info(`Event filter conditions count: ${eventFilterConditions.length}`);
            } else {
                // If not a valid ObjectId, search by slug only
                const eventFilterCondition = {
                    'metadata.registeredEvents': {
                        $elemMatch: {
                            slug: eventId
                        }
                    }
                };
                if (Object.keys(query).length > 0) {
                    query = {
                        $and: [
                            query,
                            eventFilterCondition
                        ]
                    };
                } else {
                    query = eventFilterCondition;
                }
                logger.info(`Filtering users by event slug: ${eventId}`);
            }
            // Log the final query structure for debugging
            logger.info(`Final query structure: ${JSON.stringify(query, null, 2)}`);
        }

        // Debug: If eventId filter is active, log a sample of registered events data
        if (eventId && shouldApplyMetadataEventFilter) {
            if (mongoose.Types.ObjectId.isValid(eventId)) {
                const objectId = new mongoose.Types.ObjectId(eventId);
                const objectIdString = objectId.toString();
                
                // Test query to see what format the data is stored in
                const testQuery = {
                    role: 'JobSeeker',
                    'metadata.registeredEvents': { $exists: true, $ne: [] }
                };
                const sampleUsers = await User.find(testQuery)
                    .select('metadata.registeredEvents email')
                    .limit(10)
                    .lean();
                logger.info(`Sample registeredEvents data from ${sampleUsers.length} users for eventId ${eventId}:`);
                sampleUsers.forEach((user, idx) => {
                    if (user.metadata?.registeredEvents) {
                        const matchingEvents = user.metadata.registeredEvents.filter(reg => {
                            const regId = reg.id;
                            const regIdStr = regId ? (typeof regId === 'object' ? regId.toString() : String(regId)) : null;
                            return regIdStr === objectIdString || regIdStr === eventId || reg.slug === eventId;
                        });
                        if (matchingEvents.length > 0) {
                            logger.info(`User ${idx + 1} (${user.email}) has matching events:`, JSON.stringify(matchingEvents, null, 2));
                            logger.info(`  - Event ID type: ${typeof matchingEvents[0].id}, value: ${matchingEvents[0].id}`);
                        }
                    }
                });
            }
        }

        // Since search is now handled at MongoDB level, always use pagination
        const skip = (page - 1) * limit;
        const parsedLimit = parseInt(limit);
        
        // Run count and data fetch in parallel for better performance
        const [totalCount, allUsers] = await Promise.all([
            // Get total count for pagination info
            User.countDocuments(query),
            // Fetch paginated results
            User.find(query)
                .select('-hashedPassword -refreshTokens')
                .populate('assignedBooth', 'name company')
                .populate('assignedEvents', 'name slug _id')
                .populate('organizationId', 'name slug')
                .sort({ [sortBy]: sortDir === 'asc' ? 1 : -1 })
                .limit(parsedLimit)
                .skip(skip)
                .lean()
        ]);
        
        logger.info(`Found ${totalCount} total users matching query, returning ${allUsers.length} for page ${page}`);
        
        // No need for additional filtering - it's all done at MongoDB level now
        let filteredUsers = allUsers;

        // Convert to public profile format
        const users = filteredUsers.map(user => {
            // Convert lean object to public profile format
            const publicProfile = {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                phoneNumber: user.phoneNumber,
                city: user.city,
                state: user.state,
                country: user.country,
                avatarUrl: user.avatarUrl,
                isActive: user.isActive,
                emailVerified: user.emailVerified,
                lastLogin: user.lastLogin,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt,
                metadata: user.metadata,
                survey: user.survey,
                assignedBooth: user.assignedBooth,
                assignedEvents: user.assignedEvents || [],
                resumeUrl: user.resumeUrl,
                usesScreenMagnifier: user.usesScreenMagnifier,
                usesScreenReader: user.usesScreenReader,
                needsASL: user.needsASL,
                needsCaptions: user.needsCaptions,
                needsOther: user.needsOther,
                organizationId: user.organizationId || null,
                importStatus: user.importStatus || 'complete',
                importMissingFields: Array.isArray(user.importMissingFields) ? user.importMissingFields : [],
                importMeta: user.importMeta || null
            };
            return publicProfile;
        });
        
        // totalCount is already calculated above using countDocuments
        logger.info(`Query returned ${users.length} users out of ${totalCount} total matching query`);

        // Calculate server-side stats for filtered results using MongoDB queries
        // Run all count queries in parallel for better performance
        const withAdditionalCondition = (baseQuery, condition) => ({
            $and: [baseQuery, condition]
        });
        const [activeCount, inactiveCount, verifiedCount] = await Promise.all([
            User.countDocuments(withAdditionalCondition(query, { isActive: true })),
            User.countDocuments(withAdditionalCondition(query, { isActive: false })),
            User.countDocuments(withAdditionalCondition(query, { emailVerified: true }))
        ]);

        logger.info(`Stats - Active: ${activeCount}, Inactive: ${inactiveCount}, Verified: ${verifiedCount}`);

        res.json({
            users: users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            },
            stats: {
                totalCount,
                activeCount,
                inactiveCount,
                verifiedCount
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
 * GET /api/users/import-runs
 * Recent import audit runs for current admin.
 */
router.get('/import-runs', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'GlobalSupport']), async (req, res) => {
    try {
        const limitRaw = Number(req.query.limit || 10);
        const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(100, limitRaw)) : 10;
        const query = {};
        if (req.user.role !== 'SuperAdmin') {
            query.initiatedBy = req.user._id;
        }
        const runs = await ImportRun.find(query)
            .sort({ createdAt: -1 })
            .limit(limit)
            .select('jobId entityType filename totalRows summary createdAt initiatedBy')
            .lean();
        res.json({ runs });
    } catch (error) {
        logger.error('Import runs retrieval error:', error);
        res.status(500).json({ error: 'Failed to retrieve import logs', message: error.message });
    }
});

router.get('/import-runs/:jobId', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'GlobalSupport']), async (req, res) => {
    try {
        const { jobId } = req.params;
        const query = { jobId };
        if (req.user.role !== 'SuperAdmin') {
            query.initiatedBy = req.user._id;
        }
        const run = await ImportRun.findOne(query).lean();
        if (!run) {
            return res.status(404).json({ error: 'Import run not found' });
        }
        return res.json({ run });
    } catch (error) {
        logger.error('Import run detail retrieval error:', error);
        return res.status(500).json({ error: 'Failed to retrieve import run', message: error.message });
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
            ['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) ||
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
router.put('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'GlobalSupport']), [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 100 })
        .withMessage('Name must be between 2 and 100 characters'),
    body('email')
        .optional()
        .isEmail()
        .trim()
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
    body('role')
        .optional()
        .isIn(['SuperAdmin', 'Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
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
    body('assignedEvents')
        .optional()
        .isArray()
        .withMessage('assignedEvents must be an array'),
    body('assignedEvents.*')
        .optional()
        .isMongoId()
        .withMessage('Each assignedEvent must be a valid ID'),
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
    body('linkedInUrl')
        .optional()
        .custom((value) => value === null || value === '' || typeof value === 'string')
        .withMessage('linkedInUrl must be null, empty string, or a string'),
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
        const { name, email, password, phoneNumber, city, state, country, role, isActive, languages, isAvailable, assignedBooth, assignedEvents, avatarUrl, resumeUrl, linkedInUrl,
            usesScreenMagnifier, usesScreenReader, needsASL, needsCaptions, needsOther, profile } = req.body;
        const { user } = req;

        const targetUser = await User.findById(id);
        if (!targetUser) {
            return res.status(404).json({
                error: 'User not found',
                message: 'The specified user does not exist'
            });
        }

        if (user.role === 'AdminEvent') {
            if (targetUser.role !== 'JobSeeker') {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You can only edit job seeker profiles'
                });
            }
            const orgId = user.organizationId?._id || user.organizationId;
            if (!orgId) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'No organization context'
                });
            }
            const hasReg = await RegisteredJobSeeker.exists({
                organizationId: orgId,
                jobSeekerId: targetUser._id
            });
            if (!hasReg) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'This job seeker is not registered for your organization'
                });
            }
            const disallowedStaffFields = [role, isActive, assignedBooth, assignedEvents, languages, isAvailable].some(
                (v) => v !== undefined
            );
            if (disallowedStaffFields) {
                return res.status(403).json({
                    error: 'Access denied',
                    message: 'You cannot modify role, status, or staff assignments'
                });
            }
        }

        if (role === 'SuperAdmin' && user.role !== 'SuperAdmin') {
            return res.status(403).json({
                error: 'Insufficient permissions',
                message: 'Only SuperAdmin can assign SuperAdmin role'
            });
        }

        // Store old email if email is being changed (for notifications)
        const oldEmail = targetUser.email;
        const emailChanged = email !== undefined && email !== null && normalizeEmailForLookup(email.trim()) !== normalizeEmailForLookup(oldEmail);

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
        // Allow removing LinkedIn URL by setting to null or empty string
        if (linkedInUrl !== undefined) {
            targetUser.linkedInUrl = (linkedInUrl === null || linkedInUrl === '') ? null : String(linkedInUrl).trim() || null;
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

        // Handle assignedEvents for Recruiter/BoothAdmin/Support/Interpreter/GlobalSupport roles
        if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(effectiveRole)) {
            if (assignedEvents !== undefined && Array.isArray(assignedEvents)) {
                const Event = require('../models/Event');
                const validEvents = [];
                
                // Validate each event exists
                for (const eventId of assignedEvents) {
                    const eventExists = await Event.findById(eventId).select('_id');
                    if (eventExists) {
                        validEvents.push(eventId);
                    }
                }
                
                // If booth is assigned, validate events belong to that booth
                if (targetUser.assignedBooth) {
                    const booth = await Booth.findById(targetUser.assignedBooth).select('events eventId');
                    const boothEventIds = (booth?.events || []).map(e => e.toString());
                    // Also include the legacy eventId if present
                    if (booth?.eventId) {
                        boothEventIds.push(booth.eventId.toString());
                    }
                    
                    // Filter to only events that are in the booth's events
                    const filteredEvents = validEvents.filter(e => boothEventIds.includes(e.toString()));
                    targetUser.assignedEvents = filteredEvents;
                } else {
                    targetUser.assignedEvents = validEvents;
                }
            }
        } else if (['GlobalSupport', 'GlobalInterpreter'].includes(effectiveRole)) {
            // GlobalSupport gets exactly one event, GlobalInterpreter can have multiple (no booth validation needed)
            if (assignedEvents !== undefined && Array.isArray(assignedEvents)) {
                const Event = require('../models/Event');
                const validEvents = [];
                for (const eventId of assignedEvents) {
                    const eventExists = await Event.findById(eventId).select('_id');
                    if (eventExists) {
                        validEvents.push(eventId);
                    }
                }
                // GlobalSupport: single event, GlobalInterpreter: multiple events
                targetUser.assignedEvents = effectiveRole === 'GlobalSupport' ? validEvents.slice(0, 1) : validEvents;
            }
        } else {
            // Other roles should not have assignedEvents
            if (assignedEvents !== undefined) {
                targetUser.assignedEvents = [];
            }
        }

        // Recompute import readiness after admin edit updates required fields.
        targetUser.refreshImportReadiness();
        await targetUser.save();

        // Send email notifications if email was changed (only for JobSeekers)
        if (emailChanged && targetUser.role === 'JobSeeker') {
            const { sendEmailChangedNotificationOldEmail, sendEmailChangedNotificationNewEmail } = require('../utils/mailer');
            
            // Send notification to old email
            try {
                const okOld = await sendEmailChangedNotificationOldEmail(oldEmail, targetUser.email, targetUser.name);
                if (!okOld) {
                    logger.warn(`Failed to send email change notification to old email ${oldEmail}`);
                } else {
                    logger.info(`Email change notification sent successfully to old email ${oldEmail}`);
                }
            } catch (emailError) {
                logger.error(`Error sending email change notification to old email ${oldEmail}:`, emailError);
            }

            // Send congratulations email to new email
            try {
                const okNew = await sendEmailChangedNotificationNewEmail(targetUser.email, targetUser.name);
                if (!okNew) {
                    logger.warn(`Failed to send email change notification to new email ${targetUser.email}`);
                } else {
                    logger.info(`Email change notification sent successfully to new email ${targetUser.email}`);
                }
            } catch (emailError) {
                logger.error(`Error sending email change notification to new email ${targetUser.email}:`, emailError);
            }
        }

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
 * DELETE /api/users/bulk-delete
 * Bulk permanently delete users (Admin/GlobalSupport only)
 * Automatically deactivates active users before deleting them
 */
router.delete('/bulk-delete', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { userIds } = req.body;
        const { user: currentUser } = req;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ message: 'No user IDs provided' });
        }

        // Prevent self-deletion
        const selfIdIndex = userIds.findIndex(id => id === currentUser._id.toString());
        if (selfIdIndex !== -1) {
            return res.status(400).json({ 
                message: 'Cannot delete your own account',
                error: 'Self-deletion is not allowed'
            });
        }

        // Find all users to be deleted
        const usersToDelete = await User.find({ _id: { $in: userIds } });

        // Separate active and inactive users
        const activeUsers = usersToDelete.filter(u => u.isActive);
        const inactiveUsers = usersToDelete.filter(u => !u.isActive);

        // Deactivate active users first
        let deactivatedCount = 0;
        if (activeUsers.length > 0) {
            const activeUserIds = activeUsers.map(u => u._id);
            await User.updateMany(
                { _id: { $in: activeUserIds } },
                { 
                    $set: { 
                        isActive: false,
                        refreshTokens: [] // Invalidate all refresh tokens
                    } 
                }
            );
            deactivatedCount = activeUsers.length;
            logger.info(`Bulk deactivated ${deactivatedCount} active users before deletion by ${currentUser.email}`);
        }

        // Now delete all users (all should be inactive at this point)
        const allUserIds = usersToDelete.map(u => u._id);
        const result = await User.deleteMany({
            _id: { $in: allUserIds }
        });

        logger.info(`Bulk deleted ${result.deletedCount} users (${deactivatedCount} were deactivated first) by ${currentUser.email}`);

        let message = `Successfully deleted ${result.deletedCount} user(s)`;
        if (deactivatedCount > 0) {
            message += `. ${deactivatedCount} active user(s) were automatically deactivated before deletion.`;
        }

        res.json({
            message,
            deletedCount: result.deletedCount,
            deactivatedCount
        });

    } catch (error) {
        logger.error('Bulk delete users error:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

/**
 * DELETE /api/users/:id
 * Deactivate or permanently delete user account (Admin/GlobalSupport only)
 */
router.delete('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
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
            // Permanent deletion - allow for both active and inactive users
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
router.post('/:id/reactivate', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
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
 * POST /api/users/mass-upload
 * Parse XLS/XLSX/CSV file and bulk-create users/jobseekers with row-by-row live logs.
 */
router.post('/mass-upload', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'GlobalSupport']), async (req, res) => {
    let jobId = null;
    try {
        const XLSX = require('xlsx');
        const multer = require('multer');
        const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
        const runMiddleware = (middleware) => new Promise((resolve, reject) => {
            middleware(req, res, (err) => (err ? reject(err) : resolve()));
        });

        await runMiddleware(upload.single('file'));

        if (!req.file) {
            return res.status(400).json({ error: 'No file provided. Upload XLS/XLSX/CSV using field "file".' });
        }

        const requestedJobId = typeof req.body?.importJobId === 'string' ? req.body.importJobId.trim() : '';
        jobId = requestedJobId || randomUUID();
        const entityType = req.body?.entityType === 'jobseekers' ? 'jobseekers' : 'users';
        const defaultRoleInput = typeof req.body?.defaultRole === 'string' ? req.body.defaultRole.trim() : '';

        const workbook = XLSX.read(req.file.buffer, { type: 'buffer' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rows = XLSX.utils.sheet_to_json(sheet, { defval: '' });
        if (rows.length === 0) {
            return res.status(400).json({ error: 'The spreadsheet is empty or has no data rows.' });
        }

        emitImportEvent(req, 'import-started', {
            jobId,
            total: rows.length,
            entityType,
            filename: req.file.originalname || ''
        });

        const normalizeRow = (row) => {
            const out = {};
            for (const [k, v] of Object.entries(row)) {
                const key = String(k).replace(/^\ufeff/, '').toLowerCase().trim().replace(/\s+/g, '');
                if (v === null || v === undefined) out[key] = '';
                else if (typeof v === 'string') out[key] = v.trim();
                else out[key] = String(v).trim();
            }
            return out;
        };

        const VALID_ROLES = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'];
        const orgScopedRoles = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport'];
        const roleDefaultResolved = VALID_ROLES.find((r) => r.toLowerCase() === defaultRoleInput.toLowerCase()) || '';

        const created = [];
        const skipped = [];
        const errors = [];
        const rowLogs = [];
        let incomplete = 0;
        let orgLimits = null;
        let currentOrgUsers = 0;
        let currentRecruiters = 0;

        if (req.orgId) {
            orgLimits = await Organization.findById(req.orgId).select('limits').lean();
            currentOrgUsers = await User.countDocuments({
                organizationId: req.orgId,
                role: { $in: orgScopedRoles }
            });
            currentRecruiters = await User.countDocuments({
                organizationId: req.orgId,
                role: { $in: ['Recruiter', 'BoothAdmin'] },
                isActive: true
            });
        }

        for (let i = 0; i < rows.length; i += 1) {
            const row = normalizeRow(rows[i]);
            const rowNum = i + 2;
            let rowStatus = 'created';
            let rowMessage = '';
            let rowEmail = '';
            let rowRole = '';
            let rowMissingFields = [];
            let rowImportStatus = 'n/a';

            try {
                let name = (row.name || row.fullname || '').trim();
                if (!name) {
                    const fn = (row.firstname || '').trim();
                    const ln = (row.lastname || '').trim();
                    name = [fn, ln].filter(Boolean).join(' ').trim();
                }

                const email = row.email || row.emailaddress || '';
                const password = row.password || row.pass || '';
                const roleInput = (row.role || roleDefaultResolved || 'JobSeeker').toString().trim();
                const roleResolved = VALID_ROLES.find((r) => r.toLowerCase() === roleInput.toLowerCase());
                const role = roleResolved || roleInput;
                rowEmail = email;
                rowRole = role;

                if (!name) throw new Error('Missing name');
                if (!email || !/\S+@\S+\.\S+/.test(email)) throw new Error('Invalid or missing email');
                if (!password || password.length < 8) throw new Error('Password must be at least 8 characters');
                if (!VALID_ROLES.includes(role)) throw new Error(`Invalid role: ${roleInput}`);

                const boothIdRaw = row.boothid || row.assignedbooth || row.booth || row.booth_id || '';
                let assignedBooth = null;
                if (boothIdRaw) {
                    const bid = String(boothIdRaw).trim();
                    if (!mongoose.Types.ObjectId.isValid(bid)) {
                        throw new Error('Booth Id must be a valid booth _id (MongoDB ObjectId)');
                    }
                    const boothDoc = await Booth.findById(bid).select('_id').lean();
                    if (!boothDoc) {
                        throw new Error(`No booth found with id ${bid}`);
                    }
                    assignedBooth = boothDoc._id;
                }

                const existingUser = await User.findOne({ email: email.toLowerCase() }).select('_id').lean();
                if (existingUser) {
                    rowStatus = 'skipped';
                    rowMessage = 'Email already exists';
                    skipped.push({ row: rowNum, email, reason: rowMessage });
                } else {
                    const organizationId = orgScopedRoles.includes(role) ? (req.orgId || null) : null;
                    if (organizationId && orgLimits?.limits?.maxUsers > 0 && orgScopedRoles.includes(role) && currentOrgUsers >= orgLimits.limits.maxUsers) {
                        rowStatus = 'skipped';
                        rowMessage = `User limit reached (${orgLimits.limits.maxUsers})`;
                        skipped.push({ row: rowNum, email, reason: rowMessage });
                    } else if (organizationId && orgLimits?.limits?.maxRecruiters > 0 && ['Recruiter', 'BoothAdmin'].includes(role) && currentRecruiters >= orgLimits.limits.maxRecruiters) {
                        rowStatus = 'skipped';
                        rowMessage = `Recruiter limit reached (${orgLimits.limits.maxRecruiters})`;
                        skipped.push({ row: rowNum, email, reason: rowMessage });
                    } else {
                        rowMissingFields = User.getMissingImportFields({ role, assignedBooth });
                        rowImportStatus = rowMissingFields.length > 0 ? 'incomplete' : 'complete';
                        if (rowImportStatus === 'incomplete') incomplete += 1;

                        const user = new User({
                            name,
                            email: email.toLowerCase(),
                            hashedPassword: password,
                            role,
                            phoneNumber: row.phone || row.phonenumber || null,
                            city: row.city || '',
                            state: row.state || '',
                            country: row.country || 'US',
                            organizationId,
                            assignedBooth: assignedBooth || null,
                            isActive: true,
                            emailVerified: true,
                            importStatus: rowImportStatus,
                            importMissingFields: rowMissingFields,
                            importMeta: {
                                source: 'mass-upload',
                                importedAt: new Date(),
                                importedBy: req.user._id
                            }
                        });
                        await user.save();
                        created.push({
                            row: rowNum,
                            email,
                            name,
                            role,
                            importStatus: rowImportStatus,
                            missingFields: rowMissingFields
                        });
                        rowMessage = rowImportStatus === 'incomplete'
                            ? `Created with missing fields: ${rowMissingFields.join(', ')}`
                            : 'Created successfully';
                        if (organizationId && orgScopedRoles.includes(role)) currentOrgUsers += 1;
                        if (organizationId && ['Recruiter', 'BoothAdmin'].includes(role) && user.isActive) currentRecruiters += 1;
                    }
                }
            } catch (err) {
                rowStatus = 'error';
                rowMessage = err.message || 'Unexpected import error';
                errors.push({ row: rowNum, email: rowEmail, error: rowMessage });
            }

            const rowLog = {
                row: rowNum,
                status: rowStatus,
                email: rowEmail,
                role: rowRole,
                message: rowMessage,
                importStatus: rowImportStatus,
                missingFields: rowMissingFields
            };
            rowLogs.push(rowLog);
            emitImportEvent(req, 'import-row', {
                jobId,
                progress: {
                    processed: i + 1,
                    total: rows.length
                },
                row: rowLog,
                summary: {
                    created: created.length,
                    incomplete,
                    skipped: skipped.length,
                    errors: errors.length
                }
            });
        }

        const summary = {
            total: rows.length,
            created: created.length,
            incomplete,
            skipped: skipped.length,
            errors: errors.length
        };

        await ImportRun.create({
            jobId,
            entityType,
            initiatedBy: req.user._id,
            organizationId: req.orgId || null,
            filename: req.file.originalname || '',
            totalRows: rows.length,
            summary: {
                created: summary.created,
                incomplete: summary.incomplete,
                skipped: summary.skipped,
                errors: summary.errors
            },
            rows: rowLogs
        });

        logger.info(`Mass upload by ${req.user.email} [${jobId}]: ${created.length} created (${incomplete} incomplete), ${skipped.length} skipped, ${errors.length} errors`);
        emitImportEvent(req, 'import-summary', {
            jobId,
            entityType,
            summary
        });

        res.status(201).json({
            jobId,
            message: `Mass upload complete: ${summary.created} created, ${summary.skipped} skipped, ${summary.errors} errors`,
            created,
            skipped,
            errors,
            logs: rowLogs,
            summary
        });
    } catch (error) {
        logger.error('Mass upload error:', error);
        if (jobId) {
            emitImportEvent(req, 'import-failed', {
                jobId,
                message: error.message || 'Mass upload failed'
            });
        }
        res.status(500).json({ error: 'Mass upload failed', message: error.message });
    }
});

/**
 * PUT /api/users/bulk-update
 * Bulk update multiple users at once (Admin/GlobalSupport only).
 * Body: { userIds: string[], updates: { assignedEvents?, isActive?, role?, ... } }
 */
router.put('/bulk-update', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { userIds, updates } = req.body;
        const { user: currentUser } = req;

        if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
            return res.status(400).json({ error: 'No user IDs provided' });
        }
        if (!updates || typeof updates !== 'object' || Object.keys(updates).length === 0) {
            return res.status(400).json({ error: 'No update fields provided' });
        }

        // Prevent self-modification of critical fields
        const allowedFields = ['isActive', 'assignedEvents', 'assignedBooth', 'role', 'organizationId'];
        const updateFields = {};
        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                updateFields[field] = updates[field];
            }
        }

        if (Object.keys(updateFields).length === 0) {
            return res.status(400).json({ error: 'No valid update fields provided' });
        }

        // For role changes: validate enum
        if (updateFields.role) {
            const validRoles = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'];
            if (!validRoles.includes(updateFields.role)) {
                return res.status(400).json({ error: 'Invalid role specified' });
            }
        }

        // Admin can only update users in their org
        let query = { _id: { $in: userIds } };
        if (currentUser.role === 'Admin' && req.orgId) {
            query.organizationId = req.orgId;
        }

        const affectsImportReadiness = updateFields.role !== undefined || updateFields.assignedBooth !== undefined;
        let result = null;
        if (affectsImportReadiness) {
            const usersToUpdate = await User.find(query);
            let modifiedCount = 0;
            for (const target of usersToUpdate) {
                if (updateFields.isActive !== undefined) target.isActive = updateFields.isActive;
                if (updateFields.assignedEvents !== undefined) target.assignedEvents = updateFields.assignedEvents;
                if (updateFields.assignedBooth !== undefined) target.assignedBooth = updateFields.assignedBooth;
                if (updateFields.role !== undefined) target.role = updateFields.role;
                if (updateFields.organizationId !== undefined) target.organizationId = updateFields.organizationId;
                target.refreshImportReadiness();
                await target.save();
                modifiedCount += 1;
            }
            result = { modifiedCount };
        } else {
            result = await User.updateMany(query, { $set: updateFields });
        }

        // If assignedEvents was updated, emit socket event to refresh affected sessions
        logger.info(`Bulk updated ${result.modifiedCount} users by ${currentUser.email}`);

        res.json({
            message: `Successfully updated ${result.modifiedCount} user(s)`,
            modifiedCount: result.modifiedCount
        });
    } catch (error) {
        logger.error('Bulk update users error:', error);
        res.status(500).json({ error: 'Failed to bulk update users', message: error.message });
    }
});

/**
 * GET /api/users/stats/overview
 * Get user statistics overview (Admin/GlobalSupport only)
 */
router.get('/stats/overview', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
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
router.post('/:id/verify-email', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
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

// ─── SuperAdmin global AI search across job seekers ──────────────────────────
// Uses the same aiSearchService as the org-scoped endpoint, but with a global
// scope (no organizationIds filter). SuperAdmin only — every other role must
// search through their org-scoped endpoint.

const resumeParserService = require('../services/resumeParserService');
const aiSearchService = require('../services/aiSearchService');

/**
 * GET /api/users/job-seekers/parse-status
 * SuperAdmin: count of parsed vs unparsed JobSeekers across the entire system.
 */
router.get('/job-seekers/parse-status', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const status = await resumeParserService.getParseStatus({});
        res.json(status);
    } catch (error) {
        logger.error('Global parse-status error:', error);
        res.status(500).json({ error: 'Failed to get parse status' });
    }
});

/**
 * POST /api/users/job-seekers/parse-resumes
 * SuperAdmin: kick off a global batch parse. Fire-and-forget; client polls
 * /job-seekers/parse-status for progress.
 */
router.post('/job-seekers/parse-resumes', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const force = req.body?.force === true;
        const status = await resumeParserService.getParseStatus({});
        if (status.unparsed === 0 && !force) {
            return res.json({ message: 'All profiles already parsed', ...status });
        }
        resumeParserService.batchParse({ force })
            .then(r => logger.info(`resumeParser global batch complete: processed=${r.processed} skipped=${r.skipped} errors=${r.errors}`))
            .catch(e => logger.error(`resumeParser global batch error: ${e.message}`));
        res.json({ message: 'Parsing started', queued: status.unparsed, ...status });
    } catch (error) {
        logger.error('Global batch parse error:', error);
        res.status(500).json({ error: 'Failed to start batch parsing' });
    }
});

/**
 * POST /api/users/job-seekers/ai-search
 * SuperAdmin: natural language search across ALL job seekers system-wide.
 * Body: { query, page, limit }
 */
router.post('/job-seekers/ai-search', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const { query, page = 1, limit = 20 } = req.body;
        if (!query?.trim()) return res.status(400).json({ error: 'query is required' });

        const result = await aiSearchService.search(query, { kind: 'global' }, {
            page: parseInt(page) || 1,
            limit: Math.min(parseInt(limit) || 20, 100)
        });
        res.json(result);
    } catch (error) {
        if (error.code === 'SENSITIVE_QUERY') {
            return res.status(400).json({
                error: error.message,
                code: 'SENSITIVE_QUERY',
                term: error.term
            });
        }
        if (error.code === 'OPENAI_NOT_CONFIGURED') {
            return res.status(503).json({ error: 'AI search not available — OpenAI API key not configured' });
        }
        logger.error('Global ai-search error:', error);
        res.status(500).json({ error: 'AI search failed' });
    }
});

module.exports = router;
