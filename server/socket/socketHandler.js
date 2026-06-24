const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Queue = require('../models/Queue');
const BoothQueue = require('../models/BoothQueue');
const MeetingRecord = require('../models/MeetingRecord');
const VideoCall = require('../models/VideoCall');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const logger = require('../utils/logger');
const liveStatsStore = require('../utils/liveStatsStore');
const deepgramService = require('../services/deepgramService');
const openaiCaptionService = require('../services/openaiCaptionService');
const { endRoom } = require('../config/twilio');
const { toStablePublicImageUrl } = require('../utils/mediaUrl');

/**
 * Resolve a populated or raw ObjectId ref to a string id (avoids assuming .\_id exists).
 */
function participantRefToId(ref) {
    if (!ref) return '';
    const id = ref._id ?? ref;
    try {
        return id.toString();
    } catch {
        return '';
    }
}

/** Normalized caption role for the client (recruiter | jobseeker | interpreter), or null to let the client infer. */
function captionParticipantRoleFromUser(user) {
    if (!user || !user.role) return null;
    const r = String(user.role).trim().toLowerCase();
    if (r === 'recruiter') return 'recruiter';
    if (r === 'jobseeker') return 'jobseeker';
    if (r === 'interpreter' || r === 'globalinterpreter') return 'interpreter';
    return null;
}

/** Resolve a participant's role within an active video call (recruiter | jobseeker | interpreter). */
function getVideoCallSenderRole(videoCall, userId) {
    const uid = String(userId);
    if (participantRefToId(videoCall.recruiter) === uid) return 'recruiter';
    if (participantRefToId(videoCall.jobSeeker) === uid) return 'jobseeker';
    const isInterpreter = (videoCall.interpreters || []).some(
        (entry) => entry.interpreter && participantRefToId(entry.interpreter) === uid
    );
    if (isInterpreter) return 'interpreter';
    return null;
}

/**
 * Minimal user payload for Socket.IO. Full getPublicProfile() includes metadata (Mixed) and
 * other fields that can be extremely deep and cause "Maximum call stack size exceeded"
 * when socket.io JSON-encodes the packet.
 */
function socketSafeUser(user) {
    if (!user) return {};
    const id = user._id || user.id;
    if (!id) return {};
    let orgId = user.organizationId;
    if (orgId && typeof orgId === 'object' && orgId._id) {
        orgId = orgId._id;
    }
    return {
        _id: id,
        name: user.name,
        email: user.email,
        role: user.role,
        avatarUrl: toStablePublicImageUrl(user.avatarUrl),
        phoneNumber: user.phoneNumber || undefined,
        organizationId: orgId || undefined
    };
}

/**
 * Socket.IO connection handler with authentication and real-time features
 * @param {Object} io - Socket.IO server instance
 */
