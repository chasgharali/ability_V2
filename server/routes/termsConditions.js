const express = require('express');
const { body, validationResult } = require('express-validator');
const TermsConditions = require('../models/TermsConditions');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
    getTargetAdminUser,
    cloneTermsTemplateToOrganization,
    syncMissingTermsForOrganization
} = require('../services/defaultCopyService');

const router = express.Router();

const dedupeOrgPreferred = (rows = [], orgId = null) => {
    const map = new Map();
    rows.forEach((term) => {
        const templateKey = term.sourceTemplateId ? String(term.sourceTemplateId) : String(term._id);
        const existing = map.get(templateKey);
        const isOrgRecord = orgId && term.organizationId && String(term.organizationId) === String(orgId);
        if (!existing || isOrgRecord) map.set(templateKey, term);
    });
    return Array.from(map.values());
};

/**
 * GET /api/terms-conditions
 * Get list of terms and conditions
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { active, page = 1, limit = 20 } = req.query;

        if (user.role === 'Admin' && req.orgId) {
            await syncMissingTermsForOrganization({ organizationId: req.orgId, actorId: user._id });
        }

        // Build query based on user role and filters
        let query = {};

        // Non-admin users can only see active terms
        if (!['SuperAdmin', 'Admin', 'GlobalSupport', 'AdminEvent'].includes(user.role)) {
            query.isActive = true;
        }

        // Org-scope: admins only see their org's terms (platform defaults are synced as org copies above)
        if (user.role === 'Admin' && req.orgId) {
            query.organizationId = req.orgId;
        } else if (user.role === 'SuperAdmin') {
            query.organizationId = null;
        } else if (req.orgId) {
            query.$or = [{ organizationId: req.orgId }, { organizationId: null }];
        } else {
            query.organizationId = null;
        }

        // Apply active filter
        if (active === 'true') {
            query.isActive = true;
        } else if (active === 'false') {
            query.isActive = false;
        }

        // Find terms
        const rows = await TermsConditions.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const terms = (req.orgId && user.role !== 'SuperAdmin') ? dedupeOrgPreferred(rows, req.orgId) : rows;

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
        if (
            user.role !== 'SuperAdmin' &&
            req.orgId &&
            terms.organizationId &&
            String(terms.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only view terms from your organization'
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
                isPlatformDefault: terms.isPlatformDefault,
                sourceTemplateId: terms.sourceTemplateId,
                lastSyncedAt: terms.lastSyncedAt,
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
router.post('/', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent']), [
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
        .withMessage('isRequired must be a boolean value'),
    body('isPlatformDefault')
        .optional()
        .isBoolean()
        .withMessage('isPlatformDefault must be a boolean value')
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

        const { title, content, version, isActive = false, isRequired = true, isPlatformDefault = false } = req.body;
        const { user } = req;

        // Create new terms
        const terms = new TermsConditions({
            title,
            content,
            version,
            isActive,
            isRequired,
            organizationId: user.role === 'SuperAdmin' ? null : (req.orgId || null),
            isPlatformDefault: user.role === 'SuperAdmin' ? Boolean(isPlatformDefault) : false,
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
router.put('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent']), [
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
        .withMessage('isRequired must be a boolean value'),
    body('isPlatformDefault')
        .optional()
        .isBoolean()
        .withMessage('isPlatformDefault must be a boolean value')
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

        const { title, content, version, isActive, isRequired, isPlatformDefault } = req.body;
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
        if (user.role === 'SuperAdmin' && terms.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only edit global terms templates here'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            terms.organizationId &&
            String(terms.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only update terms from your organization'
            });
        }
        if (
            !['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) &&
            !terms.createdBy.equals(user._id)
        ) {
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
        if (user.role === 'SuperAdmin' && isPlatformDefault !== undefined) {
            terms.isPlatformDefault = isPlatformDefault;
        }
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
router.delete('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent']), async (req, res) => {
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
        if (user.role === 'SuperAdmin' && terms.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only delete global terms templates'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            terms.organizationId &&
            String(terms.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only delete terms from your organization'
            });
        }
        if (!['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
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
        const deletedTerms = await TermsConditions.findByIdAndDelete(id);
        
        if (!deletedTerms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'The specified terms and conditions were not found or already deleted'
            });
        }

        logger.info(`Terms and conditions deleted: ${terms.title} v${terms.version} by ${user.email}`);

        res.json({
            message: 'Terms and conditions deleted successfully',
            deletedId: id
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
router.put('/:id/activate', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent']), async (req, res) => {
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
        if (user.role === 'SuperAdmin' && terms.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only activate global templates'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            terms.organizationId &&
            String(terms.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only activate terms from your organization'
            });
        }
        if (!['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
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
router.put('/:id/deactivate', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent']), async (req, res) => {
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
        if (user.role === 'SuperAdmin' && terms.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only deactivate global templates'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            terms.organizationId &&
            String(terms.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only deactivate terms from your organization'
            });
        }
        if (!['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) && !terms.createdBy.equals(user._id)) {
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

/**
 * POST /api/terms-conditions/:id/set-default
 * SuperAdmin: mark terms as default template and auto-copy to organizations
 */
