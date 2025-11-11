const mongoose = require('mongoose');

const chatSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    type: {
        type: String,
        enum: ['direct', 'group', 'booth'],
        default: 'direct'
    },
    participants: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
            required: true
        },
        role: {
            type: String,
            enum: ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'JobSeeker']
        },
        joinedAt: {
            type: Date,
            default: Date.now
        },
        lastRead: {
            type: Date,
            default: Date.now
        }
    }],
    booth: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Booth',
        default: null
    },
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        default: null
    },
    lastMessage: {
        content: String,
        sender: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        timestamp: Date
    },
    isActive: {
        type: Boolean,
        default: true
    },
    metadata: {
        type: mongoose.Schema.Types.Mixed,
        default: {}
    }
}, {
    timestamps: true
});

// Indexes for performance
chatSchema.index({ 'participants.user': 1 });
chatSchema.index({ booth: 1 });
chatSchema.index({ event: 1 });
chatSchema.index({ type: 1 });
chatSchema.index({ updatedAt: -1 });

// Static method to find chats for a user
chatSchema.statics.findUserChats = async function(userId) {
    return this.find({
        'participants.user': userId,
        isActive: true
    })
    .populate('participants.user', 'name email avatarUrl role')
    .populate('booth', 'name company logoUrl')
    .populate('event', 'name')
    .sort({ updatedAt: -1 });
};

// Static method to find or create direct chat between two users
chatSchema.statics.findOrCreateDirectChat = async function(user1Id, user2Id) {
    let chat = await this.findOne({
        type: 'direct',
        'participants.user': { $all: [user1Id, user2Id] },
        isActive: true
    })
    .populate('participants.user', 'name email avatarUrl role');

    if (!chat) {
        const User = mongoose.model('User');
        const [user1, user2] = await Promise.all([
            User.findById(user1Id),
            User.findById(user2Id)
        ]);

        chat = await this.create({
            name: `${user1.name} - ${user2.name}`,
            type: 'direct',
            participants: [
                { user: user1Id, role: user1.role },
                { user: user2Id, role: user2.role }
            ]
        });

        chat = await chat.populate('participants.user', 'name email avatarUrl role');
    }

    return chat;
};

// Instance method to add participant
chatSchema.methods.addParticipant = async function(userId, userRole) {
    if (!this.participants.some(p => p.user.toString() === userId.toString())) {
        this.participants.push({
            user: userId,
            role: userRole,
            joinedAt: new Date()
        });
        await this.save();
    }
    return this;
};

// Instance method to update last read timestamp
chatSchema.methods.updateLastRead = async function(userId) {
    const participant = this.participants.find(p => p.user.toString() === userId.toString());
    if (participant) {
        participant.lastRead = new Date();
        await this.save();
    }
    return this;
};

// Instance method to get unread count for a user
chatSchema.methods.getUnreadCount = async function(userId) {
    const Message = mongoose.model('Message');
    const participant = this.participants.find(p => p.user.toString() === userId.toString());
    
    if (!participant) return 0;

    const count = await Message.countDocuments({
        chat: this._id,
        timestamp: { $gt: participant.lastRead },
        sender: { $ne: userId }
    });

    return count;
};

module.exports = mongoose.model('Chat', chatSchema);
