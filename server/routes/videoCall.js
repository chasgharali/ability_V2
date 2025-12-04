const express = require('express');
const router = express.Router();
const VideoCall = require('../models/VideoCall');
const BoothQueue = require('../models/BoothQueue');
const User = require('../models/User');
const { generateAccessToken, createOrGetRoom, endRoom, getRoomParticipants } = require('../config/twilio');
const { authenticateToken: auth } = require('../middleware/auth');
const { v4: uuidv4 } = require('uuid');
const liveStatsStore = require('../utils/liveStatsStore');

/**
 * POST /api/video-call/create
 * Create a new video call room and invite job seeker
 */
router.post('/create', auth, async (req, res) => {
  try {
    const { queueId } = req.body;
    const recruiterId = req.user._id;

    // Find the queue entry
    const queueEntry = await BoothQueue.findById(queueId)
      .populate('jobSeeker booth event');

    if (!queueEntry) {
      return res.status(404).json({ error: 'Queue entry not found' });
    }

    // Verify user is a recruiter (basic role check)
    if (!['Recruiter', 'Admin', 'GlobalSupport'].includes(req.user.role)) {
      return res.status(403).json({ error: 'Only recruiters can create video calls' });
    }

    // Check if there's already an active call for this queue entry
    const existingCall = await VideoCall.findOne({
      queueEntry: queueId,
      status: 'active'
    });

    if (existingCall) {
      // End the existing call and create a new one
      console.log('Ending existing call and creating new one');
      try {
        await endRoom(existingCall.roomName);
        existingCall.status = 'ended';
        existingCall.endedAt = new Date();
        await existingCall.save();
      } catch (endError) {
        console.error('Error ending existing call:', endError);
      }
    }

    // Generate unique room name
    const roomName = `booth_${queueEntry.booth._id}_${queueEntry.jobSeeker._id}_${Date.now()}`;

    // Create Twilio room
    const twilioRoom = await createOrGetRoom(roomName, 'group');

    // Create video call record
    const videoCall = new VideoCall({
      roomName: roomName,
      roomSid: twilioRoom.sid,
      event: queueEntry.event._id,
      booth: queueEntry.booth._id,
      recruiter: recruiterId,
      jobSeeker: queueEntry.jobSeeker._id,
      queueEntry: queueId,
      status: 'active', // Explicitly set status to active
      metadata: {
        interpreterRequested: queueEntry.interpreterCategory ? true : false,
        interpreterCategory: queueEntry.interpreterCategory
      }
    });

    await videoCall.save();
    console.log('✅ VideoCall created:', {
      id: videoCall._id,
      roomName: videoCall.roomName,
      booth: videoCall.booth.toString(),
      jobSeeker: videoCall.jobSeeker.toString(),
      status: videoCall.status,
      queueEntry: videoCall.queueEntry.toString()
    });

    // Generate access tokens with unique identities
    const timestamp = Date.now();
    const recruiterToken = generateAccessToken(`recruiter_${recruiterId}_${timestamp}`, roomName);
    const jobSeekerToken = generateAccessToken(`jobseeker_${queueEntry.jobSeeker._id}_${timestamp}`, roomName);

    // Update queue entry status
    queueEntry.status = 'in_meeting';
    await queueEntry.save();
    console.log('✅ Queue entry status updated to in_meeting:', {
      queueId: queueEntry._id,
      jobSeeker: queueEntry.jobSeeker._id.toString(),
      status: queueEntry.status
    });

    // Emit socket event to job seeker
    const io = req.app.get('io');
    const jobSeekerId = queueEntry.jobSeeker._id.toString();
    const userRoom = `user:${jobSeekerId}`;
    
    // Check if job seeker is in the socket room
    const userRoomSockets = io.sockets.adapter.rooms.get(userRoom);
    const usersInRoom = userRoomSockets ? userRoomSockets.size : 0;
    console.log(`📞 Emitting call_invitation to room ${userRoom}, users in room: ${usersInRoom}`);
    
    // Emit to both room formats for compatibility
    const invitationData = {
      callId: videoCall._id,
      roomName: roomName,
      recruiter: {
        id: req.user._id,
        name: req.user.name,
        company: queueEntry.booth.company
      },
      booth: queueEntry.booth,
      event: queueEntry.event,
      accessToken: jobSeekerToken
    };
    
    io.to(userRoom).emit('call_invitation', invitationData);
    // Also emit to legacy format just in case
    io.to(`user_${jobSeekerId}`).emit('call_invitation', invitationData);
    
    console.log('✅ call_invitation emitted:', {
      jobSeekerId,
      callId: videoCall._id,
      roomName,
      usersInRoom
    });

    // Notify all recruiters in the booth that the queue entry status has changed
    // Reload the queue entry with populated fields to send complete data
    const updatedQueueEntry = await BoothQueue.findById(queueEntry._id)
      .populate('jobSeeker', 'name email avatarUrl resumeUrl phoneNumber city state metadata')
      .populate('interpreterCategory', 'name code');
    
    const boothId = queueEntry.booth._id.toString();
    const updateData = {
      boothId: boothId,
      action: 'status_changed',
      queueEntry: updatedQueueEntry.toJSON()
    };
    io.to(`booth_${boothId}`).emit('queue-updated', updateData);
    io.to(`booth_management_${boothId}`).emit('queue-updated', updateData);
    console.log('📢 Emitted queue-updated event for call start to booth:', boothId, {
      queueEntryId: updatedQueueEntry._id,
      jobSeeker: updatedQueueEntry.jobSeeker._id.toString(),
      status: updatedQueueEntry.status
    });

    res.json({
      success: true,
      callId: videoCall._id,
      roomName: roomName,
      accessToken: recruiterToken,
      roomSid: twilioRoom.sid,
      booth: queueEntry.booth,
      event: queueEntry.event,
      jobSeeker: {
        id: queueEntry.jobSeeker._id,
        name: queueEntry.jobSeeker.name,
        email: queueEntry.jobSeeker.email
      },
      interpreterRequested: queueEntry.interpreterCategory ? true : false,
      interpreterCategory: queueEntry.interpreterCategory
    });

  } catch (error) {
    console.error('Error creating video call:', error);
    console.error('Error stack:', error.stack);
    res.status(500).json({
      error: 'Failed to create video call',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * POST /api/video-call/join
 * Join an existing video call
 */
router.post('/join', auth, async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user._id;

    const videoCall = await VideoCall.findById(callId)
      .populate('recruiter jobSeeker event booth queueEntry');

    if (!videoCall) {
      return res.status(404).json({ error: 'Video call not found' });
    }

    if (videoCall.status !== 'active') {
      return res.status(400).json({ error: 'Video call is not active' });
    }

    // Determine user role
    let userRole = '';
    let identity = '';
    const timestamp = Date.now();

    if (videoCall.recruiter._id.toString() === userId) {
      userRole = 'recruiter';
      identity = `recruiter_${userId}_${timestamp}`;
    } else if (videoCall.jobSeeker._id.toString() === userId) {
      userRole = 'jobseeker';
      identity = `jobseeker_${userId}_${timestamp}`;
    } else {
      // Check if user is an invited interpreter
      const interpreterEntry = videoCall.interpreters.find(
        i => i.interpreter.toString() === userId
      );
      if (interpreterEntry) {
        userRole = 'interpreter';
        identity = `interpreter_${userId}_${timestamp}`;
      } else {
        return res.status(403).json({ error: 'Unauthorized access to call' });
      }
    }

    // Generate access token
    const accessToken = generateAccessToken(identity, videoCall.roomName);

    // Add participant to call record
    await videoCall.addParticipant(userId, userRole, null);

    res.json({
      success: true,
      callId: videoCall._id,
      roomName: videoCall.roomName,
      accessToken: accessToken,
      userRole: userRole,
      booth: videoCall.booth,
      event: videoCall.event,
      participants: {
        recruiter: videoCall.recruiter,
        jobSeeker: videoCall.jobSeeker,
        interpreters: videoCall.interpreters
      },
      chatMessages: videoCall.chatMessages,
      metadata: videoCall.metadata
    });

  } catch (error) {
    console.error('Error joining video call:', error);
    res.status(500).json({ error: 'Failed to join video call' });
  }
});

/**
 * GET /api/video-call/available-interpreters/:boothId
 * Get list of available interpreters for a booth
 */
router.get('/available-interpreters/:boothId', auth, async (req, res) => {
  try {
    const { boothId } = req.params;
    const io = req.app.get('io');

    // Find booth-assigned interpreters (show all active, regardless of availability)
    const boothInterpreters = await User.find({
      role: 'Interpreter',
      assignedBooth: boothId,
      isActive: true
    }).select('_id name email role languages isAvailable');

    // Find global interpreters (show all active, regardless of availability)
    const globalInterpreters = await User.find({
      role: 'GlobalInterpreter',
      isActive: true
    }).select('_id name email role languages isAvailable');

    // Get all interpreters currently in active meetings
    // Only consider calls that are truly active (started less than 1 hour ago)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    
    // First, cleanup any stale calls (calls marked active but started > 1 hour ago)
    const staleCalls = await VideoCall.find({
      status: 'active',
      startedAt: { $lt: oneHourAgo }
    });
    if (staleCalls.length > 0) {
      console.log(`🧹 Cleaning up ${staleCalls.length} stale active calls`);
      for (const call of staleCalls) {
        call.status = 'ended';
        call.endedAt = new Date();
        call.interpreters.forEach(i => {
          if (i.status === 'joined') i.status = 'left';
        });
        await call.save();
      }
    }

    // Now get active calls with interpreters
    const activeCallsWithInterpreters = await VideoCall.find({
      status: 'active',
      'interpreters.status': 'joined',
      startedAt: { $gte: oneHourAgo } // Only recent active calls
    }).select('interpreters startedAt');

    // Extract interpreter IDs that are currently in meetings
    const busyInterpreterIds = new Set();
    activeCallsWithInterpreters.forEach(call => {
      call.interpreters.forEach(i => {
        if (i.status === 'joined') {
          busyInterpreterIds.add(i.interpreter.toString());
        }
      });
    });

    // Get socket-based online status for interpreters using liveStatsStore
    const onlineInterpreterIds = new Set();
    const onlineUsers = liveStatsStore.getOnlineUsers();
    onlineUsers.forEach((onlineUser) => {
      if (onlineUser.role === 'Interpreter' || onlineUser.role === 'GlobalInterpreter') {
        onlineInterpreterIds.add(onlineUser.userId.toString());
      }
    });

    // Get interpreter statuses
    const interpreterStatuses = liveStatsStore.getAllInterpreterStatuses();
    
    console.log('📊 Interpreter Status Check:');
    console.log('  - Booth interpreters found:', boothInterpreters.length);
    console.log('  - Global interpreters found:', globalInterpreters.length);
    console.log('  - Busy interpreters in active meetings:', Array.from(busyInterpreterIds));
    console.log('  - Online interpreters (liveStatsStore):', Array.from(onlineInterpreterIds));
    console.log('  - Interpreter statuses:', interpreterStatuses);
    console.log('  - Total online users:', onlineUsers.length);
    
    // Debug: Check each booth interpreter's status
    boothInterpreters.forEach(i => {
      const isOnline = onlineInterpreterIds.has(i._id.toString());
      const isInMeeting = busyInterpreterIds.has(i._id.toString());
      const status = interpreterStatuses[i._id.toString()] || 'offline';
      console.log(`  - Booth Interpreter ${i.name} (${i._id}): online=${isOnline}, status=${status}, inMeeting=${isInMeeting}`);
    });

    // Combine and return - check socket-based online status AND status setting
    const interpreters = [
      ...boothInterpreters.map(i => {
        const isOnline = onlineInterpreterIds.has(i._id.toString());
        const isInMeeting = busyInterpreterIds.has(i._id.toString());
        const status = isOnline ? (interpreterStatuses[i._id.toString()] || 'online') : 'offline';
        // Available only if online, status is 'online' (not away/busy), and not in a meeting
        const isAvailable = isOnline && status === 'online' && !isInMeeting;
        return {
          ...i.toObject(),
          type: 'booth',
          isAvailable,
          inMeeting: isInMeeting,
          status: isInMeeting ? 'busy' : status // Override status if in meeting
        };
      }),
      ...globalInterpreters.map(i => {
        const isOnline = onlineInterpreterIds.has(i._id.toString());
        const isInMeeting = busyInterpreterIds.has(i._id.toString());
        const status = isOnline ? (interpreterStatuses[i._id.toString()] || 'online') : 'offline';
        // Available only if online, status is 'online' (not away/busy), and not in a meeting
        const isAvailable = isOnline && status === 'online' && !isInMeeting;
        return {
          ...i.toObject(),
          type: 'global',
          isAvailable,
          inMeeting: isInMeeting,
          status: isInMeeting ? 'busy' : status // Override status if in meeting
        };
      })
    ];

    // Sort by availability - available interpreters first, then by type (booth first)
    interpreters.sort((a, b) => {
      // First sort by availability
      if (b.isAvailable !== a.isAvailable) {
        return (b.isAvailable ? 1 : 0) - (a.isAvailable ? 1 : 0);
      }
      // Then sort by type (booth interpreters before global)
      return a.type === 'booth' ? -1 : 1;
    });

    res.json({
      success: true,
      interpreters,
      boothCount: boothInterpreters.length,
      globalCount: globalInterpreters.length,
      availableCount: interpreters.filter(i => i.isAvailable).length
    });

  } catch (error) {
    console.error('Error fetching available interpreters:', error);
    res.status(500).json({ error: 'Failed to fetch available interpreters' });
  }
});

/**
 * POST /api/video-call/invite-interpreter
 * Invite an interpreter to the call
 */
router.post('/invite-interpreter', auth, async (req, res) => {
  try {
    const { callId, interpreterId, interpreterCategory } = req.body;
    const userId = req.user._id;

    console.log('📨 Invite interpreter request:', {
      callId,
      interpreterId,
      interpreterCategory,
      requestUserId: userId.toString(),
      requestUserEmail: req.user.email
    });

    const videoCall = await VideoCall.findById(callId)
      .populate('recruiter jobSeeker booth');

    if (!videoCall) {
      return res.status(404).json({ error: 'Video call not found' });
    }

    // Only recruiter can invite interpreters
    console.log('🔐 Authorization check:', {
      recruiter: videoCall.recruiter._id.toString(),
      requestUser: userId.toString(),
      match: videoCall.recruiter._id.toString() === userId.toString()
    });

    if (videoCall.recruiter._id.toString() !== userId.toString()) {
      return res.status(403).json({ error: 'Only recruiter can invite interpreters' });
    }

    // Validate interpreterId is provided
    if (!interpreterId) {
      return res.status(400).json({ error: 'Interpreter ID is required' });
    }

    // Find the selected interpreter
    const selectedInterpreter = await User.findOne({
      _id: interpreterId,
      role: { $in: ['Interpreter', 'GlobalInterpreter'] },
      isActive: true
    });

    if (!selectedInterpreter) {
      return res.status(404).json({ error: 'Selected interpreter not found' });
    }

    // Check if interpreter is already in an active meeting
    const interpreterInActiveMeeting = await VideoCall.findOne({
      status: 'active',
      'interpreters.interpreter': interpreterId,
      'interpreters.status': 'joined'
    }).populate('recruiter booth');

    if (interpreterInActiveMeeting) {
      console.log('❌ Interpreter already in active meeting:', {
        interpreter: selectedInterpreter.email,
        existingCall: interpreterInActiveMeeting._id,
        booth: interpreterInActiveMeeting.booth?.name || 'Unknown'
      });

      return res.status(409).json({
        error: 'Interpreter is already in another meeting',
        message: `${selectedInterpreter.name} is currently in another meeting. Please try again later.`
      });
    }

    // Check if interpreter is already invited to this call
    // Allow re-inviting if they previously left or declined
    const existingInvitation = videoCall.interpreters.find(
      i => i.interpreter.toString() === interpreterId.toString()
    );

    if (existingInvitation) {
      // If they previously left or declined, allow re-invitation by updating status
      if (existingInvitation.status === 'left' || existingInvitation.status === 'declined') {
        console.log('🔄 Re-inviting interpreter who previously left/declined:', {
          interpreter: selectedInterpreter.email,
          previousStatus: existingInvitation.status
        });
        // Update the existing invitation to 'invited' status
        existingInvitation.status = 'invited';
        existingInvitation.invitedAt = new Date();
        if (interpreterCategory) {
          existingInvitation.category = interpreterCategory;
        }
        await videoCall.save();
      } else {
        // If they're still invited or joined, don't allow duplicate invitation
        return res.status(409).json({
          error: 'Interpreter already invited',
          message: 'This interpreter has already been invited to this call.'
        });
      }
    }

    // Add interpreter to call only if not already in the array (re-invitation handled above)
    if (!existingInvitation) {
      await videoCall.inviteInterpreter(selectedInterpreter._id, interpreterCategory || '');
    }

    // Generate access token for interpreter
    const timestamp = Date.now();
    const interpreterToken = generateAccessToken(
      `interpreter_${selectedInterpreter._id}_${timestamp}`,
      videoCall.roomName
    );

    // Emit socket event to interpreter
    const io = req.app.get('io');
    const interpreterRoomName = `user:${selectedInterpreter._id}`;

    console.log('📞 Sending invitation to interpreter:', {
      interpreter: selectedInterpreter.email,
      room: interpreterRoomName,
      callId: videoCall._id
    });

    io.to(interpreterRoomName).emit('interpreter_invitation', {
      callId: videoCall._id,
      roomName: videoCall.roomName,
      category: interpreterCategory,
      recruiter: {
        _id: videoCall.recruiter._id,
        name: videoCall.recruiter.name,
        email: videoCall.recruiter.email
      },
      jobSeeker: {
        _id: videoCall.jobSeeker._id,
        name: videoCall.jobSeeker.name,
        email: videoCall.jobSeeker.email
      },
      booth: videoCall.booth,
      accessToken: interpreterToken
    });

    // Add system message to chat
    await videoCall.addChatMessage(
      userId,
      'recruiter',
      `Interpreter invited: ${selectedInterpreter.name}`,
      'system'
    );

    res.json({
      success: true,
      interpreterInvited: {
        id: selectedInterpreter._id,
        name: selectedInterpreter.name,
        email: selectedInterpreter.email,
        role: selectedInterpreter.role,
        category: interpreterCategory
      }
    });

  } catch (error) {
    console.error('Error inviting interpreter:', error);
    res.status(500).json({ error: 'Failed to invite interpreter' });
  }
});

/**
 * POST /api/video-call/send-message
 * Send chat message during call
 */
router.post('/send-message', auth, async (req, res) => {
  try {
    const { callId, message } = req.body;
    const userId = req.user._id;

    const videoCall = await VideoCall.findById(callId);

    if (!videoCall) {
      return res.status(404).json({ error: 'Video call not found' });
    }

    // Determine sender role
    let senderRole = '';
    if (videoCall.recruiter.toString() === userId) {
      senderRole = 'recruiter';
    } else if (videoCall.jobSeeker.toString() === userId) {
      senderRole = 'jobseeker';
    } else {
      const interpreterEntry = videoCall.interpreters.find(
        i => i.interpreter.toString() === userId
      );
      if (interpreterEntry) {
        senderRole = 'interpreter';
      } else {
        return res.status(403).json({ error: 'Unauthorized access to call' });
      }
    }

    // Add message to call
    await videoCall.addChatMessage(userId, senderRole, message);

    // Emit message to all participants
    const io = req.app.get('io');
    const messageData = {
      callId: callId,
      sender: {
        id: userId,
        name: req.user.name,
        role: senderRole
      },
      message: message,
      timestamp: new Date()
    };

    // Send to all participants
    io.to(`call_${videoCall.roomName}`).emit('new_chat_message', messageData);

    res.json({ success: true });

  } catch (error) {
    console.error('Error sending message:', error);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

/**
 * POST /api/video-call/leave
 * Leave video call (individual participant leaves, call continues for others)
 */
router.post('/leave', auth, async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user._id;

    console.log('🚪 Leave call request:', {
      callId,
      userId: userId.toString(),
      userEmail: req.user.email,
      userRole: req.user.role
    });

    const videoCall = await VideoCall.findById(callId);

    if (!videoCall) {
      console.log('❌ Video call not found:', callId);
      return res.status(404).json({ error: 'Video call not found' });
    }

    // Check if user is a participant
    const isJobSeeker = videoCall.jobSeeker?.toString() === userId.toString();
    const isInterpreter = videoCall.interpreters?.some(i => i.interpreter.toString() === userId.toString());

    if (!isJobSeeker && !isInterpreter) {
      console.log('❌ Authorization failed - not a job seeker or interpreter');
      return res.status(403).json({ error: 'Only job seekers and interpreters can leave call' });
    }

    console.log('✅ Authorization passed - participant leaving call');

    // If interpreter leaves, update their status to 'left' in the interpreters array
    if (isInterpreter) {
      await videoCall.updateInterpreterStatus(userId, 'left');
      console.log('✅ Updated interpreter status to left:', userId.toString());
    }

    // Update participant record
    await videoCall.removeParticipant(userId);

    // Emit socket event to notify others that this participant left
    const io = req.app.get('io');
    io.to(`call_${videoCall.roomName}`).emit('participant_left_call', {
      callId: callId,
      userId: userId.toString(),
      userName: req.user.name,
      userRole: req.user.role
    });

    // If job seeker leaves, update queue status
    if (isJobSeeker) {
      const queueEntry = await BoothQueue.findById(videoCall.queueEntry);
      if (queueEntry && queueEntry.status !== 'completed' && queueEntry.status !== 'left_with_message') {
        await queueEntry.leaveQueue();
        // Notify booth management
        io.to(`booth_${queueEntry.booth}`).emit('queue-updated', {
          boothId: queueEntry.booth,
          action: 'left',
          queueEntry: queueEntry.toJSON()
        });
        io.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', {
          boothId: queueEntry.booth,
          action: 'left',
          queueEntry: queueEntry.toJSON()
        });
      }
    }

    res.json({ success: true, action: 'left' });

  } catch (error) {
    console.error('Error leaving video call:', error);
    res.status(500).json({ error: 'Failed to leave video call' });
  }
});

/**
 * POST /api/video-call/end
 * End video call for everyone (recruiter only)
 */
router.post('/end', auth, async (req, res) => {
  try {
    const { callId } = req.body;
    const userId = req.user._id;

    console.log('🔚 End call request:', {
      callId,
      userId: userId.toString(),
      userEmail: req.user.email,
      userRole: req.user.role
    });

    const videoCall = await VideoCall.findById(callId);

    if (!videoCall) {
      console.log('❌ Video call not found:', callId);
      return res.status(404).json({ error: 'Video call not found' });
    }

    // Authorization: Only recruiter, admin, or global support can end call for everyone
    const isRecruiter = videoCall.recruiter?.toString() === userId.toString();
    const hasPrivilegedRole = ['Admin', 'GlobalSupport'].includes(req.user.role);

    console.log('🔐 Authorization check:', {
      isRecruiter,
      hasPrivilegedRole,
      recruiter: videoCall.recruiter?.toString(),
      userId: userId.toString()
    });

    if (!isRecruiter && !hasPrivilegedRole) {
      console.log('❌ Authorization failed - only recruiter can end call for everyone');
      return res.status(403).json({ error: 'Only recruiter can end call for everyone' });
    }

    console.log('✅ Authorization passed - ending call for everyone');

    // End Twilio room first
    try {
      console.log('🔚 Ending Twilio room:', videoCall.roomName);
      await endRoom(videoCall.roomName);
      console.log('✅ Twilio room ended successfully');
    } catch (twilioError) {
      console.error('❌ Error ending Twilio room:', twilioError);
      // Continue even if Twilio room end fails
    }

    // Update call status
    await videoCall.endCall();

    // Update queue entry status: ensure jobseeker leaves the queue
    const queueEntry = await BoothQueue.findById(videoCall.queueEntry);
    let queueUpdateData = null;
    if (queueEntry) {
      await queueEntry.leaveQueue();
      // Prepare socket update for booth rooms
      queueUpdateData = {
        boothId: queueEntry.booth,
        action: 'left',
        queueEntry: queueEntry.toJSON()
      };
    }

    // Emit socket event to all participants
    const io = req.app.get('io');
    io.to(`call_${videoCall.roomName}`).emit('call_ended', {
      callId: callId,
      endedBy: userId,
      duration: videoCall.duration
    });

    // Also notify booth queue rooms so recruiter and others see the queue update
    if (queueUpdateData && io) {
      io.to(`booth_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
      io.to(`booth_management_${queueEntry.booth}`).emit('queue-updated', queueUpdateData);
    }

    res.json({ success: true, duration: videoCall.duration });

  } catch (error) {
    console.error('Error ending video call:', error);
    res.status(500).json({ error: 'Failed to end video call' });
  }
});

/**
 * GET /api/video-call/active
 * Get user's active call
 */
router.get('/active', auth, async (req, res) => {
  try {
    const userId = req.user._id;

    const activeCall = await VideoCall.findActiveCall(userId);

    if (!activeCall) {
      return res.json({ activeCall: null });
    }

    // Determine user role
    let userRole = '';
    if (activeCall.recruiter._id.toString() === userId) {
      userRole = 'recruiter';
    } else if (activeCall.jobSeeker._id.toString() === userId) {
      userRole = 'jobseeker';
    } else {
      userRole = 'interpreter';
    }

    // Generate fresh access token
    const identity = `${userRole}_${userId}`;
    const accessToken = generateAccessToken(identity, activeCall.roomName);

    res.json({
      activeCall: {
        id: activeCall._id,
        roomName: activeCall.roomName,
        accessToken: accessToken,
        userRole: userRole,
        booth: activeCall.booth,
        event: activeCall.event,
        participants: {
          recruiter: activeCall.recruiter,
          jobSeeker: activeCall.jobSeeker,
          interpreters: activeCall.interpreters
        },
        chatMessages: activeCall.chatMessages,
        metadata: activeCall.metadata,
        startedAt: activeCall.startedAt
      }
    });

  } catch (error) {
    console.error('Error getting active call:', error);
    res.status(500).json({ error: 'Failed to get active call' });
  }
});

/**
 * GET /api/video-call/by-queue/:queueEntryId
 * Get active video call by queue entry ID
 */
router.get('/by-queue/:queueEntryId', auth, async (req, res) => {
  try {
    const { queueEntryId } = req.params;
    const userId = req.user._id;

    const videoCall = await VideoCall.findOne({
      queueEntry: queueEntryId,
      status: 'active'
    })
      .populate('recruiter jobSeeker event booth queueEntry interpreters.interpreter');

    if (!videoCall) {
      return res.status(404).json({ 
        success: false,
        error: 'Active video call not found for this queue entry' 
      });
    }

    // Check if user has access to this call
    const hasAccess = videoCall.recruiter._id.toString() === userId ||
      videoCall.jobSeeker._id.toString() === userId ||
      videoCall.interpreters.some(i => i.interpreter._id.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({ 
        success: false,
        error: 'Unauthorized access to call' 
      });
    }

    // Generate access token for job seeker if they're the requester
    let accessToken = null;
    if (videoCall.jobSeeker._id.toString() === userId) {
      accessToken = generateAccessToken(
        `jobseeker_${userId}_${Date.now()}`,
        videoCall.roomName
      );
    }

    res.json({
      success: true,
      videoCall: {
        ...videoCall.toObject(),
        jobSeekerToken: accessToken
      }
    });

  } catch (error) {
    console.error('Error getting video call by queue entry:', error);
    res.status(500).json({ 
      success: false,
      error: 'Failed to get video call' 
    });
  }
});

/**
 * GET /api/video-call/:callId
 * Get call details
 */
router.get('/:callId', auth, async (req, res) => {
  try {
    const { callId } = req.params;
    const userId = req.user._id;

    const videoCall = await VideoCall.findById(callId)
      .populate('recruiter jobSeeker event booth queueEntry interpreters.interpreter');

    if (!videoCall) {
      return res.status(404).json({ error: 'Video call not found' });
    }

    // Check if user has access to this call
    const hasAccess = videoCall.recruiter._id.toString() === userId ||
      videoCall.jobSeeker._id.toString() === userId ||
      videoCall.interpreters.some(i => i.interpreter._id.toString() === userId);

    if (!hasAccess) {
      return res.status(403).json({ error: 'Unauthorized access to call' });
    }

    res.json({
      call: videoCall
    });

  } catch (error) {
    console.error('Error getting call details:', error);
    res.status(500).json({ error: 'Failed to get call details' });
  }
});

/**
 * POST /api/video-call/reset-interpreter-availability
 * ONE-TIME MIGRATION: Reset all interpreters to offline status
 * This fixes the issue where interpreters were showing as online by default
 */
router.post('/reset-interpreter-availability', auth, async (req, res) => {
  try {
    // Only allow admins to run this migration
    if (req.user.role !== 'Admin' && req.user.role !== 'SuperAdmin') {
      return res.status(403).json({ error: 'Unauthorized. Admin access required.' });
    }

    console.log('🔄 Starting interpreter availability reset migration...');

    // Find all interpreters before update
    const interpretersBefore = await User.find({
      role: { $in: ['Interpreter', 'GlobalInterpreter'] }
    }).select('name role isAvailable').lean();

    console.log(`Found ${interpretersBefore.length} interpreters`);
    console.log('Before:', interpretersBefore.filter(i => i.isAvailable === true).length, 'online');

    // Update all interpreters to set isAvailable to false
    const result = await User.updateMany(
      { role: { $in: ['Interpreter', 'GlobalInterpreter'] } },
      { $set: { isAvailable: false } }
    );

    // Verify the update
    const interpretersAfter = await User.find({
      role: { $in: ['Interpreter', 'GlobalInterpreter'] }
    }).select('name role isAvailable').lean();

    console.log('After:', interpretersAfter.filter(i => i.isAvailable === true).length, 'online');
    console.log('✅ Migration completed');

    res.json({
      success: true,
      message: 'All interpreters have been reset to offline status',
      stats: {
        totalInterpreters: interpretersBefore.length,
        matched: result.matchedCount,
        modified: result.modifiedCount,
        onlineBefore: interpretersBefore.filter(i => i.isAvailable === true).length,
        onlineAfter: interpretersAfter.filter(i => i.isAvailable === true).length
      }
    });

  } catch (error) {
    console.error('Error resetting interpreter availability:', error);
    res.status(500).json({ error: 'Failed to reset interpreter availability' });
  }
});

module.exports = router;


