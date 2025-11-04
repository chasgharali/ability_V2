const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
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
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Static method to get a setting
settingsSchema.statics.getSetting = async function(key) {
  const setting = await this.findOne({ key });
  return setting ? setting.value : null;
};

// Static method to set a setting
settingsSchema.statics.setSetting = async function(key, value, userId = null, description = '') {
  return await this.findOneAndUpdate(
    { key },
    { 
      value, 
      updatedBy: userId,
      description
    },
    { 
      upsert: true, 
      new: true,
      runValidators: true
    }
  );
};

// Static method to get multiple settings
settingsSchema.statics.getSettings = async function(keys = []) {
  if (keys.length === 0) {
    const allSettings = await this.find({});
    const result = {};
    allSettings.forEach(setting => {
      result[setting.key] = setting.value;
    });
    return result;
  }
  
  const settings = await this.find({ key: { $in: keys } });
  const result = {};
  settings.forEach(setting => {
    result[setting.key] = setting.value;
  });
  return result;
};

module.exports = mongoose.model('Settings', settingsSchema);
