const express = require('express');
const { body, validationResult } = require('express-validator');
const twilio = require('twilio');
const { v4: uuidv4 } = require('uuid');
const MeetingRecord = require('../models/MeetingRecord');
const Queue = require('../models/Queue');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

// Initialize Twilio client (only if credentials are provided)
const twilioClient = process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN
  ? twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    )
  : null;

/**
 * POST /api/calls/init
 * Initialize a new video call
 */
router.post('/init', authenticateToken, requireRole(['Recruiter', 'BoothAdmin', 'AdminEvent', 'Admin']), [
    body('queueId')
        .isMongoId()
        .withMessage('Valid queue ID is required'),
    body('jobseekerId')
        .isMongoId()
        .withMessage('Valid job seeker ID is required')
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

        const { queueId, jobseekerId } = req.body;
        const { user } = req;

        // Find the queue
        const queue = await Queue.findById(queueId).populate('boothId eventId');
        if (!queue) {
            return res.status(404).json({
                error: 'Queue not found',
                message: 'The specified queue does not exist'
            });
        }

        // Check if user has permission to manage this queue
        if (!queue.boothId.canUserManage(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to manage this queue'
            });
        }

        // Find the job seeker in the queue
        const queueEntry = queue.entries.find(entry =>
            entry.userId.equals(jobseekerId) &&
            entry.status === 'serving'
        );

        if (!queueEntry) {
            return res.status(400).json({
                error: 'Job seeker not being served',
                message: 'The specified job seeker is not currently being served in this queue'
            });
        }

        // Generate unique room name
        const roomName = `meeting-${uuidv4()}`;

    // Create Twilio room
    let twilioRoom;
    if (!twilioClient) {
      return res.status(503).json({
        error: 'Video service unavailable',
        message: 'Twilio credentials not configured. Please contact administrator.'
      });
    }

    try {
      twilioRoom = await twilioClient.video.rooms.create({
        uniqueName: roomName,
        type: 'group',
        recordParticipantsOnConnect: false, // Set to true if recording is needed
        maxParticipants: 4, // Recruiter, Job Seeker, Interpreter, Support
        statusCallback: `${process.env.API_BASE_URL}/api/calls/room-status-callback`
      });
    } catch (twilioError) {
      logger.error('Twilio room creation error:', twilioError);
      return res.status(500).json({
        error: 'Call initialization failed',
        message: 'Failed to create video room'
      });
    }

        // Create meeting record
        const meeting = new MeetingRecord({
            eventId: queue.eventId._id,
            boothId: queue.boothId._id,
            queueId: queue._id,
            recruiterId: user._id,
            jobseekerId: jobseekerId,
            twilioRoomId: roomName,
            twilioRoomSid: twilioRoom.sid,
            startTime: new Date(),
            status: 'scheduled'
        });

        await meeting.save();

    // Generate access tokens for participants
    let recruiterToken, jobseekerToken;
    try {
      recruiterToken = generateAccessToken(user._id.toString(), roomName, 'recruiter');
      jobseekerToken = generateAccessToken(jobseekerId, roomName, 'jobseeker');
    } catch (tokenError) {
      logger.error('Token generation error:', tokenError);
      return res.status(503).json({
        error: 'Video service unavailable',
        message: 'Twilio credentials not configured. Please contact administrator.'
      });
    }

        logger.info(`Call initialized: ${roomName} for recruiter ${user.email} and job seeker ${jobseekerId}`);

        res.status(201).json({
            message: 'Call initialized successfully',
            meeting: {
                _id: meeting._id,
                twilioRoomId: roomName,
                twilioRoomSid: twilioRoom.sid,
                status: meeting.status
            },
            tokens: {
                recruiter: recruiterToken,
                jobseeker: jobseekerToken
            },
            room: {
                name: roomName,
                sid: twilioRoom.sid,
                maxParticipants: twilioRoom.maxParticipants
            }
        });
    } catch (error) {
        logger.error('Call initialization error:', error);
        res.status(500).json({
            error: 'Call initialization failed',
            message: 'An error occurred while initializing the call'
        });
    }
});

/**
 * POST /api/calls/:meetingId/join
 * Join an existing call
 */
