const express = require('express');
const { body, validationResult } = require('express-validator');
const TermsConditions = require('../models/TermsConditions');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/terms-conditions
 * Get list of terms and conditions
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { active, page = 1, limit = 20 } = req.query;

        // Build query based on user role and filters
        let query = {};

        // Non-admin users can only see active terms
        if (!['Admin', 'GlobalSupport', 'AdminEvent'].includes(user.role)) {
            query.isActive = true;
        }

        // Apply active filter
        if (active === 'true') {
            query.isActive = true;
        } else if (active === 'false') {
            query.isActive = false;
        }

        // Find terms
        const terms = await TermsConditions.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const totalCount = await TermsConditions.countDocuments(query);

        res.json({
            terms: terms.map(term => term.getSummary()),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get terms and conditions error:', error);
        res.status(500).json({
            error: 'Failed to retrieve terms and conditions',
            message: 'An error occurred while retrieving terms and conditions'
        });
    }
});

/**
 * GET /api/terms-conditions/active
 * Get active terms and conditions
 */
router.get('/active', authenticateToken, async (req, res) => {
    try {
        const activeTerms = await TermsConditions.findActive()
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!activeTerms) {
            return res.status(404).json({
                error: 'No active terms found',
                message: 'No active terms and conditions are currently available'
            });
        }

        res.json({
            terms: {
                _id: activeTerms._id,
                title: activeTerms.title,
                content: activeTerms.content,
                version: activeTerms.version,
                isActive: activeTerms.isActive,
                isRequired: activeTerms.isRequired,
                usage: activeTerms.usage,
                createdAt: activeTerms.createdAt,
                updatedAt: activeTerms.updatedAt,
                createdBy: activeTerms.createdBy,
                updatedBy: activeTerms.updatedBy
            }
        });
    } catch (error) {
        logger.error('Get active terms error:', error);
        res.status(500).json({
            error: 'Failed to retrieve active terms',
            message: 'An error occurred while retrieving active terms and conditions'
        });
    }
});

/**
 * GET /api/terms-conditions/:id
 * Get terms and conditions details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const terms = await TermsConditions.findById(id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!terms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions do not exist'
            });
        }

        // Check if user can access this terms
        if (!terms.canUserAccess(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this terms and conditions'
            });
        }

        res.json({
            terms: {
                _id: terms._id,
                title: terms.title,
                content: terms.content,
                version: terms.version,
                isActive: terms.isActive,
                isRequired: terms.isRequired,
                usage: terms.usage,
                createdAt: terms.createdAt,
                updatedAt: terms.updatedAt,
                createdBy: terms.createdBy,
                updatedBy: terms.updatedBy
            }
        });
    } catch (error) {
        logger.error('Get terms error:', error);
        res.status(500).json({
            error: 'Failed to retrieve terms',
            message: 'An error occurred while retrieving the terms and conditions'
        });
    }
});

/**
 * POST /api/terms-conditions
 * Create new terms and conditions
 */
router.post('/', authenticateToken, requireRole(['Admin', 'AdminEvent']), [
    body('title')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Terms title must be between 2 and 200 characters'),
    body('content')
        .trim()
        .isLength({ min: 10 })
        .withMessage('Terms content must be at least 10 characters long'),
    body('version')
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Version must be between 1 and 50 characters'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value'),
    body('isRequired')
        .optional()
        .isBoolean()
        .withMessage('isRequired must be a boolean value')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { title, content, version, isActive = false, isRequired = true } = req.body;
        const { user } = req;

        // Create new terms
        const terms = new TermsConditions({
            title,
            content,
            version,
            isActive,
            isRequired,
            createdBy: user._id,
            updatedBy: user._id
        });

        await terms.save();

        logger.info(`Terms and conditions created: ${title} v${version} by ${user.email}`);

        res.status(201).json({
            message: 'Terms and conditions created successfully',
            terms: terms.getSummary()
        });
    } catch (error) {
        logger.error('Create terms error:', error);
        res.status(500).json({
            error: 'Failed to create terms and conditions',
            message: 'An error occurred while creating the terms and conditions'
        });
    }
});

/**
 * PUT /api/terms-conditions/:id
 * Update terms and conditions
 */
