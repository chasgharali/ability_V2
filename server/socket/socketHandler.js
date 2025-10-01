const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Queue = require('../models/Queue');
const BoothQueue = require('../models/BoothQueue');
const MeetingRecord = require('../models/MeetingRecord');
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
        socket.on('join-booth-queue', (data) => {
            const { boothId, userId, eventSlug } = data;
            if (boothId && userId === socket.userId) {
                socket.join(`booth_${boothId}`);
                socket.join(`user_${userId}`);
                socket.currentBoothId = boothId;
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
            if (boothId && userId === socket.userId && ['Admin', 'Recruiter', 'GlobalSupport'].includes(socket.user.role)) {
                socket.join(`booth_management_${boothId}`);
                socket.currentManagementBoothId = boothId;
                logger.info(`User ${socket.user.email} joined booth management room ${boothId}`);
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
         * Handle disconnection
         */
        socket.on('disconnect', (reason) => {
            logger.info(`User ${socket.user.email} disconnected: ${reason}`);

            // Notify call participants if user was in a call
            if (socket.currentMeetingId) {
                socket.to(`call:${socket.currentMeetingId}`).emit('participant-disconnected', {
                    userId: socket.userId,
                    user: socket.user.getPublicProfile()
                });
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
