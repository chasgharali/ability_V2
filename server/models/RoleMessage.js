const mongoose = require('mongoose');

const roleMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['JobSeeker', 'Recruiter', 'BoothAdmin', 'Admin', 'AdminEvent', 'Support', 'GlobalSupport', 'Interpreter', 'GlobalInterpreter'],
    index: true
  },
  screen: {
    type: String,
    required: true,
    trim: true,
    index: true
  },
  messageKey: {
    type: String,
    required: true,
    trim: true
  },
  content: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    default: '',
    trim: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Compound index for efficient queries
roleMessageSchema.index({ role: 1, screen: 1, messageKey: 1 }, { unique: true });

// Static method to get messages by role and screen
roleMessageSchema.statics.getMessages = async function(role, screen = null) {
  const query = { role };
  if (screen) {
    query.screen = screen;
  }
  const messages = await this.find(query);
  const result = {};
  messages.forEach(msg => {
    if (!result[msg.screen]) {
      result[msg.screen] = {};
    }
    result[msg.screen][msg.messageKey] = msg.content;
  });
  return result;
};

// Static method to get a specific message
roleMessageSchema.statics.getMessage = async function(role, screen, messageKey) {
  const message = await this.findOne({ role, screen, messageKey });
  return message ? message.content : null;
};

// Static method to set/update a message
roleMessageSchema.statics.setMessage = async function(role, screen, messageKey, content, userId = null, description = '') {
  return await this.findOneAndUpdate(
    { role, screen, messageKey },
    {
      content: content.trim(),
      updatedBy: userId,
      description: description.trim() || description
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
};

module.exports = mongoose.model('RoleMessage', roleMessageSchema);

