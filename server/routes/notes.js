const express = require('express');
const { body, validationResult } = require('express-validator');
const Note = require('../models/Note');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
    getTargetOrganization,
    upsertOrganizationCopyRecipient,
    cloneNoteTemplateToOrganization,
    syncMissingNotesForOrganization
} = require('../services/defaultCopyService');

const router = express.Router();

const dedupeOrgPreferred = (notes = [], orgId = null) => {
    const map = new Map();
    notes.forEach((note) => {
        const templateKey = note.sourceTemplateId ? String(note.sourceTemplateId) : String(note._id);
        const existing = map.get(templateKey);
        const isOrgRecord = orgId && note.organizationId && String(note.organizationId) === String(orgId);
        if (!existing || isOrgRecord) {
            map.set(templateKey, note);
        }
    });
    return Array.from(map.values());
};

/**
 * GET /api/notes
 * Get list of notes (filtered by type and role for non-admin users)
 */
router.get('/', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { type, role, page = 1, limit = 20 } = req.query;

        // Build query
        let query = {};

        // Non-admin users can only see notes assigned to their role
        if (!['SuperAdmin', 'Admin'].includes(user.role)) {
            query.assignedRoles = user.role;
            query.isActive = true;
            // Non-admin sees org-specific notes OR global notes
            if (req.orgId) {
                query.$or = [{ organizationId: req.orgId }, { organizationId: null }];
            }
        } else if (user.role === 'Admin' && req.orgId) {
            await syncMissingNotesForOrganization({ organizationId: req.orgId, actorId: user._id });
            query.organizationId = req.orgId;
        } else if (user.role === 'SuperAdmin') {
            // SuperAdmin can view notes across all organizations
        }

        // Apply type filter
        if (type && ['troubleshooting', 'instruction'].includes(type)) {
            query.type = type;
        }

        // Apply role filter (for admin)
        if (role && ['SuperAdmin', 'Admin'].includes(user.role)) {
            query.assignedRoles = role;
        }

        // Find notes
        const rows = await Note.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .populate('organizationId', 'name')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);
        const notes = (req.orgId && user.role !== 'SuperAdmin') ? dedupeOrgPreferred(rows, req.orgId) : rows;

        // Get total count for pagination
        const totalCount = await Note.countDocuments(query);

        res.json({
            notes: notes.map(note => ({
                ...note.getSummary(),
                organizationId: note.organizationId?._id || note.organizationId || null,
                organizationName: note.organizationId?.name || null,
                createdBy: note.createdBy,
                updatedBy: note.updatedBy
            })),
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalCount / limit),
                totalCount,
                hasNext: page * limit < totalCount,
                hasPrev: page > 1
            }
        });
    } catch (error) {
        logger.error('Get notes error:', error);
        res.status(500).json({
            error: 'Failed to retrieve notes',
            message: 'An error occurred while retrieving notes'
        });
    }
});

/**
 * GET /api/notes/by-role/:type
 * Get notes by type for current user's role (for view pages)
 */
router.get('/by-role/:type', authenticateToken, async (req, res) => {
    try {
        const { type } = req.params;
        const { user } = req;

        if (!['troubleshooting', 'instruction'].includes(type)) {
            return res.status(400).json({
                error: 'Invalid type',
                message: 'Type must be either "troubleshooting" or "instruction"'
            });
        }

        if (req.orgId && ['Admin', 'AdminEvent'].includes(user.role)) {
            await syncMissingNotesForOrganization({ organizationId: req.orgId, actorId: user._id });
        }

        const roleQuery = {
            type,
            assignedRoles: user.role,
            isActive: true
        };
        if (req.orgId) {
            roleQuery.$or = [{ organizationId: req.orgId }, { organizationId: null }];
        }

        // Find active notes assigned to user's role
        const rows = await Note.find(roleQuery)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 });
        const notes = req.orgId ? dedupeOrgPreferred(rows, req.orgId) : rows;

        res.json({
            notes: notes.map(note => ({
                _id: note._id,
                title: note.title,
                content: note.content,
                type: note.type,
                assignedRoles: note.assignedRoles,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
                createdBy: note.createdBy,
                updatedBy: note.updatedBy
            }))
        });
    } catch (error) {
        logger.error('Get notes by role error:', error);
        res.status(500).json({
            error: 'Failed to retrieve notes',
            message: 'An error occurred while retrieving notes'
        });
    }
});

