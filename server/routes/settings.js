const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { toStablePublicImageUrl, encodeKeyForPath } = require('../utils/mediaUrl');

const {
  SETTING_MAX_RESUMES,
  SETTING_MAX_UPDATES,
  SETTING_AI_ENABLED,
  SETTING_UPLOAD_PARSE_ENABLED,
  validateLimitSettingValue,
  validateAiEnabledSettingValue
} = require('../services/resumeBuilderLimits');

const SUPERADMIN_ONLY_SETTING_KEYS = new Set([
  'footer_text',
  SETTING_MAX_RESUMES,
  SETTING_MAX_UPDATES,
  SETTING_AI_ENABLED,
  SETTING_UPLOAD_PARSE_ENABLED
]);
const FOOTER_TEXT_MAX_LENGTH = 200;
const RESUME_BUILDER_LIMIT_KEYS = new Set([SETTING_MAX_RESUMES, SETTING_MAX_UPDATES]);

function normalizeBrandingLogoValue(value) {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  if (!trimmed) return trimmed;

  // Backward compatibility: old branding logos may still be saved as rte-content URLs.
  if (trimmed.startsWith('/api/uploads/rte-content/')) {
    const key = decodeURIComponent(trimmed.replace('/api/uploads/rte-content/', '').replace(/^\/+/, ''));
    if (/^(image|booth-logo|organization-logo)\//.test(key)) {
      return `/api/uploads/public/${encodeKeyForPath(key)}`;
    }
  }

  return toStablePublicImageUrl(trimmed);
}

function sanitizeFooterTextValue(value) {
  if (typeof value !== 'string') {
    return { error: 'Footer text must be a string' };
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return { error: 'Footer text cannot be empty' };
  }
  if (trimmed.length > FOOTER_TEXT_MAX_LENGTH) {
    return { error: `Footer text must be ${FOOTER_TEXT_MAX_LENGTH} characters or fewer` };
  }
  return { value: trimmed };
}

// @route   GET /api/settings
// @desc    Get all settings (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
    if (settings.branding_logo) {
      settings.branding_logo = normalizeBrandingLogoValue(settings.branding_logo);
    }
    res.json({ success: true, settings });
  } catch (error) {
    console.error('Error fetching settings:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch settings' 
    });
  }
});

// @route   GET /api/settings/:key
// @desc    Get a specific setting (public)
// @access  Public
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    let value = await Settings.getSetting(key);
    if (key === 'branding_logo') {
      value = normalizeBrandingLogoValue(value);
    }
    
    if (value === null) {
      return res.status(404).json({ 
        success: false, 
        error: 'Setting not found' 
      });
    }
    
    res.json({ success: true, key, value });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch setting' 
    });
  }
});

// @route   POST /api/settings
// @desc    Create or update a setting
// @access  Private (Admin/GlobalSupport/SuperAdmin only)
router.post('/', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'SuperAdmin']), async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key and value are required' 
      });
    }

    if (SUPERADMIN_ONLY_SETTING_KEYS.has(key) && req.user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        error: 'Only SuperAdmin can update this setting'
      });
    }
    
    let sanitizedValue = value;
    if (key === 'branding_logo') {
      if (typeof value !== 'string' || !value.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Branding logo value must be a non-empty string'
        });
      }
      sanitizedValue = normalizeBrandingLogoValue(value.trim());
      if (!sanitizedValue.startsWith('/api/uploads/public/')) {
        return res.status(400).json({
          success: false,
          error: 'Branding logo must be uploaded to S3 via the image uploader'
        });
      }
    }
    if (key === 'footer_text') {
      const footerResult = sanitizeFooterTextValue(value);
      if (footerResult.error) {
        return res.status(400).json({
          success: false,
          error: footerResult.error
        });
      }
      sanitizedValue = footerResult.value;
    }
    if (RESUME_BUILDER_LIMIT_KEYS.has(key)) {
      const limitResult = validateLimitSettingValue(value);
      if (limitResult.error) {
        return res.status(400).json({
          success: false,
          error: limitResult.error
        });
      }
      sanitizedValue = limitResult.value;
    }
    if (key === SETTING_AI_ENABLED) {
      const aiEnabledResult = validateAiEnabledSettingValue(value);
      if (aiEnabledResult.error) {
        return res.status(400).json({
          success: false,
          error: aiEnabledResult.error
        });
      }
      sanitizedValue = aiEnabledResult.value;
    }
    if (key === SETTING_UPLOAD_PARSE_ENABLED) {
      const uploadParseResult = validateAiEnabledSettingValue(value);
      if (uploadParseResult.error) {
        return res.status(400).json({
          success: false,
          error: uploadParseResult.error
        });
      }
      sanitizedValue = uploadParseResult.value;
    }

    const setting = await Settings.setSetting(
      key, 
      sanitizedValue,
      req.user.id, 
      description || ''
    );
    
    res.json({ 
      success: true, 
      setting: {
        key: setting.key,
        value: setting.value,
        description: setting.description
      }
    });
  } catch (error) {
    console.error('Error saving setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to save setting' 
    });
  }
});

// @route   DELETE /api/settings/:key
// @desc    Delete a setting
// @access  Private (Admin/GlobalSupport/SuperAdmin only)
router.delete('/:key', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'SuperAdmin']), async (req, res) => {
  try {
    const { key } = req.params;

    if (SUPERADMIN_ONLY_SETTING_KEYS.has(key) && req.user.role !== 'SuperAdmin') {
      return res.status(403).json({
        success: false,
        error: 'Only SuperAdmin can delete this setting'
      });
    }

    const result = await Settings.deleteOne({ key });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ 
        success: false, 
        error: 'Setting not found' 
      });
    }
    
    res.json({ 
      success: true, 
      message: 'Setting deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting setting:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to delete setting' 
    });
  }
});

module.exports = router;
