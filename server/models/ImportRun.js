const mongoose = require('mongoose');

const importRowSchema = new mongoose.Schema({
    row: { type: Number, required: true },
    status: { type: String, enum: ['created', 'skipped', 'error'], required: true },
    email: { type: String, default: '' },
    role: { type: String, default: '' },
    message: { type: String, default: '' },
    importStatus: { type: String, enum: ['complete', 'incomplete', 'n/a'], default: 'n/a' },
    missingFields: [{ type: String, trim: true }]
}, { _id: false });

const importRunSchema = new mongoose.Schema({
    jobId: { type: String, required: true, unique: true, index: true },
    entityType: { type: String, enum: ['users', 'jobseekers'], default: 'users' },
    initiatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    organizationId: { type: mongoose.Schema.Types.ObjectId, ref: 'Organization', default: null },
    filename: { type: String, default: '' },
    totalRows: { type: Number, default: 0 },
    summary: {
        created: { type: Number, default: 0 },
        incomplete: { type: Number, default: 0 },
        skipped: { type: Number, default: 0 },
        errors: { type: Number, default: 0 }
    },
    rows: [importRowSchema]
}, { timestamps: true });

module.exports = mongoose.model('ImportRun', importRunSchema);
