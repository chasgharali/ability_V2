const mongoose = require('mongoose');

const jobSeekerInterestSchema = new mongoose.Schema({
    jobSeeker: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    booth: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        required: true
    },
    company: {
        type: String,
        required: true
    },
    companyLogo: {
        type: String
    },
    isInterested: {
        type: Boolean,
        default: true
    },
    interestLevel: {
        type: String,
        enum: ['low', 'medium', 'high'],
        default: 'medium'
    },
    notes: {
        type: String,
        maxlength: 500
    },
    // Legacy IDs for tracking migrated interests from V1
    legacyEventId: {
        type: String,
        default: null,
        index: true,
        sparse: true
    },
    legacyBoothId: {
        type: String,
        default: null,
        index: true,
        sparse: true
    },
    legacyJobSeekerId: {
        type: String,
        default: null,
        index: true,
        sparse: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate interests
jobSeekerInterestSchema.index({ jobSeeker: 1, event: 1, booth: 1 }, { unique: true });

// Update the updatedAt field before saving
jobSeekerInterestSchema.pre('save', function(next) {
    this.updatedAt = Date.now();
    next();
});

// Instance methods
jobSeekerInterestSchema.methods.toggleInterest = function() {
    this.isInterested = !this.isInterested;
    return this.save();
};

// Static methods
jobSeekerInterestSchema.statics.getJobSeekerInterests = function(jobSeekerId, eventId) {
    return this.find({ jobSeeker: jobSeekerId, event: eventId, isInterested: true })
        .populate('booth')
        .populate('event', 'name slug')
        .sort({ createdAt: -1 });
};

jobSeekerInterestSchema.statics.getBoothInterests = function(boothId) {
    return this.find({ booth: boothId, isInterested: true })
        .populate('jobSeeker', 'name email')
        .sort({ createdAt: -1 });
};

const JobSeekerInterest = mongoose.model('JobSeekerInterest', jobSeekerInterestSchema);

module.exports = JobSeekerInterest;
