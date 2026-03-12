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
    // The event that triggered the org membership
    eventId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: [true, 'Event is required']
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

// Compound unique: a job seeker can only be an org member once (regardless of how many events)
registeredJobSeekerSchema.index({ organizationId: 1, jobSeekerId: 1 }, { unique: true });
registeredJobSeekerSchema.index({ organizationId: 1 });
registeredJobSeekerSchema.index({ jobSeekerId: 1 });
registeredJobSeekerSchema.index({ eventId: 1 });
registeredJobSeekerSchema.index({ registeredAt: -1 });

// Static: register a job seeker with an org (upsert — idempotent)
registeredJobSeekerSchema.statics.registerWithOrg = async function (organizationId, jobSeekerId, eventId) {
    return this.findOneAndUpdate(
        { organizationId, jobSeekerId },
        { $setOnInsert: { organizationId, jobSeekerId, eventId, registeredAt: new Date() } },
        { upsert: true, new: true }
    );
};

module.exports = mongoose.model('RegisteredJobSeeker', registeredJobSeekerSchema);
