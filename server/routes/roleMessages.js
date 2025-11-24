const express = require('express');
const { body, validationResult } = require('express-validator');
const RoleMessage = require('../models/RoleMessage');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/role-messages
 * Get all role messages (Admin/GlobalSupport only)
 */
router.get('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const messages = await RoleMessage.find({}).populate('updatedBy', 'name email').sort({ role: 1, screen: 1, messageKey: 1 });
    res.json({ success: true, messages });
  } catch (error) {
    logger.error('Error fetching role messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch role messages' });
  }
});

/**
 * GET /api/role-messages/:role
 * Get messages for a specific role
 * GET /api/role-messages/:role/:screen
 * Get messages for a specific role and screen
 */
router.get('/:role/:screen?', authenticateToken, async (req, res) => {
  try {
    const { role, screen } = req.params;
    const { user } = req;
    
    // Users can only access messages for their own role (unless Admin/GlobalSupport)
    if (!['Admin', 'GlobalSupport'].includes(user.role) && user.role !== role) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const messages = await RoleMessage.getMessages(role, screen || null);
    res.json({ success: true, messages });
  } catch (error) {
    logger.error('Error fetching role messages:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch role messages' });
  }
});

/**
 * GET /api/role-messages/:role/:screen/:messageKey
 * Get a specific message
 */
router.get('/:role/:screen/:messageKey', authenticateToken, async (req, res) => {
  try {
    const { role, screen, messageKey } = req.params;
    const { user } = req;
    
    // Users can only access messages for their own role (unless Admin/GlobalSupport)
    if (!['Admin', 'GlobalSupport'].includes(user.role) && user.role !== role) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    const content = await RoleMessage.getMessage(role, screen, messageKey);
    res.json({ success: true, content });
  } catch (error) {
    logger.error('Error fetching role message:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch role message' });
  }
});

/**
 * POST /api/role-messages
 * Create or update a role message (Admin/GlobalSupport only)
 */
router.post('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), [
  body('role').isIn(['JobSeeker', 'Recruiter', 'BoothAdmin', 'Admin', 'AdminEvent', 'Support', 'GlobalSupport', 'Interpreter', 'GlobalInterpreter']).withMessage('Invalid role'),
  body('screen').trim().notEmpty().withMessage('Screen is required'),
  body('messageKey').trim().notEmpty().withMessage('Message key is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { role, screen, messageKey, content, description } = req.body;
    const message = await RoleMessage.setMessage(role, screen, messageKey, content, req.user.id, description || '');
    
    res.json({ success: true, message });
  } catch (error) {
    logger.error('Error saving role message:', error);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, error: 'Message already exists for this role, screen, and key' });
    }
    res.status(500).json({ success: false, error: 'Failed to save role message' });
  }
});

/**
 * PUT /api/role-messages/:id
 * Update a role message (Admin/GlobalSupport only)
 */
router.put('/:id', authenticateToken, requireRole(['Admin', 'GlobalSupport']), [
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim()
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { content, description } = req.body;

    const message = await RoleMessage.findByIdAndUpdate(
      id,
      {
        content: content.trim(),
        description: description ? description.trim() : undefined,
        updatedBy: req.user.id
      },
      { new: true, runValidators: true }
    );

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, message });
  } catch (error) {
    logger.error('Error updating role message:', error);
    res.status(500).json({ success: false, error: 'Failed to update role message' });
  }
});

/**
 * DELETE /api/role-messages/:id
 * Delete a role message (Admin/GlobalSupport only)
 */
router.delete('/:id', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const { id } = req.params;
    const message = await RoleMessage.findByIdAndDelete(id);

    if (!message) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }

    res.json({ success: true, message: 'Message deleted successfully' });
  } catch (error) {
    logger.error('Error deleting role message:', error);
    res.status(500).json({ success: false, error: 'Failed to delete role message' });
  }
});

module.exports = router;