router.post('/:meetingId/join', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { user } = req;

        // Find the meeting
        const meeting = await MeetingRecord.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user is a participant
        const isParticipant = meeting.recruiterId.equals(user._id) ||
            meeting.jobseekerId.equals(user._id) ||
            meeting.interpreterId?.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not a participant in this meeting'
            });
        }

        // Determine user role in the call
        let userRole = 'observer';
        if (meeting.recruiterId.equals(user._id)) {
            userRole = 'recruiter';
        } else if (meeting.jobseekerId.equals(user._id)) {
            userRole = 'jobseeker';
        } else if (meeting.interpreterId?.equals(user._id)) {
            userRole = 'interpreter';
        }

    // Generate access token
    let accessToken;
    try {
      accessToken = generateAccessToken(user._id.toString(), meeting.twilioRoomId, userRole);
    } catch (tokenError) {
      logger.error('Token generation error:', tokenError);
      return res.status(503).json({
        error: 'Video service unavailable',
        message: 'Twilio credentials not configured. Please contact administrator.'
      });
    }

        // Update meeting status if it's the first participant joining
        if (meeting.status === 'scheduled') {
            meeting.status = 'active';
            await meeting.save();
        }

        logger.info(`User ${user.email} joined call ${meetingId} as ${userRole}`);

        res.json({
            message: 'Successfully joined call',
            meeting: {
                _id: meeting._id,
                twilioRoomId: meeting.twilioRoomId,
                twilioRoomSid: meeting.twilioRoomSid,
                status: meeting.status,
                startTime: meeting.startTime
            },
            accessToken,
            userRole,
            room: {
                name: meeting.twilioRoomId,
                sid: meeting.twilioRoomSid
            }
        });
    } catch (error) {
        logger.error('Call join error:', error);
        res.status(500).json({
            error: 'Failed to join call',
            message: 'An error occurred while joining the call'
        });
    }
});

/**
 * POST /api/calls/:meetingId/request-interpreter
 * Request an interpreter for the call
 */
router.post('/:meetingId/request-interpreter', authenticateToken, requireRole(['Recruiter', 'BoothAdmin', 'AdminEvent', 'Admin']), [
    body('reason')
        .optional()
        .isLength({ max: 500 })
        .withMessage('Reason cannot exceed 500 characters'),
    body('language')
        .optional()
        .isLength({ max: 50 })
        .withMessage('Language cannot exceed 50 characters')
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

        const { meetingId } = req.params;
        const { reason, language } = req.body;
        const { user } = req;

        // Find the meeting
        const meeting = await MeetingRecord.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user is the recruiter
        if (!meeting.recruiterId.equals(user._id)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only the recruiter can request an interpreter'
            });
        }

        // Check if interpreter is already assigned
        if (meeting.interpreterId) {
            return res.status(400).json({
                error: 'Interpreter already assigned',
                message: 'An interpreter is already assigned to this meeting'
            });
        }

        // Request interpreter
        await meeting.requestInterpreter(user._id, reason, language);

        logger.info(`Interpreter requested for meeting ${meetingId} by ${user.email}`);

        res.json({
            message: 'Interpreter request sent successfully',
            interpreterRequest: meeting.interpreterRequest
        });
    } catch (error) {
        logger.error('Interpreter request error:', error);
        res.status(500).json({
            error: 'Failed to request interpreter',
            message: 'An error occurred while requesting an interpreter'
        });
    }
});

/**
 * POST /api/calls/:meetingId/accept-interpreter
 * Accept an interpreter request
 */
router.post('/:meetingId/accept-interpreter', authenticateToken, requireRole(['Interpreter', 'GlobalInterpreter']), async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { user } = req;

        // Find the meeting
        const meeting = await MeetingRecord.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if there's a pending interpreter request
        if (!meeting.interpreterRequest || meeting.interpreterRequest.status !== 'pending') {
            return res.status(400).json({
                error: 'No pending interpreter request',
                message: 'There is no pending interpreter request for this meeting'
            });
        }

        // Accept interpreter request
        await meeting.acceptInterpreterRequest(user._id);

    // Generate access token for interpreter
    let accessToken;
    try {
      accessToken = generateAccessToken(user._id.toString(), meeting.twilioRoomId, 'interpreter');
    } catch (tokenError) {
      logger.error('Token generation error:', tokenError);
      return res.status(503).json({
        error: 'Video service unavailable',
        message: 'Twilio credentials not configured. Please contact administrator.'
      });
    }

        logger.info(`Interpreter request accepted for meeting ${meetingId} by ${user.email}`);

        res.json({
            message: 'Interpreter request accepted successfully',
            meeting: {
                _id: meeting._id,
                twilioRoomId: meeting.twilioRoomId,
                twilioRoomSid: meeting.twilioRoomSid,
                status: meeting.status
            },
            accessToken,
            userRole: 'interpreter',
            room: {
                name: meeting.twilioRoomId,
                sid: meeting.twilioRoomSid
            }
        });
    } catch (error) {
        logger.error('Accept interpreter error:', error);
        res.status(500).json({
            error: 'Failed to accept interpreter request',
            message: 'An error occurred while accepting the interpreter request'
        });
    }
});

/**
 * POST /api/calls/:meetingId/end
 * End a call
 */
