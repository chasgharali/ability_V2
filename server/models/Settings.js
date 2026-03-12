const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  // Organization scope — null means platform-wide global setting
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Unique per (key, organizationId) — org-specific settings override global
settingsSchema.index({ key: 1, organizationId: 1 }, { unique: true });

// Static method to get a setting (org-specific overrides global)
settingsSchema.statics.getSetting = async function(key, organizationId = null) {
  if (organizationId) {
    const orgSetting = await this.findOne({ key, organizationId });
    if (orgSetting) return orgSetting.value;
  }
  const globalSetting = await this.findOne({ key, organizationId: null });
  return globalSetting ? globalSetting.value : null;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, userId = null, description = '', organizationId = null) {
  return await this.findOneAndUpdate(
    { key, organizationId: organizationId || null },
    { 
      value, 
      updatedBy: userId,
      description,
      organizationId: organizationId || null
    },
    { 
      upsert: true, 
      new: true,
      runValidators: true
    }
  );
};

// Static method to get multiple settings (org-specific overrides global)
settingsSchema.statics.getSettings = async function(keys = [], organizationId = null) {
  const query = keys.length > 0 ? { key: { $in: keys } } : {};
  const allSettings = await this.find({
    ...query,
    $or: [{ organizationId: null }, { organizationId: organizationId || null }]
  });
  const result = {};
  // Global first, then org-specific overrides
  const sorted = allSettings.sort((a, b) => {
    if (!a.organizationId && b.organizationId) return -1;
    if (a.organizationId && !b.organizationId) return 1;
    return 0;
  });
  sorted.forEach(setting => {
    result[setting.key] = setting.value;
  });
  return result;
};

module.exports = mongoose.model('Settings', settingsSchema);
