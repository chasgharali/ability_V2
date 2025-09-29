const express = require('express');
const { body, validationResult } = require('express-validator');
const Event = require('../models/Event');
const Booth = require('../models/Booth');
const { authenticateToken, requireRole, requireResourceAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/events
 * Get list of events
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { status, upcoming, active, page = 1, limit = 20 } = req.query;

        // Build query based on user role and filters
        let query = {};

        // Non-admin users can only see published/active events
        if (!['Admin', 'GlobalSupport', 'AdminEvent'].includes(user.role)) {
            query.status = { $in: ['published', 'active'] };
        }

        // Apply status filter
        if (status) {
            query.status = status;
        }

        // Apply time-based filters
        if (upcoming === 'true') {
            query.start = { $gt: new Date() };
        } else if (active === 'true') {
            const now = new Date();
            query.start = { $lte: now };
            query.end = { $gte: now };
            query.status = 'active';
        }

        // Find events
        const events = await Event.find(query)
            .populate('createdBy', 'name email')
            .populate('administrators', 'name email')
            .sort({ start: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const totalCount = await Event.countDocuments(query);

        res.json({
            events: events.map(event => event.getSummary()),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });

        /**
         * GET /api/events/slug/:slug
         * Get event details by slug
         */
        router.get('/slug/:slug', authenticateToken, async (req, res) => {
            try {
                const { slug } = req.params;
                const { user } = req;

                const event = await Event.findOne({ slug })
                    .populate('createdBy', 'name email')
                    .populate('administrators', 'name email')
                    .populate('booths', 'name description logoUrl status');

                if (!event) {
                    return res.status(404).json({
                        error: 'Event not found',
                        message: 'The specified event does not exist'
                    });
                }

                if (!event.canUserAccess(user)) {
                    return res.status(403).json({
                        error: 'Access denied',
                        message: 'You do not have permission to view this event'
                    });
                }

                res.json({
                    event: {
                        ...event.toObject(),
                        isActive: event.isActive,
                        isUpcoming: event.isUpcoming,
                        duration: event.duration
                    }
                });
            } catch (error) {
                logger.error('Get event by slug error:', error);
                res.status(500).json({
                    error: 'Failed to retrieve event',
                    message: 'An error occurred while retrieving the event'
                });
            }
        });
    } catch (error) {
        logger.error('Get events error:', error);
        res.status(500).json({
            error: 'Failed to retrieve events',
            message: 'An error occurred while retrieving events'
        });
    }
});

/**
 * GET /api/events/:id
 * Get event details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const event = await Event.findById(id)
            .populate('createdBy', 'name email')
            .populate('administrators', 'name email')
            .populate('booths', 'name description logoUrl status');

        if (!event) {
            return res.status(404).json({
                error: 'Event not found',
                message: 'The specified event does not exist'
            });
        }

        // Check if user can access this event
        if (!event.canUserAccess(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this event'
            });
        }

        res.json({
            event: {
                ...event.toObject(),
                isActive: event.isActive,
                isUpcoming: event.isUpcoming,
                duration: event.duration
            }
        });
    } catch (error) {
        logger.error('Get event error:', error);
        res.status(500).json({
            error: 'Failed to retrieve event',
            message: 'An error occurred while retrieving the event'
        });
    }
});

/**
 * POST /api/events
 * Create a new event
 */
