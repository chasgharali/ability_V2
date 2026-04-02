const express = require('express');
const { body, validationResult } = require('express-validator');
const LegalPage = require('../models/LegalPage');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

const VALID_TYPES = ['terms-of-use', 'privacy-policy'];

/**
 * GET /api/legal-pages/:type
 * Public — no authentication required.
 * Returns the stored content for "terms-of-use" or "privacy-policy".
 */
router.get('/:type', async (req, res) => {
    const { type } = req.params;

    if (!VALID_TYPES.includes(type)) {
        return res.status(400).json({ error: 'Invalid type', message: 'type must be terms-of-use or privacy-policy' });
    }

    try {
        const page = await LegalPage.findOne({ type }).populate('updatedBy', 'name email');

        if (!page) {
            return res.status(404).json({
                error: 'Not found',
                message: `No ${type} content has been saved yet`
            });
        }

        res.json({ page });
    } catch (error) {
        logger.error(`Get legal page (${type}) error:`, error);
        res.status(500).json({ error: 'Server error', message: 'Failed to retrieve legal page' });
    }
});

/**
 * PUT /api/legal-pages/:type
 * SuperAdmin only — create or update the content for a legal page type.
 */
router.put(
    '/:type',
    authenticateToken,
    requireRole(['SuperAdmin']),
    [
        body('title').trim().isLength({ min: 2, max: 200 }).withMessage('Title must be between 2 and 200 characters'),
        body('content').optional().isString().withMessage('Content must be a string')
    ],
    async (req, res) => {
        const { type } = req.params;

        if (!VALID_TYPES.includes(type)) {
            return res.status(400).json({ error: 'Invalid type', message: 'type must be terms-of-use or privacy-policy' });
        }

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ error: 'Validation failed', details: errors.array() });
        }

        const { title, content = '' } = req.body;
        const { user } = req;

        try {
            const page = await LegalPage.findOneAndUpdate(
                { type },
                { type, title, content, updatedBy: user._id },
                { upsert: true, new: true, runValidators: true }
            );

            logger.info(`Legal page (${type}) saved by ${user.email}`);
            res.json({ message: 'Legal page saved successfully', page });
        } catch (error) {
            logger.error(`Save legal page (${type}) error:`, error);
            res.status(500).json({ error: 'Server error', message: 'Failed to save legal page' });
        }
    }
);

module.exports = router;
