const mongoose = require('mongoose');

const boothQueueSchema = new mongoose.Schema({
    jobSeeker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    booth: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    position: {
        type: Number,
        required: true
    },
    queueToken: {
        type: String,
        required: true,
        unique: true
    },
    interpreterCategory: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'InterpreterCategory',
        default: null
    },
    status: {
        type: String,
        enum: ['waiting', 'invited', 'in_meeting', 'completed', 'left', 'left_with_message'],
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    leftAt: {
        type: Date,
        default: null
    },
    invitedAt: {
        type: Date,
        default: null
    },
    lastActivity: {
        type: Date,
        default: Date.now
    },
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MeetingRecord',
        default: null
    },
    // Leave message when job seeker exits queue (separate from regular messages)
    leaveMessage: {
        type: {
            type: String,
            enum: ['text', 'audio', 'video'],
            default: null
        },
        content: {
            type: String,
            default: null
        },
        createdAt: {
            type: Date,
            default: null
        }
    },
    // Bidirectional messages between job seeker and recruiter
    messages: [{
        type: {
            type: String,
            enum: ['text', 'audio', 'video'],
            required: true
        },
        content: {
            type: String,
            required: true
        },
        sender: {
            type: String,
            enum: ['jobseeker', 'recruiter'],
            default: 'jobseeker'
        },
        createdAt: {
            type: Date,
            default: Date.now
        },
        isRead: {
            type: Boolean,
            default: false
        }
    }],
    // Meeting details when invited
    meetingId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'MeetingRecord',
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
boothQueueSchema.index({ booth: 1, status: 1 });
// Partial unique index - only enforce uniqueness for active queue entries
boothQueueSchema.index(
    { jobSeeker: 1, booth: 1 }, 
    { 
        unique: true, 
        partialFilterExpression: { status: { $in: ['waiting', 'invited', 'in_meeting'] } }
    }
);
boothQueueSchema.index({ event: 1, booth: 1 });

// Virtual for unread message count for recruiter (from job seeker)
boothQueueSchema.virtual('messageCount').get(function() {
    return this.messages ? this.messages.filter(msg => !msg.isRead && msg.sender === 'jobseeker').length : 0;
});

// Virtual for unread message count for job seeker (from recruiter)
boothQueueSchema.virtual('unreadForJobSeeker').get(function() {
    return this.messages ? this.messages.filter(msg => !msg.isRead && msg.sender === 'recruiter').length : 0;
});

// Generate queue token before validation so the required validator passes
boothQueueSchema.pre('validate', function(next) {
    if (!this.queueToken) {
        this.queueToken = `${this.booth}_${this.jobSeeker}_${Date.now()}`;
    }
    next();
});

// Defensive fallback in case something clears it between validate and save
boothQueueSchema.pre('save', function(next) {
    if (!this.queueToken) {
        this.queueToken = `${this.booth}_${this.jobSeeker}_${Date.now()}`;
    }
    next();
});

// Static method to get next position in queue for a booth
boothQueueSchema.statics.getNextPosition = async function(boothId) {
    const lastEntry = await this.findOne({ booth: boothId })
        .sort({ position: -1 })
        .select('position');
    
    return lastEntry ? lastEntry.position + 1 : 1;
};

boothQueueSchema.statics.getBoothQueue = async function(boothId) {
    return this.find({ 
        booth: boothId, 
        status: { $in: ['waiting', 'invited'] }
    })
    .populate('jobSeeker', 'name email avatarUrl resumeUrl phoneNumber city state metadata')
    .populate('interpreterCategory', 'name code')
    .sort({ position: 1 });
};

// Static method to get job seeker's current queue entry
boothQueueSchema.statics.getJobSeekerQueue = async function(jobSeekerId, boothId) {
    return this.findOne({ 
        jobSeeker: jobSeekerId, 
        booth: boothId,
        status: { $in: ['waiting', 'invited'] }
    })
    .populate('booth', 'company companyLogo')
    .populate('event', 'name logo')
    .populate('jobSeeker', 'name email avatarUrl resumeUrl phoneNumber city state metadata')
    .populate('interpreterCategory', 'name code');
};

// Instance method to add message
boothQueueSchema.methods.addMessage = function(messageData) {
    this.messages.push({
        type: messageData.type,
        content: messageData.content,
        sender: messageData.sender,
        createdAt: new Date(),
        isRead: false
    });
    return this.save();
};

// Instance method to mark messages as read (by sender type)
boothQueueSchema.methods.markMessagesAsRead = function(senderType) {
    if (senderType) {
        this.messages.forEach(message => {
            if (message.sender === senderType) {
                message.isRead = true;
            }
        });
    } else {
        // Mark all as read if no sender type specified
        this.messages.forEach(message => {
            message.isRead = true;
        });
    }
    return this.save();
};

// Instance method to leave queue
boothQueueSchema.methods.leaveQueue = function(withMessage = false) {
    this.status = withMessage ? 'left_with_message' : 'left';
    this.leftAt = new Date();
    return this.save();
};

// Instance method to invite to meeting
boothQueueSchema.methods.inviteToMeeting = function(meetingId) {
    this.status = 'invited';
    this.invitedAt = new Date();
    this.lastActivity = new Date();
    this.meetingId = meetingId;
    return this.save();
};

// Instance method to update activity timestamp
boothQueueSchema.methods.updateActivity = function() {
    this.lastActivity = new Date();
    return this.save();
};

module.exports = mongoose.model('BoothQueue', boothQueueSchema);