router.post('/', authenticateToken, requireRole(['AdminEvent', 'Admin']), [
    body('name')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Event name must be between 2 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description cannot exceed 1000 characters'),
    body('start')
        .isISO8601()
        .withMessage('Start time must be a valid ISO 8601 date'),
    body('end')
        .isISO8601()
        .withMessage('End time must be a valid ISO 8601 date'),
    body('timezone')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Timezone cannot exceed 50 characters'),
    body('logoUrl')
        .optional()
        .isURL()
        .withMessage('Logo URL must be a valid URL'),
    body('sendyId').optional().isLength({ max: 200 }),
    body('link').optional().isURL(),
    body('termsId').optional().isLength({ max: 200 }),
    body('limits.maxBooths').optional().isInt({ min: 0 }),
    body('limits.maxRecruitersPerEvent').optional().isInt({ min: 0 }),
    body('theme').optional().isObject(),
    body('theme.addFooter').optional().isBoolean(),
    body('termsIds').optional().isArray().withMessage('termsIds must be an array'),
    body('termsIds.*').optional().isMongoId().withMessage('Each terms id must be a valid id')
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

        const { name, description, start, end, timezone = 'UTC', logoUrl, sendyId, link, limits, theme, termsId, termsIds } = req.body;
        const { user } = req;

        // Validate date range
        const startDate = new Date(start);
        const endDate = new Date(end);

        if (endDate <= startDate) {
            return res.status(400).json({
                error: 'Invalid date range',
                message: 'End time must be after start time'
            });
        }

        // Create new event
        const event = new Event({
            name,
            description,
            start: startDate,
            end: endDate,
            timezone,
            logoUrl,
            sendyId: sendyId || null,
            link: link || null,
            limits: {
                maxBooths: limits?.maxBooths ?? 0,
                maxRecruitersPerEvent: limits?.maxRecruitersPerEvent ?? 0
            },
            theme: theme || undefined,
            termsId: termsId || null,
            termsIds: Array.isArray(termsIds) ? termsIds : [],
            createdBy: user._id,
            administrators: [user._id]
        });

        await event.save();

        logger.info(`Event created: ${name} by ${user.email}`);

        res.status(201).json({
            message: 'Event created successfully',
            event: event.getSummary()
        });
    } catch (error) {
        logger.error('Create event error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Event already exists',
                message: 'An event with this name already exists'
            });
        }

        res.status(500).json({
            error: 'Failed to create event',
            message: 'An error occurred while creating the event'
        });
    }
});

/**
 * PUT /api/events/:id
 * Update an event
 */
router.put('/:id', authenticateToken, requireResourceAccess('event', 'id'), [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Event name must be between 2 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description cannot exceed 1000 characters'),
    body('start')
        .optional()
        .isISO8601()
        .withMessage('Start time must be a valid ISO 8601 date'),
    body('end')
        .optional()
        .isISO8601()
        .withMessage('End time must be a valid ISO 8601 date'),
    body('timezone')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Timezone cannot exceed 50 characters'),
    body('logoUrl')
        .optional()
        .isURL()
        .withMessage('Logo URL must be a valid URL'),
    body('sendyId').optional().isLength({ max: 200 }),
    body('status')
        .optional()
        .isIn(['draft', 'published', 'active', 'completed', 'cancelled'])
        .withMessage('Invalid status'),
    body('limits.maxBooths')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Max booths must be a non-negative integer'),
    body('limits.maxRecruitersPerEvent')
        .optional()
        .isInt({ min: 0 })
        .withMessage('Max recruiters per event must be a non-negative integer')
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

        const { name, description, start, end, timezone, logoUrl, status, sendyId, limits, theme } = req.body;
        const { event, user } = req;

        // Update allowed fields
        if (name !== undefined) event.name = name;
        if (description !== undefined) event.description = description;
        if (start !== undefined) event.start = new Date(start);
        if (end !== undefined) event.end = new Date(end);
        if (timezone !== undefined) event.timezone = timezone;
        if (logoUrl !== undefined) event.logoUrl = logoUrl;
        if (sendyId !== undefined) event.sendyId = sendyId || null;
        if (status !== undefined) event.status = status;

        // Update limits if provided
        if (limits !== undefined) {
            if (limits.maxBooths !== undefined) event.limits.maxBooths = limits.maxBooths;
            if (limits.maxRecruitersPerEvent !== undefined) event.limits.maxRecruitersPerEvent = limits.maxRecruitersPerEvent;
        }

        // Update theme if provided
        if (theme !== undefined) {
            if (theme.headerColor !== undefined) event.theme.headerColor = theme.headerColor;
            if (theme.headerTextColor !== undefined) event.theme.headerTextColor = theme.headerTextColor;
            if (theme.bodyColor !== undefined) event.theme.bodyColor = theme.bodyColor;
            if (theme.bodyTextColor !== undefined) event.theme.bodyTextColor = theme.bodyTextColor;
            if (theme.sidebarColor !== undefined) event.theme.sidebarColor = theme.sidebarColor;
            if (theme.sidebarTextColor !== undefined) event.theme.sidebarTextColor = theme.sidebarTextColor;
            if (theme.btnPrimaryColor !== undefined) event.theme.btnPrimaryColor = theme.btnPrimaryColor;
            if (theme.btnPrimaryTextColor !== undefined) event.theme.btnPrimaryTextColor = theme.btnPrimaryTextColor;
            if (theme.btnSecondaryColor !== undefined) event.theme.btnSecondaryColor = theme.btnSecondaryColor;
            if (theme.btnSecondaryTextColor !== undefined) event.theme.btnSecondaryTextColor = theme.btnSecondaryTextColor;
            if (theme.entranceFormColor !== undefined) event.theme.entranceFormColor = theme.entranceFormColor;
            if (theme.entranceFormTextColor !== undefined) event.theme.entranceFormTextColor = theme.entranceFormTextColor;
            if (theme.chatHeaderColor !== undefined) event.theme.chatHeaderColor = theme.chatHeaderColor;
            if (theme.chatSidebarColor !== undefined) event.theme.chatSidebarColor = theme.chatSidebarColor;
            if (theme.addFooter !== undefined) event.theme.addFooter = theme.addFooter;
        }

        // Validate date range if both dates are provided
        if (start !== undefined && end !== undefined) {
            if (event.end <= event.start) {
                return res.status(400).json({
                    error: 'Invalid date range',
                    message: 'End time must be after start time'
                });
            }
        }

        await event.save();

        logger.info(`Event updated: ${event.name} by ${user.email}`);

        res.json({
            message: 'Event updated successfully',
            event: event.getSummary()
        });
    } catch (error) {
        logger.error('Update event error:', error);
        res.status(500).json({
            error: 'Failed to update event',
            message: 'An error occurred while updating the event'
        });
    }
});

