const mongoose = require('mongoose');
const DEFAULT_MESSAGE_KEY = 'default';
const INSTRUCTION_ROLE_ALIASES = {
  BoothAdmin: 'Recruiter'
};

const roleMessageSchema = new mongoose.Schema({
  role: {
    type: String,
    required: true,
    enum: ['SuperAdmin', 'JobSeeker', 'Recruiter', 'BoothAdmin', 'Admin', 'AdminEvent', 'Support', 'GlobalSupport', 'Interpreter', 'GlobalInterpreter'],
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
    default: DEFAULT_MESSAGE_KEY,
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
  // Organization scope — null means platform-wide default
  organizationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Organization',
    default: null
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  // SuperAdmin-managed platform default template
  isPlatformDefault: {
    type: Boolean,
    default: false
  },
  // Source default template when this message is copied to an organization
  sourceTemplateId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'RoleMessage',
    default: null
  },
  // Last time this record was synced from its source template
  lastSyncedAt: {
    type: Date,
    default: null
  },
  // Tracks organizations this template was explicitly copied to
  copyRecipients: {
    type: [{
      organizationId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Organization',
        required: true
      },
      organizationName: {
        type: String,
        default: ''
      },
      adminUserId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
      },
      adminName: {
        type: String,
        default: ''
      },
      adminEmail: {
        type: String,
        default: ''
      },
      copiedAt: {
        type: Date,
        default: Date.now
      },
      lastCopiedAt: {
        type: Date,
        default: Date.now
      },
      copyCount: {
        type: Number,
        default: 1
      }
    }],
    default: []
  }
}, {
  timestamps: true
});

// Compound index — one instruction per role+screen within an organization scope
roleMessageSchema.index({ organizationId: 1, role: 1, screen: 1 }, { unique: true });

// Static method to get messages by role and screen (org-aware: org messages override global)
roleMessageSchema.statics.getMessages = async function(role, screen = null, organizationId = null) {
  const rolesToQuery = INSTRUCTION_ROLE_ALIASES[role]
    ? [role, INSTRUCTION_ROLE_ALIASES[role]]
    : [role];
  const query = { role: { $in: rolesToQuery } };
  if (organizationId) {
    query.$or = [{ organizationId: null }, { organizationId }];
  } else {
    query.organizationId = null;
  }
  if (screen) query.screen = screen;
  const messages = await this.find(query);
  const result = {};
  // Global (null org) messages first, then org-specific messages override them.
  // BoothAdmin inherits Recruiter instructions when no BoothAdmin-specific copy exists.
  const sorted = messages.sort((a, b) => {
    const rolePriority = (msg) => {
      if (msg.role === role) return 0;
      if (INSTRUCTION_ROLE_ALIASES[role] && msg.role === INSTRUCTION_ROLE_ALIASES[role]) return 1;
      return 2;
    };
    const roleDiff = rolePriority(a) - rolePriority(b);
    if (roleDiff !== 0) return roleDiff;
    if (!a.organizationId && b.organizationId) return -1;
    if (a.organizationId && !b.organizationId) return 1;
    return 0;
  });
  sorted.forEach(msg => {
    if (!result[msg.screen]) result[msg.screen] = {};
    result[msg.screen][msg.messageKey || DEFAULT_MESSAGE_KEY] = msg.content;
  });
  return result;
};

// Static method to get a specific message
roleMessageSchema.statics.getMessage = async function(role, screen, messageKey, organizationId = null) {
  const messages = await this.getMessages(role, screen, organizationId);
  const screenMessages = messages[screen];
  if (!screenMessages || typeof screenMessages !== 'object') return null;

  if (messageKey && screenMessages[messageKey]) {
    return screenMessages[messageKey];
  }
  if (screenMessages[DEFAULT_MESSAGE_KEY]) {
    return screenMessages[DEFAULT_MESSAGE_KEY];
  }
  const firstMessage = Object.values(screenMessages)[0];
  return firstMessage || null;
};

// Static method to set/update a message
roleMessageSchema.statics.setMessage = async function(role, screen, content, userId = null, description = '', organizationId = null) {
  return await this.findOneAndUpdate(
    { role, screen, organizationId: organizationId || null },
    {
      content: content.trim(),
      updatedBy: userId,
      description: description.trim() || description,
      organizationId: organizationId || null,
      messageKey: DEFAULT_MESSAGE_KEY
    },
    {
      upsert: true,
      new: true,
      runValidators: true
    }
  );
};

roleMessageSchema.statics.dropLegacyIndexes = async function() {
  const indexNames = ['role_1_screen_1_messageKey_1', 'organizationId_1_role_1_screen_1_messageKey_1'];
  for (const indexName of indexNames) {
    try {
      await this.collection.dropIndex(indexName);
    } catch (error) {
      if (error.codeName !== 'IndexNotFound') {
        throw error;
      }
    }
  }
};

const RoleMessage = mongoose.model('RoleMessage', roleMessageSchema);

if (mongoose.connection.readyState === 1) {
  RoleMessage.dropLegacyIndexes().catch(() => {});
} else {
  mongoose.connection.once('open', () => {
    RoleMessage.dropLegacyIndexes().catch(() => {});
  });
}

module.exports = RoleMessage;

