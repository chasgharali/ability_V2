const mongoose = require('mongoose');

const registeredJobSeekerSchema = new mongoose.Schema({
    organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: [true, 'Organization is required']
    },
    jobSeekerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: [true, 'Job seeker is required']
    },
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, 'Event is required']
    },
    // Resume the job seeker submitted with this specific event registration
    resumeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Resume',
        default: null
    },
    // S3 URL of the generated PDF when a saved resume was selected
    resumeUrl: {
        type: String,
        default: null
    },
    // DEPRECATED — see notes on User.aiProfile. Search now lives in the
    // ParsedResume collection (one doc per user). Disability / accessibility
    // fields removed from this subschema; do not re-introduce them.
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
    // Convenience fields for registration-level indexing status/provenance.
    // Kept for backward compatibility with existing rows; new search code
    // reads from `ParsedResume.parsedAt` instead.
    aiIndexedAt: {
        type: Date,
        default: null
    },
    aiParseSource: {
        type: String,
        default: ''
    },
    registeredAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Compound unique: one registration per (org, job seeker, event)
registeredJobSeekerSchema.index({ organizationId: 1, jobSeekerId: 1, eventId: 1 }, { unique: true });
registeredJobSeekerSchema.index({ organizationId: 1 });
registeredJobSeekerSchema.index({ jobSeekerId: 1 });
registeredJobSeekerSchema.index({ eventId: 1 });
registeredJobSeekerSchema.index({ registeredAt: -1 });
registeredJobSeekerSchema.index({ organizationId: 1, aiIndexedAt: 1 });

// Static: register a job seeker for a specific event (upsert — idempotent per org+jobSeeker+event)
registeredJobSeekerSchema.statics.registerWithOrg = async function (organizationId, jobSeekerId, eventId, resumeId = null, resumeUrl = null) {
    return this.findOneAndUpdate(
        { organizationId, jobSeekerId, eventId },
        { $setOnInsert: { organizationId, jobSeekerId, eventId, resumeId, resumeUrl, registeredAt: new Date() } },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('RegisteredJobSeeker', registeredJobSeekerSchema);
