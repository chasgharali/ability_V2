const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/, 'Please enter a valid email']
    },
    hashedPassword: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [8, 'Password must be at least 8 characters']
    },
    role: {
        type: String,
        required: [true, 'Role is required'],
        enum: {
            values: ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'],
            message: 'Invalid role specified'
        },
        default: 'JobSeeker'
    },
    avatarUrl: {
        type: String,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    lastLogin: {
        type: Date,
        default: null
    },
    // JobSeeker specific fields
    resumeUrl: {
        type: String,
        default: null
    },
    phoneNumber: {
        type: String,
        default: null
    },
    // Interpreter specific fields
    languages: [{
        type: String,
        trim: true
    }],
    isAvailable: {
        type: Boolean,
        default: true
    },
    // Metadata for additional user information
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    // Refresh tokens for JWT management
    refreshTokens: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now,
            expires: 604800 // 7 days
        }
    }]
}, {
    timestamps: true,
    toJSON: {
        transform: function (doc, ret) {
            delete ret.hashedPassword;
            delete ret.refreshTokens;
            return ret;
        }
    }
});

// Index for performance
userSchema.index({ email: 1 });
userSchema.index({ role: 1 });
userSchema.index({ isActive: 1 });

// Pre-save middleware to hash password
userSchema.pre('save', async function (next) {
    // Only hash the password if it has been modified (or is new)
    if (!this.isModified('hashedPassword')) return next();

    try {
        // Hash password with cost of 12
        const salt = await bcrypt.genSalt(12);
        this.hashedPassword = await bcrypt.hash(this.hashedPassword, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password
userSchema.methods.comparePassword = async function (candidatePassword) {
    return bcrypt.compare(candidatePassword, this.hashedPassword);
};

// Instance method to generate user summary for API responses
userSchema.methods.getPublicProfile = function () {
    return {
        _id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        avatarUrl: this.avatarUrl,
        isActive: this.isActive,
        languages: this.languages,
        isAvailable: this.isAvailable,
        createdAt: this.createdAt
    };
};

// Static method to find users by role
userSchema.statics.findByRole = function (role) {
    return this.find({ role, isActive: true });
};

// Static method to find available interpreters
userSchema.statics.findAvailableInterpreters = function () {
    return this.find({
        role: { $in: ['Interpreter', 'GlobalInterpreter'] },
        isActive: true,
        isAvailable: true
    });
};

module.exports = mongoose.model('User', userSchema);
