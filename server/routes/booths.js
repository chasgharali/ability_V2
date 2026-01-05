const express = require('express');
const { body, validationResult } = require('express-validator');
const Booth = require('../models/Booth');
const { authenticateToken, requireRole, requireResourceAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/booths
 * List booths (optionally by eventId)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { eventId, page = 1, limit = 50 } = req.query;
        const filter = {};
        if (eventId) filter.eventId = eventId;
        const skip = (parseInt(page) - 1) * parseInt(limit);

        const [items, total] = await Promise.all([
            Booth.find(filter).populate('eventId', 'name').sort({ createdAt: -1 }).skip(skip).limit(parseInt(limit)),
            Booth.countDocuments(filter)
        ]);

        res.json({
            booths: items.map(b => b.getSummary()),
            total,
            page: parseInt(page),
            limit: parseInt(limit)
        });
    } catch (error) {
        logger.error('List booths error:', error);
        res.status(500).json({ error: 'Failed to list booths' });
    }
});

/**
 * GET /api/booths/invite/:slug
 * Resolve a booth by its customInviteSlug or by name-token pattern
 * Returns booth info, event info, registration status, and event status
 */
router.get('/invite/:slug', authenticateToken, async (req, res) => {
    try {
        const { slug } = req.params;
        const { user } = req;
        
        // First, try to find by customInviteSlug
        let booth = await Booth.findOne({ customInviteSlug: slug }).populate('eventId', 'name slug logoUrl status start end isDemo');
        
        // If not found, try to match by name-token pattern (e.g., "meta-632814")
        if (!booth) {
            // Check if slug matches pattern: name-token (where token is 6 digits)
            const nameTokenPattern = /^(.+)-(\d{6})$/;
            const match = slug.match(nameTokenPattern);
            
            if (match) {
                const boothNamePart = match[1].toLowerCase(); // e.g., "meta"
                
                // Find all booths and filter by slugified name
                const allBooths = await Booth.find({}).populate('eventId', 'name slug logoUrl status start end isDemo');
                booth = allBooths.find(b => {
                    // Slugify the booth name for comparison (same logic as frontend)
                    const boothNameSlug = b.name
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-');
                    return boothNameSlug === boothNamePart;
                });
            } else {
                // If it doesn't match name-token pattern, try direct name match (for backward compatibility)
                const allBooths = await Booth.find({}).populate('eventId', 'name slug logoUrl status start end isDemo');
                booth = allBooths.find(b => {
                    const boothNameSlug = b.name
                        .toLowerCase()
                        .trim()
                        .replace(/[^a-z0-9\s-]/g, '')
                        .replace(/\s+/g, '-')
                        .replace(/-+/g, '-');
                    return boothNameSlug === slug.toLowerCase();
                });
            }
        }
        
        if (!booth) {
            return res.status(404).json({
                error: 'Booth not found',
                message: 'No booth found for this invite link'
            });
        }

        // Check if event is assigned to booth
        if (!booth.eventId) {
            return res.status(400).json({
                error: 'Event not assigned',
                message: 'This booth is not assigned to any event. You are unable to join this booth.',
                booth: booth.getPublicInfo(),
                boothId: booth._id,
                event: null,
                isRegistered: false,
                isEventUpcoming: false,
                canJoinQueue: false
            });
        }

        const event = booth.eventId;
        // Get event summary with virtuals
        const eventSummary = event.getSummary ? event.getSummary() : { 
            _id: event._id, 
            name: event.name, 
            slug: event.slug, 
            logoUrl: event.logoUrl, 
            status: event.status,
            start: event.start,
            end: event.end,
            isUpcoming: event.isUpcoming,
            isActive: event.isActive,
            isDemo: event.isDemo || false
        };
        
        // Ensure virtuals are computed if getSummary didn't include them
        if (!eventSummary.isUpcoming && event.start) {
            const now = new Date();
            eventSummary.isUpcoming = new Date(event.start) > now && ['published', 'active'].includes(event.status);
        }
        if (!eventSummary.isActive && event.start && event.end) {
            const now = new Date();
            eventSummary.isActive = event.status === 'active' && now >= new Date(event.start) && now <= new Date(event.end);
        }

        // Check if user is registered for the event
        let isRegistered = false;
        if (user && user.metadata && user.metadata.registeredEvents) {
            const registeredEvents = user.metadata.registeredEvents || [];
            isRegistered = registeredEvents.some(reg => 
                (reg.id && reg.id.toString() === event._id.toString()) ||
                (reg.slug && reg.slug === event.slug)
            );
        }

        // Check if event is upcoming/active using computed values
        const now = new Date();
        const eventStart = eventSummary.start ? new Date(eventSummary.start) : null;
        const eventEnd = eventSummary.end ? new Date(eventSummary.end) : null;
        const isEventUpcoming = eventSummary.isUpcoming || (eventStart && eventStart > now && ['published', 'active'].includes(eventSummary.status));
        const isEventActive = eventSummary.isActive || (eventStart && eventStart <= now && eventEnd && eventEnd >= now && eventSummary.status === 'active');
        const isEventPublished = ['published', 'active'].includes(eventSummary.status);
        const isDemoEvent = eventSummary.isDemo || false;

        // Determine if user can join queue
        // User can join if:
        // 1. They are registered AND
        // 2. Event is published/active (not draft or cancelled) AND
        // 3. Event hasn't ended (or is demo)
        const eventHasEnded = eventEnd && eventEnd < now;
        const canJoinQueue = isRegistered && isEventPublished && (!eventHasEnded || isDemoEvent);

        // Log for debugging
        logger.info(`Booth invite resolve: slug=${slug}, boothId=${booth._id}, eventId=${event._id}, isRegistered=${isRegistered}, isEventPublished=${isEventPublished}, eventHasEnded=${eventHasEnded}, isDemoEvent=${isDemoEvent}, canJoinQueue=${canJoinQueue}`);

        // Public info for job seekers
        res.json({
            booth: booth.getPublicInfo(),
            boothId: booth._id,
            event: eventSummary,
            isRegistered,
            isEventUpcoming,
            canJoinQueue
        });
    } catch (error) {
        logger.error('Resolve booth by invite slug error:', error);
        res.status(500).json({ error: 'Failed to resolve invite link' });
    }
});

