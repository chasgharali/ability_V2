const mongoose = require('mongoose');

const interpreterCategorySchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Category name is required'],
        trim: true,
        maxlength: [100, 'Category name cannot exceed 100 characters'],
        unique: true
    },
    description: {
        type: String,
        trim: true,
        maxlength: [500, 'Description cannot exceed 500 characters']
    },
    code: {
        type: String,
        required: [true, 'Category code is required'],
        trim: true,
        uppercase: true,
        maxlength: [10, 'Category code cannot exceed 10 characters'],
        unique: true,
        match: [/^[A-Z0-9_]+$/, 'Code can only contain uppercase letters, numbers, and underscores']
    },
    isActive: {
        type: Boolean,
        default: true
    },
    // Optional color for UI display
    color: {
        type: String,
        default: '#000000',
        match: [/^#[0-9A-F]{6}$/i, 'Color must be a valid hex color code']
    },
    // Sort order for display
    sortOrder: {
        type: Number,
        default: 0
    },
    // Creator/admin who created this category
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

// Indexes for performance (name and code indexes are created by unique: true)
interpreterCategorySchema.index({ isActive: 1 });
interpreterCategorySchema.index({ sortOrder: 1 });

// Pre-save middleware to generate code if not provided
interpreterCategorySchema.pre('validate', function (next) {
    if (!this.code && this.name) {
        this.code = this.name
            .toUpperCase()
            .replace(/[^A-Z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 10);
    }
    next();
});

// Instance method to get category summary
interpreterCategorySchema.methods.getSummary = function () {
    return {
        _id: this._id,
        name: this.name,
        description: this.description,
        code: this.code,
        isActive: this.isActive,
        color: this.color,
        sortOrder: this.sortOrder,
        createdAt: this.createdAt,
        updatedAt: this.updatedAt
    };
};

// Static method to find active categories
interpreterCategorySchema.statics.findActive = function () {
    return this.find({ isActive: true }).sort({ sortOrder: 1, name: 1 });
};

// Static method to find all categories with sorting
interpreterCategorySchema.statics.findAllSorted = function () {
    return this.find({}).sort({ sortOrder: 1, name: 1 });
};

module.exports = mongoose.model('InterpreterCategory', interpreterCategorySchema);
