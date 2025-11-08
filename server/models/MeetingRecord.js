const mongoose = require('mongoose');

const feedbackSchema = new mongoose.Schema({
    rating: {
        type: Number,
        required: [true, 'Rating is required'],
        min: 1,
        max: 5
    },
    notes: {
        type: String,
        trim: true,
        maxlength: [1000, 'Notes cannot exceed 1000 characters']
    },
    strengths: [{
        type: String,
        trim: true,
        maxlength: [200, 'Strength cannot exceed 200 characters']
    }],
    areasForImprovement: [{
        type: String,
        trim: true,
        maxlength: [200, 'Area for improvement cannot exceed 200 characters']
    }],
    recommendedForHire: {
        type: Boolean,
        default: null
    },
    submittedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: false });

const attachmentSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['resume', 'document', 'image', 'audio', 'video'],
        required: true
    },
    filename: {
        type: String,
        required: true
    },
    s3Url: {
        type: String,
        required: true
    },
    mimeType: {
        type: String,
        required: true
    },
    size: {
        type: Number,
        required: true
    },
    transcript: {
        type: String,
        default: null
    },
    uploadedAt: {
        type: Date,
        default: Date.now
    }
}, { _id: true });

const meetingRecordSchema = new mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, 'Event ID is required']
    },
    boothId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        required: [true, 'Booth ID is required']
    },
    queueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'BoothQueue',
        required: [true, 'Queue ID is required']
    },
    videoCallId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'VideoCall',
        default: null
    },
    // Participants
    recruiterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Recruiter ID is required']
    },
    jobseekerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Job seeker ID is required']
    },
    interpreterId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Call details
    twilioRoomId: {
        type: String,
        default: null
    },
    twilioRoomSid: {
        type: String,
        default: null
    },
    // Timing
    startTime: {
        type: Date,
        default: Date.now
    },
    endTime: {
        type: Date,
        default: null
    },
    duration: {
        type: Number,
        default: null // minutes
    },
    // Call status
    status: {
        type: String,
        enum: ['scheduled', 'active', 'completed', 'cancelled', 'failed', 'left_with_message'],
        default: 'scheduled'
    },
    // Call quality metrics
    qualityMetrics: {
        connectionQuality: {
            type: String,
            enum: ['excellent', 'good', 'fair', 'poor'],
            default: null
        },
        audioQuality: {
            type: String,
            enum: ['excellent', 'good', 'fair', 'poor'],
            default: null
        },
        videoQuality: {
            type: String,
            enum: ['excellent', 'good', 'fair', 'poor'],
            default: null
        },
        droppedConnections: {
            type: Number,
            default: 0
        }
    },
    // Feedback and rating
    feedback: {
        type: feedbackSchema,
        default: null
    },
    // Recruiter rating (1-5 stars) and feedback message
    recruiterRating: {
        type: Number,
        min: 1,
        max: 5,
        default: null
    },
    recruiterFeedback: {
        type: String,
        trim: true,
        maxlength: [1000, 'Feedback cannot exceed 1000 characters'],
        default: null
    },
    // Job seeker messages from queue (audio, video, text)
    jobSeekerMessages: [{
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
        },
        isLeaveMessage: {
            type: Boolean,
            default: false
        }
    }],
    // Attachments (resume, documents shared during call)
    attachments: [attachmentSchema],
    // Chat messages (if using Twilio Chat)
    chatMessages: [{
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        message: {
            type: String,
            required: true,
            maxlength: [1000, 'Message cannot exceed 1000 characters']
        },
        timestamp: {
            type: Date,
            default: Date.now
        },
        messageType: {
            type: String,
            enum: ['text', 'file', 'system'],
            default: 'text'
        },
        attachment: {
            type: attachmentSchema,
            default: null
        }
    }],
    // Interpreter request details
    interpreterRequest: {
        requestedAt: {
            type: Date,
            default: null
        },
        requestedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            default: null
        },
        reason: {
            type: String,
            trim: true,
            maxlength: [500, 'Reason cannot exceed 500 characters']
        },
        language: {
            type: String,
            trim: true
        },
        status: {
            type: String,
            enum: ['pending', 'accepted', 'declined', 'completed'],
            default: null
        },
        acceptedAt: {
            type: Date,
            default: null
        },
        joinedAt: {
            type: Date,
            default: null
        }
    },
    // Meeting metadata
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
meetingRecordSchema.index({ eventId: 1 });
meetingRecordSchema.index({ boothId: 1 });
meetingRecordSchema.index({ recruiterId: 1 });
meetingRecordSchema.index({ jobseekerId: 1 });
meetingRecordSchema.index({ interpreterId: 1 });
meetingRecordSchema.index({ twilioRoomId: 1 });
meetingRecordSchema.index({ status: 1 });
meetingRecordSchema.index({ startTime: 1 });

