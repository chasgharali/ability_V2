const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Event name is required'],
        trim: true,
        maxlength: [200, 'Event name cannot exceed 200 characters']
    },
    slug: {
        type: String,
        required: [true, 'Event slug is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [1000, 'Description cannot exceed 1000 characters']
    },
    logoUrl: {
        type: String,
        default: null
    },
    start: {
        type: Date,
        required: [true, 'Event start time is required']
    },
    end: {
        type: Date,
        required: [true, 'Event end time is required'],
        validate: {
            validator: function (value) {
                return value > this.start;
            },
            message: 'Event end time must be after start time'
        }
    },
    timezone: {
        type: String,
        default: 'UTC',
        required: true
    },
    // Array of booth IDs
    booths: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth'
    }],
    // Event settings and configuration
    settings: {
        // Queue settings
        queueSettings: {
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
            allowQueueJoining: {
                type: Boolean,
                default: true
            }
        },
        // Call settings
        callSettings: {
            maxCallDuration: {
                type: Number,
                default: 60, // minutes
                min: 5,
                max: 180
            },
            allowInterpreterRequests: {
                type: Boolean,
                default: true
            },
            requireInterpreterApproval: {
                type: Boolean,
                default: false
            }
        },
        // Registration settings
        registrationSettings: {
            allowDirectRegistration: {
                type: Boolean,
                default: true
            },
            requireEmailVerification: {
                type: Boolean,
                default: false
            },
            allowEventLinkRegistration: {
                type: Boolean,
                default: true
            }
        },
        // Accessibility settings
        accessibilitySettings: {
            enableHighContrast: {
                type: Boolean,
                default: true
            },
            enableScreenReaderSupport: {
                type: Boolean,
                default: true
            },
            enableKeyboardNavigation: {
                type: Boolean,
                default: true
            }
        }
    },
    // Event status
    status: {
        type: String,
        enum: ['draft', 'published', 'active', 'completed', 'cancelled'],
        default: 'draft'
    },
    // Event creator/admin
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Event administrators
    administrators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Event statistics
    stats: {
        totalRegistrations: {
            type: Number,
            default: 0
        },
        totalCalls: {
            type: Number,
            default: 0
        },
        totalInterpreterRequests: {
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
eventSchema.index({ slug: 1 });
eventSchema.index({ status: 1 });
eventSchema.index({ start: 1, end: 1 });
eventSchema.index({ createdBy: 1 });

// Virtual for event duration
eventSchema.virtual('duration').get(function () {
    return this.end - this.start;
});

// Virtual for checking if event is currently active
eventSchema.virtual('isActive').get(function () {
    const now = new Date();
    return this.status === 'active' && now >= this.start && now <= this.end;
});

// Virtual for checking if event is upcoming
eventSchema.virtual('isUpcoming').get(function () {
    const now = new Date();
    return this.status === 'published' && now < this.start;
});

// Pre-save middleware to generate slug if not provided
eventSchema.pre('save', function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .trim('-');
    }
    next();
});

// Instance method to check if user can access event
eventSchema.methods.canUserAccess = function (user) {
    if (!user) return false;

    // Admin and GlobalSupport can access all events
    if (['Admin', 'GlobalSupport'].includes(user.role)) return true;

    // Event administrators can access their events
    if (this.administrators.includes(user._id)) return true;

    // AdminEvent can access events they created
    if (user.role === 'AdminEvent' && this.createdBy.equals(user._id)) return true;

    // Published and active events are accessible to all users
    return ['published', 'active'].includes(this.status);
};

// Instance method to get event summary
eventSchema.methods.getSummary = function () {
    return {
        _id: this._id,
        name: this.name,
        slug: this.slug,
        description: this.description,
        logoUrl: this.logoUrl,
        start: this.start,
        end: this.end,
        timezone: this.timezone,
        status: this.status,
        isActive: this.isActive,
        isUpcoming: this.isUpcoming,
        boothCount: this.booths.length,
        stats: this.stats
    };
};

// Static method to find active events
eventSchema.statics.findActive = function () {
    const now = new Date();
    return this.find({
        status: 'active',
        start: { $lte: now },
        end: { $gte: now }
    });
};

// Static method to find upcoming events
eventSchema.statics.findUpcoming = function () {
    const now = new Date();
    return this.find({
        status: { $in: ['published', 'active'] },
        start: { $gt: now }
    });
};

module.exports = mongoose.model('Event', eventSchema);