/**
 * DELETE /api/events/:id
 * Delete an event
 */
router.delete('/:id', authenticateToken, requireResourceAccess('event', 'id'), async (req, res) => {
    try {
        const { event, user } = req;

        // Check if event has active booths or meetings
        const activeBooths = await Booth.countDocuments({ eventId: event._id, status: 'active' });
        if (activeBooths > 0) {
            return res.status(400).json({
                error: 'Cannot delete event',
                message: 'Event has active booths. Please deactivate all booths first.'
            });
        }

        // Delete associated booths
        await Booth.deleteMany({ eventId: event._id });

        // Delete the event
        await Event.findByIdAndDelete(event._id);

        logger.info(`Event deleted: ${event.name} by ${user.email}`);

        res.json({
            message: 'Event deleted successfully'
        });
    } catch (error) {
        logger.error('Delete event error:', error);
        res.status(500).json({
            error: 'Failed to delete event',
            message: 'An error occurred while deleting the event'
        });
    }
});

/**
 * GET /api/events/:id/booths
 * Get booths for an event
 */
router.get('/:id/booths', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const event = await Event.findById(id);
        if (!event) {
            return res.status(404).json({
                error: 'Event not found',
                message: 'The specified event does not exist'
            });
        }

        // Check if user can access this event
        if (!event.canUserAccess(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this event'
            });
        }

        const booths = await Booth.findByEvent(id);

        // Return public info for job seekers, full info for others
        const boothData = user.role === 'JobSeeker'
            ? booths.map(booth => booth.getPublicInfo())
            : booths.map(booth => booth.getSummary());

        res.json({
            event: event.getSummary(),
            booths: boothData
        });
    } catch (error) {
        logger.error('Get event booths error:', error);
        res.status(500).json({
            error: 'Failed to retrieve event booths',
            message: 'An error occurred while retrieving event booths'
        });
    }
});

/**
 * POST /api/events/:id/booths
 * Create a booth for an event
 */
router.post('/:id/booths', authenticateToken, requireResourceAccess('event', 'id'), requireRole(['BoothAdmin', 'AdminEvent', 'Admin']), [
    body('name')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Booth name must be between 2 and 200 characters'),
    body('description')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description cannot exceed 1000 characters'),
    body('logoUrl')
        .optional()
        .isURL()
        .withMessage('Logo URL must be a valid URL')
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

        const { name, description, logoUrl } = req.body;
        const { event, user } = req;

        // Create new booth
        const booth = new Booth({
            eventId: event._id,
            name,
            description,
            logoUrl,
            administrators: [user._id]
        });

        await booth.save();

        // Add booth to event
        event.booths.push(booth._id);
        await event.save();

        logger.info(`Booth created: ${name} for event ${event.name} by ${user.email}`);

        res.status(201).json({
            message: 'Booth created successfully',
            booth: booth.getSummary()
        });
    } catch (error) {
        logger.error('Create booth error:', error);
        res.status(500).json({
            error: 'Failed to create booth',
            message: 'An error occurred while creating the booth'
        });
    }
});

module.exports = router;
