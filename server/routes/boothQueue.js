const express = require('express');
const router = express.Router();
const BoothQueue = require('../models/BoothQueue');
const Booth = require('../models/Booth');
const Event = require('../models/Event');
const MeetingRecord = require('../models/MeetingRecord');
const { authenticateToken } = require('../middleware/auth');
const { getIO } = require('../socket/socketHandler');
const logger = require('../utils/logger');

// Join a booth queue
router.post('/join', authenticateToken, async (req, res) => {
    try {
        const { eventId, boothId, interpreterCategory, agreedToTerms } = req.body;
        const jobSeekerId = req.user._id;

        // Validate required fields
        if (!eventId || !boothId || !agreedToTerms) {
            return res.status(400).json({
                success: false,
                message: 'Event ID, Booth ID, and terms agreement are required'
            });
        }

        // Check if job seeker is already in any queue for this event
        let existingQueue = await BoothQueue.findOne({
            jobSeeker: jobSeekerId,
            event: eventId,
            status: { $in: ['waiting', 'invited', 'in_meeting'] }
        });

        // If there's an existing queue entry, try to clean up stale entries
        // (entries where user might have disconnected without proper cleanup)
        if (existingQueue) {
            // Check if this is a stale entry (older than 5 minutes with no recent activity)
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            const isStale = existingQueue.createdAt < fiveMinutesAgo && 
                           (!existingQueue.lastActivity || existingQueue.lastActivity < fiveMinutesAgo);
            
            if (isStale && existingQueue.status === 'waiting') {
                // Auto-cleanup stale waiting entries
                await existingQueue.leaveQueue();
                logger.info(`Auto-cleaned stale queue entry for user ${jobSeekerId} in booth ${existingQueue.booth}`);
                
                // Notify booth management about the cleanup
                const io = getIO();
                io.to(`booth_${existingQueue.booth}`).emit('queue-updated', {
                    type: 'left',
                    queueEntry: {
                        _id: existingQueue._id,
                        jobSeeker: req.user.getPublicProfile(),
                        position: existingQueue.position,
                        status: 'left'
                    }
                });
                
                existingQueue = null; // Allow them to join
            } else {
                return res.status(400).json({
                    success: false,
                    message: 'You are already in a queue for this event. Please leave your current queue first.',
                    existingQueue: {
                        boothId: existingQueue.booth,
                        position: existingQueue.position,
                        status: existingQueue.status
                    }
                });
            }
        }

        // Get next position in queue
        const position = await BoothQueue.getNextPosition(boothId);

        // Create queue entry with duplicate handling
        let queueEntry;
        try {
            queueEntry = new BoothQueue({
                jobSeeker: jobSeekerId,
                booth: boothId,
                event: eventId,
                position,
                interpreterCategory: interpreterCategory || null,
                agreedToTerms,
                status: 'waiting'
            });

            await queueEntry.save();
        } catch (error) {
            if (error.code === 11000) {
                // Handle duplicate key error - there might still be an active entry
                logger.warn(`Duplicate key error for user ${jobSeekerId} in booth ${boothId}, attempting cleanup`);
                
                // Find and clean up any remaining active entries
                const duplicateEntry = await BoothQueue.findOne({
                    jobSeeker: jobSeekerId,
                    booth: boothId,
                    status: { $in: ['waiting', 'invited', 'in_meeting'] }
                });
                
                if (duplicateEntry) {
                    await duplicateEntry.leaveQueue();
                    logger.info(`Cleaned up duplicate entry ${duplicateEntry._id} for user ${jobSeekerId}`);
                    
                    // Retry creating the queue entry
                    queueEntry = new BoothQueue({
                        jobSeeker: jobSeekerId,
                        booth: boothId,
                        event: eventId,
                        position,
                        interpreterCategory: interpreterCategory || null,
                        agreedToTerms,
                        status: 'waiting'
                    });
                    
                    await queueEntry.save();
                } else {
                    throw error; // Re-throw if we can't find the duplicate
                }
            } else {
                throw error; // Re-throw non-duplicate errors
            }
        }

        // Populate references for response
        await queueEntry.populate([
            { path: 'jobSeeker', select: 'name email' },
            { path: 'booth', select: 'company companyLogo' },
            { path: 'event', select: 'name logo' },
            { path: 'interpreterCategory', select: 'name code' }
        ]);

        // Emit socket event for real-time updates
        if (req.app.get('io')) {
            req.app.get('io').to(`booth_${boothId}`).emit('queue-updated', {
                boothId,
                action: 'joined',
                queueEntry: queueEntry.toJSON()
            });
        }

        res.status(201).json({
            success: true,
            message: 'Successfully joined the queue',
            queueToken: queueEntry.queueToken,
            position: queueEntry.position,
            queueEntry
        });

    } catch (error) {
        console.error('Error joining queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to join queue',
            error: error.message
        });
    }
});

// Leave a booth queue
router.post('/leave', authenticateToken, async (req, res) => {
    try {
        const { boothId } = req.body;
        const jobSeekerId = req.user._id;

        const queueEntry = await BoothQueue.findOne({
            jobSeeker: jobSeekerId,
            booth: boothId,
            status: { $in: ['waiting', 'invited'] }
        });

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        await queueEntry.leaveQueue();

        // Emit socket event
        if (req.app.get('io')) {
            req.app.get('io').to(`booth_${boothId}`).emit('queue-updated', {
                boothId,
                action: 'left',
                queueEntry: queueEntry.toJSON()
            });
        }

        res.json({
            success: true,
            message: 'Successfully left the queue'
        });

    } catch (error) {
        console.error('Error leaving queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to leave queue',
            error: error.message
        });
    }
});

