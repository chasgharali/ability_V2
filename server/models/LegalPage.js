const mongoose = require('mongoose');

const legalPageSchema = new mongoose.Schema({
    type: {
        type: String,
        enum: ['terms-of-use', 'privacy-policy'],
        required: true,
        unique: true
    },
    title: {
        type: String,
        required: true,
        trim: true,
        maxlength: [200, 'Title cannot exceed 200 characters']
    },
    content: {
        type: String,
        default: ''
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    }
}, {
    timestamps: true
});

legalPageSchema.index({ type: 1 }, { unique: true });

module.exports = mongoose.model('LegalPage', legalPageSchema);
