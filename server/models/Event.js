const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Event name is required'],
        trim: true,
        maxlength: [200, 'Event name cannot exceed 200 characters']
    },
    // Event limits
    limits: {
        maxBooths: {
            type: Number,
            default: 0,
            min: 0
        },
        maxRecruitersPerEvent: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    // UI theme/customization options from the admin form
    theme: {
        headerColor: { type: String, default: '#ffffff' },
        headerTextColor: { type: String, default: '#000000' },
        bodyColor: { type: String, default: '#ff9800' },
        bodyTextColor: { type: String, default: '#000000' },
        sidebarColor: { type: String, default: '#ffffff' },
        sidebarTextColor: { type: String, default: '#000000' },
        btnPrimaryColor: { type: String, default: '#000000' },
        btnPrimaryTextColor: { type: String, default: '#ffffff' },
        btnSecondaryColor: { type: String, default: '#000000' },
        btnSecondaryTextColor: { type: String, default: '#ffffff' },
        entranceFormColor: { type: String, default: '#ff9800' },
        entranceFormTextColor: { type: String, default: '#000000' },
        chatHeaderColor: { type: String, default: '#eeeeee' },
        chatSidebarColor: { type: String, default: '#000000' },
        addFooter: { type: Boolean, default: false }
    },
    termsId: {
        type: String,
        trim: true,
        default: null
    },
    // New: allow linking multiple Terms & Conditions documents to an event
    termsIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'TermsConditions'
    }],
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
    // Optional Sendy/Mailing list integration id
    sendyId: {
        type: String,
        trim: true,
        default: null,
        maxlength: [200, 'Sendy ID cannot exceed 200 characters']
    },
    // Optional public landing link for the event
    link: {
        type: String,
        trim: true,
        default: null
    },
    logoUrl: {
        type: String,
        default: null
    },
    // Demo events are always available and not tied to a fixed schedule for admins
    isDemo: {
        type: Boolean,
        default: false
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

// Indexes for performance (slug index is created by unique: true)
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
    // Demo events are considered always active as long as they are published/active
    if (this.isDemo) {
        return ['published', 'active'].includes(this.status);
    }
    return this.status === 'active' && now >= this.start && now <= this.end;
});

// Virtual for checking if event is upcoming
eventSchema.virtual('isUpcoming').get(function () {
    const now = new Date();
    if (this.isDemo) {
        // Demo events are not time-bound; treat them as not-upcoming (they are simply available)
        return false;
    }
    return this.status === 'published' && now < this.start;
});

// Pre-save middleware to generate slug if not provided
eventSchema.pre('validate', function (next) {
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
    if (this.administrators && this.administrators.includes(user._id)) return true;

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
        link: this.link,
        sendyId: this.sendyId,
        logoUrl: this.logoUrl,
        start: this.start,
        end: this.end,
        timezone: this.timezone,
        status: this.status,
        isDemo: this.isDemo || false,
        isActive: this.isActive,
        isUpcoming: this.isUpcoming,
        limits: this.limits,
        addFooter: this.theme?.addFooter ?? false,
        boothCount: (this.booths ? this.booths.length : 0),
        stats: this.stats,
        createdAt: this.createdAt,
        termsIds: this.termsIds || []
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