// Get queue status for a job seeker
router.get('/status/:boothId', authenticateToken, async (req, res) => {
    try {
        const { boothId } = req.params;
        const jobSeekerId = req.user._id;

        const queueEntry = await BoothQueue.getJobSeekerQueue(jobSeekerId, boothId);

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Not in queue'
            });
        }

        // Get current serving number (you might want to store this in booth or calculate it)
        const currentServing = await BoothQueue.countDocuments({
            booth: boothId,
            status: { $in: ['invited', 'in_meeting', 'completed'] }
        }) + 1;

        res.json({
            success: true,
            position: queueEntry.position,
            token: queueEntry.queueToken,
            currentServing,
            status: queueEntry.status,
            queueEntry
        });

    } catch (error) {
        console.error('Error getting queue status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get queue status',
            error: error.message
        });
    }
});

// Get booth queue (for recruiters)
router.get('/booth/:boothId', authenticateToken, async (req, res) => {
    try {
        const { boothId } = req.params;

        // Check if user has permission to view this booth's queue
        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        const queue = await BoothQueue.getBoothQueue(boothId);
        
        // Get current serving number
        const currentServing = await BoothQueue.countDocuments({
            booth: boothId,
            status: { $in: ['invited', 'in_meeting', 'completed'] }
        }) + 1;

        res.json({
            success: true,
            queue,
            currentServing,
            totalCount: queue.length
        });

    } catch (error) {
        console.error('Error getting booth queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get booth queue',
            error: error.message
        });
    }
});

// Send message to recruiter
router.post('/message', authenticateToken, async (req, res) => {
    try {
        const { boothId, type, content, queueToken } = req.body;
        const jobSeekerId = req.user._id;

        if (!['text', 'audio', 'video'].includes(type)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid message type'
            });
        }

        const queueEntry = await BoothQueue.findOne({
            jobSeeker: jobSeekerId,
            booth: boothId,
            queueToken,
            status: { $in: ['waiting', 'invited'] }
        });

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Add message to queue entry and update activity
        await queueEntry.addMessage({ type, content });
        await queueEntry.updateActivity();

        // Emit socket event to recruiters
        if (req.app.get('io')) {
            req.app.get('io').to(`booth_management_${boothId}`).emit('new-queue-message', {
                boothId,
                queueEntry: queueEntry.toJSON(),
                message: { type, content, createdAt: new Date() }
            });
        }

        res.json({
            success: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// Get messages for a queue entry (recruiter view)
router.get('/messages/:queueId', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;

        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        const queueEntry = await BoothQueue.findById(queueId);
        
        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Mark messages as read
        await queueEntry.markMessagesAsRead();

        res.json({
            success: true,
            messages: queueEntry.messages
        });

    } catch (error) {
        console.error('Error getting messages:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to get messages',
            error: error.message
        });
    }
});

// Invite job seeker to meeting (recruiter action)
router.post('/invite/:queueId', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { jobSeekerId, boothId, eventId, interpreterCategory } = req.body;

        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        const queueEntry = await BoothQueue.findById(queueId);
        
        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Create meeting record
        const meeting = new MeetingRecord({
            jobSeeker: jobSeekerId,
            recruiter: req.user._id,
            booth: boothId,
            event: eventId,
            interpreterCategory: interpreterCategory || null,
            status: 'scheduled',
            scheduledAt: new Date()
        });

        await meeting.save();

        // Update queue entry
        await queueEntry.inviteToMeeting(meeting._id);

        // Emit socket event to job seeker
        if (req.app.get('io')) {
            req.app.get('io').to(`user_${jobSeekerId}`).emit('queue-invited-to-meeting', {
                boothId,
                userId: jobSeekerId,
                meetingId: meeting._id,
                queueEntry: queueEntry.toJSON()
            });
        }

        res.json({
            success: true,
            message: 'Job seeker invited to meeting',
            meetingId: meeting._id
        });

    } catch (error) {
        console.error('Error inviting to meeting:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to invite to meeting',
            error: error.message
        });
    }
});

// Update serving number (recruiter action)
router.patch('/serving/:boothId', authenticateToken, async (req, res) => {
    try {
        const { boothId } = req.params;
        const { servingNumber } = req.body;

        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        // You might want to store serving number in booth model or cache
        // For now, we'll just emit the socket event

        if (req.app.get('io')) {
            req.app.get('io').to(`booth_${boothId}`).emit('queue-serving-updated', {
                boothId,
                currentServing: servingNumber
            });
        }

        res.json({
            success: true,
            message: 'Serving number updated',
            currentServing: servingNumber
        });

    } catch (error) {
        console.error('Error updating serving number:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update serving number',
            error: error.message
        });
    }
});

// Remove job seeker from queue (recruiter action)
router.delete('/remove/:queueId', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;

        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        const queueEntry = await BoothQueue.findById(queueId);
        
        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        await queueEntry.leaveQueue();

        // Emit socket event
        if (req.app.get('io')) {
            req.app.get('io').to(`booth_${queueEntry.booth}`).emit('queue-updated', {
                boothId: queueEntry.booth,
                action: 'removed',
                queueEntry: queueEntry.toJSON()
            });
        }

        res.json({
            success: true,
            message: 'Job seeker removed from queue'
        });

    } catch (error) {
        console.error('Error removing from queue:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to remove from queue',
            error: error.message
        });
    }
});

module.exports = router;
