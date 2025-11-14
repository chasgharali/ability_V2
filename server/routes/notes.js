const express = require('express');
const { body, validationResult } = require('express-validator');
const Note = require('../models/Note');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

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
        if (user.role !== 'Admin') {
            query.assignedRoles = user.role;
            query.isActive = true;
        }

        // Apply type filter
        if (type && ['troubleshooting', 'instruction'].includes(type)) {
            query.type = type;
        }

        // Apply role filter (for admin)
        if (role && user.role === 'Admin') {
            query.assignedRoles = role;
        }

        // Find notes
        const notes = await Note.find(query)
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 })
            .limit(limit * 1)
            .skip((page - 1) * limit);

        // Get total count for pagination
        const totalCount = await Note.countDocuments(query);

        res.json({
            notes: notes.map(note => ({
                ...note.getSummary(),
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

        // Find active notes assigned to user's role
        const notes = await Note.find({
            type,
            assignedRoles: user.role,
            isActive: true
        })
            .populate('createdBy', 'name email')
            .populate('updatedBy', 'name email')
            .sort({ createdAt: -1 });

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

        res.json({
            note: {
                _id: note._id,
                title: note.title,
                content: note.content,
                type: note.type,
                assignedRoles: note.assignedRoles,
                isActive: note.isActive,
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
router.post('/', authenticateToken, requireRole(['Admin']), [
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
        .withMessage('isActive must be a boolean value')
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

        const { title, content, type, assignedRoles, isActive = true } = req.body;
        const { user } = req;

        // Create new note
        const note = new Note({
            title,
            content,
            type,
            assignedRoles,
            isActive,
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
router.put('/:id', authenticateToken, requireRole(['Admin']), [
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
        .withMessage('isActive must be a boolean value')
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

        const { title, content, type, assignedRoles, isActive } = req.body;
        const { id } = req.params;
        const { user } = req;

        const note = await Note.findById(id);
        if (!note) {
            return res.status(404).json({
                error: 'Note not found',
                message: 'The specified note does not exist'
            });
        }

        // Update allowed fields
        if (title !== undefined) note.title = title;
        if (content !== undefined) note.content = content;
        if (type !== undefined) note.type = type;
        if (assignedRoles !== undefined) note.assignedRoles = assignedRoles;
        if (isActive !== undefined) note.isActive = isActive;
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
router.delete('/:id', authenticateToken, requireRole(['Admin']), async (req, res) => {
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

module.exports = router;