/**
 * GET /api/notes/:id
 * Get note details
 */
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const note = await Note.findById(id)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email');

        if (!note) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'The specified note does not exist'
            });
        }

        // Check if user can access this note
        if (!note.canUserAccess(user)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to view this note'
            });
        }
        if (
            user.role !== 'SuperAdmin' &&
            req.orgId &&
            note.organizationId &&
            String(note.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only view notes from your organization'
            });
        }

        res.json({
            note: {
                _id: note._id,
                title: note.title,
                content: note.content,
                type: note.type,
                assignedRoles: note.assignedRoles,
                isActive: note.isActive,
                isPlatformDefault: note.isPlatformDefault,
                sourceTemplateId: note.sourceTemplateId,
                lastSyncedAt: note.lastSyncedAt,
                createdAt: note.createdAt,
                updatedAt: note.updatedAt,
                createdBy: note.createdBy,
                updatedBy: note.updatedBy
            }
        });
    } catch (error) {
        logger.error('Get note error:', error);
        res.status(500).json({
            error: 'Failed to retrieve note',
            message: 'An error occurred while retrieving the note'
        });
    }
});

/**
 * POST /api/notes
 * Create new note
 */
router.post('/', authenticateToken, requireRole(['SuperAdmin', 'Admin']), [
    body('title')
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Note title must be between 2 and 200 characters'),
    body('content')
        .trim()
        .isLength({ min: 10 })
        .withMessage('Note content must be at least 10 characters long'),
    body('type')
        .isIn(['troubleshooting', 'instruction'])
        .withMessage('Note type must be either "troubleshooting" or "instruction"'),
    body('assignedRoles')
        .isArray({ min: 1 })
        .withMessage('At least one role must be assigned'),
    body('assignedRoles.*')
        .isIn(['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
        .withMessage('Invalid role specified'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value'),
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

        const { title, content, type, assignedRoles, isActive = true, isPlatformDefault = false } = req.body;
        const { user } = req;
        const canSetDefault = user.role === 'SuperAdmin';
        const includesJobSeekerRole = Array.isArray(assignedRoles) && assignedRoles.includes('JobSeeker');

        if (includesJobSeekerRole && user.role !== 'SuperAdmin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only SuperAdmin can assign notes to JobSeeker'
            });
        }

        // Create new note
        const note = new Note({
            title,
            content,
            type,
            assignedRoles,
            isActive,
            organizationId: user.role === 'SuperAdmin' ? null : (req.orgId || null),
            isPlatformDefault: canSetDefault ? Boolean(isPlatformDefault) : false,
            createdBy: user._id,
            updatedBy: user._id
        });

        await note.save();

        logger.info(`Note created: ${title} (${type}) by ${user.email}`);

        res.status(201).json({
            message: 'Note created successfully',
            note: note.getSummary()
        });
    } catch (error) {
        logger.error('Create note error:', error);
        res.status(500).json({
            error: 'Failed to create note',
            message: 'An error occurred while creating the note'
        });
    }
});

/**
 * PUT /api/notes/:id
 * Update note
 */
router.put('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin']), [
    body('title')
        .optional()
        .trim()
        .isLength({ min: 2, max: 200 })
        .withMessage('Note title must be between 2 and 200 characters'),
    body('content')
        .optional()
        .trim()
        .isLength({ min: 10 })
        .withMessage('Note content must be at least 10 characters long'),
    body('type')
        .optional()
        .isIn(['troubleshooting', 'instruction'])
        .withMessage('Note type must be either "troubleshooting" or "instruction"'),
    body('assignedRoles')
        .optional()
        .isArray({ min: 1 })
        .withMessage('At least one role must be assigned'),
    body('assignedRoles.*')
        .optional()
        .isIn(['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker'])
        .withMessage('Invalid role specified'),
    body('isActive')
        .optional()
        .isBoolean()
        .withMessage('isActive must be a boolean value'),
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

        const { title, content, type, assignedRoles, isActive, isPlatformDefault } = req.body;
        const { id } = req.params;
        const { user } = req;
        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'The specified note does not exist'
            });
        }
        const effectiveAssignedRoles = Array.isArray(assignedRoles) ? assignedRoles : note.assignedRoles;
        if (effectiveAssignedRoles.includes('JobSeeker') && user.role !== 'SuperAdmin') {
            return res.status(403).json({
                error: 'Access denied',
                message: 'Only SuperAdmin can assign notes to JobSeeker'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            note.organizationId &&
            String(note.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only update notes from your organization'
            });
        }
        if (user.role === 'SuperAdmin' && note.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only update global default notes from this section'
            });
        }

        // Update allowed fields
        if (title !== undefined) note.title = title;
        if (content !== undefined) note.content = content;
        if (type !== undefined) note.type = type;
        if (assignedRoles !== undefined) note.assignedRoles = assignedRoles;
        if (isActive !== undefined) note.isActive = isActive;
        if (user.role === 'SuperAdmin' && isPlatformDefault !== undefined) {
            note.isPlatformDefault = isPlatformDefault;
        }
        note.updatedBy = user._id;

        await note.save();

        logger.info(`Note updated: ${note.title} (${note.type}) by ${user.email}`);

        res.json({
            message: 'Note updated successfully',
            note: note.getSummary()
        });
    } catch (error) {
        logger.error('Update note error:', error);
        res.status(500).json({
            error: 'Failed to update note',
            message: 'An error occurred while updating the note'
        });
    }
});

