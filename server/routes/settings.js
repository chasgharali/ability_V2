const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { toStablePublicImageUrl, encodeKeyForPath } = require('../utils/mediaUrl');

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
