const express = require('express');
const { body, validationResult } = require('express-validator');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const Booth = require('../models/Booth');
const logger = require('../utils/logger');

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
 * Get list of users (Admin/GlobalSupport only)
 */
router.get('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { role, isActive, page = 1, limit = 50, search, eventId } = req.query;

        logger.info(`Get users request - role: ${role}, isActive: ${isActive}, search: ${search}, eventId: ${eventId}`);

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

        // Note: Search will be applied after fetching records to support searching in nested fields
        // (metadata.profile, survey fields, etc.) which are difficult to query directly in MongoDB
        const searchTerm = search && search.trim() ? search.trim() : null;

        // Filter by event registration
        if (eventId) {
            const mongoose = require('mongoose');
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
        if (eventId) {
            const mongoose = require('mongoose');
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

        // Helper function to check if user matches search term across all fields
        const matchesSearch = (user, searchTerm) => {
            const term = searchTerm.toLowerCase();
            
            // Basic fields
            if (user.name && user.name.toLowerCase().includes(term)) return true;
            if (user.email && user.email.toLowerCase().includes(term)) return true;
            if (user.phoneNumber && user.phoneNumber.toLowerCase().includes(term)) return true;
            if (user.city && user.city.toLowerCase().includes(term)) return true;
            if (user.state && user.state.toLowerCase().includes(term)) return true;
            if (user.country && user.country.toLowerCase().includes(term)) return true;
            
            // Profile fields (metadata.profile)
            if (user.metadata?.profile) {
                const profile = user.metadata.profile;
                if (profile.headline && profile.headline.toLowerCase().includes(term)) return true;
                if (profile.keywords && profile.keywords.toLowerCase().includes(term)) return true;
                if (profile.workLevel && profile.workLevel.toLowerCase().includes(term)) return true;
                if (profile.educationLevel && profile.educationLevel.toLowerCase().includes(term)) return true;
                if (profile.clearance && profile.clearance.toLowerCase().includes(term)) return true;
                if (profile.veteranStatus && profile.veteranStatus.toLowerCase().includes(term)) return true;
                if (profile.workAuthorization && profile.workAuthorization.toLowerCase().includes(term)) return true;
                if (Array.isArray(profile.employmentTypes) && profile.employmentTypes.some(et => et && et.toLowerCase().includes(term))) return true;
                if (Array.isArray(profile.languages) && profile.languages.some(lang => lang && lang.toLowerCase().includes(term))) return true;
                if (Array.isArray(profile.primaryExperience) && profile.primaryExperience.some(exp => exp && exp.toLowerCase().includes(term))) return true;
            }
            
            // Survey fields
            if (user.survey) {
                if (Array.isArray(user.survey.race) && user.survey.race.some(r => r && r.toLowerCase().includes(term))) return true;
                if (user.survey.genderIdentity && user.survey.genderIdentity.toLowerCase().includes(term)) return true;
                if (user.survey.ageGroup && user.survey.ageGroup.toLowerCase().includes(term)) return true;
                if (user.survey.countryOfOrigin && user.survey.countryOfOrigin.toLowerCase().includes(term)) return true;
                if (Array.isArray(user.survey.disabilities) && user.survey.disabilities.some(d => d && d.toLowerCase().includes(term))) return true;
                if (user.survey.otherDisability && user.survey.otherDisability.toLowerCase().includes(term)) return true;
            }
            
            // Role and status
            if (user.role && user.role.toLowerCase().includes(term)) return true;
            if (user.isActive !== undefined) {
                if ((user.isActive && 'active'.includes(term)) || (!user.isActive && 'inactive'.includes(term))) return true;
            }
            if (user.emailVerified !== undefined) {
                if ((user.emailVerified && 'verified'.includes(term)) || (!user.emailVerified && 'unverified'.includes(term))) return true;
            }
            
            return false;
        };

        // Fetch ALL users matching the base query (without pagination) if search is provided
        // Otherwise, fetch with pagination for better performance
        let allUsers;
        if (searchTerm) {
            // Fetch all records for search filtering
            allUsers = await User.find(query)
                .select('-hashedPassword -refreshTokens')
                .populate('assignedBooth', 'name company')
                .sort({ createdAt: -1 })
                .lean();
        } else {
            // Fetch with pagination for better performance when no search
            const skip = (page - 1) * limit;
            allUsers = await User.find(query)
                .select('-hashedPassword -refreshTokens')
                .populate('assignedBooth', 'name company')
                .sort({ createdAt: -1 })
                .limit(limit * 1)
                .skip(skip)
                .lean();
        }

        // Apply search filter if provided
        let filteredUsers = allUsers;
        if (searchTerm) {
            filteredUsers = allUsers.filter(user => matchesSearch(user, searchTerm));
        }

        // Apply pagination if search was used (since we fetched all records)
        if (searchTerm) {
            const skip = (page - 1) * limit;
            filteredUsers = filteredUsers.slice(skip, skip + parseInt(limit));
        }

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
                assignedBooth: user.assignedBooth
            };
            return publicProfile;
        });

        // Calculate total count for pagination
        let totalCount;
        if (searchTerm) {
            // Count is based on filtered records
            totalCount = allUsers.filter(user => matchesSearch(user, searchTerm)).length;
        } else {
            // No search - count from database
            totalCount = await User.countDocuments(query);
        }
        
        logger.info(`Query returned ${users.length} users out of ${totalCount} total matching query`);

        // Calculate server-side stats for filtered results
        // For search, we need to recalculate stats from filtered results
        let activeCount, inactiveCount, verifiedCount;
        if (searchTerm) {
            const filteredForStats = allUsers.filter(user => matchesSearch(user, searchTerm));
            activeCount = filteredForStats.filter(u => u.isActive === true).length;
            inactiveCount = filteredForStats.filter(u => u.isActive === false).length;
            verifiedCount = filteredForStats.filter(u => u.emailVerified === true).length;
        } else {
            activeCount = await User.countDocuments({ ...query, isActive: true });
            inactiveCount = await User.countDocuments({ ...query, isActive: false });
            verifiedCount = await User.countDocuments({ ...query, emailVerified: true });
        }

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
