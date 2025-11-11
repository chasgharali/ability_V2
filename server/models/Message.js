const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
    chat: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Chat',
        required: true,
        index: true
    },
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    content: {
        type: String,
        required: true,
        trim: true,
        maxlength: 5000
    },
    type: {
        type: String,
        enum: ['text', 'file', 'image', 'system'],
        default: 'text'
    },
    fileUrl: {
        type: String,
        default: null
    },
    fileName: {
        type: String,
        default: null
    },
    fileSize: {
        type: Number,
        default: null
    },
    readBy: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        readAt: {
            type: Date,
            default: Date.now
        }
    }],
    isEdited: {
        type: Boolean,
        default: false
    },
    editedAt: {
        type: Date,
        default: null
    },
    isDeleted: {
        type: Boolean,
        default: false
    },
    deletedAt: {
        type: Date,
        default: null
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for performance
messageSchema.index({ chat: 1, createdAt: -1 });
messageSchema.index({ sender: 1 });
messageSchema.index({ createdAt: -1 });

// Static method to get messages for a chat
messageSchema.statics.getChatMessages = async function(chatId, limit = 50, skip = 0) {
    return this.find({
        chat: chatId,
        isDeleted: false
    })
    .populate('sender', 'name email avatarUrl role')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Static method to mark message as read
messageSchema.statics.markAsRead = async function(messageId, userId) {
    const message = await this.findById(messageId);
    if (!message) return null;

    const alreadyRead = message.readBy.some(r => r.user.toString() === userId.toString());
    if (!alreadyRead) {
        message.readBy.push({
            user: userId,
            readAt: new Date()
        });
        await message.save();
    }

    return message;
};

// Instance method to mark as edited
messageSchema.methods.markAsEdited = async function() {
    this.isEdited = true;
    this.editedAt = new Date();
    await this.save();
    return this;
};

// Instance method to soft delete
messageSchema.methods.softDelete = async function() {
    this.isDeleted = true;
    this.deletedAt = new Date();
    await this.save();
    return this;
};

module.exports = mongoose.model('Message', messageSchema);
