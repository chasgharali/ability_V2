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
    passwordResetToken: {
        type: String,
        default: null
    },
    passwordResetExpires: {
        type: Date,
        default: null
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        lowercase: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/, 'Please enter a valid email']
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
    // Legacy ID from V1 database for migration tracking
    legacyId: {
        type: String,
        default: null,
        index: true
    },
    // Legacy password support for V1 users (dual password validation)
    legacyPassword: {
        hash: { type: String, default: null },
        salt: { type: String, default: null },
        algorithm: { type: String, default: 'pbkdf2' }
    },
    // Registration date (for migrated users)
    registrationDate: {
        type: Date,
        default: null
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
            // Keep legacyPassword in JSON (it's needed for debugging during migration)
            // delete ret.legacyPassword; // Commented out - keep for migration period
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
    // Skip if password is already a bcrypt hash (starts with $2)
    if (!this.isModified('hashedPassword')) return next();
    
    // Don't re-hash if it's already a bcrypt hash (from migration)
    if (this.hashedPassword && this.hashedPassword.startsWith('$2')) {
        return next();
    }

    try {
        // Hash password with cost of 12
        const salt = await bcrypt.genSalt(12);
        this.hashedPassword = await bcrypt.hash(this.hashedPassword, salt);
        next();
    } catch (error) {
        next(error);
    }
});

// Instance method to check password (supports both bcrypt and legacy pbkdf2)
// Matches V1's validPassword method exactly:
// V1: const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
// V1: return this.hash_password === hash;
userSchema.methods.comparePassword = async function (candidatePassword) {
    const crypto = require('crypto');
    
    // Try new bcrypt password first (for new V2 users)
    if (this.hashedPassword && this.hashedPassword.startsWith('$2')) {
    try {
            const bcryptMatch = await bcrypt.compare(candidatePassword, this.hashedPassword);
            if (bcryptMatch) {
                return true;
            }
    } catch (error) {
            // Bcrypt comparison failed, continue to legacy password check
        }
    }

    // If legacy password exists, try pbkdf2 (for migrated V1 users)
    // Access legacyPassword - handle both mongoose document and plain object from database
    let legacyPassword = null;
    
    // Try multiple ways to access legacyPassword field
    if (this.legacyPassword) {
        legacyPassword = this.legacyPassword;
    } else if (this._doc && this._doc.legacyPassword) {
        legacyPassword = this._doc.legacyPassword;
    } else if (typeof this.toObject === 'function') {
        try {
            const userObj = this.toObject({ getters: false, virtuals: false });
            legacyPassword = userObj.legacyPassword;
        } catch (e) {
            // Try accessing directly from document
            legacyPassword = this.get ? this.get('legacyPassword') : null;
        }
    }
    
    // Check if legacy password exists and has required fields
    if (!legacyPassword || typeof legacyPassword !== 'object') {
        return false;
    }
    
    const legacyHash = legacyPassword.hash || legacyPassword.Hash;
    const legacySalt = legacyPassword.salt || legacyPassword.Salt;
    
    if (!legacyHash || !legacySalt) {
        return false;
    }
    
    // Use EXACT same logic as V1 validPassword method
    // V1 Code:
    // schema.methods.validPassword = function (password: string): boolean {
    //   const hash = crypto.pbkdf2Sync(password, this.salt, 10000, 512, "sha512").toString("hex");
    //   return this.hash_password === hash;
    // };
    try {
        const computedHash = crypto.pbkdf2Sync(
                candidatePassword,
            legacySalt,
            10000, // iterations - MUST match V1 exactly
            512,   // key length - MUST match V1 exactly
            'sha512' // algorithm - MUST match V1 exactly
            ).toString('hex');
            
        // Compare hashes (exact string comparison like V1)
        if (computedHash === legacyHash) {
            // Password matches! Auto-migrate to bcrypt and clear legacy password
            const newBcryptHash = await bcrypt.hash(candidatePassword, 12);
            
            // Update directly in database using native MongoDB driver to bypass Mongoose validation
            // This avoids validation errors when the document has fields that don't match current schema
            try {
                const collection = this.constructor.collection;
                await collection.updateOne(
                    { _id: this._id },
                    {
                        $set: {
                            hashedPassword: newBcryptHash,
                            legacyPassword: null,
                            updatedAt: new Date()
                        }
                    }
                );
                
                // Update local instance
                this.hashedPassword = newBcryptHash;
                this.legacyPassword = null;
                
                return true;
            } catch (updateError) {
                // If update fails, log but don't fail authentication
                console.error(`[comparePassword] Error updating password for ${this.email}:`, updateError.message);
                // Still return true since password was validated correctly
                return true;
        }
    }
    
    return false;
    } catch (error) {
        console.error(`[comparePassword] Error validating legacy password for ${this.email}:`, error.message);
        return false;
    }
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

// Validate recruiter/booth admin/booth support/booth interpreter must have assignedBooth
userSchema.pre('validate', function (next) {
    const role = this.role;
    if (['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'].includes(role) && !this.assignedBooth) {
        this.invalidate('assignedBooth', 'Assigned booth is required for recruiters, booth admins, booth support, and booth interpreters');
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
