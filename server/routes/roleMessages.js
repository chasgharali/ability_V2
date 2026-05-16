const express = require('express');
const { body, validationResult } = require('express-validator');
const RoleMessage = require('../models/RoleMessage');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  getTargetAdminUser,
  cloneRoleMessageTemplateToOrganization,
  syncMissingRoleMessagesForOrganization
} = require('../services/defaultCopyService');

const router = express.Router();

/**
 * GET /api/role-messages
 * Get all role messages (Admin/GlobalSupport only)
 */
router.get('/', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const query = {};
    if (req.user.role === 'SuperAdmin') {
      query.organizationId = null;
    } else if (req.user.role === 'Admin' && req.orgId) {
      await syncMissingRoleMessagesForOrganization({
        organizationId: req.orgId,
        actorId: req.user._id
      });
      query.organizationId = req.orgId;
    }
    const messages = await RoleMessage.find(query).populate('updatedBy', 'name email').sort({ role: 1, screen: 1, messageKey: 1 });
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
    if (!['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) && user.role !== role) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.orgId && ['Admin', 'AdminEvent'].includes(user.role)) {
      await syncMissingRoleMessagesForOrganization({
        organizationId: req.orgId,
        actorId: user._id
      });
    }

    const messages = await RoleMessage.getMessages(role, screen || null, req.orgId || null);
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
    if (!['SuperAdmin', 'Admin', 'GlobalSupport'].includes(user.role) && user.role !== role) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }

    if (req.orgId && ['Admin', 'AdminEvent'].includes(user.role)) {
      await syncMissingRoleMessagesForOrganization({
        organizationId: req.orgId,
        actorId: user._id
      });
    }
    const content = await RoleMessage.getMessage(role, screen, messageKey, req.orgId || null);
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
router.post('/', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), [
  body('role').isIn(['JobSeeker', 'Recruiter', 'BoothAdmin', 'Admin', 'AdminEvent', 'Support', 'GlobalSupport', 'Interpreter', 'GlobalInterpreter']).withMessage('Invalid role'),
  body('screen').trim().notEmpty().withMessage('Screen is required'),
  body('messageKey').trim().notEmpty().withMessage('Message key is required'),
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim(),
  body('isPlatformDefault').optional().isBoolean().withMessage('isPlatformDefault must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { role, screen, messageKey, content, description, isPlatformDefault = false } = req.body;
    const message = await RoleMessage.setMessage(
      role,
      screen,
      messageKey,
      content,
      req.user.id,
      description || '',
      req.user.role === 'SuperAdmin' ? null : (req.orgId || null)
    );
    if (req.user.role === 'SuperAdmin') {
      message.isPlatformDefault = Boolean(isPlatformDefault);
      message.updatedBy = req.user.id;
      await message.save();
    }
    
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
router.put('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), [
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim(),
  body('isPlatformDefault').optional().isBoolean().withMessage('isPlatformDefault must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { content, description, isPlatformDefault } = req.body;

    const existingMessage = await RoleMessage.findById(id);
    if (!existingMessage) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    if (req.user.role === 'SuperAdmin' && existingMessage.organizationId) {
      return res.status(403).json({ success: false, error: 'SuperAdmin can only edit global templates here' });
    }
    if (req.user.role === 'Admin' && req.orgId && String(existingMessage.organizationId) !== String(req.orgId)) {
      return res.status(403).json({ success: false, error: 'You can only edit your organization messages' });
    }

    const message = await RoleMessage.findByIdAndUpdate(
      id,
      {
        content: content.trim(),
        description: description ? description.trim() : undefined,
        updatedBy: req.user.id,
        ...(req.user.role === 'SuperAdmin' && isPlatformDefault !== undefined ? { isPlatformDefault } : {})
      },
      { new: true, runValidators: true }
    );

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
router.delete('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const { id } = req.params;
    const existingMessage = await RoleMessage.findById(id);
    if (!existingMessage) {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
    if (req.user.role === 'SuperAdmin' && existingMessage.organizationId) {
      return res.status(403).json({ success: false, error: 'SuperAdmin can only delete global templates' });
    }
    if (req.user.role === 'Admin' && req.orgId && String(existingMessage.organizationId) !== String(req.orgId)) {
      return res.status(403).json({ success: false, error: 'You can only delete your organization messages' });
    }

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

/**
 * POST /api/role-messages/:id/set-default
 * SuperAdmin: mark page instruction as default template and auto-copy to organizations
 */
router.post('/:id/set-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const templateMessage = await RoleMessage.findOne({ _id: id, organizationId: null });
    if (!templateMessage) {
      return res.status(404).json({ success: false, error: 'Default template message not found' });
    }

    templateMessage.isPlatformDefault = true;
    templateMessage.updatedBy = req.user._id;
    await templateMessage.save();
    res.json({ success: true, message: 'Page instruction set as platform default successfully' });
  } catch (error) {
    logger.error('Error setting default role message:', error);
    res.status(500).json({ success: false, error: 'Failed to set default page instruction' });
  }
});

/**
 * POST /api/role-messages/:id/unset-default
 * SuperAdmin: remove platform default flag from page instruction template
 */
router.post('/:id/unset-default', authenticateToken, requireRole(['SuperAdmin']), async (req, res) => {
  try {
    const { id } = req.params;
    const templateMessage = await RoleMessage.findOne({ _id: id, organizationId: null });
    if (!templateMessage) {
      return res.status(404).json({ success: false, error: 'Default template message not found' });
    }

    templateMessage.isPlatformDefault = false;
    templateMessage.updatedBy = req.user._id;
    await templateMessage.save();
    res.json({ success: true, message: 'Page instruction removed from platform defaults' });
  } catch (error) {
    logger.error('Error unsetting default role message:', error);
    res.status(500).json({ success: false, error: 'Failed to unset default page instruction' });
  }
});

/**
 * POST /api/role-messages/:id/copy-to-admin
 * SuperAdmin: copy page instruction template to a specific organization admin
 */
router.post('/:id/copy-to-admin', authenticateToken, requireRole(['SuperAdmin']), [
  body('targetAdminUserId').trim().notEmpty().withMessage('targetAdminUserId is required'),
  body('overwrite').optional().isBoolean().withMessage('overwrite must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { targetAdminUserId, overwrite = false } = req.body;
    const templateMessage = await RoleMessage.findOne({ _id: id, organizationId: null });
    if (!templateMessage) {
      return res.status(404).json({ success: false, error: 'Default template message not found' });
    }

    const adminUser = await getTargetAdminUser(targetAdminUserId);

    if (!adminUser) {
      return res.status(404).json({ success: false, error: 'Target admin user not found' });
    }

    const { record: copiedMessage } = await cloneRoleMessageTemplateToOrganization({
      template: templateMessage,
      organizationId: adminUser.organizationId,
      actorId: req.user._id,
      overwrite
    });

    const now = new Date();
    const recipients = Array.isArray(templateMessage.copyRecipients) ? templateMessage.copyRecipients : [];
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

    templateMessage.copyRecipients = recipients;
    templateMessage.updatedBy = req.user._id;
    await templateMessage.save();

    res.json({
      success: true,
      message: `Page instruction copied to ${adminUser.name || adminUser.email} successfully`,
      copiedMessage
    });
  } catch (error) {
    logger.error('Error copying role message to admin:', error);
    res.status(500).json({ success: false, error: 'Failed to copy page instruction to selected admin' });
  }
});

/**
 * POST /api/role-messages/sync-defaults
 * Materialize missing org copies from platform defaults
 */
router.post('/sync-defaults', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const organizationId = req.user.role === 'SuperAdmin' ? req.body?.organizationId : req.orgId;
    if (!organizationId) {
      return res.status(400).json({
        success: false,
        error: 'organizationId required for syncing page instructions defaults'
      });
    }

    const createdCount = await syncMissingRoleMessagesForOrganization({
      organizationId,
      actorId: req.user._id
    });

    res.json({
      success: true,
      message: 'Page instructions defaults sync completed',
      createdCount
    });
  } catch (error) {
    logger.error('Error syncing role message defaults:', error);
    res.status(500).json({ success: false, error: 'Failed to sync page instructions defaults' });
  }
});

module.exports = router;

