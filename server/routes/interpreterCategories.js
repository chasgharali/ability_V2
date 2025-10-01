const express = require('express');
const router = express.Router();
const InterpreterCategory = require('../models/InterpreterCategory');
const { authenticateToken } = require('../middleware/auth');

// Get all interpreter categories with pagination and filtering
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { page = 1, limit = 20, active, search } = req.query;
        const skip = (page - 1) * limit;

        // Build query
        let query = {};
        if (active !== undefined) {
            query.isActive = active === 'true';
        }
        if (search) {
            query.$or = [
                { name: { $regex: search, $options: 'i' } },
                { description: { $regex: search, $options: 'i' } },
                { code: { $regex: search, $options: 'i' } }
            ];
        }

        const categories = await InterpreterCategory.find(query)
            .populate('createdBy', 'name email')
            .sort({ sortOrder: 1, name: 1 })
            .skip(skip)
            .limit(parseInt(limit));

        const total = await InterpreterCategory.countDocuments(query);

        res.json({
            success: true,
            categories,
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Error fetching interpreter categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch interpreter categories',
            error: error.message
        });
    }
});

// Get active interpreter categories (for dropdowns)
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const categories = await InterpreterCategory.findActive();
        res.json({
            success: true,
            categories
        });
    } catch (error) {
        console.error('Error fetching active interpreter categories:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active interpreter categories',
            error: error.message
        });
    }
});

// Get single interpreter category by ID
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const category = await InterpreterCategory.findById(req.params.id)
            .populate('createdBy', 'name email');

        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Interpreter category not found'
            });
        }

        res.json({
            success: true,
            category
        });
    } catch (error) {
        console.error('Error fetching interpreter category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch interpreter category',
            error: error.message
        });
    }
});

// Create new interpreter category
router.post('/', authenticateToken, async (req, res) => {
    try {
        // Check if user has permission to create categories
        if (!['Admin', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to create interpreter categories'
            });
        }

        const categoryData = {
            ...req.body,
            createdBy: req.user._id
        };

        const category = new InterpreterCategory(categoryData);
        await category.save();

        await category.populate('createdBy', 'name email');

        res.status(201).json({
            success: true,
            message: 'Interpreter category created successfully',
            category
        });
    } catch (error) {
        console.error('Error creating interpreter category:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `Interpreter category with this ${field} already exists`
            });
        }

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to create interpreter category',
            error: error.message
        });
    }
});

// Update interpreter category
router.put('/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user has permission to update categories
        if (!['Admin', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to update interpreter categories'
            });
        }

        const category = await InterpreterCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Interpreter category not found'
            });
        }

        // Update fields
        Object.keys(req.body).forEach(key => {
            if (key !== 'createdBy' && req.body[key] !== undefined) {
                category[key] = req.body[key];
            }
        });

        await category.save();
        await category.populate('createdBy', 'name email');

        res.json({
            success: true,
            message: 'Interpreter category updated successfully',
            category
        });
    } catch (error) {
        console.error('Error updating interpreter category:', error);
        
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(400).json({
                success: false,
                message: `Interpreter category with this ${field} already exists`
            });
        }

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Validation failed',
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: 'Failed to update interpreter category',
            error: error.message
        });
    }
});

// Toggle category active status
router.patch('/:id/toggle-status', authenticateToken, async (req, res) => {
    try {
        // Check if user has permission to update categories
        if (!['Admin', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to update interpreter categories'
            });
        }

        const category = await InterpreterCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Interpreter category not found'
            });
        }

        category.isActive = !category.isActive;
        await category.save();

        res.json({
            success: true,
            message: `Interpreter category ${category.isActive ? 'activated' : 'deactivated'} successfully`,
            category: category.getSummary()
        });
    } catch (error) {
        console.error('Error toggling interpreter category status:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to toggle interpreter category status',
            error: error.message
        });
    }
});

// Delete interpreter category
router.delete('/:id', authenticateToken, async (req, res) => {
    try {
        // Check if user has permission to delete categories
        if (!['Admin', 'GlobalSupport'].includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Insufficient permissions to delete interpreter categories'
            });
        }

        const category = await InterpreterCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).json({
                success: false,
                message: 'Interpreter category not found'
            });
        }

        await InterpreterCategory.findByIdAndDelete(req.params.id);

        res.json({
            success: true,
            message: 'Interpreter category deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting interpreter category:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete interpreter category',
            error: error.message
        });
    }
});

module.exports = router;