/**
 * POST /api/booths
 * Create booths for one or more events
 */
router.post('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), [
    body('name').isString().trim().isLength({ min: 2, max: 200 }),
    body('description').optional().isString(),
    body('logoUrl').optional().isURL(),
    body('companyPage').optional().isURL(),
    body('recruitersCount').optional().isInt({ min: 1 }),
    body('expireLinkTime').optional().isISO8601().toDate(),
    body('customInviteSlug').optional().isString().toLowerCase().matches(/^[a-z0-9-]+$/).withMessage('Custom invite must be lowercase letters, numbers, and dashes only'),
    body('joinBoothButtonLink').optional().isString().trim(),
    body('richSections').optional().isArray({ max: 3 }),
    body('richSections.*.title').optional().isString().isLength({ min: 1, max: 100 }),
    body('richSections.*.contentHtml').optional().isString().isLength({ min: 0, max: 5000 }),
    body('eventIds').isArray({ min: 1 }).withMessage('eventIds must be a non-empty array'),
    body('eventIds.*').isMongoId().withMessage('Each eventId must be a valid id')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { name, description, logoUrl, companyPage, recruitersCount, expireLinkTime, customInviteSlug, joinBoothButtonLink, richSections = [], eventIds } = req.body;
        const Event = require('../models/Event');

        const created = [];
        const skipped = [];

        // Check customInviteSlug uniqueness ahead of time (if provided)
        if (customInviteSlug) {
            const exists = await Booth.findOne({ customInviteSlug });
            if (exists) {
                return res.status(409).json({ error: 'Custom invite already taken' });
            }
        }

        for (const eid of eventIds) {
            const ev = await Event.findById(eid);
            if (!ev) { skipped.push({ eventId: eid, reason: 'Event not found' }); continue; }

            // Enforce booth limit if configured
            const maxBooths = ev?.limits?.maxBooths || 0; // 0 = unlimited
            if (maxBooths > 0) {
                const current = await Booth.countDocuments({ eventId: eid });
                if (current >= maxBooths) {
                    skipped.push({ eventId: eid, reason: 'Limit reached' });
                    continue;
                }
            }

            const booth = await Booth.create({
                eventId: eid,
                name,
                description: description || '',
                logoUrl: logoUrl || null,
                companyPage: companyPage || '',
                recruitersCount: recruitersCount || 1,
                expireLinkTime: expireLinkTime || null,
                customInviteSlug: customInviteSlug || undefined,
                joinBoothButtonLink: joinBoothButtonLink || '',
                richSections: (richSections || []).slice(0, 3).map((s, index) => ({
                    title: s.title || `Section ${index + 1}`,
                    contentHtml: s.contentHtml || '',
                    isActive: s.isActive !== false,
                    order: s.order ?? index
                }))
            });

            // Add booth to event's booths array
            await Event.findByIdAndUpdate(eid, { $addToSet: { booths: booth._id } });

            created.push(booth.getSummary());
        }

        res.status(created.length ? 201 : 200).json({
            message: created.length ? 'Booth(s) created' : 'No booths created',
            created,
            skipped
        });
    } catch (error) {
        logger.error('Create booths error:', error);
        res.status(500).json({ error: 'Failed to create booths' });
    }
});

