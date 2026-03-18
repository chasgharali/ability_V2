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
const GLOBAL_SCOPE_FILTER = [{ organizationId: null }, { organizationId: { $exists: false } }];

// Static method to get a setting (org-specific overrides global)
settingsSchema.statics.getSetting = async function(key, organizationId = null) {
  if (organizationId) {
    const orgSetting = await this.findOne({ key, organizationId });
    if (orgSetting) return orgSetting.value;
  }
  const globalSetting = await this.findOne({ key, $or: GLOBAL_SCOPE_FILTER });
  return globalSetting ? globalSetting.value : null;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, userId = null, description = '', organizationId = null) {
  const filter = organizationId
    ? { key, organizationId }
    : { key, $or: GLOBAL_SCOPE_FILTER };
  const update = {
    value,
    updatedBy: userId,
    description,
    organizationId: organizationId || null
  };

  try {
    return await this.findOneAndUpdate(
      filter,
      update,
      {
        upsert: true,
        new: true,
        runValidators: true
      }
    );
  } catch (error) {
    // Fallback for environments that still have a legacy unique index on `key`.
    // In that case, upsert can fail with E11000 even though setting should be updated.
    if (error?.code === 11000 && error?.keyPattern?.key === 1) {
      return await this.findOneAndUpdate(
        { key },
        update,
        {
          upsert: false,
          new: true,
          runValidators: true
        }
      );
    }
    throw error;
  }
};

settingsSchema.statics.normalizeLegacyIndexes = async function(log = console) {
  const indexes = await this.collection.indexes();
  const hasLegacyKeyIndex = indexes.some((index) => index.name === 'key_1' && index.unique);
  const hasScopedIndex = indexes.some((index) => index.name === 'key_1_organizationId_1' && index.unique);

  if (hasLegacyKeyIndex) {
    await this.collection.dropIndex('key_1');
    if (log?.info) {
      log.info('Dropped legacy settings index: key_1');
    }
  }

  if (!hasScopedIndex) {
    await this.collection.createIndex(
      { key: 1, organizationId: 1 },
      { unique: true, name: 'key_1_organizationId_1' }
    );
    if (log?.info) {
      log.info('Created settings scoped index: key_1_organizationId_1');
    }
  }
};

// Static method to get multiple settings (org-specific overrides global)
settingsSchema.statics.getSettings = async function(keys = [], organizationId = null) {
  const query = keys.length > 0 ? { key: { $in: keys } } : {};
  const scopeFilter = organizationId
    ? { $or: [...GLOBAL_SCOPE_FILTER, { organizationId }] }
    : { $or: GLOBAL_SCOPE_FILTER };

  const allSettings = await this.find({
    ...query,
    ...scopeFilter
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