router.post('/:id/set-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const { id } = req.params;
        const templateTerms = await TermsConditions.findOne({ _id: id, organizationId: null });
        if (!templateTerms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'Default template terms not found'
            });
        }

        templateTerms.isPlatformDefault = true;
        templateTerms.updatedBy = req.user._id;
        await templateTerms.save();

        res.json({
            message: 'Terms set as platform default successfully'
        });
    } catch (error) {
        logger.error('Set default terms error:', error);
        res.status(500).json({
            error: 'Failed to set default terms',
            message: 'An error occurred while setting default terms template'
        });
    }
});

/**
 * POST /api/terms-conditions/:id/unset-default
 * SuperAdmin: remove platform default flag from terms template
 */
router.post('/:id/unset-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const { id } = req.params;
        const templateTerms = await TermsConditions.findOne({ _id: id, organizationId: null });
        if (!templateTerms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'Default template terms not found'
            });
        }

        templateTerms.isPlatformDefault = false;
        templateTerms.updatedBy = req.user._id;
        await templateTerms.save();

        res.json({
            message: 'Terms removed from platform defaults'
        });
    } catch (error) {
        logger.error('Unset default terms error:', error);
        res.status(500).json({
            error: 'Failed to unset default terms',
            message: 'An error occurred while unsetting default terms template'
        });
    }
});

/**
 * POST /api/terms-conditions/:id/copy-to-admin
 * SuperAdmin: copy terms template to a specific organization admin
 */
router.post('/:id/copy-to-admin', authenticateToken, requireRole(['SuperAdmin']), [
    body('targetAdminUserId')
        .trim()
        .notEmpty()
        .withMessage('targetAdminUserId is required'),
    body('overwrite')
        .optional()
        .isBoolean()
        .withMessage('overwrite must be a boolean value')
], async (req, res) => {
    try {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors.array()
            });
        }

        const { id } = req.params;
        const { targetAdminUserId, overwrite = false } = req.body;
        const templateTerms = await TermsConditions.findOne({ _id: id, organizationId: null });
        if (!templateTerms) {
            return res.status(404).json({
                error: 'Terms not found',
                message: 'Default template terms not found'
            });
        }

        const adminUser = await getTargetAdminUser(targetAdminUserId);

        if (!adminUser) {
            return res.status(404).json({
                error: 'Admin not found',
                message: 'Target admin user not found or has no organization'
            });
        }

        const { record: copiedTerms } = await cloneTermsTemplateToOrganization({
            template: templateTerms,
            organizationId: adminUser.organizationId,
            actorId: req.user._id,
            overwrite
        });

        const now = new Date();
        const recipients = Array.isArray(templateTerms.copyRecipients) ? templateTerms.copyRecipients : [];
        const existingIndex = recipients.findIndex(
            (recipient) => String(recipient.adminUserId) === String(adminUser._id)
        );

        if (existingIndex >= 0) {
            recipients[existingIndex].adminName = adminUser.name || recipients[existingIndex].adminName || '';
            recipients[existingIndex].adminEmail = adminUser.email || recipients[existingIndex].adminEmail || '';
            recipients[existingIndex].organizationId = adminUser.organizationId;
            recipients[existingIndex].lastCopiedAt = now;
            recipients[existingIndex].copyCount = (recipients[existingIndex].copyCount || 0) + 1;
        } else {
            recipients.push({
                adminUserId: adminUser._id,
                adminName: adminUser.name || '',
                adminEmail: adminUser.email || '',
                organizationId: adminUser.organizationId,
                copiedAt: now,
                lastCopiedAt: now,
                copyCount: 1
            });
        }

        templateTerms.copyRecipients = recipients;
        templateTerms.updatedBy = req.user._id;
        await templateTerms.save();

        res.json({
            message: `Terms copied to ${adminUser.name || adminUser.email} successfully`,
            terms: copiedTerms.getSummary()
        });
    } catch (error) {
        logger.error('Copy terms to admin error:', error);
        res.status(500).json({
            error: 'Failed to copy terms',
            message: 'An error occurred while copying terms to selected admin'
        });
    }
});

/**
 * POST /api/terms-conditions/sync-defaults
 * Materialize missing org copies from platform defaults
 */
router.post('/sync-defaults', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const organizationId = req.user.role === 'SuperAdmin' ? req.body?.organizationId : req.orgId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'organizationId required',
                message: 'Organization context is required to sync term defaults'
            });
        }

        const createdCount = await syncMissingTermsForOrganization({
            organizationId,
            actorId: req.user._id
        });

        res.json({
            message: 'Terms defaults sync completed',
            createdCount
        });
    } catch (error) {
        logger.error('Sync terms defaults error:', error);
        res.status(500).json({
            error: 'Failed to sync term defaults',
            message: 'An error occurred while syncing term defaults'
        });
    }
});

module.exports = router;