// Virtual for call duration in minutes
meetingRecordSchema.virtual('callDurationMinutes').get(function () {
    if (!this.startTime || !this.endTime) return null;
    return Math.round((this.endTime - this.startTime) / (1000 * 60));
});

// Virtual for checking if call is active
meetingRecordSchema.virtual('isActive').get(function () {
    return this.status === 'active';
});

// Virtual for checking if call is completed
meetingRecordSchema.virtual('isCompleted').get(function () {
    return this.status === 'completed';
});

// Instance method to start call
meetingRecordSchema.methods.startCall = function () {
    this.status = 'active';
    this.startTime = new Date();
    return this.save();
};

// Instance method to end call
meetingRecordSchema.methods.endCall = function () {
    this.status = 'completed';
    this.endTime = new Date();
    this.duration = this.callDurationMinutes;
    return this.save();
};

// Instance method to request interpreter
meetingRecordSchema.methods.requestInterpreter = function (requestedBy, reason, language) {
    this.interpreterRequest = {
        requestedAt: new Date(),
        requestedBy,
        reason,
        language,
        status: 'pending'
    };
    return this.save();
};

// Instance method to accept interpreter request
meetingRecordSchema.methods.acceptInterpreterRequest = function (interpreterId) {
    if (this.interpreterRequest.status !== 'pending') {
        throw new Error('No pending interpreter request');
    }

    this.interpreterId = interpreterId;
    this.interpreterRequest.status = 'accepted';
    this.interpreterRequest.acceptedAt = new Date();
    return this.save();
};

// Instance method to join as interpreter
meetingRecordSchema.methods.joinAsInterpreter = function () {
    if (this.interpreterRequest.status !== 'accepted') {
        throw new Error('Interpreter request not accepted');
    }

    this.interpreterRequest.status = 'completed';
    this.interpreterRequest.joinedAt = new Date();
    return this.save();
};

// Instance method to add chat message
meetingRecordSchema.methods.addChatMessage = function (userId, message, messageType = 'text', attachment = null) {
    const chatMessage = {
        userId,
        message,
        messageType,
        timestamp: new Date()
    };

    if (attachment) {
        chatMessage.attachment = attachment;
    }

    this.chatMessages.push(chatMessage);
    return this.save();
};

// Instance method to add attachment
meetingRecordSchema.methods.addAttachment = function (attachment) {
    this.attachments.push(attachment);
    return this.save();
};

// Instance method to submit feedback
meetingRecordSchema.methods.submitFeedback = function (feedbackData) {
    this.feedback = {
        ...feedbackData,
        submittedAt: new Date()
    };
    return this.save();
};

// Instance method to submit recruiter rating and feedback
meetingRecordSchema.methods.submitRecruiterRating = function (rating, feedback) {
    this.recruiterRating = rating;
    this.recruiterFeedback = feedback;
    return this.save();
};

// Instance method to get meeting summary
meetingRecordSchema.methods.getSummary = function () {
    return {
        _id: this._id,
        eventId: this.eventId,
        boothId: this.boothId,
        recruiterId: this.recruiterId,
        jobseekerId: this.jobseekerId,
        interpreterId: this.interpreterId,
        startTime: this.startTime,
        endTime: this.endTime,
        duration: this.duration,
        status: this.status,
        hasFeedback: !!this.feedback,
        hasInterpreter: !!this.interpreterId,
        attachmentCount: this.attachments.length,
        chatMessageCount: this.chatMessages.length
    };
};

// Static method to find meetings by user
meetingRecordSchema.statics.findByUser = function (userId, role) {
    const query = {};

    if (role === 'Recruiter') {
        query.recruiterId = userId;
    } else if (role === 'JobSeeker') {
        query.jobseekerId = userId;
    } else if (['Interpreter', 'GlobalInterpreter'].includes(role)) {
        query.interpreterId = userId;
    }

    return this.find(query).sort({ startTime: -1 });
};

// Static method to find active meetings
meetingRecordSchema.statics.findActive = function () {
    return this.find({ status: 'active' });
};

// Static method to find meetings by event
meetingRecordSchema.statics.findByEvent = function (eventId) {
    return this.find({ eventId }).sort({ startTime: -1 });
};

module.exports = mongoose.model('MeetingRecord', meetingRecordSchema);
