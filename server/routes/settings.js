const express = require('express');
const router = express.Router();
const Settings = require('../models/Settings');
const { authenticateToken, requireRole } = require('../middleware/auth');

// @route   GET /api/settings
// @desc    Get all settings (public)
// @access  Public
router.get('/', async (req, res) => {
  try {
    const settings = await Settings.getSettings();
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
    const value = await Settings.getSetting(key);
    
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
// @access  Private (Admin/GlobalSupport only)
router.post('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
  try {
    const { key, value, description } = req.body;
    
    if (!key || value === undefined) {
      return res.status(400).json({ 
        success: false, 
        error: 'Key and value are required' 
      });
    }
    
    const setting = await Settings.setSetting(
      key, 
      value, 
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
// @access  Private (Admin/GlobalSupport only)
router.delete('/:key', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
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