/**
 * DELETE /api/booths/bulk-delete
 * Bulk delete booths (Admin/GlobalSupport/AdminEvent only)
 */
router.delete('/bulk-delete', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'AdminEvent']), async (req, res) => {
    try {
        const { boothIds } = req.body;
        const { user } = req;
        const Event = require('../models/Event');

        if (!boothIds || !Array.isArray(boothIds) || boothIds.length === 0) {
            return res.status(400).json({ message: 'No booth IDs provided' });
        }

        // Find all booths to be deleted
        const boothsToDelete = await Booth.find({ _id: { $in: boothIds } });

        // For AdminEvent role, only allow deletion of booths they manage
        if (user.role === 'AdminEvent') {
            const unauthorizedBooths = boothsToDelete.filter(booth => {
                // Check if user can access the event this booth belongs to
                const event = booth.eventId;
                if (!event || !event.canUserAccess) {
                    // If event is populated, check access
                    if (typeof event === 'object' && event.administrators) {
                        return !event.administrators.some(adminId => adminId.toString() === user._id.toString());
                    }
                    return true;
                }
                return !event.canUserAccess(user);
            });
            
            if (unauthorizedBooths.length > 0) {
                return res.status(403).json({
                    message: 'You do not have permission to delete some of the selected booths',
                    error: 'Access denied'
                });
            }
        }

        // Get unique event IDs
        const eventIds = [...new Set(boothsToDelete.map(b => b.eventId?.toString() || b.eventId).filter(Boolean))];

        // Remove booths from events' booths arrays
        for (const eventId of eventIds) {
            const boothIdsForEvent = boothsToDelete
                .filter(b => (b.eventId?.toString() || b.eventId) === eventId)
                .map(b => b._id);
            
            if (boothIdsForEvent.length > 0) {
                await Event.findByIdAndUpdate(eventId, { $pull: { booths: { $in: boothIdsForEvent } } });
            }
        }

        // Delete the booths
        const result = await Booth.deleteMany({
            _id: { $in: boothIds }
        });

        logger.info(`Bulk deleted ${result.deletedCount} booths by ${user.email}`);

        res.json({
            message: `Successfully deleted ${result.deletedCount} booth(s)`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        logger.error('Bulk delete booths error:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
        });
    }
});

/**
 * DELETE /api/booths/:id
 * Delete a booth
 */