/**
 * DELETE /api/notes/:id
 * Delete note
 */
router.delete('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        const { user } = req;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'The specified note does not exist'
            });
        }
        if (
            user.role === 'Admin' &&
            req.orgId &&
            note.organizationId &&
            String(note.organizationId) !== String(req.orgId)
        ) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only delete notes from your organization'
            });
        }
        if (user.role === 'SuperAdmin' && note.organizationId) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'SuperAdmin can only delete global default notes'
            });
        }

        // Delete the note
        await Note.findByIdAndDelete(id);

        logger.info(`Note deleted: ${note.title} (${note.type}) by ${user.email}`);

        res.json({
            message: 'Note deleted successfully'
        });
    } catch (error) {
        logger.error('Delete note error:', error);
        res.status(500).json({
            error: 'Failed to delete note',
            message: 'An error occurred while deleting the note'
        });
    }
});

/**
 * POST /api/notes/:id/set-default
 * SuperAdmin: mark note as default template and auto-copy to organizations
 */
router.post('/:id/set-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const { id } = req.params;
        const templateNote = await Note.findOne({ _id: id, organizationId: null });
        if (!templateNote) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'Default template note not found'
            });
        }

        templateNote.isPlatformDefault = true;
        templateNote.updatedBy = req.user._id;
        await templateNote.save();

        res.json({
            message: 'Note set as platform default successfully'
        });
    } catch (error) {
        logger.error('Set default note error:', error);
        res.status(500).json({
            error: 'Failed to set default note',
            message: 'An error occurred while setting default note template'
        });
    }
});

/**
 * POST /api/notes/:id/unset-default
 * SuperAdmin: remove platform default flag from note template
 */
router.post('/:id/unset-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
    try {
        const { id } = req.params;
        const templateNote = await Note.findOne({ _id: id, organizationId: null });
        if (!templateNote) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'Default template note not found'
            });
        }

        templateNote.isPlatformDefault = false;
        templateNote.updatedBy = req.user._id;
        await templateNote.save();

        res.json({
            message: 'Note removed from platform defaults'
        });
    } catch (error) {
        logger.error('Unset default note error:', error);
        res.status(500).json({
            error: 'Failed to unset default note',
            message: 'An error occurred while unsetting default note template'
        });
    }
});

/**
 * POST /api/notes/:id/copy-to-organization
 * SuperAdmin: copy default note to a specific organization
 */
router.post('/:id/copy-to-organization', authenticateToken, requireRole(['SuperAdmin']), [
    body('targetOrganizationId')
        .trim()
        .notEmpty()
        .withMessage('targetOrganizationId is required'),
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
        const { targetOrganizationId, overwrite = false } = req.body;

        const templateNote = await Note.findOne({ _id: id, organizationId: null });
        if (!templateNote) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'Default template note not found'
            });
        }

        const organization = await getTargetOrganization(targetOrganizationId);

        if (!organization) {
            return res.status(404).json({
                error: 'Organization not found',
                message: 'Target organization not found or is inactive'
            });
        }

        const { record: copiedNote } = await cloneNoteTemplateToOrganization({
            template: templateNote,
            organizationId: organization._id,
            actorId: req.user._id,
            overwrite
        });

        templateNote.copyRecipients = upsertOrganizationCopyRecipient(templateNote.copyRecipients, organization);
        templateNote.updatedBy = req.user._id;
        await templateNote.save();

        res.json({
            message: `Note copied to ${organization.name || 'organization'} successfully`,
            note: copiedNote.getSummary()
        });
    } catch (error) {
        logger.error('Copy note to organization error:', error);
        res.status(500).json({
            error: 'Failed to copy note',
            message: 'An error occurred while copying note to selected organization'
        });
    }
});

/**
 * POST /api/notes/sync-defaults
 * Materialize missing org copies from platform defaults
 */
router.post('/sync-defaults', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        if (!req.orgId && req.user.role !== 'SuperAdmin') {
            return res.status(400).json({
                error: 'Organization missing',
                message: 'Organization context is required to sync defaults'
            });
        }

        const organizationId = req.user.role === 'SuperAdmin' ? req.body?.organizationId : req.orgId;
        if (!organizationId) {
            return res.status(400).json({
                error: 'organizationId required',
                message: 'SuperAdmin must provide organizationId to sync defaults'
            });
        }

        const createdCount = await syncMissingNotesForOrganization({
            organizationId,
            actorId: req.user._id
        });

        res.json({
            message: 'Notes defaults sync completed',
            createdCount
        });
    } catch (error) {
        logger.error('Sync notes defaults error:', error);
        res.status(500).json({
            error: 'Failed to sync note defaults',
            message: 'An error occurred while syncing note defaults'
        });
    }
});

module.exports = router;





