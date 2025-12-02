const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const BoothQueue = require('../models/BoothQueue');
const Booth = require('../models/Booth');
const Event = require('../models/Event');
const MeetingRecord = require('../models/MeetingRecord');
const VideoCall = require('../models/VideoCall');
const { authenticateToken } = require('../middleware/auth');
const { getIO } = require('../socket/socketHandler');
const logger = require('../utils/logger');

// Helper function to get job seekers currently in active calls for a booth
const getJobSeekersInActiveCalls = async (boothId) => {
    const boothObjectId = mongoose.Types.ObjectId.isValid(boothId) 
        ? new mongoose.Types.ObjectId(boothId) 
        : boothId;
    
    // Check VideoCall model for active calls
    const activeVideoCalls = await VideoCall.find({
        booth: boothObjectId,
        status: 'active'
    }).select('jobSeeker roomName');
    
    // Check MeetingRecord model for active/scheduled calls (only recent ones - last 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const activeMeetings = await MeetingRecord.find({
        boothId: boothObjectId,
        status: { $in: ['active', 'scheduled'] },
        startTime: { $gte: twoHoursAgo }
    }).select('jobseekerId twilioRoomId startTime');
    
    // Also check BoothQueue for entries with status 'in_meeting' (most reliable source)
    const inMeetingQueues = await BoothQueue.find({
        booth: boothObjectId,
        status: 'in_meeting'
    }).select('jobSeeker');
    
    // Combine job seeker IDs from all sources
    const jobSeekerIds = new Set();
    
    activeVideoCalls.forEach(call => {
        if (call.jobSeeker) {
            jobSeekerIds.add(call.jobSeeker.toString());
        }
    });
    
    activeMeetings.forEach(meeting => {
        if (meeting.jobseekerId) {
            jobSeekerIds.add(meeting.jobseekerId.toString());
        }
    });
    
    inMeetingQueues.forEach(queue => {
        if (queue.jobSeeker) {
            jobSeekerIds.add(queue.jobSeeker.toString());
        }
    });
    
    console.log('Active calls check for booth:', boothId);
    console.log('  - VideoCall active:', activeVideoCalls.length, activeVideoCalls.map(c => ({ js: c.jobSeeker?.toString(), room: c.roomName })));
    console.log('  - MeetingRecord active (last 2h):', activeMeetings.length, activeMeetings.map(m => ({ js: m.jobseekerId?.toString(), room: m.twilioRoomId })));
    console.log('  - BoothQueue in_meeting:', inMeetingQueues.length, inMeetingQueues.map(q => q.jobSeeker?.toString()));
    console.log('  - Total unique jobSeekers in calls:', jobSeekerIds.size, [...jobSeekerIds]);
    
    return jobSeekerIds;
};

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

        // First, clean up any stale queue entries for this user across all events
        const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
        const staleEntries = await BoothQueue.find({
            jobSeeker: jobSeekerId,
            status: { $in: ['waiting', 'in_meeting'] }, // Include in_meeting status for cleanup
            $or: [
                { lastActivity: { $lt: oneMinuteAgo } },
                { lastActivity: { $exists: false }, createdAt: { $lt: oneMinuteAgo } }
            ]
        });

        // Remove stale entries
        for (const staleEntry of staleEntries) {
            // For in_meeting status, also check if there's an active video call
            if (staleEntry.status === 'in_meeting') {
                const VideoCall = require('../models/VideoCall');
                const activeCall = await VideoCall.findOne({
                    queueEntry: staleEntry._id,
                    status: 'active'
                });
                
                // If no active call found, it's safe to clean up
                if (!activeCall) {
                    await staleEntry.leaveQueue();
                    logger.info(`Auto-cleaned orphaned in_meeting queue entry for user ${jobSeekerId} in booth ${staleEntry.booth} (no active call)`);
                }
            } else {
                await staleEntry.leaveQueue();
                logger.info(`Auto-cleaned stale queue entry for user ${jobSeekerId} in booth ${staleEntry.booth}`);
            }
        }

        // Check if user is already in any queue for this event
        let existingQueue = await BoothQueue.findOne({
            jobSeeker: jobSeekerId,
            event: eventId,
            status: { $in: ['waiting', 'invited', 'in_meeting'] }
        });

        // If there's an existing queue entry, try to clean up stale entries
        // (entries where user might have disconnected without proper cleanup)
        if (existingQueue) {
            // Check if this is a stale entry (older than 2 minutes with no recent activity)
            const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000);
            const isStale = existingQueue.createdAt < twoMinutesAgo &&
                (!existingQueue.lastActivity || existingQueue.lastActivity < twoMinutesAgo);

            // Also check if user is trying to join the same booth they're already in
            const isSameBooth = existingQueue.booth.toString() === boothId;

            if (isStale && (existingQueue.status === 'waiting' || existingQueue.status === 'in_meeting')) {
                // For in_meeting status, check if there's actually an active call
                let shouldCleanup = true;
                if (existingQueue.status === 'in_meeting') {
                    const VideoCall = require('../models/VideoCall');
                    const activeCall = await VideoCall.findOne({
                        queueEntry: existingQueue._id,
                        status: 'active'
                    });
                    shouldCleanup = !activeCall; // Only cleanup if no active call
                }

                if (shouldCleanup) {
                    // Auto-cleanup stale entries
                    await existingQueue.leaveQueue();
                    logger.info(`Auto-cleaned stale queue entry for user ${jobSeekerId} in booth ${existingQueue.booth} (status: ${existingQueue.status})`);

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
                }
            } else if (isSameBooth && existingQueue.status === 'waiting') {
                // If trying to rejoin the same booth, return the existing queue entry
                return res.json({
                    success: true,
                    message: 'You are already in this queue',
                    queueEntry: existingQueue,
                    queueToken: existingQueue.queueToken
                });
            } else {
                return res.status(400).json({
                    error: 'You are already in a queue for this event. Please leave your current queue first.',
                    currentQueue: {
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
            const updateData = {
                boothId,
                action: 'joined',
                queueEntry: queueEntry.toJSON()
            };
            console.log('Emitting queue-updated event:', updateData);
            console.log('Emitting to rooms:', `booth_${boothId}`, `booth_management_${boothId}`);

            // Check how many users are in each room
            const boothRoom = req.app.get('io').sockets.adapter.rooms.get(`booth_${boothId}`);
            const managementRoom = req.app.get('io').sockets.adapter.rooms.get(`booth_management_${boothId}`);
            console.log(`Users in booth_${boothId}:`, boothRoom ? boothRoom.size : 0);
            console.log(`Users in booth_management_${boothId}:`, managementRoom ? managementRoom.size : 0);

            req.app.get('io').to(`booth_${boothId}`).emit('queue-updated', updateData);
            req.app.get('io').to(`booth_management_${boothId}`).emit('queue-updated', updateData);
        } else {
            console.log('No socket.io instance available');
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

        await queueEntry.leaveQueue(false);

        // Emit socket event
        if (req.app.get('io')) {
            const updateData = {
                boothId,
                action: 'left',
                queueEntry: queueEntry.toJSON()
            };
            req.app.get('io').to(`booth_${boothId}`).emit('queue-updated', updateData);
            req.app.get('io').to(`booth_management_${boothId}`).emit('queue-updated', updateData);
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

// Leave queue with message (text/audio/video message)
router.post('/leave-with-message', authenticateToken, async (req, res) => {
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
        }).populate('jobSeeker', 'name email').populate('booth', 'name administrators').populate('event', 'name');

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Store the leave message in separate field (not in messages array)
        queueEntry.leaveMessage = {
            type,
            content,
            createdAt: new Date()
        };
        
        // Mark as left with message
        await queueEntry.leaveQueue(true);
        await queueEntry.save();

        // Create meeting record for the leave message
        const MeetingRecord = require('../models/MeetingRecord');
        const User = require('../models/User');
        
        // Find recruiter assigned to this booth (optional - recruiter can be assigned later)
        const recruiter = await User.findOne({
            assignedBooth: boothId,
            role: 'Recruiter'
        });
        
        const recruiterId = recruiter ? recruiter._id : null;

        // Only create meeting record if recruiter exists, otherwise just save leave message in queue entry
        if (recruiter) {
            console.log('Creating meeting record for leave message:', {
                eventId: queueEntry.event._id,
                boothId: queueEntry.booth._id,
                queueId: queueEntry._id,
                recruiterId,
                jobseekerId: jobSeekerId,
                status: 'left_with_message',
                messageType: type
            });

            const meetingRecord = new MeetingRecord({
                eventId: queueEntry.event._id,
                boothId: queueEntry.booth._id,
                queueId: queueEntry._id,
                recruiterId: recruiterId,
                jobseekerId: jobSeekerId,
                twilioRoomId: `leave-message-${queueEntry._id}`,
                startTime: queueEntry.joinedAt,
                endTime: new Date(),
                duration: 0,
                status: 'left_with_message',
                jobSeekerMessages: [{
                    type: type,
                    content: content,
                    sender: 'jobseeker',
                    createdAt: new Date(),
                    isLeaveMessage: true
                }]
            });

            try {
                await meetingRecord.save();
                console.log('Meeting record created successfully:', meetingRecord._id);
                console.log('Meeting record details:', {
                    id: meetingRecord._id,
                    status: meetingRecord.status,
                    jobseekerId: meetingRecord.jobseekerId,
                    recruiterId: meetingRecord.recruiterId
                });
                
                // Link meeting record to queue entry
                queueEntry.meetingId = meetingRecord._id;
                await queueEntry.save();
            } catch (saveError) {
                console.error('Error saving meeting record:', saveError);
                // Don't throw - leave message is already saved in queueEntry.leaveMessage
                console.warn('Meeting record creation failed, but leave message is saved in queue entry');
            }
        } else {
            console.log('No recruiter assigned to booth:', boothId, '- Leave message saved in queue entry only');
            // Leave message is already saved in queueEntry.leaveMessage above
            // Meeting record will be created later when recruiter is assigned, if needed
        }

        // Emit socket event to recruiters
        if (req.app.get('io')) {
            const updateData = {
                boothId,
                action: 'left_with_message',
                queueEntry: queueEntry.toJSON(),
                jobSeekerName: queueEntry.jobSeeker.name
            };
            req.app.get('io').to(`booth_${boothId}`).emit('queue-updated', updateData);
            req.app.get('io').to(`booth_management_${boothId}`).emit('queue-updated', updateData);
            req.app.get('io').to(`booth_management_${boothId}`).emit('jobseeker-left-with-message', {
                jobSeekerName: queueEntry.jobSeeker.name,
                queueEntryId: queueEntry._id,
                messageType: type
            });
        }

        res.json({
            success: true,
            message: 'Successfully left queue with message'
        });

    } catch (error) {
        console.error('Error leaving queue with message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to leave queue with message',
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

        // Compute waiting count using the same logic as recruiter view:
        // number of queue entries still waiting with position greater than currentServing
        const waitingCount = await BoothQueue.countDocuments({
            booth: boothId,
            status: { $in: ['waiting', 'invited'] },
            position: { $gt: currentServing }
        });

        // Calculate people ahead: count of people currently waiting with position less than current user's position
        const peopleAhead = await BoothQueue.countDocuments({
            booth: boothId,
            status: { $in: ['waiting', 'invited'] },
            position: { $lt: queueEntry.position }
        });

        res.json({
            success: true,
            position: queueEntry.position,
            token: queueEntry.queueToken,
            currentServing,
            waitingCount,
            peopleAhead,
            status: queueEntry.status,
            queueEntry,
            unreadMessages: queueEntry.unreadForJobSeeker
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

        // Include 'in_meeting' status to show job seekers currently in calls
        const queue = await BoothQueue.find({ 
            booth: boothId, 
            status: { $in: ['waiting', 'invited', 'in_meeting'] }
        })
        .populate('jobSeeker', 'name email avatarUrl resumeUrl phoneNumber city state metadata')
        .populate('interpreterCategory', 'name code')
        .sort({ position: 1 });

        // Get current serving number
        const currentServing = await BoothQueue.countDocuments({
            booth: boothId,
            status: { $in: ['invited', 'in_meeting', 'completed'] }
        }) + 1;

        // Check for active calls in this booth to detect job seekers currently in calls with other recruiters
        const jobSeekersInCall = await getJobSeekersInActiveCalls(boothId);

        // Add isInCall flag to each queue entry
        const queueWithCallStatus = queue.map(entry => {
            const entryObj = entry.toObject();
            entryObj.isInCall = jobSeekersInCall.has(entry.jobSeeker._id.toString());
            return entryObj;
        });

        res.json({
            success: true,
            queue: queueWithCallStatus,
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

// Send message from job seeker to recruiter
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
        }).populate('jobSeeker', 'name email');

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Add message with sender info
        await queueEntry.addMessage({ type, content, sender: 'jobseeker' });
        await queueEntry.updateActivity();

        // Emit socket event to recruiters
        if (req.app.get('io')) {
            req.app.get('io').to(`booth_management_${boothId}`).emit('new-queue-message', {
                boothId,
                queueEntry: queueEntry.toJSON(),
                message: { type, content, sender: 'jobseeker', createdAt: new Date() }
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

// Send message from recruiter to job seeker
router.post('/message-to-jobseeker/:queueId', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;
        const { content } = req.body;

        if (!['Admin', 'Recruiter', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        const queueEntry = await BoothQueue.findById(queueId)
            .populate('jobSeeker', 'name email');

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Add text message from recruiter
        await queueEntry.addMessage({ type: 'text', content, sender: 'recruiter' });
        await queueEntry.updateActivity();

        // Emit socket event to job seeker
        if (req.app.get('io')) {
            req.app.get('io').to(`user_${queueEntry.jobSeeker._id}`).emit('new-message-from-recruiter', {
                queueId: queueEntry._id,
                boothId: queueEntry.booth,
                message: { type: 'text', content, sender: 'recruiter', createdAt: new Date() }
            });
        }

        res.json({
            success: true,
            message: 'Message sent successfully'
        });

    } catch (error) {
        console.error('Error sending message to job seeker:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

// Get messages for a queue entry
router.get('/messages/:queueId', authenticateToken, async (req, res) => {
    try {
        const { queueId } = req.params;
        const userId = req.user._id;
        const userRole = req.user.role;

        const queueEntry = await BoothQueue.findById(queueId);

        if (!queueEntry) {
            return res.status(404).json({
                success: false,
                message: 'Queue entry not found'
            });
        }

        // Check permissions
        const isJobSeeker = queueEntry.jobSeeker.toString() === userId.toString();
        const isRecruiter = ['Admin', 'Recruiter', 'GlobalSupport'].includes(userRole);

        if (!isJobSeeker && !isRecruiter) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions'
            });
        }

        // Mark messages as read based on user type
        if (isRecruiter) {
            await queueEntry.markMessagesAsRead('jobseeker');
        } else if (isJobSeeker) {
            await queueEntry.markMessagesAsRead('recruiter');
        }

        res.json({
            success: true,
            messages: queueEntry.messages,
            unreadCount: isJobSeeker ? queueEntry.unreadForJobSeeker : queueEntry.messageCount
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
            const updateData = {
                boothId: queueEntry.booth,
                action: 'removed',
                queueEntry: queueEntry.toJSON()
            };
            req.app.get('io').to(`booth_${queueEntry.booth}`).emit('queue-updated', updateData);
            req.app.get('io').to(`booth_management_${queueEntry.booth}`).emit('queue-updated', updateData);
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

// Manual cleanup endpoint for stuck queue entries
router.post('/cleanup', authenticateToken, async (req, res) => {
    try {
        const jobSeekerId = req.user._id;
        
        // Find all queue entries for this user
        const userQueues = await BoothQueue.find({
            jobSeeker: jobSeekerId,
            status: { $in: ['waiting', 'invited', 'in_meeting'] }
        });

        let cleanedCount = 0;
        const VideoCall = require('../models/VideoCall');

        for (const queueEntry of userQueues) {
            let shouldCleanup = false;

            if (queueEntry.status === 'in_meeting') {
                // Check if there's an active video call
                const activeCall = await VideoCall.findOne({
                    queueEntry: queueEntry._id,
                    status: 'active'
                });
                shouldCleanup = !activeCall;
            } else {
                // For waiting/invited, cleanup if older than 1 minute
                const oneMinuteAgo = new Date(Date.now() - 1 * 60 * 1000);
                shouldCleanup = queueEntry.createdAt < oneMinuteAgo;
            }

            if (shouldCleanup) {
                await queueEntry.leaveQueue();
                cleanedCount++;
                logger.info(`Manual cleanup: removed queue entry for user ${jobSeekerId} in booth ${queueEntry.booth} (status: ${queueEntry.status})`);
            }
        }

        res.json({
            success: true,
            message: `Cleaned up ${cleanedCount} queue entries`,
            cleanedCount
        });

    } catch (error) {
        logger.error('Manual cleanup error:', error);
        res.status(500).json({
            error: 'Failed to cleanup queue entries',
            details: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