router.delete('/:id', authenticateToken, requireResourceAccess('booth', 'id'), async (req, res) => {
    try {
        const { booth, user } = req;
        const Event = require('../models/Event');

        // Remove booth from event's booths array
        await Event.findByIdAndUpdate(booth.eventId, { $pull: { booths: booth._id } });

        await booth.deleteOne();
        logger.info(`Booth deleted: ${booth._id} by ${user.email}`);
        res.json({ message: 'Booth deleted' });
    } catch (error) {
        logger.error('Delete booth error:', error);
        res.status(500).json({ error: 'Failed to delete booth' });
    }
});
/**
 * GET /api/booths/:id
 * Get booth details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const booth = await Booth.findById(id).populate('eventId', 'name slug description link sendyId logoUrl start end timezone status administrators createdBy booths limits theme termsIds createdAt');
        if (!booth) {
            return res.status(404).json({
                error: 'Booth not found',
                message: 'The specified booth does not exist'
            });
        }

        // Check if user can access this booth (guard against missing fields)
        const canManage = typeof booth.canUserManage === 'function' ? booth.canUserManage(user) : false;
        const canAccessEvent = booth.eventId && typeof booth.eventId.canUserAccess === 'function'
            ? booth.eventId.canUserAccess(user)
            : false;
        if (!canManage && !canAccessEvent) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this booth'
            });
        }

        // Return appropriate data based on user role
        const boothData = user?.role === 'JobSeeker'
            ? (typeof booth.getPublicInfo === 'function' ? booth.getPublicInfo() : booth)
            : (typeof booth.getSummary === 'function' ? booth.getSummary() : booth);

        res.json({
            booth: boothData,
            event: booth.eventId && typeof booth.eventId.getSummary === 'function'
                ? booth.eventId.getSummary()
                : (booth.eventId || null)
        });
    } catch (error) {
        logger.error('Get booth error:', error);
        res.status(500).json({
            error: 'Failed to retrieve booth',
            message: 'An error occurred while retrieving the booth'
        });
    }
});

/**
 * PUT /api/booths/:id
 * Update booth details
 */
