const express = require('express');
const { body, validationResult } = require('express-validator');
const MeetingRecord = require('../models/MeetingRecord');
const { authenticateToken, requireRole, requireOwnership } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/meetings
 * Get user's meetings
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { page = 1, limit = 20, status, eventId } = req.query;

        // Build query
        let query = {};

        // Filter by user role
        if (user.role === 'Recruiter') {
            query.recruiterId = user._id;
        } else if (user.role === 'JobSeeker') {
            query.jobseekerId = user._id;
        } else if (['Interpreter', 'GlobalInterpreter'].includes(user.role)) {
            query.interpreterId = user._id;
        } else if (!['Admin', 'GlobalSupport'].includes(user.role)) {
            // Non-admin users can only see their own meetings
            query.$or = [
                { recruiterId: user._id },
                { jobseekerId: user._id },
                { interpreterId: user._id }
            ];
        }

        // Apply filters
        if (status) {
            query.status = status;
        }

        if (eventId) {
            query.eventId = eventId;
        }

        // Find meetings
        const meetings = await MeetingRecord.find(query)
            .populate('eventId', 'name start end')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email role')
            .populate('jobseekerId', 'name email role')
            .populate('interpreterId', 'name email role')
            .sort({ startTime: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const totalCount = await MeetingRecord.countDocuments(query);

        res.json({
            meetings: meetings.map(meeting => meeting.getSummary()),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get meetings error:', error);
        res.status(500).json({
            error: 'Failed to retrieve meetings',
            message: 'An error occurred while retrieving meetings'
        });
    }
});

/**
 * GET /api/meetings/:id
 * Get meeting details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const meeting = await MeetingRecord.findById(id)
            .populate('eventId', 'name start end')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email role')
            .populate('jobseekerId', 'name email role')
            .populate('interpreterId', 'name email role');

        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user has access to this meeting
        const isParticipant = meeting.recruiterId._id.equals(user._id) ||
            meeting.jobseekerId._id.equals(user._id) ||
            meeting.interpreterId?._id.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this meeting'
            });
        }

        res.json({
            meeting: {
                ...meeting.toObject(),
                isActive: meeting.isActive,
                isCompleted: meeting.isCompleted,
                callDurationMinutes: meeting.callDurationMinutes
            }
        });
    } catch (error) {
        logger.error('Get meeting error:', error);
        res.status(500).json({
            error: 'Failed to retrieve meeting',
            message: 'An error occurred while retrieving the meeting'
        });
    }
});

/**
 * POST /api/meetings/:id/feedback
 * Submit feedback for a meeting
 */
router.post('/:id/feedback', authenticateToken, requireRole(['Recruiter', 'BoothAdmin', 'AdminEvent', 'Admin']), [
    body('rating')
        .isInt({ min: 1, max: 5 })
        .withMessage('Rating must be between 1 and 5'),
    body('notes')
        .optional()
        .trim()
        .isLength({ max: 1000 })
        .withMessage('Notes cannot exceed 1000 characters'),
    body('strengths')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Strengths must be an array with maximum 10 items'),
    body('strengths.*')
        .trim()
        .isLength({ max: 200 })
        .withMessage('Each strength cannot exceed 200 characters'),
    body('areasForImprovement')
        .optional()
        .isArray({ max: 10 })
        .withMessage('Areas for improvement must be an array with maximum 10 items'),
    body('areasForImprovement.*')
        .trim()
        .isLength({ max: 200 })
        .withMessage('Each area for improvement cannot exceed 200 characters'),
    body('recommendedForHire')
        .optional()
        .isBoolean()
        .withMessage('Recommended for hire must be boolean')
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
        const { rating, notes, strengths, areasForImprovement, recommendedForHire } = req.body;
        const { user } = req;

        const meeting = await MeetingRecord.findById(id);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user is the recruiter or has permission to provide feedback
        if (!meeting.recruiterId.equals(user._id) && !['Admin', 'GlobalSupport', 'BoothAdmin', 'AdminEvent'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only the recruiter or authorized personnel can provide feedback'
            });
        }

        // Check if feedback already exists
        if (meeting.feedback) {
            return res.status(409).json({
                error: 'Feedback already exists',
                message: 'Feedback has already been submitted for this meeting'
            });
        }

        // Submit feedback
        const feedbackData = {
            rating,
            notes,
            strengths: strengths || [],
            areasForImprovement: areasForImprovement || [],
            recommendedForHire
        };

        await meeting.submitFeedback(feedbackData);

        logger.info(`Feedback submitted for meeting ${id} by ${user.email}`);

        res.json({
            message: 'Feedback submitted successfully',
            feedback: meeting.feedback
        });
    } catch (error) {
        logger.error('Submit feedback error:', error);
        res.status(500).json({
            error: 'Failed to submit feedback',
            message: 'An error occurred while submitting feedback'
        });
    }
});

