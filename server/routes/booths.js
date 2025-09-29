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
 * POST /api/booths
 * Create booths for one or more events
 */
router.post('/', authenticateToken, requireRole(['Admin','GlobalSupport']), [
    body('name').isString().trim().isLength({ min: 2, max: 200 }),
    body('description').optional().isString().isLength({ max: 1000 }),
    body('logoUrl').optional().isURL(),
    body('companyPage').optional().isURL(),
    body('recruitersCount').optional().isInt({ min: 1 }),
    body('expireLinkTime').optional().isISO8601().toDate(),
    body('customInviteSlug').optional().isString().toLowerCase().matches(/^[a-z0-9-]+$/).withMessage('Custom invite must be lowercase letters, numbers, and dashes only'),
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

        const { name, description, logoUrl, companyPage, recruitersCount, expireLinkTime, customInviteSlug, richSections = [], eventIds } = req.body;
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
                richSections: (richSections || []).slice(0,3).map((s, index) => ({
                  title: s.title || `Section ${index+1}`,
                  contentHtml: s.contentHtml || '',
                  isActive: s.isActive !== false,
                  order: s.order ?? index
                }))
            });
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
 * DELETE /api/booths/:id
 * Delete a booth
 */
router.delete('/:id', authenticateToken, requireResourceAccess('booth', 'id'), async (req, res) => {
    try {
        const { booth, user } = req;
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

        const booth = await Booth.findById(id).populate('eventId', 'name start end status');
        if (!booth) {
            return res.status(404).json({
                error: 'Booth not found',
                message: 'The specified booth does not exist'
            });
        }

        // Check if user can access this booth
        if (!booth.canUserManage(user) && !booth.eventId.canUserAccess(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this booth'
            });
        }

        // Return appropriate data based on user role
        const boothData = user.role === 'JobSeeker'
            ? booth.getPublicInfo()
            : booth.getSummary();

        res.json({
            booth: boothData,
            event: booth.eventId.getSummary()
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
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Description cannot exceed 1000 characters'),
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
        .optional()
        .isISO8601()
        .toDate(),
    body('customInviteSlug')
        .optional()
        .isString()
        .toLowerCase()
        .matches(/^[a-z0-9-]+$/)
        .withMessage('Custom invite must be lowercase letters, numbers, and dashes only'),
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

        const { name, description, logoUrl, status, companyPage, recruitersCount, expireLinkTime, customInviteSlug } = req.body;
        const { booth, user } = req;

        // Update allowed fields
        if (name !== undefined) booth.name = name;
        if (description !== undefined) booth.description = description;
        if (logoUrl !== undefined) booth.logoUrl = logoUrl;
        if (companyPage !== undefined) booth.companyPage = companyPage;
        if (recruitersCount !== undefined) booth.recruitersCount = recruitersCount;
        if (expireLinkTime !== undefined) booth.expireLinkTime = expireLinkTime;
        if (customInviteSlug !== undefined) {
            if (customInviteSlug) {
                const exists = await Booth.findOne({ customInviteSlug, _id: { $ne: booth._id } });
                if (exists) {
                    return res.status(409).json({ error: 'Custom invite already taken' });
                }
            }
            booth.customInviteSlug = customInviteSlug || undefined;
        }
        if (status !== undefined) booth.status = status;

        await booth.save();

        logger.info(`Booth updated: ${booth.name} by ${user.email}`);

        res.json({
            message: 'Booth updated successfully',
            booth: booth.getSummary()
        });
    } catch (error) {
        logger.error('Update booth error:', error);
        res.status(500).json({
            error: 'Failed to update booth',
            message: 'An error occurred while updating the booth'
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
        .isLength({ min: 1, max: 5000 })
        .withMessage('Section content must be between 1 and 5000 characters'),
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
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { sections } = req.body;
        const { booth, user } = req;

        // Update rich sections
        booth.richSections = sections.map((section, index) => ({
            title: section.title,
            contentHtml: section.contentHtml,
            isActive: section.isActive !== undefined ? section.isActive : true,
            order: section.order !== undefined ? section.order : index
        }));

        await booth.save();

        logger.info(`Booth rich sections updated: ${booth.name} by ${user.email}`);

        res.json({
            message: 'Rich sections updated successfully',
            sections: booth.richSections
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
