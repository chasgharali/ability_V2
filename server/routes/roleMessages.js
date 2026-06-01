const express = require('express');
const { body, validationResult } = require('express-validator');
const RoleMessage = require('../models/RoleMessage');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const {
  getTargetOrganization,
  upsertOrganizationCopyRecipient,
  cloneRoleMessageTemplateToOrganization,
  syncMissingRoleMessagesForOrganization
} = require('../services/defaultCopyService');

const router = express.Router();
const canManageRoleInstructions = (actorRole, targetRole) => actorRole === 'SuperAdmin' || targetRole !== 'JobSeeker';

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
    } else if (req.user.role === 'Admin') {
      return res.status(400).json({ success: false, error: 'Organization context is required for Admin users' });
    } else if (req.user.role === 'GlobalSupport') {
      query.organizationId = req.orgId || null;
    }
    if (req.user.role !== 'SuperAdmin') {
      query.role = { $ne: 'JobSeeker' };
    }
    const messages = await RoleMessage.find(query).populate('updatedBy', 'name email').sort({ role: 1, screen: 1 });
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
  body('content').trim().notEmpty().withMessage('Content is required'),
  body('description').optional().trim(),
  body('isPlatformDefault').optional().isBoolean().withMessage('isPlatformDefault must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { role, screen, content, description, isPlatformDefault = false } = req.body;
    if (!canManageRoleInstructions(req.user.role, role)) {
      return res.status(403).json({ success: false, error: 'Only SuperAdmin can manage JobSeeker instructions' });
    }
    const message = await RoleMessage.setMessage(
      role,
      screen,
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
      return res.status(400).json({ success: false, error: 'Message already exists for this role and screen' });
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
    if (!canManageRoleInstructions(req.user.role, existingMessage.role)) {
      return res.status(403).json({ success: false, error: 'Only SuperAdmin can manage JobSeeker instructions' });
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
    if (!canManageRoleInstructions(req.user.role, existingMessage.role)) {
      return res.status(403).json({ success: false, error: 'Only SuperAdmin can manage JobSeeker instructions' });
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
 * POST /api/role-messages/:id/copy-to-organization
 * SuperAdmin: copy page instruction template to a specific organization
 */
router.post('/:id/copy-to-organization', authenticateToken, requireRole(['SuperAdmin']), [
  body('targetOrganizationId').trim().notEmpty().withMessage('targetOrganizationId is required'),
  body('overwrite').optional().isBoolean().withMessage('overwrite must be a boolean value')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ success: false, errors: errors.array() });
    }

    const { id } = req.params;
    const { targetOrganizationId, overwrite = false } = req.body;
    const templateMessage = await RoleMessage.findOne({ _id: id, organizationId: null });
    if (!templateMessage) {
      return res.status(404).json({ success: false, error: 'Default template message not found' });
    }

    const organization = await getTargetOrganization(targetOrganizationId);

    if (!organization) {
      return res.status(404).json({ success: false, error: 'Target organization not found' });
    }

    const { record: copiedMessage } = await cloneRoleMessageTemplateToOrganization({
      template: templateMessage,
      organizationId: organization._id,
      actorId: req.user._id,
      overwrite
    });

    templateMessage.copyRecipients = upsertOrganizationCopyRecipient(templateMessage.copyRecipients, organization);
    templateMessage.updatedBy = req.user._id;
    await templateMessage.save();

    res.json({
      success: true,
      message: `Page instruction copied to ${organization.name || 'organization'} successfully`,
      copiedMessage
    });
  } catch (error) {
    logger.error('Error copying role message to organization:', error);
    res.status(500).json({ success: false, error: 'Failed to copy page instruction to selected organization' });
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