/**
 * GET /api/meetings/:id/feedback
 * Get feedback for a meeting
 */
router.get('/:id/feedback', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const meeting = await MeetingRecord.findById(id)
            .populate('recruiterId', 'name email role')
            .populate('jobseekerId', 'name email role');

        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user has access to this meeting
        const isParticipant = meeting.recruiterId._id.equals(user._id) ||
            meeting.jobseekerId._id.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport', 'BoothAdmin', 'AdminEvent'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this feedback'
            });
        }

        if (!meeting.feedback) {
            return res.status(404).json({
                error: 'No feedback found',
                message: 'No feedback has been submitted for this meeting'
            });
        }

        res.json({
            meeting: {
                _id: meeting._id,
                recruiter: meeting.recruiterId.getPublicProfile(),
                jobseeker: meeting.jobseekerId.getPublicProfile(),
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                duration: meeting.duration
            },
            feedback: meeting.feedback
        });
    } catch (error) {
        logger.error('Get feedback error:', error);
        res.status(500).json({
            error: 'Failed to retrieve feedback',
            message: 'An error occurred while retrieving feedback'
        });
    }
});

/**
 * GET /api/meetings/:id/chat
 * Get chat messages for a meeting
 */
router.get('/:id/chat', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;
        const { page = 1, limit = 50 } = req.query;

        const meeting = await MeetingRecord.findById(id);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user has access to this meeting
        const isParticipant = meeting.recruiterId.equals(user._id) ||
            meeting.jobseekerId.equals(user._id) ||
            meeting.interpreterId?.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view chat messages'
            });
        }

        // Get chat messages with pagination
        const messages = meeting.chatMessages
            .sort((a, b) => b.timestamp - a.timestamp)
            .slice((page - 1) * limit, page * limit);

        // Populate user information for messages
        const User = require('../models/User');
        const populatedMessages = await Promise.all(
            messages.map(async (message) => {
                const userInfo = await User.findById(message.userId).select('name email role');
                return {
                    _id: message._id,
                    user: userInfo.getPublicProfile(),
                    message: message.message,
                    messageType: message.messageType,
                    timestamp: message.timestamp,
                    attachment: message.attachment
                };
            })
        );

        res.json({
            messages: populatedMessages.reverse(), // Reverse to show oldest first
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(meeting.chatMessages.length / limit),
                totalMessages: meeting.chatMessages.length,
                hasNext: page * limit < meeting.chatMessages.length,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get chat messages error:', error);
        res.status(500).json({
            error: 'Failed to retrieve chat messages',
            message: 'An error occurred while retrieving chat messages'
        });
    }
});

/**
 * GET /api/meetings/:id/attachments
 * Get attachments for a meeting
 */
router.get('/:id/attachments', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const meeting = await MeetingRecord.findById(id);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user has access to this meeting
        const isParticipant = meeting.recruiterId.equals(user._id) ||
            meeting.jobseekerId.equals(user._id) ||
            meeting.interpreterId?.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view attachments'
            });
        }

        res.json({
            attachments: meeting.attachments.map(attachment => ({
                _id: attachment._id,
                type: attachment.type,
                filename: attachment.filename,
                s3Url: attachment.s3Url,
                mimeType: attachment.mimeType,
                size: attachment.size,
                transcript: attachment.transcript,
                uploadedAt: attachment.uploadedAt
            }))
        });
    } catch (error) {
        logger.error('Get attachments error:', error);
        res.status(500).json({
            error: 'Failed to retrieve attachments',
            message: 'An error occurred while retrieving attachments'
        });
    }
});

module.exports = router;
