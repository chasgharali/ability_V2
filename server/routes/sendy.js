const express = require('express');
const { authenticateToken, requireRole } = require('../middleware/auth');
const sendyService = require('../services/sendyService');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/sendy/lists
 * Fetch available Sendy mailing lists for admin event connection
 */
router.get('/lists', authenticateToken, requireRole(['Admin', 'AdminEvent']), async (req, res) => {
    try {
        if (!sendyService.isAvailable()) {
            return res.status(503).json({
                error: 'Sendy not configured',
                message: 'Sendy integration is not configured on this server'
            });
        }

        const lists = await sendyService.getLists();
        res.json({ lists });
    } catch (error) {
        logger.error('Get Sendy lists error:', error);
        res.status(500).json({
            error: 'Failed to fetch Sendy lists',
            message: 'An error occurred while fetching mailing lists from Sendy'
        });
    }
});

module.exports = router;
