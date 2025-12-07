const mongoose = require('mongoose');

const richSectionSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Section title is required'],
        trim: true,
        maxlength: [100, 'Title cannot exceed 100 characters']
    },
    contentHtml: {
        type: String,
        required: false, // Made optional to allow empty content for demo events
        default: '',
        maxlength: [5000, 'Content cannot exceed 5000 characters']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    order: {
        type: Number,
        default: 0
    }
}, { _id: true });

const boothSchema = new mongoose.Schema({
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, 'Event ID is required']
    },
    name: {
        type: String,
        required: [true, 'Booth name is required'],
        trim: true,
        maxlength: [200, 'Booth name cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true
    },
    recruitersCount: {
        type: Number,
        default: 1,
        min: 1
        },
    companyPage: {
        type: String,
        default: '',
        trim: true
    },
    expireLinkTime: {
        type: Date,
        default: null
    },
    customInviteSlug: {
        type: String,
        unique: true,
        sparse: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Custom invite must be lowercase letters, numbers, and dashes only']
    },
    // Custom join booth button link - if set, overrides the default queue link
    joinBoothButtonLink: {
        type: String,
        default: '',
        trim: true
    },
    logoUrl: {
        type: String,
        default: null
    },
    // Rich content sections for the waiting area
    richSections: [richSectionSchema],
    // Queue reference
    queueId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Queue',
        default: null
    },
    // Booth administrators
    administrators: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }],
    // Booth settings
    settings: {
        // Queue settings specific to this booth
        queueSettings: {
            maxQueueSize: {
                type: Number,
                default: 50,
                min: 1,
                max: 200
            },
            estimatedWaitTime: {
                type: Number,
                default: 15, // minutes
                min: 1,
                max: 120
            },
            allowQueueJoining: {
                type: Boolean,
                default: true
            }
        },
        // Call settings specific to this booth
        callSettings: {
            maxCallDuration: {
                type: Number,
                default: 30, // minutes
                min: 5,
                max: 120
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
        // Display settings
        displaySettings: {
            showLogo: {
                type: Boolean,
                default: true
            },
            showDescription: {
                type: Boolean,
                default: true
            },
            showRichSections: {
                type: Boolean,
                default: true
            }
        }
    },
    // Booth status
    status: {
        type: String,
        enum: ['active', 'inactive', 'maintenance'],
        default: 'active'
    },
    // Booth statistics
    stats: {
        totalQueueJoins: {
            type: Number,
            default: 0
        },
        totalCalls: {
            type: Number,
            default: 0
        },
        averageCallDuration: {
            type: Number,
            default: 0
        },
        averageRating: {
            type: Number,
            default: 0
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance (customInviteSlug index is created by unique: true)
boothSchema.index({ eventId: 1 });
boothSchema.index({ status: 1 });
boothSchema.index({ administrators: 1 });

// Virtual for checking if booth is available for queue joining
boothSchema.virtual('isAvailableForQueue').get(function () {
    return this.status === 'active' &&
        this.settings.queueSettings.allowQueueJoining;
});

// Instance method to check if user can manage booth
boothSchema.methods.canUserManage = function (user) {
    if (!user) return false;

    // Admin and GlobalSupport can manage all booths
    if (['Admin', 'GlobalSupport'].includes(user.role)) return true;

    // Booth administrators can manage their booths
    if (this.administrators && this.administrators.includes(user._id)) return true;

    // AdminEvent can manage booths in their events
    if (user.role === 'AdminEvent') {
        // This would need to be populated or checked via event
        return true; // Simplified for now
    }

    return false;
};

// Instance method to get booth summary
boothSchema.methods.getSummary = function () {
    const sections = Array.isArray(this.richSections) ? this.richSections : [];
    return {
        _id: this._id,
        eventId: this.eventId,
        name: this.name,
        description: this.description,
        logoUrl: this.logoUrl,
        recruitersCount: this.recruitersCount,
        companyPage: this.companyPage,
        expireLinkTime: this.expireLinkTime,
        customInviteSlug: this.customInviteSlug,
        joinBoothButtonLink: this.joinBoothButtonLink || '',
        status: this.status,
        isAvailableForQueue: this.isAvailableForQueue,
        queueId: this.queueId,
        stats: this.stats,
        richSectionsCount: sections.length,
        richSections: sections
            .slice(0, 3)
            .sort((a, b) => a.order - b.order)
            .map(s => ({ _id: s._id, title: s.title, contentHtml: s.contentHtml, order: s.order, isActive: s.isActive }))
    };
};

// Instance method to get public booth info (for job seekers)
boothSchema.methods.getPublicInfo = function () {
    const sections = Array.isArray(this.richSections) ? this.richSections : [];
    return {
        _id: this._id,
        name: this.name,
        description: this.description,
        logoUrl: this.logoUrl,
        recruitersCount: this.recruitersCount,
        companyPage: this.companyPage,
        joinBoothButtonLink: this.joinBoothButtonLink || '',
        isAvailableForQueue: this.isAvailableForQueue,
        estimatedWaitTime: this.settings.queueSettings.estimatedWaitTime,
        richSections: sections
            .filter(section => section.isActive)
            .sort((a, b) => a.order - b.order)
            .map(section => ({
                title: section.title,
                contentHtml: section.contentHtml
            }))
    };
};

// Static method to find booths by event
boothSchema.statics.findByEvent = function (eventId) {
    return this.find({ eventId, status: 'active' });
};

// Static method to find booths available for queue joining
boothSchema.statics.findAvailableForQueue = function (eventId) {
    return this.find({
        eventId,
        status: 'active',
        'settings.queueSettings.allowQueueJoining': true
    });
};

module.exports = mongoose.model('Booth', boothSchema);