router.post('/:meetingId/end', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { user } = req;

        // Find the meeting
        const meeting = await MeetingRecord.findById(meetingId);
        if (!meeting) {
            return res.status(404).json({
                error: 'Meeting not found',
                message: 'The specified meeting does not exist'
            });
        }

        // Check if user is a participant or has admin rights
        const isParticipant = meeting.recruiterId.equals(user._id) ||
            meeting.jobseekerId.equals(user._id) ||
            meeting.interpreterId?.equals(user._id);

        if (!isParticipant && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You are not a participant in this meeting'
            });
        }

        // End the meeting
        await meeting.endCall();

    // End the Twilio room
    if (twilioClient) {
      try {
        await twilioClient.video.rooms(meeting.twilioRoomSid).update({ status: 'completed' });
      } catch (twilioError) {
        logger.error('Twilio room end error:', twilioError);
        // Don't fail the request if Twilio room ending fails
      }
    }

        logger.info(`Call ended: ${meetingId} by ${user.email}`);

        res.json({
            message: 'Call ended successfully',
            meeting: {
                _id: meeting._id,
                status: meeting.status,
                endTime: meeting.endTime,
                duration: meeting.duration
            }
        });
    } catch (error) {
        logger.error('End call error:', error);
        res.status(500).json({
            error: 'Failed to end call',
            message: 'An error occurred while ending the call'
        });
    }
});

/**
 * GET /api/calls/:meetingId/status
 * Get call status and participants
 */
router.get('/:meetingId/status', authenticateToken, async (req, res) => {
    try {
        const { meetingId } = req.params;
        const { user } = req;

        // Find the meeting
        const meeting = await MeetingRecord.findById(meetingId)
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
                message: 'You do not have access to this meeting'
            });
        }

        res.json({
            meeting: {
                _id: meeting._id,
                status: meeting.status,
                startTime: meeting.startTime,
                endTime: meeting.endTime,
                duration: meeting.duration,
                twilioRoomId: meeting.twilioRoomId,
                twilioRoomSid: meeting.twilioRoomSid
            },
            participants: {
                recruiter: meeting.recruiterId.getPublicProfile(),
                jobseeker: meeting.jobseekerId.getPublicProfile(),
                interpreter: meeting.interpreterId ? meeting.interpreterId.getPublicProfile() : null
            },
            interpreterRequest: meeting.interpreterRequest
        });
    } catch (error) {
        logger.error('Get call status error:', error);
        res.status(500).json({
            error: 'Failed to get call status',
            message: 'An error occurred while retrieving call status'
        });
    }
});

/**
 * POST /api/calls/room-status-callback
 * Twilio room status callback webhook
 */
router.post('/room-status-callback', express.raw({ type: 'application/x-www-form-urlencoded' }), async (req, res) => {
    try {
        const { RoomSid, RoomStatus, RoomName } = req.body;

        if (!RoomSid || !RoomStatus || !RoomName) {
            return res.status(400).json({ error: 'Missing required parameters' });
        }

        // Find meeting by Twilio room SID
        const meeting = await MeetingRecord.findOne({ twilioRoomSid: RoomSid });
        if (!meeting) {
            logger.warn(`Meeting not found for Twilio room: ${RoomSid}`);
            return res.status(404).json({ error: 'Meeting not found' });
        }

        // Update meeting status based on room status
        switch (RoomStatus) {
            case 'in-progress':
                if (meeting.status === 'scheduled') {
                    meeting.status = 'active';
                    await meeting.save();
                }
                break;
            case 'completed':
                if (meeting.status === 'active') {
                    meeting.status = 'completed';
                    meeting.endTime = new Date();
                    meeting.duration = meeting.callDurationMinutes;
                    await meeting.save();
                }
                break;
        }

        logger.info(`Twilio room status updated: ${RoomSid} -> ${RoomStatus}`);

        res.status(200).json({ message: 'Status updated successfully' });
    } catch (error) {
        logger.error('Twilio room status callback error:', error);
        res.status(500).json({ error: 'Callback processing failed' });
    }
});

/**
 * Generate Twilio access token for video room
 * @param {string} userId - User ID
 * @param {string} roomName - Twilio room name
 * @param {string} role - User role in the call
 * @returns {string} - JWT access token
 */
const generateAccessToken = (userId, roomName, role) => {
  if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_API_KEY || !process.env.TWILIO_API_SECRET) {
    throw new Error('Twilio credentials not configured');
  }

  const AccessToken = twilio.jwt.AccessToken;
  const VideoGrant = AccessToken.VideoGrant;

  // Create access token
  const token = new AccessToken(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_API_KEY,
    process.env.TWILIO_API_SECRET,
    { identity: userId }
  );

  // Grant video access
  const videoGrant = new VideoGrant({
    room: roomName
  });

  token.addGrant(videoGrant);

  // Set token expiration (1 hour)
  token.ttl = 3600;

  return token.toJwt();
};

module.exports = router;
