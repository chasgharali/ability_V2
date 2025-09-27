const mongoose = require('mongoose');

const queueEntrySchema = new mongoose.Schema({
    tokenNumber: {
        type: Number,
        required: [true, 'Token number is required'],
        min: 1
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'User ID is required']
    },
    status: {
        type: String,
        enum: ['waiting', 'serving', 'completed', 'left', 'expired'],
        default: 'waiting'
    },
    joinedAt: {
        type: Date,
        default: Date.now
    },
    servedAt: {
        type: Date,
        default: null
    },
    leftAt: {
        type: Date,
        default: null
    },
    // Optional message when leaving queue
    leaveMessage: {
        type: {
            type: String,
            enum: ['text', 'audio', 'video'],
            required: function () {
                return this.status === 'left';
            }
        },
        content: String, // For text messages
        contentUrl: String, // For audio/video files
        transcript: String // For audio/video transcripts
    },
    // Estimated wait time when joined
    estimatedWaitTime: {
        type: Number,
        default: 15 // minutes
    },
    // Actual wait time
    actualWaitTime: {
        type: Number,
        default: null // minutes
    }
}, { _id: true });

const queueSchema = new mongoose.Schema({
    boothId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        required: [true, 'Booth ID is required']
    },
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, 'Event ID is required']
    },
    // Current serving token number
    currentServing: {
        type: Number,
        default: 0,
        min: 0
    },
    // Last issued token number
    lastToken: {
        type: Number,
        default: 0,
        min: 0
    },
    // Queue entries
    entries: [queueEntrySchema],
    // Queue status
    status: {
        type: String,
        enum: ['active', 'paused', 'closed'],
        default: 'active'
    },
    // Queue settings
    settings: {
        maxQueueSize: {
            type: Number,
            default: 100,
            min: 1,
            max: 1000
        },
        tokenExpiryMinutes: {
            type: Number,
            default: 30,
            min: 5,
            max: 120
        },
        autoAdvanceInterval: {
            type: Number,
            default: 5, // minutes
            min: 1,
            max: 30
        }
    },
    // Queue statistics
    stats: {
        totalTokensIssued: {
            type: Number,
            default: 0
        },
        totalServed: {
            type: Number,
            default: 0
        },
        totalLeft: {
            type: Number,
            default: 0
        },
        averageWaitTime: {
            type: Number,
            default: 0
        },
        averageServiceTime: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
queueSchema.index({ boothId: 1 });
queueSchema.index({ eventId: 1 });
queueSchema.index({ status: 1 });
queueSchema.index({ 'entries.userId': 1 });
queueSchema.index({ 'entries.tokenNumber': 1 });

// Virtual for current queue length
queueSchema.virtual('currentLength').get(function () {
    return this.entries.filter(entry => entry.status === 'waiting').length;
});

// Virtual for next token number
queueSchema.virtual('nextToken').get(function () {
    return this.lastToken + 1;
});

// Virtual for estimated wait time
queueSchema.virtual('estimatedWaitTime').get(function () {
    const waitingEntries = this.entries.filter(entry => entry.status === 'waiting');
    if (waitingEntries.length === 0) return 0;

    // Simple estimation based on average service time
    const avgServiceTime = this.stats.averageServiceTime || 15; // minutes
    return waitingEntries.length * avgServiceTime;
});

// Instance method to join queue
queueSchema.methods.joinQueue = async function (userId) {
    // Check if user is already in queue
    const existingEntry = this.entries.find(entry =>
        entry.userId.equals(userId) &&
        ['waiting', 'serving'].includes(entry.status)
    );

    if (existingEntry) {
        throw new Error('User is already in queue');
    }

    // Check queue capacity
    if (this.currentLength >= this.settings.maxQueueSize) {
        throw new Error('Queue is at maximum capacity');
    }

    // Check queue status
    if (this.status !== 'active') {
        throw new Error('Queue is not accepting new entries');
    }

    // Generate new token
    const tokenNumber = this.nextToken;
    this.lastToken = tokenNumber;
    this.stats.totalTokensIssued += 1;

    // Add entry to queue
    const newEntry = {
        tokenNumber,
        userId,
        status: 'waiting',
        joinedAt: new Date(),
        estimatedWaitTime: this.estimatedWaitTime
    };

    this.entries.push(newEntry);

    await this.save();

    return {
        tokenNumber,
        queuePosition: this.currentLength,
        estimatedWaitTime: this.estimatedWaitTime
    };
};

// Instance method to leave queue
queueSchema.methods.leaveQueue = async function (userId, leaveMessage = null) {
    const entry = this.entries.find(entry =>
        entry.userId.equals(userId) &&
        ['waiting', 'serving'].includes(entry.status)
    );

    if (!entry) {
        throw new Error('User is not in queue');
    }

    entry.status = 'left';
    entry.leftAt = new Date();
    entry.actualWaitTime = Math.round((entry.leftAt - entry.joinedAt) / (1000 * 60)); // minutes

    if (leaveMessage) {
        entry.leaveMessage = leaveMessage;
    }

    this.stats.totalLeft += 1;

    await this.save();

    return entry;
};

// Instance method to serve next token
queueSchema.methods.serveNext = async function () {
    const nextEntry = this.entries.find(entry =>
        entry.status === 'waiting' &&
        entry.tokenNumber > this.currentServing
    );

    if (!nextEntry) {
        return null; // No one to serve
    }

    // Mark previous entry as completed if it was being served
    const previousEntry = this.entries.find(entry =>
        entry.status === 'serving'
    );

    if (previousEntry) {
        previousEntry.status = 'completed';
        previousEntry.servedAt = new Date();
        previousEntry.actualWaitTime = Math.round((previousEntry.servedAt - previousEntry.joinedAt) / (1000 * 60));
        this.stats.totalServed += 1;
    }

    // Serve next entry
    nextEntry.status = 'serving';
    nextEntry.servedAt = new Date();
    this.currentServing = nextEntry.tokenNumber;

    await this.save();

    return nextEntry;
};

// Instance method to get queue status
queueSchema.methods.getStatus = function () {
    const waitingEntries = this.entries.filter(entry => entry.status === 'waiting');
    const servingEntry = this.entries.find(entry => entry.status === 'serving');

    return {
        queueId: this._id,
        boothId: this.boothId,
        eventId: this.eventId,
        currentServing: this.currentServing,
        nextToken: this.nextToken,
        currentLength: this.currentLength,
        estimatedWaitTime: this.estimatedWaitTime,
        status: this.status,
        servingEntry: servingEntry ? {
            tokenNumber: servingEntry.tokenNumber,
            userId: servingEntry.userId,
            servedAt: servingEntry.servedAt
        } : null,
        waitingEntries: waitingEntries.map(entry => ({
            tokenNumber: entry.tokenNumber,
            userId: entry.userId,
            joinedAt: entry.joinedAt,
            estimatedWaitTime: entry.estimatedWaitTime
        }))
    };
};

// Instance method to get user's position in queue
queueSchema.methods.getUserPosition = function (userId) {
    const userEntry = this.entries.find(entry =>
        entry.userId.equals(userId) &&
        ['waiting', 'serving'].includes(entry.status)
    );

    if (!userEntry) {
        return null;
    }

    const waitingEntries = this.entries.filter(entry => entry.status === 'waiting');
    const position = waitingEntries.findIndex(entry => entry.tokenNumber === userEntry.tokenNumber) + 1;

    return {
        tokenNumber: userEntry.tokenNumber,
        position,
        status: userEntry.status,
        joinedAt: userEntry.joinedAt,
        estimatedWaitTime: userEntry.estimatedWaitTime
    };
};

// Static method to find active queues
queueSchema.statics.findActive = function () {
    return this.find({ status: 'active' });
};

// Static method to find queue by booth
queueSchema.statics.findByBooth = function (boothId) {
    return this.findOne({ boothId });
};

module.exports = mongoose.model('Queue', queueSchema);
