const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { toStablePublicImageUrl } = require('../utils/mediaUrl');
const BOOTH_REQUIRED_ROLES = ['Recruiter', 'BoothAdmin', 'Support', 'Interpreter'];

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
    pendingEmail: {
        type: String,
        default: null,
        trim: true
    },
    emailChangeToken: {
        type: String,
        default: null
    },
    emailChangeExpires: {
        type: Date,
        default: null
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        match: [/^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,})+$/i, 'Please enter a valid email']
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
            values: ['SuperAdmin', 'Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker', 'Unassigned'],
            message: 'Invalid role specified'
        },
        // No silent JobSeeker default. Callers that create real job seekers
        // (registration, job seeker import) set role explicitly; anything else
        // that omits a role is flagged "Unassigned" / Needs Info.
        default: 'Unassigned'
    },
    // Organization scope — null for SuperAdmin and JobSeeker (global)
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        default: null
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
    resumeBuilderUsage: {
        updateCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    resumeUrl: {
        type: String,
        default: null
    },
    linkedInUrl: {
        type: String,
        default: null,
        trim: true
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
    // Recruiter/BoothAdmin/GlobalSupport specific: assigned events
    // Recruiter/BoothAdmin: multiple events for filtering job seekers
    // GlobalSupport: single event for scoping team chat visibility
    // GlobalInterpreter: multiple events for scoping team chat visibility
    assignedEvents: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event'
    }],
    // Metadata for additional user information
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    },
    importStatus: {
        type: String,
        enum: ['complete', 'incomplete'],
        default: 'complete'
    },
    importMissingFields: [{
        type: String,
        trim: true
    }],
    importMeta: {
        source: { type: String, trim: true, default: null },
        importedAt: { type: Date, default: null },
        importedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
    },
    // DEPRECATED — superseded by the ParsedResume collection.
    //
    // The previous design copied AI-parsed search data onto every User
    // document, including survey/disability/accessibility fields. That
    // violated the privacy contract (see docs/skills/ai-search/SKILL.md).
    //
    // Search now lives in `ParsedResume` keyed by userId, which has a
    // strict allowlist of non-sensitive fields and a hard schema-level
    // block on disability / accessibility / race / gender fields.
    //
    // This stub is kept (with the sensitive fields removed) only so legacy
    // documents in production don't trip Mongoose strict-mode warnings.
    // Do NOT write to it. Read from ParsedResume instead.
    aiProfile: {
        parsedAt: { type: Date, default: null },
        parseSource: { type: String, default: '' },
        currentTitle: { type: String, default: '' },
        yearsOfExperience: { type: Number, default: null },
        skills: [{ type: String }],
        industries: [{ type: String }],
        educationLevel: { type: String, default: '' },
        workLanguages: [{ type: String }],
        summary: { type: String, default: '' },
        headline: { type: String, default: '' },
        keywords: [{ type: String }],
        employmentTypes: [{ type: String }],
        workLevel: { type: String, default: '' },
        totalEventsRegistered: { type: Number, default: 0 },
        eventNames: [{ type: String }],
        searchableText: { type: String, default: '' }
    },
    // Refresh tokens for JWT management
    // NOTE: Do NOT use 'expires' on array subdocuments - MongoDB TTL indexes
    // work at the document level, which would delete the entire User document!
    // Token expiration should be handled in application logic instead.
    refreshTokens: [{
        token: String,
        createdAt: {
            type: Date,
            default: Date.now
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
userSchema.index({ organizationId: 1 });
userSchema.index({ organizationId: 1, role: 1 });

// Additional indexes for optimized search and listing
userSchema.index({ name: 1 }); // For name search
userSchema.index({ createdAt: -1 }); // For sorting by registration date
userSchema.index({ role: 1, isActive: 1 }); // Compound index for common filter combination
userSchema.index({ role: 1, createdAt: -1 }); // Compound index for listing with role filter
userSchema.index({ city: 1 }); // For location-based search
userSchema.index({ state: 1 }); // For location-based search
userSchema.index({ importStatus: 1 });

// Text index for full-text search capability (optional, for future use)
// This enables MongoDB's built-in text search on these fields
userSchema.index({ 
    name: 'text', 
    email: 'text', 
    city: 'text',
    'metadata.profile.headline': 'text',
    'metadata.profile.keywords': 'text'
}, {
    weights: {
        name: 10,  // Name has highest priority
        email: 8,
        'metadata.profile.headline': 5,
        'metadata.profile.keywords': 3,
        city: 2
    },
    name: 'user_text_search_index'
});

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
        avatarUrl: toStablePublicImageUrl(this.avatarUrl),
        emailVerified: this.emailVerified,
        resumeUrl: this.resumeUrl,
        linkedInUrl: this.linkedInUrl,
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
        assignedEvents: this.assignedEvents || [],
        createdAt: this.createdAt,
        pendingEmail: this.pendingEmail,
        organizationId: this.organizationId,
        importStatus: this.importStatus || 'complete',
        importMissingFields: Array.isArray(this.importMissingFields) ? this.importMissingFields : [],
        importMeta: this.importMeta || null
    };

    // If assignedBooth is populated, include booth name
    if (this.assignedBooth && typeof this.assignedBooth === 'object' && this.assignedBooth.name) {
        profile.boothName = this.assignedBooth.name || this.assignedBooth.company || 'Unknown Booth';
        profile.assignedBooth = this.assignedBooth._id; // Keep just the ID
    }

    // If assignedEvents are populated, extract IDs
    if (this.assignedEvents && Array.isArray(this.assignedEvents) && this.assignedEvents.length > 0) {
        profile.assignedEvents = this.assignedEvents.map(e => 
            typeof e === 'object' && e._id ? e._id : e
        );
    }

    if (profile.organizationId && typeof profile.organizationId === 'object' && !Array.isArray(profile.organizationId)) {
        const orgObject = typeof profile.organizationId.toObject === 'function'
            ? profile.organizationId.toObject()
            : profile.organizationId;
        profile.organizationId = {
            ...orgObject,
            logoUrl: toStablePublicImageUrl(profile.organizationId.logoUrl)
        };
    }

    return profile;
};

const getMissingImportFields = (userLike = {}) => {
    const missing = [];
    const role = userLike.role;
    if (!role || role === 'Unassigned') {
        missing.push('role');
    }
    const needsBooth = BOOTH_REQUIRED_ROLES.includes(role);
    if (needsBooth && !userLike.assignedBooth) {
        missing.push('assignedBooth');
    }
    return missing;
};

userSchema.methods.refreshImportReadiness = function refreshImportReadiness() {
    const missing = getMissingImportFields(this);
    this.importMissingFields = missing;
    this.importStatus = missing.length > 0 ? 'incomplete' : 'complete';
    if (this.importStatus === 'complete') {
        this.importMissingFields = [];
    }
    return this.importStatus;
};

userSchema.statics.getMissingImportFields = getMissingImportFields;

// Validate recruiter/booth admin/booth support/booth interpreter must have assignedBooth.
// Allow incomplete imported users to persist and be fixed later.
userSchema.pre('validate', function (next) {
    const role = this.role;
    const allowIncompleteImport = this.importStatus === 'incomplete';
    if (BOOTH_REQUIRED_ROLES.includes(role) && !this.assignedBooth && !allowIncompleteImport) {
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
