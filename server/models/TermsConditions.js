const mongoose = require('mongoose');

const termsConditionsSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Terms title is required'],
        trim: true,
        maxlength: [200, 'Terms title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Terms content is required'],
        trim: true
    },
    version: {
        type: String,
        required: [true, 'Version is required'],
        trim: true,
        maxlength: [50, 'Version cannot exceed 50 characters']
    },
    isActive: {
        type: Boolean,
        default: false
    },
    // Terms creator/admin
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Last updated by
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Usage statistics
    usage: {
        totalEvents: {
            type: Number,
            default: 0
        },
        lastUsed: {
            type: Date,
            default: null
        }
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
termsConditionsSchema.index({ isActive: 1 });
termsConditionsSchema.index({ version: 1 });
termsConditionsSchema.index({ createdBy: 1 });
termsConditionsSchema.index({ createdAt: -1 });

// Virtual for content preview (first 200 characters)
termsConditionsSchema.virtual('contentPreview').get(function () {
    if (!this.content) return '';
    // Remove HTML tags for preview
    const textContent = this.content.replace(/<[^>]*>/g, '');
    return textContent.length > 200 ? textContent.substring(0, 200) + '...' : textContent;
});

// Instance method to check if user can access terms
termsConditionsSchema.methods.canUserAccess = function (user) {
    if (!user) return false;

    // Admin and GlobalSupport can access all terms
    if (['Admin', 'GlobalSupport'].includes(user.role)) return true;

    // AdminEvent can access terms they created
    if (user.role === 'AdminEvent' && this.createdBy.equals(user._id)) return true;

    // Active terms are accessible to all authenticated users
    return this.isActive;
};

// Instance method to get terms summary
termsConditionsSchema.methods.getSummary = function () {
    return {
        _id: this._id,
        title: this.title,
        version: this.version,
        contentPreview: this.contentPreview,
        isActive: this.isActive,
        usage: this.usage,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

// Static method to find active terms (may be multiple)
termsConditionsSchema.statics.findActive = function () {
    return this.find({ isActive: true }).sort({ createdAt: -1 });
};

// Static method to find latest version
termsConditionsSchema.statics.findLatest = function () {
    return this.findOne().sort({ createdAt: -1 });
};

// No-op middleware: multiple active terms are allowed simultaneously
termsConditionsSchema.pre('save', async function (next) {
    return next();
});

module.exports = mongoose.model('TermsConditions', termsConditionsSchema);
