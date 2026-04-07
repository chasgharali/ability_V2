const mongoose = require('mongoose');
const { toStablePublicImageUrl } = require('../utils/mediaUrl');

const organizationSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Organization name is required'],
        trim: true,
        maxlength: [200, 'Organization name cannot exceed 200 characters']
    },
    slug: {
        type: String,
        required: [true, 'Organization slug is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^[a-z0-9-]+$/, 'Slug can only contain lowercase letters, numbers, and hyphens']
    },
    logoUrl: {
        type: String,
        default: null
    },
    logoAltText: {
        type: String,
        default: '',
        trim: true,
        maxlength: [200, 'Logo alt text cannot exceed 200 characters']
    },
    description: {
        type: String,
        trim: true,
        maxlength: [2000, 'Description cannot exceed 2000 characters'],
        default: ''
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Host organization limits set by SuperAdmin
    limits: {
        maxEvents: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0
        },
        maxRecruiters: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0
        },
        maxUsers: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0
        },
        maxJobSeekers: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0
        },
        maxBooths: {
            type: Number,
            default: 0, // 0 = unlimited
            min: 0
        }
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ createdAt: -1 });

// Pre-save: auto-generate slug from name
organizationSchema.pre('validate', function (next) {
    if (!this.slug && this.name) {
        this.slug = this.name
            .toLowerCase()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');
    }
    next();
});

// Instance method to get org summary
organizationSchema.methods.getSummary = function () {
    return {
        _id: this._id,
        name: this.name,
        slug: this.slug,
        logoUrl: toStablePublicImageUrl(this.logoUrl),
        logoAltText: this.logoAltText,
        description: this.description,
        isActive: this.isActive,
        limits: this.limits,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

module.exports = mongoose.model('Organization', organizationSchema);
