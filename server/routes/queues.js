const express = require('express');
const { body, validationResult } = require('express-validator');
const Queue = require('../models/Queue');
const Booth = require('../models/Booth');
const Event = require('../models/Event');
const { authenticateToken, requireRole, requireResourceAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/events/:eventId/booths/:boothId/join
 * Join a booth queue
 */
router.post('/events/:eventId/booths/:boothId/join', authenticateToken, [
    body('estimatedWaitTime')
        .optional()
        .isInt({ min: 1, max: 120 })
        .withMessage('Estimated wait time must be between 1 and 120 minutes')
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

        const { eventId, boothId } = req.params;
        const { user } = req;

        // Only JobSeekers can join queues
        if (user.role !== 'JobSeeker') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only job seekers can join queues'
            });
        }

        // Find the booth
        const booth = await Booth.findById(boothId);
        if (!booth) {
            return res.status(404).json({
                error: 'Booth not found',
                message: 'The specified booth does not exist'
            });
        }

        // Verify booth belongs to the event
        if (!booth.eventId.equals(eventId)) {
            return res.status(400).json({
                error: 'Invalid booth',
                message: 'The booth does not belong to the specified event'
            });
        }

        // Check if booth is available for queue joining
        if (!booth.isAvailableForQueue) {
            return res.status(400).json({
                error: 'Queue unavailable',
                message: 'This booth is not currently accepting queue entries'
            });
        }

        // Find or create queue for the booth
        let queue = await Queue.findOne({ boothId });
        if (!queue) {
            queue = new Queue({
                boothId,
                eventId,
                settings: {
                    maxQueueSize: booth.settings.queueSettings.maxQueueSize,
                    tokenExpiryMinutes: 30,
                    autoAdvanceInterval: 5
                }
            });
            await queue.save();

            // Update booth with queue reference
            booth.queueId = queue._id;
            await booth.save();
        }

        // Join the queue
        const result = await queue.joinQueue(user._id);

        logger.info(`User ${user.email} joined queue for booth ${boothId} with token ${result.tokenNumber}`);

        res.status(201).json({
            message: 'Successfully joined queue',
            queueId: queue._id,
            tokenNumber: result.tokenNumber,
            queuePosition: result.queuePosition,
            estimatedWaitTime: result.estimatedWaitTime,
            booth: booth.getPublicInfo()
        });
    } catch (error) {
        logger.error('Queue join error:', error);

        if (error.message === 'User is already in queue') {
            return res.status(409).json({
                error: 'Already in queue',
                message: 'You are already in this queue'
            });
        }

        if (error.message === 'Queue is at maximum capacity') {
            return res.status(400).json({
                error: 'Queue full',
                message: 'This queue is currently at maximum capacity'
            });
        }

        if (error.message === 'Queue is not accepting new entries') {
            return res.status(400).json({
                error: 'Queue closed',
                message: 'This queue is not currently accepting new entries'
            });
        }

        res.status(500).json({
            error: 'Queue join failed',
            message: 'An error occurred while joining the queue'
        });
    }
});

/**
 * POST /api/queues/:queueId/leave
 * Leave a queue
 */
router.post('/:queueId/leave', authenticateToken, [
    body('leaveMessage.type')
        .optional()
        .isIn(['text', 'audio', 'video'])
        .withMessage('Leave message type must be text, audio, or video'),
    body('leaveMessage.content')
        .optional()
        .isLength({ max: 1000 })
        .withMessage('Leave message content cannot exceed 1000 characters'),
    body('leaveMessage.contentUrl')
        .optional()
        .isURL()
        .withMessage('Leave message content URL must be a valid URL'),
    body('leaveMessage.transcript')
        .optional()
        .isLength({ max: 2000 })
        .withMessage('Leave message transcript cannot exceed 2000 characters')
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

        const { queueId } = req.params;
        const { leaveMessage } = req.body;
        const { user } = req;

        // Find the queue
        const queue = await Queue.findById(queueId);
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Leave the queue
        const result = await queue.leaveQueue(user._id, leaveMessage);

        logger.info(`User ${user.email} left queue ${queueId} with token ${result.tokenNumber}`);

        res.json({
            message: 'Successfully left queue',
            tokenNumber: result.tokenNumber,
            waitTime: result.actualWaitTime,
            leftAt: result.leftAt
        });
    } catch (error) {
        logger.error('Queue leave error:', error);

        if (error.message === 'User is not in queue') {
            return res.status(400).json({
                error: 'Not in queue',
                message: 'You are not currently in this queue'
            });
        }

        res.status(500).json({
            error: 'Queue leave failed',
            message: 'An error occurred while leaving the queue'
        });
    }
});

