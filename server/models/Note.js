const mongoose = require('mongoose');

const noteSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Note title is required'],
        trim: true,
        maxlength: [200, 'Note title cannot exceed 200 characters']
    },
    content: {
        type: String,
        required: [true, 'Note content is required'],
        trim: true
    },
    type: {
        type: String,
        required: [true, 'Note type is required'],
        enum: {
            values: ['troubleshooting', 'instruction'],
            message: 'Note type must be either "troubleshooting" or "instruction"'
        }
    },
    assignedRoles: {
        type: [String],
        required: [true, 'At least one role must be assigned'],
        validate: {
            validator: function(roles) {
                return roles && roles.length > 0;
            },
            message: 'At least one role must be assigned'
        },
        enum: {
            values: ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'],
            message: 'Invalid role specified'
        }
    },
    // Note creator/admin
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
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance
noteSchema.index({ type: 1 });
noteSchema.index({ assignedRoles: 1 });
noteSchema.index({ isActive: 1 });
noteSchema.index({ createdAt: -1 });
noteSchema.index({ type: 1, assignedRoles: 1 });

// Virtual for content preview (first 200 characters)
noteSchema.virtual('contentPreview').get(function () {
    if (!this.content) return '';
    // Remove HTML tags for preview
    const textContent = this.content.replace(/<[^>]*>/g, '');
    return textContent.length > 200 ? textContent.substring(0, 200) + '...' : textContent;
});

// Instance method to check if user can access note
noteSchema.methods.canUserAccess = function (user) {
    if (!user) return false;

    // Admin can access all notes
    if (user.role === 'Admin') return true;

    // Check if user's role is in assignedRoles
    return this.assignedRoles.includes(user.role);
};

// Instance method to get note summary
noteSchema.methods.getSummary = function () {
    return {
        _id: this._id,
        title: this.title,
        contentPreview: this.contentPreview,
        type: this.type,
        assignedRoles: this.assignedRoles,
        isActive: this.isActive,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

// Static method to find notes by type and role
noteSchema.statics.findByTypeAndRole = function (type, role) {
    return this.find({
        type,
        assignedRoles: role,
        isActive: true
    }).sort({ createdAt: -1 });
};

module.exports = mongoose.model('Note', noteSchema);