let _io = null;
const handleRecruiterDisconnectCleanup = async ({ io, callId, recruiterId }) => {
    try {
        const callIdStr = String(callId);
        const recruiterIdStr = String(recruiterId);

        const videoCall = await VideoCall.findById(callIdStr);
        if (!videoCall || videoCall.status !== 'active') {
            return;
        }

        if (participantRefToId(videoCall.recruiter) !== recruiterIdStr) {
            return;
        }

        await videoCall.endCall();

        const queueEntry = await BoothQueue.findById(videoCall.queueEntry)
            .populate('jobSeeker', 'name email avatarUrl resumeUrl linkedInUrl phoneNumber city state metadata')
            .populate('interpreterCategory', 'name code');

        if (queueEntry && ['invited', 'in_meeting'].includes(queueEntry.status)) {
            queueEntry.status = 'waiting';
            queueEntry.lastActivity = new Date();
            await queueEntry.save();

            const queueUpdateData = {
                boothId: String(queueEntry.booth),
                action: 'status_changed',
                queueEntry: queueEntry.toJSON()
            };

            io.to(`booth_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
            io.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
        }

        try {
            await endRoom(videoCall.roomName);
        } catch (twilioError) {
            logger.warn(`Failed to end Twilio room ${videoCall.roomName} after recruiter disconnect`, twilioError);
        }

        io.to(`call_${videoCall.roomName}`).emit('call_ended', {
            callId: callIdStr,
            endedBy: recruiterIdStr,
            reason: 'recruiter_disconnected'
        });

        logger.info(`Ended call ${callIdStr} immediately after recruiter ${recruiterIdStr} disconnected`);
    } catch (error) {
        logger.error('Error handling recruiter disconnect cleanup:', error);
    }
};

const getIO = () => {
    if (!_io) {
        throw new Error('Socket.IO has not been initialized yet');
    }
    return _io;
};

const getCaptionService = () => {
    const provider = (process.env.CAPTION_PROVIDER || 'openai').toLowerCase();
    if (provider === 'deepgram' && deepgramService.isAvailable()) {
        return { service: deepgramService, provider: 'deepgram' };
    }

    if (openaiCaptionService.isAvailable()) {
        return { service: openaiCaptionService, provider: 'openai' };
    }

    if (deepgramService.isAvailable()) {
        return { service: deepgramService, provider: 'deepgram' };
    }

    return { service: null, provider: provider };
};

const socketHandler = (io) => {
    _io = io;
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

        liveStatsStore.userConnected(socket.user);
        const canSetTeamChatStatus = liveStatsStore.canSetChatStatus(socket.user.role);

        // Join user-specific room
        socket.join(`user:${socket.userId}`);

        // Join role-specific room
        socket.join(`role:${socket.user.role}`);

        // Broadcast user online status
        socket.broadcast.emit('user-online', {
            userId: socket.userId,
            userName: socket.user.name,
            chatStatus: liveStatsStore.getChatStatus(socket.userId) || 'online',
            timestamp: new Date()
        });

        // Handle request for online users list
        socket.on('request-online-users', () => {
            // Get all connected socket IDs
            const connectedSockets = io.sockets.sockets;
            const onlineUserIds = [];
            
            connectedSockets.forEach((connectedSocket) => {
                if (connectedSocket.userId && connectedSocket.userId !== socket.userId) {
                    onlineUserIds.push(connectedSocket.userId);
                }
            });
            
            logger.info(`Sending online users list to ${socket.user.email}: ${onlineUserIds.length} users`);
            socket.emit('online-users-list', {
                userIds: onlineUserIds,
                chatStatuses: liveStatsStore.getAllChatStatuses(),
                timestamp: new Date()
            });
        });

        socket.on('set-chat-status', (data = {}) => {
            try {
                const { status } = data;

                if (!canSetTeamChatStatus) {
                    socket.emit('error', { message: 'Your role cannot set team chat status' });
                    return;
                }

                if (!['online', 'away', 'meeting', 'offline'].includes(status)) {
                    socket.emit('error', { message: 'Invalid status. Must be online, away, meeting, or offline.' });
                    return;
                }

                const success = liveStatsStore.setChatStatus(socket.userId, status);
                if (!success) {
                    socket.emit('error', { message: 'Failed to update chat status' });
                    return;
                }

                socket.emit('chat-status-updated', {
                    userId: socket.userId,
                    status,
                    timestamp: new Date()
                });

                socket.broadcast.emit('user-chat-status-changed', {
                    userId: socket.userId,
                    userName: socket.user.name,
                    status,
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error('Set chat status error:', error);
                socket.emit('error', { message: 'Failed to update chat status' });
            }
        });

        socket.on('get-chat-status', () => {
            try {
                socket.emit('chat-status', {
                    userId: socket.userId,
                    status: liveStatsStore.getChatStatus(socket.userId) || 'online',
                    canSetStatus: canSetTeamChatStatus,
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error('Get chat status error:', error);
                socket.emit('error', { message: 'Failed to get chat status' });
            }
        });

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

                liveStatsStore.userJoinedCall({
                    sessionId: `meeting:${meetingId}`,
                    boothId: meeting.boothId,
                    eventId: meeting.eventId
                }, socket.user);

                // Notify other participants that user joined
                socket.to(`call:${meetingId}`).emit('participant-joined', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user),
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
                liveStatsStore.userLeftCall(socket.userId);

                // Notify other participants that user left
                socket.to(`call:${meetingId}`).emit('participant-left', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user)
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
                    user: socketSafeUser(socket.user),
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
                const messageText = typeof message === 'string'
                    ? message.trim()
                    : String(message?.message || message?.content || '').trim();
                const messageType = message?.messageType || 'text';

                if (!callId || !messageText) {
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
                const hasAccess = participantRefToId(videoCall.recruiter) === socket.userId ||
                                 participantRefToId(videoCall.jobSeeker) === socket.userId ||
                                 videoCall.interpreters.some(
                                     (i) => i.interpreter && participantRefToId(i.interpreter) === socket.userId
                                 );

                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to send messages' });
                    return;
                }

                // Persist using schema-compatible fields — role is based on call participation, not account role.
                const normalizedSenderRole = getVideoCallSenderRole(videoCall, socket.userId)
                    || captionParticipantRoleFromUser(socket.user)
                    || 'participant';
                const timestamp = message?.timestamp || new Date().toISOString();

                videoCall.chatMessages.push({
                    sender: socket.userId,
                    senderRole: normalizedSenderRole,
                    message: messageText,
                    timestamp,
                    messageType
                });
                await videoCall.save();

                // Broadcast client-friendly payload.
                const messageData = {
                    sender: {
                        id: socket.userId,
                        name: socket.user.name,
                        role: normalizedSenderRole
                    },
                    senderRole: normalizedSenderRole,
                    message: messageText,
                    timestamp,
                    messageType
                };

                // Broadcast message to all participants in the video call room
                // Use the same room format as join-video-call handler
                const roomName = `call_${videoCall.roomName}`;
                console.log(`DEBUG: Broadcasting message to room ${roomName}`);
                console.log(`DEBUG: Message data:`, messageData);
                console.log(`DEBUG: Room size:`, io.sockets.adapter.rooms.get(roomName)?.size || 0);
                console.log(`DEBUG: Sockets in room:`, Array.from(io.sockets.adapter.rooms.get(roomName) || []));
                
                io.to(roomName).emit('video-call-message', messageData);

                logger.info(`User ${socket.user.email} sent message in video call ${callId}`);
            } catch (error) {
                logger.error('Video call message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        /**
         * Simple video call message (direct broadcast without database)
         */
        socket.on('video-call-message-direct', async (data) => {
            try {
                const { roomName, message } = data;
                
                console.log(`DEBUG: Direct message received from ${socket.user.email}`);
                console.log(`DEBUG: Room: ${roomName}, Message: ${message}`);
                
                if (!roomName || !message) {
                    socket.emit('error', { message: 'Room name and message are required' });
                    return;
                }
                
                const senderRole = captionParticipantRoleFromUser(socket.user) || 'participant';
                const messageData = {
                    sender: {
                        id: socket.userId,
                        name: socket.user.name,
                        role: senderRole
                    },
                    senderRole,
                    message: message,
                    timestamp: new Date().toISOString(),
                    messageType: 'text'
                };
                
                const fullRoomName = `call_${roomName}`;
                console.log(`DEBUG: Broadcasting direct message to room ${fullRoomName}`);
                console.log(`DEBUG: Room size:`, io.sockets.adapter.rooms.get(fullRoomName)?.size || 0);
                
                // Broadcast to all participants including sender
                io.to(fullRoomName).emit('video-call-message-direct', messageData);
                
                logger.info(`User ${socket.user.email} sent direct message to room ${fullRoomName}`);
            } catch (error) {
                logger.error('Direct video call message error:', error);
                socket.emit('error', { message: 'Failed to send direct message' });
            }
        });

        /**
         * Caption Audio Stream - Receive audio chunks for Deepgram transcription
         * This enables real-time captions using professional speech-to-text
         */
        socket.on('caption-audio-stream', async (data) => {
            try {
                const { callId, roomName, participantId, participantName, audioChunk, isStart, isEnd } = data;
                
                if (!callId || !roomName || !participantId) {
                    logger.warn('Caption audio stream missing required fields');
                    return;
                }

                const connectionKey = `${callId}_${participantId}`;

                // Start new transcription session
                if (isStart) {
                    const { service: captionService, provider } = getCaptionService();
                    if (!captionService) {
                        logger.error('❌ No caption service available - configure OPENAI_API_KEY or DEEPGRAM_API_KEY');
                        socket.emit('caption-error', { 
                            message: 'Caption service not configured. Please contact administrator.',
                            code: 'SERVICE_UNAVAILABLE',
                            details: 'OPENAI_API_KEY and DEEPGRAM_API_KEY are not configured'
                        });
                        return;
                    }
                    
                    logger.info(`🎤 Starting ${provider} transcription for ${participantName} (callId: ${callId}, roomName: ${roomName})`);

                    try {
                        await captionService.startTranscription(
                            connectionKey,
                            callId,
                            roomName,
                            participantId,
                            participantName || socket.user.name,
                            (transcription) => {
                                // Broadcast transcription to all participants
                                const captionData = {
                                    participantId: transcription.participantId,
                                    participantName: transcription.participantName,
                                    text: transcription.text,
                                    isFinal: transcription.isFinal,
                                    timestamp: transcription.timestamp,
                                    confidence: transcription.confidence
                                };
                                const captionRole = captionParticipantRoleFromUser(socket.user);
                                if (captionRole) {
                                    captionData.participantRole = captionRole;
                                }

                                // Use existing room format for broadcasting
                                const fullRoomName = `call_${roomName}`;
                                const videoCallRoomName = `video-call-${callId}`;

                                // Broadcast to all participants in the call rooms (including sender)
                                io.to(fullRoomName).emit('caption-transcription', captionData);
                                io.to(videoCallRoomName).emit('caption-transcription', captionData);
                                
                                // Also emit directly to sender to ensure they receive it
                                socket.emit('caption-transcription', captionData);

                                logger.info(`📝 Caption broadcast: ${transcription.participantName} -> "${transcription.text.substring(0, 50)}..." (to ${fullRoomName} and ${videoCallRoomName})`);
                            }
                        );

                        socket.emit('caption-started', { 
                            connectionKey,
                            provider,
                            message: 'Caption transcription started' 
                        });

                        logger.info(`🎤 Caption transcription started (${provider}) for ${participantName} in call ${callId}`);
                    } catch (error) {
                        logger.error('Failed to start caption transcription:', error);
                        socket.emit('caption-error', { 
                            message: 'Failed to start caption service',
                            code: 'START_FAILED'
                        });
                    }
                    return;
                }

                // End transcription session
                if (isEnd) {
                    const { service: captionService } = getCaptionService();
                    if (captionService) {
                        await captionService.stopTranscription(connectionKey);
                    }
                    socket.emit('caption-stopped', { 
                        connectionKey,
                        message: 'Caption transcription stopped' 
                    });
                    logger.info(`🛑 Caption transcription stopped for ${participantName} in call ${callId}`);
                    return;
                }

                // Send audio chunk to Deepgram
                if (audioChunk) {
                    // Convert array/object to Buffer if needed
                    let audioBuffer;
                    if (Buffer.isBuffer(audioChunk)) {
                        audioBuffer = audioChunk;
                    } else if (audioChunk.data && Array.isArray(audioChunk.data)) {
                        // Convert Int16 array to proper Buffer (16-bit PCM)
                        const int16Array = new Int16Array(audioChunk.data);
                        audioBuffer = Buffer.from(int16Array.buffer);
                    } else if (Array.isArray(audioChunk)) {
                        // Convert Int16 array to proper Buffer (16-bit PCM)
                        // The array contains Int16 values, so we need to create an Int16Array first
                        const int16Array = new Int16Array(audioChunk);
                        audioBuffer = Buffer.from(int16Array.buffer);
                    } else if (typeof audioChunk === 'string') {
                        audioBuffer = Buffer.from(audioChunk, 'base64');
                    } else {
                        logger.warn(`⚠️ Invalid audio chunk format received for ${participantName}:`, typeof audioChunk, audioChunk?.constructor?.name);
                        return;
                    }

                    // Track chunk count for logging
                    if (!socket._audioChunkCount) socket._audioChunkCount = 0;
                    socket._audioChunkCount++;
                    
                    // Log first chunk and periodically
                    if (socket._audioChunkCount === 1) {
                        logger.info(`🎤 First audio chunk received from ${participantName} (size: ${audioBuffer.length} bytes)`);
                        logger.info(`   Original array length: ${Array.isArray(audioChunk) ? audioChunk.length : 'N/A'}, Buffer size: ${audioBuffer.length} bytes`);
                        logger.info(`   Expected buffer size for Int16: ${Array.isArray(audioChunk) ? audioChunk.length * 2 : 'N/A'} bytes`);
                        // Log sample values to verify they're in valid Int16 range
                        if (Array.isArray(audioChunk) && audioChunk.length > 0) {
                            const sampleValues = audioChunk.slice(0, 5);
                            logger.info(`   Sample values (first 5): ${JSON.stringify(sampleValues)}`);
                        }
                    } else if (socket._audioChunkCount % 50 === 0) {
                        logger.debug(`📤 Received ${socket._audioChunkCount} audio chunks from ${participantName}`);
                    }

                    const { service: captionService, provider } = getCaptionService();
                    if (!captionService) {
                        return;
                    }

                    const sent = captionService.sendAudio(connectionKey, audioBuffer);
                    if (!sent) {
                        logger.warn(`⚠️ Failed to send audio chunk ${socket._audioChunkCount} to ${provider} caption service for ${participantName} (connectionKey: ${connectionKey})`);
                    }
                } else {
                    logger.debug(`No audio chunk in data for ${participantName}`);
                }

            } catch (error) {
                logger.error('Caption audio stream error:', error);
            }
        });

        /**
         * Stop all captions when leaving a call
         */
        socket.on('caption-stop-all', async (data) => {
            try {
                const { callId } = data;
                if (callId) {
                    const { service: captionService } = getCaptionService();
                    captionService?.stopAllForCall(callId);
                    logger.info(`Stopped all captions for call ${callId}`);
                }
            } catch (error) {
                logger.error('Caption stop all error:', error);
            }
        });

        /**
         * Broadcast caption transcription from fallback Web Speech API
         * This allows browser-based speech recognition to also broadcast to other participants
         */
        socket.on('caption-transcription-broadcast', async (data) => {
            try {
                const { callId, roomName, participantId, participantName, text, isFinal, timestamp } = data;
                
                if (!roomName || !text || !participantId) {
                    logger.warn('Caption transcription broadcast missing required fields:', data);
                    return;
                }
                
                // Prepare caption data for broadcasting
                const captionData = {
                    participantId,
                    participantName: participantName || socket.user.name,
                    text,
                    isFinal: isFinal !== false,
                    timestamp: timestamp || new Date().toISOString()
                };
                const captionRole = captionParticipantRoleFromUser(socket.user);
                if (captionRole) {
                    captionData.participantRole = captionRole;
                }

                // Find the room name format used for this call
                const fullRoomName = `call_${roomName}`;
                const videoCallRoomName = `video-call-${callId}`;
                
                // Broadcast to all participants in the call room (including sender)
                io.to(fullRoomName).emit('caption-transcription', captionData);
                io.to(videoCallRoomName).emit('caption-transcription', captionData);
                
                if (callId) {
                    io.to(`video-call-${callId}`).emit('caption-transcription', captionData);
                }
                
                // Also emit directly to sender to ensure they receive it
                socket.emit('caption-transcription', captionData);
                
                logger.info(`📝 Fallback caption broadcast: ${participantName} -> "${text.substring(0, 50)}..." (to ${fullRoomName} and ${videoCallRoomName})`);
                
            } catch (error) {
                logger.error('Caption transcription broadcast error:', error);
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
                    requestedBy: socketSafeUser(socket.user),
                    boothId: meeting.boothId,
                    eventId: meeting.eventId
                });

                // Notify call participants
                io.to(`call:${meetingId}`).emit('interpreter-requested', {
                    reason,
                    language,
                    requestedBy: socketSafeUser(socket.user)
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
                    interpreter: socketSafeUser(socket.user)
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
                const hasAccess = participantRefToId(videoCall.recruiter) === socket.userId ||
                                 participantRefToId(videoCall.jobSeeker) === socket.userId ||
                                 videoCall.interpreters.some(
                                     (i) => i.interpreter && participantRefToId(i.interpreter) === socket.userId
                                 );

                if (!hasAccess) {
                    socket.emit('error', { message: 'Access denied to video call' });
                    return;
                }

                socket.join(`call_${roomName}`);
                socket.currentVideoCallId = callId;
                socket.currentVideoCallRoom = roomName;

                liveStatsStore.userJoinedCall({
                    sessionId: `video:${callId}`,
                    boothId: videoCall.booth,
                    eventId: videoCall.event
                }, socket.user);

                // Debug: Log room joining
                console.log(`DEBUG: User ${socket.user.email} joined room call_${roomName}`);
                console.log(`DEBUG: Socket rooms after join:`, Array.from(socket.rooms));
                console.log(`DEBUG: Total sockets in room call_${roomName}:`, io.sockets.adapter.rooms.get(`call_${roomName}`)?.size || 0);

                // Notify other participants that user joined
                socket.to(`call_${roomName}`).emit('participant-joined-video', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user),
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
                liveStatsStore.userLeftCall(socket.userId);

                // Notify other participants that user left
                socket.to(`call_${roomName}`).emit('participant-left-video', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user)
                });

                if (socket.currentVideoCallRoom === roomName) {
                    socket.currentVideoCallId = null;
                    socket.currentVideoCallRoom = null;
                }
                logger.info(`User ${socket.user.email} left video call room ${roomName}`);
            }
        });

        /**
         * Handle job seeker declining an incoming call invitation
         */
        socket.on('call-invitation-declined', async (data = {}) => {
            try {
                const { callId } = data;

                if (!callId) {
                    socket.emit('error', { message: 'Call ID is required' });
                    return;
                }

                const videoCall = await VideoCall.findById(callId);
                if (!videoCall) {
                    socket.emit('error', { message: 'Video call not found' });
                    return;
                }

                const isJobSeeker = participantRefToId(videoCall.jobSeeker) === socket.userId;
                if (!isJobSeeker) {
                    socket.emit('error', { message: 'Only the invited job seeker can decline this call' });
                    return;
                }

                // Mark the call as ended so it won't be recovered as active by either side.
                await videoCall.endCall();

                // Return the job seeker to waiting state so they remain in the queue.
                const queueEntry = await BoothQueue.findById(videoCall.queueEntry)
                    .populate('jobSeeker', 'name email avatarUrl resumeUrl linkedInUrl phoneNumber city state metadata')
                    .populate('interpreterCategory', 'name code');

                if (queueEntry) {
                    queueEntry.status = 'waiting';
                    queueEntry.lastActivity = new Date();
                    await queueEntry.save();

                    const queueUpdateData = {
                        boothId: String(queueEntry.booth),
                        action: 'status_changed',
                        queueEntry: queueEntry.toJSON()
                    };

                    io.to(`booth_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
                    io.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
                }

                try {
                    await endRoom(videoCall.roomName);
                } catch (twilioError) {
                    logger.warn(`Failed to end Twilio room ${videoCall.roomName} after invite decline`, twilioError);
                }

                io.to(`call_${videoCall.roomName}`).emit('call_ended', {
                    callId: callId.toString(),
                    endedBy: socket.userId,
                    reason: 'declined_invitation'
                });

                io.to(`call_${videoCall.roomName}`).emit('participant_left_call', {
                    callId: callId.toString(),
                    userId: socket.userId,
                    userName: socket.user.name,
                    userRole: 'JobSeeker',
                    reason: 'declined_invitation'
                });

                logger.info(`Job seeker ${socket.user.email} declined call invitation ${callId}`);
            } catch (error) {
                logger.error('Call invitation decline error:', error);
                socket.emit('error', { message: 'Failed to process call invitation decline' });
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
                const { callId, response, devicePreferences } = data; // response: 'accept' or 'decline'

                if (!callId || !response) {
                    socket.emit('error', { message: 'Call ID and response are required' });
                    return;
                }

                const videoCall = await VideoCall.findById(callId)
                    .populate('recruiter jobSeeker booth event');

                if (!videoCall) {
                    socket.emit('error', { message: 'Video call not found' });
                    return;
                }

                // Update interpreter status
                const status = response === 'accept' ? 'joined' : 'declined';
                await videoCall.updateInterpreterStatus(socket.userId, status);

                if (response === 'accept') {
                    // Generate access token for interpreter
                    const { generateAccessToken } = require('../config/twilio');
                    const timestamp = Date.now();
                    const interpreterToken = generateAccessToken(
                        `interpreter_${socket.userId}_${timestamp}`,
                        videoCall.roomName
                    );

                    // Notify call participants that interpreter accepted
                    const responseData = {
                        callId: callId,
                        interpreter: socketSafeUser(socket.user),
                        response: response,
                        timestamp: new Date()
                    };

                    io.to(`call_${videoCall.roomName}`).emit('interpreter-response', responseData);

                    // Add system message to chat
                    await videoCall.addChatMessage(
                        socket.userId,
                        'interpreter',
                        `${socket.user.name} joined as interpreter`,
                        'system'
                    );

                    // Join interpreter to call room  
                    socket.join(`call_${videoCall.roomName}`);
                    
                    // Send confirmation back to interpreter with call details and access token
                    socket.emit('interpreter-accepted-confirmation', {
                        callId: videoCall._id,
                        roomName: videoCall.roomName,
                        accessToken: interpreterToken,
                        booth: videoCall.booth,
                        event: videoCall.event,
                        recruiter: socketSafeUser(videoCall.recruiter),
                        jobSeeker: socketSafeUser(videoCall.jobSeeker)
                    });

                    logger.info(`Interpreter ${socket.user.email} accepted call ${callId}`);
                } else {
                    // Notify call participants that interpreter declined
                    io.to(`call_${videoCall.roomName}`).emit('interpreter-declined', {
                        callId: callId,
                        interpreter: socketSafeUser(socket.user),
                        timestamp: new Date()
                    });

                    // Add system message to chat
                    await videoCall.addChatMessage(
                        socket.userId,
                        'interpreter',
                        `${socket.user.name} declined interpreter invitation`,
                        'system'
                    );

                    logger.info(`Interpreter ${socket.user.email} declined call ${callId}`);
                }
            } catch (error) {
                logger.error('Interpreter response error:', error);
                socket.emit('error', { message: 'Failed to process interpreter response' });
            }
        });

        /**
         * Handle interpreter status changes (online/away/busy)
         */
        socket.on('set-interpreter-status', (data) => {
            try {
                const { status } = data; // status: 'online', 'away', or 'busy'
                
                if (!['online', 'away', 'busy'].includes(status)) {
                    socket.emit('error', { message: 'Invalid status. Must be online, away, or busy.' });
                    return;
                }

                // Only interpreters can set their status
                if (socket.user.role !== 'Interpreter' && socket.user.role !== 'GlobalInterpreter') {
                    socket.emit('error', { message: 'Only interpreters can set their status' });
                    return;
                }

                // Update status in liveStatsStore
                const success = liveStatsStore.setInterpreterStatus(socket.userId, status);
                
                if (success) {
                    // Confirm status change to interpreter
                    socket.emit('interpreter-status-updated', {
                        status: status,
                        timestamp: new Date()
                    });

                    // Broadcast status change to all recruiters so they can see updated availability
                    io.to('role:Recruiter').emit('interpreter-status-changed', {
                        interpreterId: socket.userId,
                        interpreterName: socket.user.name,
                        status: status,
                        timestamp: new Date()
                    });

                    logger.info(`Interpreter ${socket.user.email} set status to: ${status}`);
                } else {
                    socket.emit('error', { message: 'Failed to update status' });
                }
            } catch (error) {
                logger.error('Interpreter status update error:', error);
                socket.emit('error', { message: 'Failed to update interpreter status' });
            }
        });

        /**
         * Get interpreter's current status
         */
        socket.on('get-interpreter-status', () => {
            try {
                if (socket.user.role !== 'Interpreter' && socket.user.role !== 'GlobalInterpreter') {
                    socket.emit('error', { message: 'Only interpreters can get their status' });
                    return;
                }

                const status = liveStatsStore.getInterpreterStatus(socket.userId) || 'online';
                socket.emit('interpreter-status', { status, timestamp: new Date() });
            } catch (error) {
                logger.error('Get interpreter status error:', error);
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

            // Broadcast user offline status
            socket.broadcast.emit('user-offline', {
                userId: socket.userId,
                userName: socket.user.name,
                chatStatus: 'offline',
                timestamp: new Date()
            });

            socket.broadcast.emit('user-chat-status-changed', {
                userId: socket.userId,
                userName: socket.user.name,
                status: 'offline',
                timestamp: new Date()
            });

            // Notify call participants if user was in a call
            if (socket.currentMeetingId) {
                socket.to(`call:${socket.currentMeetingId}`).emit('participant-disconnected', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user)
                });
            }

            // Notify video call participants if user was in a video call
            if (socket.currentVideoCallRoom) {
                socket.to(`call_${socket.currentVideoCallRoom}`).emit('participant-left-video', {
                    userId: socket.userId,
                    user: socketSafeUser(socket.user),
                    reason: 'disconnected'
                });

                // Stop any active caption transcriptions for this user
                if (socket.currentVideoCallId) {
                    const connectionKey = `${socket.currentVideoCallId}_${socket.userId}`;
                    const { service: captionService } = getCaptionService();
                    if (captionService) {
                        await captionService.stopTranscription(connectionKey);
                        logger.info(`Stopped caption transcription for disconnected user ${socket.user.email}`);
                    }
                }

                // Update participant status in video call
                try {
                    if (socket.currentVideoCallId) {
                        const videoCall = await VideoCall.findById(socket.currentVideoCallId);
                        if (videoCall) {
                            const recruiterId = participantRefToId(videoCall.recruiter);
                            if (socket.userId === recruiterId) {
                                await handleRecruiterDisconnectCleanup({
                                    io,
                                    callId: socket.currentVideoCallId,
                                    recruiterId
                                });
                                socket.currentVideoCallId = null;
                                socket.currentVideoCallRoom = null;
                                return;
                            }

                            await videoCall.removeParticipant(socket.userId);
                            
                            // If user is an interpreter, update their status to 'left'
                            const isInterpreter = videoCall.interpreters?.some(
                                i => i.interpreter.toString() === socket.userId.toString()
                            );
                            if (isInterpreter) {
                                await videoCall.updateInterpreterStatus(socket.userId, 'left');
                                logger.info(`Updated interpreter ${socket.user.email} status to 'left' on disconnect`);
                            }
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

                    // Find any active queue entries for this user (including in_meeting status)
                    const activeQueues = await BoothQueue.find({
                        jobSeeker: socket.userId,
                        status: { $in: ['waiting', 'invited', 'in_meeting'] }
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
                                jobSeeker: socketSafeUser(socket.user),
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

            liveStatsStore.userDisconnected(socket.userId);
        });

        /**
         * Chat Socket Handlers
         */
        
        // Join chat room
        socket.on('join-chat', async (data) => {
            try {
                const { chatId } = data;
                
                if (!chatId) {
                    socket.emit('error', { message: 'Chat ID is required' });
                    return;
                }

                // Verify user is participant in chat
                const chat = await Chat.findOne({
                    _id: chatId,
                    'participants.user': socket.userId
                });

                if (!chat) {
                    socket.emit('error', { message: 'You are not a participant in this chat' });
                    return;
                }

                socket.join(`chat:${chatId}`);
                socket.currentChatId = chatId;

                // Update last read timestamp
                await chat.updateLastRead(socket.userId);

                logger.info(`User ${socket.user.email} joined chat ${chatId}`);
                socket.emit('chat-joined', { chatId });
            } catch (error) {
                logger.error('Join chat error:', error);
                socket.emit('error', { message: 'Failed to join chat' });
            }
        });

        // Leave chat room
        socket.on('leave-chat', (data) => {
            try {
                const { chatId } = data;
                if (chatId) {
                    socket.leave(`chat:${chatId}`);
                    if (socket.currentChatId === chatId) {
                        socket.currentChatId = null;
                    }
                    logger.info(`User ${socket.user.email} left chat ${chatId}`);
                }
            } catch (error) {
                logger.error('Leave chat error:', error);
            }
        });

        // Send message in chat
        socket.on('send-message', async (data) => {
            try {
                const { chatId, content, type = 'text', fileUrl, fileName, fileSize } = data;

                if (!chatId || !content) {
                    socket.emit('error', { message: 'Chat ID and content are required' });
                    return;
                }

                // Verify user is participant in chat
                const chat = await Chat.findOne({
                    _id: chatId,
                    'participants.user': socket.userId
                });

                if (!chat) {
                    socket.emit('error', { message: 'You are not a participant in this chat' });
                    return;
                }

                // Create message
                const message = await Message.create({
                    chat: chatId,
                    sender: socket.userId,
                    content,
                    type,
                    fileUrl,
                    fileName,
                    fileSize
                });

                const populatedMessage = await Message.findById(message._id)
                    .populate({
                        path: 'sender',
                        select: 'name email avatarUrl role assignedBooth',
                        populate: {
                            path: 'assignedBooth',
                            select: 'name company'
                        }
                    });

                // Update chat's last message
                chat.lastMessage = {
                    content: content.substring(0, 100),
                    sender: socket.userId,
                    timestamp: message.createdAt
                };
                await chat.save();

                // Broadcast to all participants in chat
                io.to(`chat:${chatId}`).emit('new-message', {
                    chatId,
                    message: populatedMessage
                });

                // Send notification to offline participants
                const onlineUsers = Array.from(io.sockets.adapter.rooms.get(`chat:${chatId}`) || []);
                const offlineParticipants = chat.participants.filter(p => 
                    p.user.toString() !== socket.userId.toString() && 
                    !onlineUsers.includes(`user:${p.user}`)
                );

                offlineParticipants.forEach(participant => {
                    io.to(`user:${participant.user}`).emit('chat-notification', {
                        chatId,
                        message: populatedMessage,
                        unreadCount: 1 // Will be calculated on client side
                    });
                });

                logger.info(`Message sent in chat ${chatId} by ${socket.user.email}`);
            } catch (error) {
                logger.error('Send message error:', error);
                socket.emit('error', { message: 'Failed to send message' });
            }
        });

        // Typing indicator
        socket.on('typing', (data) => {
            try {
                const { chatId, isTyping } = data;
                if (chatId) {
                    socket.to(`chat:${chatId}`).emit('user-typing', {
                        chatId,
                        userId: socket.userId,
                        userName: socket.user.name,
                        isTyping
                    });
                }
            } catch (error) {
                logger.error('Typing indicator error:', error);
            }
        });

        // Mark messages as read
        socket.on('mark-read', async (data) => {
            try {
                const { chatId } = data;
                
                if (!chatId) {
                    return;
                }

                const chat = await Chat.findOne({
                    _id: chatId,
                    'participants.user': socket.userId
                });

                if (!chat) {
                    return;
                }

                await chat.updateLastRead(socket.userId);

                // Notify other participants
                socket.to(`chat:${chatId}`).emit('messages-read', {
                    chatId,
                    userId: socket.userId,
                    timestamp: new Date()
                });
            } catch (error) {
                logger.error('Mark read error:', error);
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
                    user: socketSafeUser(meeting.recruiterId),
                    role: 'recruiter'
                },
                {
                    userId: meeting.jobseekerId._id,
                    user: socketSafeUser(meeting.jobseekerId),
                    role: 'jobseeker'
                }
            ];

            if (meeting.interpreterId) {
                participants.push({
                    userId: meeting.interpreterId._id,
                    user: socketSafeUser(meeting.interpreterId),
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
module.exports.getIO = getIO;