/**
 * GET /api/queues/:queueId/status
 * Get queue status and user's position
 */
router.get('/:queueId/status', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { user } = req;

        // Find the queue
        const queue = await Queue.findById(queueId).populate('boothId', 'name logoUrl');
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Get queue status
        const queueStatus = queue.getStatus();

        // Get user's position if they're in the queue
        let userPosition = null;
        if (user.role === 'JobSeeker') {
            userPosition = queue.getUserPosition(user._id);
        }

        res.json({
            queue: queueStatus,
            userPosition,
            booth: {
                _id: queue.boothId._id,
                name: queue.boothId.name,
                logoUrl: queue.boothId.logoUrl
            }
        });
    } catch (error) {
        logger.error('Queue status error:', error);
        res.status(500).json({
            error: 'Failed to get queue status',
            message: 'An error occurred while retrieving queue status'
        });
    }
});

/**
 * POST /api/queues/:queueId/serve-next
 * Serve the next person in queue (Recruiter/BoothAdmin only)
 */
router.post('/:queueId/serve-next', authenticateToken, requireRole(['Recruiter', 'BoothAdmin', 'AdminEvent', 'Admin']), async (req, res) => {
    try {
        const { queueId } = req.params;
        const { user } = req;

        // Find the queue
        const queue = await Queue.findById(queueId).populate('entries.userId', 'name email role');
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Check if user has permission to manage this queue
        const booth = await Booth.findById(queue.boothId);
        if (!booth.canUserManage(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to manage this queue'
            });
        }

        // Serve next person
        const servedEntry = await queue.serveNext();

        if (!servedEntry) {
            return res.json({
                message: 'No one to serve',
                currentServing: queue.currentServing,
                queueLength: queue.currentLength
            });
        }

        // Populate user information
        await servedEntry.populate('userId', 'name email role');

        logger.info(`User ${servedEntry.userId.email} (token ${servedEntry.tokenNumber}) is now being served by ${user.email}`);

        res.json({
            message: 'Next person served',
            servedEntry: {
                tokenNumber: servedEntry.tokenNumber,
                user: servedEntry.userId.getPublicProfile(),
                servedAt: servedEntry.servedAt,
                waitTime: servedEntry.actualWaitTime
            },
            queueStatus: queue.getStatus()
        });
    } catch (error) {
        logger.error('Serve next error:', error);
        res.status(500).json({
            error: 'Failed to serve next person',
            message: 'An error occurred while serving the next person in queue'
        });
    }
});

/**
 * GET /api/queues/:queueId/entries
 * Get queue entries (BoothAdmin/Recruiter only)
 */
