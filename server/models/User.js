const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Sub-schema for JobSeeker survey
const surveySchema = new mongoose.Schema({
    race: [{ type: String, trim: true, default: undefined }],
    genderIdentity: { type: String, trim: true, default: '' },
    ageGroup: { type: String, trim: true, default: '' },
    countryOfOrigin: { type: String, trim: true, default: '' },
    disabilities: [{ type: String, trim: true, default: undefined }],
    otherDisability: { type: String, trim: true, default: '' },
    updatedAt: { type: Date, default: null }
}, { _id: false, minimize: false });

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true,
        maxlength: [100, 'Name cannot exceed 100 characters']
    },
    emailVerified: {
        type: Boolean,
        default: false
    },
    emailVerificationToken: {
        type: String,
        default: null
    },
    emailVerificationExpires: {
        type: Date,
        default: null
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
    // Basic location fields
    state: {
        type: String,
        trim: true,
        default: ''
    },
    city: {
        type: String,
        trim: true,
        default: ''
    },
    country: {
        type: String,
        trim: true,
        default: 'US'
    },
    // Accessibility preferences
    usesScreenMagnifier: { type: Boolean, default: false },
    usesScreenReader: { type: Boolean, default: false },
    needsASL: { type: Boolean, default: false },
    needsCaptions: { type: Boolean, default: false },
    needsOther: { type: Boolean, default: false },
    subscribeAnnouncements: { type: Boolean, default: false },
    // JobSeeker survey
    survey: { type: surveySchema, default: () => ({ race: [], genderIdentity: '', ageGroup: '', countryOfOrigin: '', disabilities: [], otherDisability: '', updatedAt: null }) },
    // Interpreter specific fields
    languages: [{
        type: String,
        trim: true
    }],
    isAvailable: {
        type: Boolean,
        default: false // Interpreters are offline by default until they set themselves online
    },
    // Recruiter/BoothAdmin specific: assigned booth
    assignedBooth: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        default: null
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

// Index for performance (email index is created by unique: true)
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
    const profile = {
        _id: this._id,
        name: this.name,
        email: this.email,
        role: this.role,
        avatarUrl: this.avatarUrl,
        emailVerified: this.emailVerified,
        resumeUrl: this.resumeUrl,
        isActive: this.isActive,
        lastLogin: this.lastLogin,
        phoneNumber: this.phoneNumber,
        state: this.state,
        city: this.city,
        country: this.country,
        usesScreenMagnifier: this.usesScreenMagnifier,
        usesScreenReader: this.usesScreenReader,
        needsASL: this.needsASL,
        needsCaptions: this.needsCaptions,
        needsOther: this.needsOther,
        subscribeAnnouncements: this.subscribeAnnouncements,
        survey: this.survey,
        metadata: this.metadata,
        languages: this.languages,
        isAvailable: this.isAvailable,
        assignedBooth: this.assignedBooth,
        createdAt: this.createdAt
    };

    // If assignedBooth is populated, include booth name
    if (this.assignedBooth && typeof this.assignedBooth === 'object' && this.assignedBooth.name) {
        profile.boothName = this.assignedBooth.name || this.assignedBooth.company || 'Unknown Booth';
        profile.assignedBooth = this.assignedBooth._id; // Keep just the ID
    }

    return profile;
};

// Validate recruiter/booth admin must have assignedBooth
userSchema.pre('validate', function (next) {
    const role = this.role;
    if (['Recruiter', 'BoothAdmin'].includes(role) && !this.assignedBooth) {
        this.invalidate('assignedBooth', 'Assigned booth is required for recruiters and booth admins');
    }
    next();
});

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