router.put('/:id', authenticateToken, requireResourceAccess('booth', 'id'), [
    body('name')
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Booth name must be between 2 and 200 characters'),
    body('description')
        .optional()
        .trim(),
    body('logoUrl')
        .optional()
        .isURL()
        .withMessage('Logo URL must be a valid URL'),
    body('companyPage')
        .optional()
        .isURL()
        .withMessage('Company page must be a valid URL'),
    body('recruitersCount')
        .optional()
        .isInt({ min: 1 })
        .withMessage('Recruiters count must be at least 1'),
    body('expireLinkTime')
        .optional({ nullable: true, checkFalsy: true })
        .custom((value) => {
            // Allow null, undefined, empty string, or string "null"
            if (value === null || value === undefined || value === '' || value === 'null' || String(value).toLowerCase() === 'null') {
                return true;
            }
            // For non-empty values, validate as ISO8601 date
            const validator = require('validator');
            return validator.isISO8601(String(value));
        }),
    body('customInviteSlug')
        .optional()
        .isString()
        .toLowerCase()
        .custom((value) => {
            if (value === '' || value === null || value === undefined) return true;
            return /^[a-z0-9-]+$/.test(value);
        })
        .withMessage('Custom invite must be lowercase letters, numbers, and dashes only'),
    body('joinBoothButtonLink')
        .optional()
        .isString()
        .trim(),
    body('eventId')
        .optional()
        .isMongoId()
        .withMessage('Event ID must be a valid MongoDB ObjectId'),
    body('status')
        .optional()
        .isIn(['active', 'inactive', 'maintenance'])
        .withMessage('Invalid status')
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

        const { name, description, logoUrl, status, companyPage, recruitersCount, expireLinkTime, customInviteSlug, joinBoothButtonLink, eventId } = req.body;
        const { booth, user } = req;
        const Event = require('../models/Event');

        // CRITICAL FIX: If expireLinkTime is stored as string "null" in DB, fix it directly in database first
        // This must happen before any validation or save operations
        const existingExpireLinkTime = booth.expireLinkTime;
        if (existingExpireLinkTime !== null && existingExpireLinkTime !== undefined) {
            const existingValueStr = String(existingExpireLinkTime);
            if (existingValueStr === 'null' || existingValueStr.toLowerCase() === 'null') {
                // Directly update in database to fix the corrupted value (bypass validation)
                await Booth.findByIdAndUpdate(booth._id, { $set: { expireLinkTime: null } }, { runValidators: false });
                // CRITICAL: Reload the entire booth document to get the fixed value
                // We need to get a fresh instance from the database
                const reloadedBooth = await Booth.findById(booth._id);
                if (reloadedBooth) {
                    // Replace the booth object's expireLinkTime with the fixed value
                    booth.expireLinkTime = reloadedBooth.expireLinkTime;
                    // Mark it as modified so it doesn't get overwritten
                    booth.markModified('expireLinkTime');
                }
            }
        }

        // Check if this is a demo event - if so, skip expireLinkTime validation
        let isDemoEvent = false;
        if (booth.eventId) {
            try {
                const event = await Event.findById(booth.eventId);
                isDemoEvent = event && event.isDemo;
            } catch (err) {
                // If event lookup fails, continue without demo check
                logger.warn(`Could not check if event is demo for booth ${booth._id}:`, err);
            }
        }

        // Build update object - use findByIdAndUpdate to bypass validation issues
        const updateData = {};
        if (name !== undefined) updateData.name = name;
        if (description !== undefined) updateData.description = description;
        if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
        if (companyPage !== undefined) updateData.companyPage = companyPage;
        if (recruitersCount !== undefined) updateData.recruitersCount = recruitersCount;
        
        // Handle expireLinkTime - always convert string "null" to actual null
        if (expireLinkTime !== undefined) {
            let processedValue = expireLinkTime;
            if (typeof processedValue === 'string' && (processedValue === 'null' || processedValue.toLowerCase() === 'null' || processedValue === '')) {
                processedValue = null;
            } else if (processedValue === null || processedValue === undefined || processedValue === '') {
                processedValue = null;
            } else if (typeof processedValue === 'string') {
                const parsedDate = new Date(processedValue);
                processedValue = isNaN(parsedDate.getTime()) ? null : parsedDate;
            }
            updateData.expireLinkTime = processedValue;
        }
        
        if (customInviteSlug !== undefined) {
            const slugValue = customInviteSlug === '' ? undefined : customInviteSlug;
            if (slugValue) {
                const exists = await Booth.findOne({ customInviteSlug: slugValue, _id: { $ne: booth._id } });
                if (exists) {
                    return res.status(409).json({ error: 'Custom invite already taken' });
                }
            }
            updateData.customInviteSlug = slugValue;
        }
        if (joinBoothButtonLink !== undefined) updateData.joinBoothButtonLink = joinBoothButtonLink;
        if (eventId !== undefined) {
            const targetEvent = await Event.findById(eventId);
            if (!targetEvent) {
                return res.status(404).json({ error: 'Event not found' });
            }
            updateData.eventId = eventId;
        }
        if (status !== undefined) updateData.status = status;

        // Use findByIdAndUpdate - this bypasses the corrupted value issue
        // The setter in the model will handle conversion when the new value is set
        const updatedBooth = await Booth.findByIdAndUpdate(
            booth._id,
            { $set: updateData },
            { new: true, runValidators: true }
        );

        if (!updatedBooth) {
            return res.status(404).json({ error: 'Booth not found' });
        }

        logger.info(`Booth updated: ${updatedBooth.name} by ${user.email}`);

        res.json({
            message: 'Booth updated successfully',
            booth: updatedBooth.getSummary()
        });
    } catch (error) {
        logger.error('Update booth error:', error);
        // Log the full error details for debugging
        logger.error('Update booth error details:', {
            message: error.message,
            stack: error.stack,
            name: error.name
        });
        res.status(500).json({
            error: 'Failed to update booth',
            message: error.message || 'An error occurred while updating the booth',
            details: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

/**
 * PUT /api/booths/:id/rich-sections
 * Update booth rich content sections
 */
router.put('/:id/rich-sections', authenticateToken, requireResourceAccess('booth', 'id'), [
    body('sections')
        .isArray({ min: 1, max: 3 })
        .withMessage('Must provide 1-3 sections'),
    body('sections.*.title')
        .trim()
        .isLength({ min: 1, max: 100 })
        .withMessage('Section title must be between 1 and 100 characters'),
    body('sections.*.contentHtml')
        .trim()
        .isLength({ min: 0, max: 5000 })
        .withMessage('Section content must be between 0 and 5000 characters'),
    body('sections.*.isActive')
        .optional()
        .isBoolean()
        .withMessage('Section active status must be boolean'),
    body('sections.*.order')
        .optional()
        .isInt({ min: 0, max: 2 })
        .withMessage('Section order must be between 0 and 2')
], async (req, res) => {
    try {
        const { sections } = req.body;
        const { booth, user } = req;
        const Event = require('../models/Event');
        
        // CRITICAL FIX: If expireLinkTime is stored as string "null" in DB, fix it directly in database first
        const existingExpireLinkTime = booth.expireLinkTime;
        if (existingExpireLinkTime !== null && existingExpireLinkTime !== undefined) {
            const existingValueStr = String(existingExpireLinkTime);
            if (existingValueStr === 'null' || existingValueStr.toLowerCase() === 'null') {
                await Booth.findByIdAndUpdate(booth._id, { $set: { expireLinkTime: null } }, { runValidators: false });
                const reloadedBooth = await Booth.findById(booth._id);
                if (reloadedBooth) {
                    booth.expireLinkTime = reloadedBooth.expireLinkTime;
                }
            }
        }
        
        // Check if this is a demo event - if so, allow empty content
        let isDemoEvent = false;
        if (booth.eventId) {
            try {
                const event = await Event.findById(booth.eventId);
                isDemoEvent = event && event.isDemo;
            } catch (err) {
                logger.warn(`Could not check if event is demo for booth ${booth._id}:`, err);
            }
        }
        
        // For demo events, allow empty contentHtml. For regular events, validate content is not empty
        if (!isDemoEvent) {
            for (let i = 0; i < sections.length; i++) {
                if (!sections[i].contentHtml || sections[i].contentHtml.trim() === '') {
                    return res.status(400).json({
                        error: 'Validation failed',
                        message: 'Please check your input data',
                        details: [{
                            type: 'field',
                            value: sections[i].contentHtml,
                            msg: 'Section content must be between 1 and 5000 characters',
                            path: `sections[${i}].contentHtml`,
                            location: 'body'
                        }]
                    });
                }
            }
        }
        
        // Check for other validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        // Prepare rich sections - for demo events, allow empty contentHtml
        const richSectionsData = sections.map((section, index) => ({
            title: section.title,
            contentHtml: section.contentHtml || '', // Allow empty for demo events
            isActive: section.isActive !== undefined ? section.isActive : true,
            order: section.order !== undefined ? section.order : index
        }));

        // Use findByIdAndUpdate to bypass validation issues
        const updatedBooth = await Booth.findByIdAndUpdate(
            booth._id,
            { $set: { richSections: richSectionsData } },
            { new: true, runValidators: true }
        );

        if (!updatedBooth) {
            return res.status(404).json({ error: 'Booth not found' });
        }

        logger.info(`Booth rich sections updated: ${updatedBooth.name} by ${user.email}`);

        res.json({
            message: 'Rich sections updated successfully',
            sections: updatedBooth.richSections
        });
    } catch (error) {
        logger.error('Update booth rich sections error:', error);
        res.status(500).json({
            error: 'Failed to update rich sections',
            message: 'An error occurred while updating the rich sections'
        });
    }
});

/**
 * PUT /api/booths/:id/settings
 * Update booth settings
 */
router.put('/:id/settings', authenticateToken, requireResourceAccess('booth', 'id'), [
    body('queueSettings.maxQueueSize')
        .optional()
        .isInt({ min: 1, max: 200 })
        .withMessage('Max queue size must be between 1 and 200'),
    body('queueSettings.estimatedWaitTime')
        .optional()
        .isInt({ min: 1, max: 120 })
        .withMessage('Estimated wait time must be between 1 and 120 minutes'),
    body('queueSettings.allowQueueJoining')
        .optional()
        .isBoolean()
        .withMessage('Allow queue joining must be boolean'),
    body('callSettings.maxCallDuration')
        .optional()
        .isInt({ min: 5, max: 120 })
        .withMessage('Max call duration must be between 5 and 120 minutes'),
    body('callSettings.allowInterpreterRequests')
        .optional()
        .isBoolean()
        .withMessage('Allow interpreter requests must be boolean'),
    body('callSettings.requireInterpreterApproval')
        .optional()
        .isBoolean()
        .withMessage('Require interpreter approval must be boolean'),
    body('displaySettings.showLogo')
        .optional()
        .isBoolean()
        .withMessage('Show logo must be boolean'),
    body('displaySettings.showDescription')
        .optional()
        .isBoolean()
        .withMessage('Show description must be boolean'),
    body('displaySettings.showRichSections')
        .optional()
        .isBoolean()
        .withMessage('Show rich sections must be boolean')
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

        const { queueSettings, callSettings, displaySettings } = req.body;
        const { booth, user } = req;

        // Update settings
        if (queueSettings) {
            if (queueSettings.maxQueueSize !== undefined) {
                booth.settings.queueSettings.maxQueueSize = queueSettings.maxQueueSize;
            }
            if (queueSettings.estimatedWaitTime !== undefined) {
                booth.settings.queueSettings.estimatedWaitTime = queueSettings.estimatedWaitTime;
            }
            if (queueSettings.allowQueueJoining !== undefined) {
                booth.settings.queueSettings.allowQueueJoining = queueSettings.allowQueueJoining;
            }
        }

        if (callSettings) {
            if (callSettings.maxCallDuration !== undefined) {
                booth.settings.callSettings.maxCallDuration = callSettings.maxCallDuration;
            }
            if (callSettings.allowInterpreterRequests !== undefined) {
                booth.settings.callSettings.allowInterpreterRequests = callSettings.allowInterpreterRequests;
            }
            if (callSettings.requireInterpreterApproval !== undefined) {
                booth.settings.callSettings.requireInterpreterApproval = callSettings.requireInterpreterApproval;
            }
        }

        if (displaySettings) {
            if (displaySettings.showLogo !== undefined) {
                booth.settings.displaySettings.showLogo = displaySettings.showLogo;
            }
            if (displaySettings.showDescription !== undefined) {
                booth.settings.displaySettings.showDescription = displaySettings.showDescription;
            }
            if (displaySettings.showRichSections !== undefined) {
                booth.settings.displaySettings.showRichSections = displaySettings.showRichSections;
            }
        }

        await booth.save();

        logger.info(`Booth settings updated: ${booth.name} by ${user.email}`);

        res.json({
            message: 'Booth settings updated successfully',
            settings: booth.settings
        });
    } catch (error) {
        logger.error('Update booth settings error:', error);
        res.status(500).json({
            error: 'Failed to update booth settings',
            message: 'An error occurred while updating the booth settings'
        });
    }
});

/**
 * POST /api/booths/:id/administrators
 * Add administrator to booth
 */
router.post('/:id/administrators', authenticateToken, requireResourceAccess('booth', 'id'), [
    body('userId')
        .isMongoId()
        .withMessage('Valid user ID is required')
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

        const { userId } = req.body;
        const { booth, user } = req;

        // Check if user is already an administrator
        if (booth.administrators.includes(userId)) {
            return res.status(409).json({
                error: 'User already administrator',
                message: 'This user is already an administrator of this booth'
            });
        }

        // Add administrator
        booth.administrators.push(userId);
        await booth.save();

        logger.info(`Administrator added to booth ${booth.name}: ${userId} by ${user.email}`);

        res.json({
            message: 'Administrator added successfully',
            administrators: booth.administrators
        });
    } catch (error) {
        logger.error('Add booth administrator error:', error);
        res.status(500).json({
            error: 'Failed to add administrator',
            message: 'An error occurred while adding the administrator'
        });
    }
});

/**
 * DELETE /api/booths/:id/administrators/:userId
 * Remove administrator from booth
 */
router.delete('/:id/administrators/:userId', authenticateToken, requireResourceAccess('booth', 'id'), async (req, res) => {
    try {
        const { userId } = req.params;
        const { booth, user } = req;

        // Check if user is an administrator
        if (!booth.administrators.includes(userId)) {
            return res.status(404).json({
                error: 'User not administrator',
                message: 'This user is not an administrator of this booth'
            });
        }

        // Remove administrator
        booth.administrators = booth.administrators.filter(adminId => !adminId.equals(userId));
        await booth.save();

        logger.info(`Administrator removed from booth ${booth.name}: ${userId} by ${user.email}`);

        res.json({
            message: 'Administrator removed successfully',
            administrators: booth.administrators
        });
    } catch (error) {
        logger.error('Remove booth administrator error:', error);
        res.status(500).json({
            error: 'Failed to remove administrator',
            message: 'An error occurred while removing the administrator'
        });
    }
});

/**
 * GET /api/booths/:id/stats
 * Get booth statistics
 */
router.get('/:id/stats', authenticateToken, requireResourceAccess('booth', 'id'), async (req, res) => {
    try {
        const { booth, user } = req;
        const { startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.createdAt = {};
            if (startDate) dateFilter.createdAt.$gte = new Date(startDate);
            if (endDate) dateFilter.createdAt.$lte = new Date(endDate);
        }

        // Get queue statistics
        const Queue = require('../models/Queue');
        const queue = await Queue.findOne({ boothId: booth._id });

        let queueStats = null;
        if (queue) {
            queueStats = {
                totalTokensIssued: queue.stats.totalTokensIssued,
                totalServed: queue.stats.totalServed,
                totalLeft: queue.stats.totalLeft,
                averageWaitTime: queue.stats.averageWaitTime,
                averageServiceTime: queue.stats.averageServiceTime,
                currentLength: queue.currentLength,
                currentServing: queue.currentServing
            };
        }

        // Get meeting statistics
        const MeetingRecord = require('../models/MeetingRecord');
        const meetingStats = await MeetingRecord.aggregate([
            { $match: { boothId: booth._id, ...dateFilter } },
            {
                $group: {
                    _id: null,
                    totalMeetings: { $sum: 1 },
                    totalDuration: { $sum: '$duration' },
                    averageRating: { $avg: '$feedback.rating' },
                    totalInterpreterRequests: { $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] } }
                }
            }
        ]);

        const stats = meetingStats[0] || {
            totalMeetings: 0,
            totalDuration: 0,
            averageRating: 0,
            totalInterpreterRequests: 0
        };

        res.json({
            booth: booth.getSummary(),
            stats: {
                ...booth.stats,
                queue: queueStats,
                meetings: {
                    totalMeetings: stats.totalMeetings,
                    totalDuration: stats.totalDuration,
                    averageRating: Math.round(stats.averageRating * 10) / 10,
                    totalInterpreterRequests: stats.totalInterpreterRequests
                }
            }
        });
    } catch (error) {
        logger.error('Get booth stats error:', error);
        res.status(500).json({
            error: 'Failed to retrieve booth statistics',
            message: 'An error occurred while retrieving booth statistics'
        });
    }
});

module.exports = router;
