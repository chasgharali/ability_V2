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
        enum: ['waiting', 'invited', 'in_meeting', 'completed', 'left'],
        default: 'waiting'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    invitedAt: {
        type: Date,
        default: null
    },
    leftAt: {
        type: Date,
        default: null
    },
    agreedToTerms: {
        type: Boolean,
        required: true,
        default: false
    },
    // Messages from job seeker to recruiter
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
boothQueueSchema.index({ jobSeeker: 1, booth: 1 }, { unique: true });
boothQueueSchema.index({ queueToken: 1 });
boothQueueSchema.index({ event: 1, booth: 1 });

// Virtual for unread message count
boothQueueSchema.virtual('messageCount').get(function() {
    return this.messages ? this.messages.filter(msg => !msg.isRead).length : 0;
});

// Pre-save middleware to generate queue token
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

// Static method to get current queue for a booth
boothQueueSchema.statics.getBoothQueue = async function(boothId) {
    return this.find({ 
        booth: boothId, 
        status: { $in: ['waiting', 'invited'] }
    })
    .populate('jobSeeker', 'name email profilePicture')
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
    .populate('interpreterCategory', 'name code');
};

// Instance method to add message
boothQueueSchema.methods.addMessage = function(messageData) {
    this.messages.push({
        type: messageData.type,
        content: messageData.content,
        createdAt: new Date(),
        isRead: false
    });
    return this.save();
};

// Instance method to mark messages as read
boothQueueSchema.methods.markMessagesAsRead = function() {
    this.messages.forEach(message => {
        message.isRead = true;
    });
    return this.save();
};

// Instance method to leave queue
boothQueueSchema.methods.leaveQueue = function() {
    this.status = 'left';
    this.leftAt = new Date();
    return this.save();
};

// Instance method to invite to meeting
boothQueueSchema.methods.inviteToMeeting = function(meetingId) {
    this.status = 'invited';
    this.invitedAt = new Date();
    this.meetingId = meetingId;
    return this.save();
};

module.exports = mongoose.model('BoothQueue', boothQueueSchema);
