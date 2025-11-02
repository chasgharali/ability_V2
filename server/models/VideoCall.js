const mongoose = require('mongoose');

const videoCallSchema = new mongoose.Schema({
  roomName: {
    type: String,
    required: true,
    unique: true
  },
  roomSid: {
    type: String,
    required: true
  },
  event: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Event',
    required: true
  },
  booth: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Booth',
    required: true
  },
  recruiter: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  jobSeeker: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  queueEntry: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'BoothQueue',
    required: true
  },
  interpreters: [{
    interpreter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    category: {
      type: String,
      enum: ['ASL', 'Spanish', 'French', 'German', 'Mandarin', 'Other']
    },
    status: {
      type: String,
      enum: ['invited', 'joined', 'declined'],
      default: 'invited'
    },
    invitedAt: {
      type: Date,
      default: Date.now
    },
    joinedAt: Date
  }],
  status: {
    type: String,
    enum: ['active', 'ended', 'failed'],
    default: 'active'
  },
  startedAt: {
    type: Date,
    default: Date.now
  },
  endedAt: Date,
  duration: Number, // in seconds
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    role: {
      type: String,
      enum: ['recruiter', 'jobseeker', 'interpreter']
    },
    participantSid: String,
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: Date,
    connectionQuality: {
      type: String,
      enum: ['excellent', 'good', 'fair', 'poor'],
      default: 'good'
    }
  }],
  chatMessages: [{
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    senderRole: {
      type: String,
      enum: ['recruiter', 'jobseeker', 'interpreter'],
      required: true
    },
    message: {
      type: String,
      required: true
    },
    timestamp: {
      type: Date,
      default: Date.now
    },
    messageType: {
      type: String,
      enum: ['text', 'system'],
      default: 'text'
    }
  }],
  callQuality: {
    averageLatency: Number,
    packetsLost: Number,
    reconnections: Number,
    totalDisconnections: Number
  },
  metadata: {
    interpreterRequested: {
      type: Boolean,
      default: false
    },
    interpreterCategory: String,
    callRating: {
      recruiter: Number,
      jobSeeker: Number
    },
    technicalIssues: [String]
  }
}, {
  timestamps: true
});

// Index for efficient queries (roomName index is created by unique: true)
videoCallSchema.index({ recruiter: 1, status: 1 });
videoCallSchema.index({ jobSeeker: 1, status: 1 });
videoCallSchema.index({ event: 1, booth: 1 });
videoCallSchema.index({ status: 1, startedAt: -1 });

// Static methods
videoCallSchema.statics.findActiveCall = function(userId) {
  return this.findOne({
    $or: [
      { recruiter: userId },
      { jobSeeker: userId },
      { 'interpreters.interpreter': userId }
    ],
    status: 'active'
  }).populate('recruiter jobSeeker event booth queueEntry');
};

videoCallSchema.statics.findCallByRoom = function(roomName) {
  return this.findOne({ roomName }).populate('recruiter jobSeeker event booth queueEntry interpreters.interpreter');
};

// Instance methods
videoCallSchema.methods.addParticipant = function(userId, role, participantSid) {
  this.participants.push({
    user: userId,
    role: role,
    participantSid: participantSid,
    joinedAt: new Date()
  });
  return this.save();
};

videoCallSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => p.user.toString() === userId.toString());
  if (participant) {
    participant.leftAt = new Date();
  }
  return this.save();
};

videoCallSchema.methods.addChatMessage = function(senderId, senderRole, message, messageType = 'text') {
  this.chatMessages.push({
    sender: senderId,
    senderRole: senderRole,
    message: message,
    messageType: messageType,
    timestamp: new Date()
  });
  return this.save();
};

videoCallSchema.methods.inviteInterpreter = function(interpreterId, category) {
  this.interpreters.push({
    interpreter: interpreterId,
    category: category,
    status: 'invited',
    invitedAt: new Date()
  });
  this.metadata.interpreterRequested = true;
  this.metadata.interpreterCategory = category;
  return this.save();
};

videoCallSchema.methods.updateInterpreterStatus = function(interpreterId, status) {
  const interpreter = this.interpreters.find(i => i.interpreter.toString() === interpreterId.toString());
  if (interpreter) {
    interpreter.status = status;
    if (status === 'joined') {
      interpreter.joinedAt = new Date();
    }
  }
  return this.save();
};

videoCallSchema.methods.endCall = function() {
  this.status = 'ended';
  this.endedAt = new Date();
  this.duration = Math.floor((this.endedAt - this.startedAt) / 1000);
  return this.save();
};

module.exports = mongoose.model('VideoCall', videoCallSchema);