router.get('/:queueId/entries', authenticateToken, requireRole(['Recruiter', 'BoothAdmin', 'AdminEvent', 'Admin', 'Support', 'GlobalSupport']), async (req, res) => {
    try {
        const { queueId } = req.params;
        const { user } = req;
        const { page = 1, limit = 50, status } = req.query;

        // Find the queue
        const queue = await Queue.findById(queueId).populate('entries.userId', 'name email role');
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Check if user has permission to view this queue
        const booth = await Booth.findById(queue.boothId);
        if (!booth.canUserManage(user) && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this queue'
            });
        }

        // Filter entries by status if specified
        let entries = queue.entries;
        if (status) {
            entries = entries.filter(entry => entry.status === status);
        }

        // Sort entries by token number
        entries.sort((a, b) => a.tokenNumber - b.tokenNumber);

        // Pagination
        const startIndex = (page - 1) * limit;
        const endIndex = page * limit;
        const paginatedEntries = entries.slice(startIndex, endIndex);

        res.json({
            entries: paginatedEntries.map(entry => ({
                tokenNumber: entry.tokenNumber,
                user: entry.userId.getPublicProfile(),
                status: entry.status,
                joinedAt: entry.joinedAt,
                servedAt: entry.servedAt,
                leftAt: entry.leftAt,
                estimatedWaitTime: entry.estimatedWaitTime,
                actualWaitTime: entry.actualWaitTime,
                leaveMessage: entry.leaveMessage
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(entries.length / limit),
                totalEntries: entries.length,
                hasNext: endIndex < entries.length,
                hasPrev: startIndex > 0
            },
            queueStats: queue.stats
        });
    } catch (error) {
        logger.error('Queue entries error:', error);
        res.status(500).json({
            error: 'Failed to get queue entries',
            message: 'An error occurred while retrieving queue entries'
        });
    }
});

/**
 * PUT /api/queues/:queueId/settings
 * Update queue settings (BoothAdmin/AdminEvent only)
 */
router.put('/:queueId/settings', authenticateToken, requireRole(['BoothAdmin', 'AdminEvent', 'Admin']), [
    body('maxQueueSize')
        .optional()
        .isInt({ min: 1, max: 1000 })
        .withMessage('Max queue size must be between 1 and 1000'),
    body('tokenExpiryMinutes')
        .optional()
        .isInt({ min: 5, max: 120 })
        .withMessage('Token expiry must be between 5 and 120 minutes'),
    body('autoAdvanceInterval')
        .optional()
        .isInt({ min: 1, max: 30 })
        .withMessage('Auto advance interval must be between 1 and 30 minutes')
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

        const { queueId } = req.params;
        const { user } = req;
        const { maxQueueSize, tokenExpiryMinutes, autoAdvanceInterval } = req.body;

        // Find the queue
        const queue = await Queue.findById(queueId);
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Check if user has permission to manage this queue
        const booth = await Booth.findById(queue.boothId);
        if (!booth.canUserManage(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to manage this queue'
            });
        }

        // Update settings
        if (maxQueueSize !== undefined) queue.settings.maxQueueSize = maxQueueSize;
        if (tokenExpiryMinutes !== undefined) queue.settings.tokenExpiryMinutes = tokenExpiryMinutes;
        if (autoAdvanceInterval !== undefined) queue.settings.autoAdvanceInterval = autoAdvanceInterval;

        await queue.save();

        logger.info(`Queue ${queueId} settings updated by ${user.email}`);

        res.json({
            message: 'Queue settings updated successfully',
            settings: queue.settings
        });
    } catch (error) {
        logger.error('Queue settings update error:', error);
        res.status(500).json({
            error: 'Failed to update queue settings',
            message: 'An error occurred while updating queue settings'
        });
    }
});

/**
 * PUT /api/queues/:queueId/status
 * Update queue status (BoothAdmin/AdminEvent only)
 */
router.put('/:queueId/status', authenticateToken, requireRole(['BoothAdmin', 'AdminEvent', 'Admin']), [
    body('status')
        .isIn(['active', 'paused', 'closed'])
        .withMessage('Status must be active, paused, or closed')
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

        const { queueId } = req.params;
        const { user } = req;
        const { status } = req.body;

        // Find the queue
        const queue = await Queue.findById(queueId);
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Check if user has permission to manage this queue
        const booth = await Booth.findById(queue.boothId);
        if (!booth.canUserManage(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to manage this queue'
            });
        }

        // Update status
        queue.status = status;
        await queue.save();

        logger.info(`Queue ${queueId} status changed to ${status} by ${user.email}`);

        res.json({
            message: 'Queue status updated successfully',
            status: queue.status
        });
    } catch (error) {
        logger.error('Queue status update error:', error);
        res.status(500).json({
            error: 'Failed to update queue status',
            message: 'An error occurred while updating queue status'
        });
    }
});

module.exports = router;
