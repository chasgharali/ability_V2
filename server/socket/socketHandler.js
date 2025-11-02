const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Queue = require('../models/Queue');
const BoothQueue = require('../models/BoothQueue');
const MeetingRecord = require('../models/MeetingRecord');
const VideoCall = require('../models/VideoCall');
const logger = require('../utils/logger');

/**
 * Socket.IO connection handler with authentication and real-time features
 * @param {Object} io - Socket.IO server instance
 */
const socketHandler = (io) => {
    // Middleware to authenticate socket connections
    io.use(async (socket, next) => {
        try {
            // Accept token from multiple places and normalize 'Bearer ' prefix
            const authToken = socket.handshake.auth?.token
                || socket.handshake.headers?.authorization
                || socket.handshake.query?.token;

            if (!authToken) {
                return next(new Error('Authentication token required'));
            }

            const token = authToken.startsWith('Bearer ')
                ? authToken.slice(7)
                : authToken;

            // Verify JWT token
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            const user = await User.findById(decoded.userId).select('-hashedPassword -refreshTokens');

            if (!user || !user.isActive) {
                return next(new Error('Invalid or inactive user'));
            }

            socket.userId = user._id.toString();
            socket.user = user;
            next();
        } catch (error) {
            logger.error('Socket authentication error:', error);
            next(new Error('Authentication failed'));
        }
    });

    io.on('connection', (socket) => {
        logger.info(`User ${socket.user.email} connected via socket`);

        // Join user-specific room
        socket.join(`user:${socket.userId}`);

        // Join role-specific room
        socket.join(`role:${socket.user.role}`);

        /**
         * Join queue room for real-time updates
         */
        socket.on('join-queue-room', async (data) => {
            try {
                const { queueId } = data;

                if (!queueId) {
                    socket.emit('error', { message: 'Queue ID is required' });
                    return;
                }

                // Verify queue exists and user has access
                const queue = await Queue.findById(queueId);
                if (!queue) {
                    socket.emit('error', { message: 'Queue not found' });
                    return;
                }

                // Check if user is in the queue or has permission to view it
                const userPosition = queue.getUserPosition(socket.userId);
                const canViewQueue = ['Admin', 'GlobalSupport', 'BoothAdmin', 'Recruiter', 'AdminEvent'].includes(socket.user.role);

                if (!userPosition && !canViewQueue) {
                    socket.emit('error', { message: 'Access denied to queue room' });
                    return;
                }

                socket.join(`queue:${queueId}`);
                socket.currentQueueId = queueId;

                // Send current queue status
                const queueStatus = queue.getStatus();
                socket.emit('queue-status', {
                    queueId,
                    status: queueStatus,
                    userPosition: userPosition
                });

                logger.info(`User ${socket.user.email} joined queue room ${queueId}`);
            } catch (error) {
                logger.error('Join queue room error:', error);
                socket.emit('error', { message: 'Failed to join queue room' });
            }
        });

        /**
         * Leave queue room
         */
        socket.on('leave-queue-room', (data) => {
            const { queueId } = data;
            if (queueId) {
                socket.leave(`queue:${queueId}`);
                if (socket.currentQueueId === queueId) {
                    socket.currentQueueId = null;
                }
                logger.info(`User ${socket.user.email} left queue room ${queueId}`);
            }
        });

        /**
         * Join call room for video/audio communication
         */
        socket.on('join-call-room', async (data) => {
            try {
                const { meetingId, twilioRoomId } = data;

                if (!meetingId || !twilioRoomId) {
                    socket.emit('error', { message: 'Meeting ID and Twilio room ID are required' });
                    return;
                }

                // Verify meeting exists and user is a participant
                const meeting = await MeetingRecord.findById(meetingId);
                if (!meeting) {
                    socket.emit('error', { message: 'Meeting not found' });
                    return;
                }

                // Check if user is a participant in the meeting
                const isParticipant = meeting.recruiterId.equals(socket.userId) ||
                    meeting.jobseekerId.equals(socket.userId) ||
                    meeting.interpreterId?.equals(socket.userId);

                if (!isParticipant && !['Admin', 'GlobalSupport'].includes(socket.user.role)) {
                    socket.emit('error', { message: 'Access denied to call room' });
                    return;
                }

                socket.join(`call:${meetingId}`);
                socket.currentMeetingId = meetingId;

                // Notify other participants that user joined
                socket.to(`call:${meetingId}`).emit('participant-joined', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile(),
                    role: socket.user.role
                });

                // Send current call participants
                const participants = await getCallParticipants(meetingId);
                socket.emit('call-participants', participants);

                logger.info(`User ${socket.user.email} joined call room ${meetingId}`);
            } catch (error) {
                logger.error('Join call room error:', error);
                socket.emit('error', { message: 'Failed to join call room' });
            }
        });

        /**
         * Leave call room
         */
        socket.on('leave-call-room', (data) => {
            const { meetingId } = data;
            if (meetingId) {
                socket.leave(`call:${meetingId}`);

                // Notify other participants that user left
                socket.to(`call:${meetingId}`).emit('participant-left', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile()
                });

                if (socket.currentMeetingId === meetingId) {
                    socket.currentMeetingId = null;
                }
                logger.info(`User ${socket.user.email} left call room ${meetingId}`);
            }
        });

        /**
         * Send chat message in call
         */
        socket.on('call-message', async (data) => {
            try {
                const { meetingId, message, messageType = 'text' } = data;

                if (!meetingId || !message) {
                    socket.emit('error', { message: 'Meeting ID and message are required' });
                    return;
                }

                // Verify meeting exists and user is a participant
                const meeting = await MeetingRecord.findById(meetingId);
                if (!meeting) {
                    socket.emit('error', { message: 'Meeting not found' });
                    return;
                }

                // Check if user is a participant
                const isParticipant = meeting.recruiterId.equals(socket.userId) ||
                    meeting.jobseekerId.equals(socket.userId) ||
                    meeting.interpreterId?.equals(socket.userId);

                if (!isParticipant) {
                    socket.emit('error', { message: 'Access denied to send messages' });
                    return;
                }

                // Add message to meeting record
                await meeting.addChatMessage(socket.userId, message, messageType);

                // Broadcast message to all participants
                const messageData = {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile(),
                    message,
                    messageType,
                    timestamp: new Date()
                };

                io.to(`call:${meetingId}`).emit('call-message', messageData);

                logger.info(`User ${socket.user.email} sent message in call ${meetingId}`);
            } catch (error) {
                logger.error('Call message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Send chat message in video call
         */
        socket.on('video-call-message', async (data) => {
            try {
                const { callId, message } = data;

                if (!callId || !message) {
                    socket.emit('error', { message: 'Call ID and message are required' });
                    return;
                }

                // Verify video call exists and user is a participant
                const videoCall = await VideoCall.findById(callId)
                    .populate('recruiter jobSeeker interpreters.interpreter');

                if (!videoCall) {
                    socket.emit('error', { message: 'Video call not found' });
                    return;
                }

                // Check if user is a participant
                const hasAccess = videoCall.recruiter._id.toString() === socket.userId ||
                                 videoCall.jobSeeker._id.toString() === socket.userId ||
                                 videoCall.interpreters.some(i => i.interpreter._id.toString() === socket.userId);

                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to send messages' });
                    return;
                }

                // Add message to video call record
                const messageData = {
                    sender: {
                        id: socket.userId,
                        name: socket.user.name,
                        role: socket.user.role
                    },
                    message: message.message,
                    timestamp: message.timestamp || new Date().toISOString(),
                    messageType: message.messageType || 'text'
                };

                videoCall.chatMessages.push(messageData);
                await videoCall.save();

                // Broadcast message to all participants in the video call room
                // Use the same room format as join-video-call handler
                io.to(`call_${videoCall.roomName}`).emit('video-call-message', messageData);

                logger.info(`User ${socket.user.email} sent message in video call ${callId}`);
            } catch (error) {
                logger.error('Video call message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Request interpreter for call
         */
        socket.on('request-interpreter', async (data) => {
            try {
                const { meetingId, reason, language } = data;

                if (!meetingId) {
                    socket.emit('error', { message: 'Meeting ID is required' });
                    return;
                }

                // Verify meeting exists and user is recruiter
                const meeting = await MeetingRecord.findById(meetingId);
                if (!meeting) {
                    socket.emit('error', { message: 'Meeting not found' });
                    return;
                }

                if (!meeting.recruiterId.equals(socket.userId)) {
                    socket.emit('error', { message: 'Only recruiters can request interpreters' });
                    return;
                }

                // Request interpreter
                await meeting.requestInterpreter(socket.userId, reason, language);

                // Notify available interpreters
                io.to('role:Interpreter').to('role:GlobalInterpreter').emit('interpreter-request', {
                    meetingId,
                    reason,
                    language,
                    requestedBy: socket.user.getPublicProfile(),
                    boothId: meeting.boothId,
                    eventId: meeting.eventId
                });

                // Notify call participants
                io.to(`call:${meetingId}`).emit('interpreter-requested', {
                    reason,
                    language,
                    requestedBy: socket.user.getPublicProfile()
                });

                logger.info(`Interpreter requested for meeting ${meetingId} by ${socket.user.email}`);
            } catch (error) {
                logger.error('Interpreter request error:', error);
                socket.emit('error', { message: 'Failed to request interpreter' });
            }
        });

        /**
         * Accept interpreter request
         */
        socket.on('accept-interpreter-request', async (data) => {
            try {
                const { meetingId } = data;

                if (!meetingId) {
                    socket.emit('error', { message: 'Meeting ID is required' });
                    return;
                }

                // Verify meeting exists and user is interpreter
                const meeting = await MeetingRecord.findById(meetingId);
                if (!meeting) {
                    socket.emit('error', { message: 'Meeting not found' });
                    return;
                }

                if (!['Interpreter', 'GlobalInterpreter'].includes(socket.user.role)) {
                    socket.emit('error', { message: 'Only interpreters can accept interpreter requests' });
                    return;
                }

                // Accept interpreter request
                await meeting.acceptInterpreterRequest(socket.userId);

                // Notify call participants
                io.to(`call:${meetingId}`).emit('interpreter-accepted', {
                    interpreter: socket.user.getPublicProfile()
                });

                logger.info(`Interpreter request accepted for meeting ${meetingId} by ${socket.user.email}`);
            } catch (error) {
                logger.error('Accept interpreter request error:', error);
                socket.emit('error', { message: 'Failed to accept interpreter request' });
            }
        });

        /**
         * Join booth queue room for real-time updates
         */
        socket.on('join-booth-queue', async (data) => {
            const { boothId, userId, eventSlug } = data;
            if (boothId && userId === socket.userId) {
                socket.join(`booth_${boothId}`);
                socket.join(`user_${userId}`);
                socket.currentBoothId = boothId;

                // Update activity timestamp for job seekers
                if (socket.user.role === 'JobSeeker') {
                    try {
                        const BoothQueue = require('../models/BoothQueue');
                        const queueEntry = await BoothQueue.findOne({
                            jobSeeker: socket.userId,
                            booth: boothId,
                            status: { $in: ['waiting', 'invited'] }
                        });

                        if (queueEntry) {
                            await queueEntry.updateActivity();
                        }
                    } catch (error) {
                        logger.error('Error updating queue activity:', error);
                    }
                }

                logger.info(`User ${socket.user.email} joined booth queue room ${boothId}`);
            }
        });

        /**
         * Leave booth queue room
         */
        socket.on('leave-booth-queue', (data) => {
            const { boothId, userId } = data;
            if (boothId && userId === socket.userId) {
                socket.leave(`booth_${boothId}`);
                if (socket.currentBoothId === boothId) {
                    socket.currentBoothId = null;
                }
                logger.info(`User ${socket.user.email} left booth queue room ${boothId}`);
            }
        });

        /**
         * Join booth management room (for recruiters)
         */
        socket.on('join-booth-management', (data) => {
            const { boothId, userId } = data;
            console.log('join-booth-management event received:', { boothId, userId, userRole: socket.user.role });
            if (boothId && userId === socket.userId && ['Admin', 'Recruiter', 'GlobalSupport'].includes(socket.user.role)) {
                socket.join(`booth_management_${boothId}`);
                socket.currentManagementBoothId = boothId;
                logger.info(`User ${socket.user.email} joined booth management room ${boothId}`);
                console.log(`User joined booth_management_${boothId} room`);

                // Verify the room was joined
                const rooms = Array.from(socket.rooms);
                console.log(`User ${socket.user.email} is now in rooms:`, rooms);
            } else {
                console.log('Failed to join booth management room:', { boothId, userId, userRole: socket.user.role });
            }
        });

        /**
         * Leave booth management room
         */
        socket.on('leave-booth-management', (data) => {
            const { boothId, userId } = data;
            if (boothId && userId === socket.userId) {
                socket.leave(`booth_management_${boothId}`);
                if (socket.currentManagementBoothId === boothId) {
                    socket.currentManagementBoothId = null;
                }
                logger.info(`User ${socket.user.email} left booth management room ${boothId}`);
            }
        });

        /**
         * Update serving number (from recruiter)
         */
        socket.on('serving-number-updated', (data) => {
            const { boothId, currentServing } = data;
            if (boothId && ['Admin', 'Recruiter', 'GlobalSupport'].includes(socket.user.role)) {
                // Broadcast to all job seekers in this booth's queue
                socket.to(`booth_${boothId}`).emit('queue-serving-updated', {
                    boothId,
                    currentServing
                });
                logger.info(`Serving number updated for booth ${boothId}: ${currentServing}`);
            }
        });

        /**
         * Handle queue heartbeat from job seekers
         */
        socket.on('queue-heartbeat', async (data) => {
            const { boothId, userId } = data;
            if (boothId && userId === socket.userId && socket.user.role === 'JobSeeker') {
                try {
                    const BoothQueue = require('../models/BoothQueue');
                    const queueEntry = await BoothQueue.findOne({
                        jobSeeker: socket.userId,
                        booth: boothId,
                        status: { $in: ['waiting', 'invited'] }
                    });

                    if (queueEntry) {
                        await queueEntry.updateActivity();
                        logger.debug(`Heartbeat received from user ${socket.user.email} for booth ${boothId}`);
                    }
                } catch (error) {
                    logger.error('Error handling queue heartbeat:', error);
                }
            }
        });

        /**
         * Join video call room
         */
        socket.on('join-video-call', async (data) => {
            try {
                const { callId, roomName } = data;

                if (!callId || !roomName) {
                    socket.emit('error', { message: 'Call ID and room name are required' });
                    return;
                }

                // Verify video call exists and user has access
                const videoCall = await VideoCall.findById(callId)
                    .populate('recruiter jobSeeker interpreters.interpreter');

                if (!videoCall) {
                    socket.emit('error', { message: 'Video call not found' });
                    return;
                }

                // Check if user has access to this call
                const hasAccess = videoCall.recruiter._id.toString() === socket.userId ||
                                 videoCall.jobSeeker._id.toString() === socket.userId ||
                                 videoCall.interpreters.some(i => i.interpreter._id.toString() === socket.userId);

                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to video call' });
                    return;
                }

                socket.join(`call_${roomName}`);
                socket.currentVideoCallId = callId;
                socket.currentVideoCallRoom = roomName;

                // Notify other participants that user joined
                socket.to(`call_${roomName}`).emit('participant-joined-video', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile(),
                    role: socket.user.role
                });

                logger.info(`User ${socket.user.email} joined video call room ${roomName}`);
            } catch (error) {
                logger.error('Join video call room error:', error);
                socket.emit('error', { message: 'Failed to join video call room' });
            }
        });

        /**
         * Leave video call room
         */
        socket.on('leave-video-call', (data) => {
            const { roomName } = data;
            if (roomName) {
                socket.leave(`call_${roomName}`);

                // Notify other participants that user left
                socket.to(`call_${roomName}`).emit('participant-left-video', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile()
                });

                if (socket.currentVideoCallRoom === roomName) {
                    socket.currentVideoCallId = null;
                    socket.currentVideoCallRoom = null;
                }
                logger.info(`User ${socket.user.email} left video call room ${roomName}`);
            }
        });

        /**
         * Handle video call participant status updates
         */
        socket.on('video-participant-status', (data) => {
            const { roomName, status, participantSid } = data;
            if (roomName && socket.currentVideoCallRoom === roomName) {
                // Broadcast status update to other participants
                socket.to(`call_${roomName}`).emit('participant-status-update', {
                    userId: socket.userId,
                    status: status,
                    participantSid: participantSid,
                    timestamp: new Date()
                });
            }
        });

        /**
         * Handle video call quality updates
         */
        socket.on('video-call-quality', async (data) => {
            try {
                const { callId, qualityData } = data;
                if (callId && socket.currentVideoCallId === callId) {
                    // Update call quality in database
                    const videoCall = await VideoCall.findById(callId);
                    if (videoCall) {
                        if (!videoCall.callQuality) {
                            videoCall.callQuality = {};
                        }
                        Object.assign(videoCall.callQuality, qualityData);
                        await videoCall.save();
                    }
                }
            } catch (error) {
                logger.error('Video call quality update error:', error);
            }
        });

        /**
         * Handle interpreter response to invitation
         */
        socket.on('interpreter-response', async (data) => {
            try {
                const { callId, response } = data; // response: 'accept' or 'decline'

                if (!callId || !response) {
                    socket.emit('error', { message: 'Call ID and response are required' });
                    return;
                }

                const videoCall = await VideoCall.findById(callId)
                    .populate('recruiter jobSeeker');

                if (!videoCall) {
                    socket.emit('error', { message: 'Video call not found' });
                    return;
                }

                // Update interpreter status
                const status = response === 'accept' ? 'joined' : 'declined';
                await videoCall.updateInterpreterStatus(socket.userId, status);

                // Notify call participants
                const responseData = {
                    callId: callId,
                    interpreter: socket.user.getPublicProfile(),
                    response: response,
                    timestamp: new Date()
                };

                io.to(`call_${videoCall.roomName}`).emit('interpreter-response', responseData);

                // Add system message to chat
                const message = response === 'accept' 
                    ? `${socket.user.name} joined as interpreter`
                    : `${socket.user.name} declined interpreter invitation`;
                
                await videoCall.addChatMessage(
                    socket.userId,
                    'interpreter',
                    message,
                    'system'
                );

                logger.info(`Interpreter ${socket.user.email} ${response}ed call ${callId}`);
            } catch (error) {
                logger.error('Interpreter response error:', error);
                socket.emit('error', { message: 'Failed to process interpreter response' });
            }
        });

        /**
         * Test connection handler
         */
        socket.on('test-connection', (data) => {
            console.log('Test connection received from user:', socket.user.email, data);
            socket.emit('test-connection-response', {
                message: 'Connection test successful',
                userId: socket.userId,
                timestamp: new Date()
            });
        });

        /**
         * Handle disconnection
         */
        socket.on('disconnect', async (reason) => {
            logger.info(`User ${socket.user.email} disconnected: ${reason}`);

            // Notify call participants if user was in a call
            if (socket.currentMeetingId) {
                socket.to(`call:${socket.currentMeetingId}`).emit('participant-disconnected', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile()
                });
            }

            // Notify video call participants if user was in a video call
            if (socket.currentVideoCallRoom) {
                socket.to(`call_${socket.currentVideoCallRoom}`).emit('participant-left-video', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile(),
                    reason: 'disconnected'
                });

                // Update participant status in video call
                try {
                    if (socket.currentVideoCallId) {
                        const videoCall = await VideoCall.findById(socket.currentVideoCallId);
                        if (videoCall) {
                            await videoCall.removeParticipant(socket.userId);
                        }
                    }
                } catch (error) {
                    logger.error('Error updating video call on disconnect:', error);
                }
            }

            // Clean up queue entries for job seekers who disconnect
            if (socket.user.role === 'JobSeeker') {
                try {
                    const BoothQueue = require('../models/BoothQueue');

                    // Find any active queue entries for this user
                    const activeQueues = await BoothQueue.find({
                        jobSeeker: socket.userId,
                        status: { $in: ['waiting', 'invited'] }
                    });

                    // Leave all active queues
                    for (const queueEntry of activeQueues) {
                        await queueEntry.leaveQueue();

                        // Notify booth management about queue update
                        const updateData = {
                            boothId: queueEntry.booth,
                            action: 'left',
                            queueEntry: {
                                _id: queueEntry._id,
                                jobSeeker: socket.user.getPublicProfile(),
                                position: queueEntry.position,
                                status: 'left'
                            }
                        };
                        socket.to(`booth_${queueEntry.booth}`).emit('queue-updated', updateData);
                        socket.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', updateData);

                        logger.info(`Auto-removed user ${socket.user.email} from queue for booth ${queueEntry.booth} due to disconnect`);
                    }
                } catch (error) {
                    logger.error('Error cleaning up queue on disconnect:', error);
                }
            }
        });
    });

    /**
     * Helper function to get call participants
     */
    const getCallParticipants = async (meetingId) => {
        try {
            const meeting = await MeetingRecord.findById(meetingId)
                .populate('recruiterId', 'name email role')
                .populate('jobseekerId', 'name email role')
                .populate('interpreterId', 'name email role');

            if (!meeting) return [];

            const participants = [
                {
                    userId: meeting.recruiterId._id,
                    user: meeting.recruiterId.getPublicProfile(),
                    role: 'recruiter'
                },
                {
                    userId: meeting.jobseekerId._id,
                    user: meeting.jobseekerId.getPublicProfile(),
                    role: 'jobseeker'
                }
            ];

            if (meeting.interpreterId) {
                participants.push({
                    userId: meeting.interpreterId._id,
                    user: meeting.interpreterId.getPublicProfile(),
                    role: 'interpreter'
                });
            }

            return participants;
        } catch (error) {
            logger.error('Get call participants error:', error);
            return [];
        }
    };

    /**
     * Broadcast queue updates to all connected clients in the queue room
     */
    const broadcastQueueUpdate = async (queueId) => {
        try {
            const queue = await Queue.findById(queueId);
            if (!queue) return;

            const queueStatus = queue.getStatus();

            io.to(`queue:${queueId}`).emit('queue-update', {
                queueId,
                status: queueStatus,
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Broadcast queue update error:', error);
        }
    };

    /**
     * Broadcast meeting updates to all connected clients in the meeting room
     */
    const broadcastMeetingUpdate = async (meetingId) => {
        try {
            const meeting = await MeetingRecord.findById(meetingId);
            if (!meeting) return;

            io.to(`call:${meetingId}`).emit('meeting-update', {
                meetingId,
                status: meeting.status,
                participants: await getCallParticipants(meetingId),
                timestamp: new Date()
            });
        } catch (error) {
            logger.error('Broadcast meeting update error:', error);
        }
    };

    // Export functions for use in other parts of the application
    return {
        broadcastQueueUpdate,
        broadcastMeetingUpdate,
        getCallParticipants
    };
};

module.exports = socketHandler;