router.put('/:id', authenticateToken, requireRole(['Admin', 'AdminEvent']), [
    body('title')
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Terms title must be between 2 and 200 characters'),
    body('content')
        .optional()
        .trim()
        .isLength({ min: 10 })
        .withMessage('Terms content must be at least 10 characters long'),
    body('version')
        .optional()
        .trim()
        .isLength({ min: 1, max: 50 })
        .withMessage('Version must be between 1 and 50 characters'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value'),
    body('isRequired')
        .optional()
        .isBoolean()
        .withMessage('isRequired must be a boolean value')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { title, content, version, isActive, isRequired } = req.body;
        const { id } = req.params;
        const { user } = req;

        const terms = await TermsConditions.findById(id);
        if (!terms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions do not exist'
            });
        }

        // Check if user can update this terms
        if (!['Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to update this terms and conditions'
            });
        }

        // Update allowed fields
        if (title !== undefined) terms.title = title;
        if (content !== undefined) terms.content = content;
        if (version !== undefined) terms.version = version;
        if (isActive !== undefined) terms.isActive = isActive;
        if (isRequired !== undefined) terms.isRequired = isRequired;
        terms.updatedBy = user._id;

        await terms.save();

        logger.info(`Terms and conditions updated: ${terms.title} v${terms.version} by ${user.email}`);

        res.json({
            message: 'Terms and conditions updated successfully',
            terms: terms.getSummary()
        });
    } catch (error) {
        logger.error('Update terms error:', error);
        res.status(500).json({
            error: 'Failed to update terms and conditions',
            message: 'An error occurred while updating the terms and conditions'
        });
    }
});

/**
 * DELETE /api/terms-conditions/:id
 * Delete terms and conditions
 */
router.delete('/:id', authenticateToken, requireRole(['Admin', 'AdminEvent']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const terms = await TermsConditions.findById(id);
        if (!terms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions do not exist'
            });
        }

        // Check if user can delete this terms
        if (!['Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to delete this terms and conditions'
            });
        }

        // Check if terms is currently active
        if (terms.isActive) {
            return res.status(400).json({
                error: 'Cannot delete active terms',
                message: 'Cannot delete active terms and conditions. Please deactivate them first.'
            });
        }

        // Delete the terms
        await TermsConditions.findByIdAndDelete(id);

        logger.info(`Terms and conditions deleted: ${terms.title} v${terms.version} by ${user.email}`);

        res.json({
            message: 'Terms and conditions deleted successfully'
        });
    } catch (error) {
        logger.error('Delete terms error:', error);
        res.status(500).json({
            error: 'Failed to delete terms and conditions',
            message: 'An error occurred while deleting the terms and conditions'
        });
    }
});

/**
 * PUT /api/terms-conditions/:id/activate
 * Activate terms and conditions
 */
router.put('/:id/activate', authenticateToken, requireRole(['Admin', 'AdminEvent']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const terms = await TermsConditions.findById(id);
        if (!terms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions do not exist'
            });
        }

        // Check if user can activate this terms
        if (!['Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to activate this terms and conditions'
            });
        }

        // Activate the terms (this will automatically deactivate others due to pre-save middleware)
        terms.isActive = true;
        terms.updatedBy = user._id;
        await terms.save();

        logger.info(`Terms and conditions activated: ${terms.title} v${terms.version} by ${user.email}`);

        res.json({
            message: 'Terms and conditions activated successfully',
            terms: terms.getSummary()
        });
    } catch (error) {
        logger.error('Activate terms error:', error);
        res.status(500).json({
            error: 'Failed to activate terms and conditions',
            message: 'An error occurred while activating the terms and conditions'
        });
    }
});

/**
 * PUT /api/terms-conditions/:id/deactivate
 * Deactivate terms and conditions
 */
router.put('/:id/deactivate', authenticateToken, requireRole(['Admin', 'AdminEvent']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const terms = await TermsConditions.findById(id);
        if (!terms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions do not exist'
            });
        }

        // Check if user can deactivate this terms
        if (!['Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to deactivate this terms and conditions'
            });
        }

        // Deactivate the terms
        terms.isActive = false;
        terms.updatedBy = user._id;
        await terms.save();

        logger.info(`Terms and conditions deactivated: ${terms.title} v${terms.version} by ${user.email}`);

        res.json({
            message: 'Terms and conditions deactivated successfully',
            terms: terms.getSummary()
        });
    } catch (error) {
        logger.error('Deactivate terms error:', error);
        res.status(500).json({
            error: 'Failed to deactivate terms and conditions',
            message: 'An error occurred while deactivating the terms and conditions'
        });
    }
});

module.exports = router;
