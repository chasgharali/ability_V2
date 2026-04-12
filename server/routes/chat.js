const express = require('express');
const router = express.Router();
const { authenticateToken } = require('../middleware/auth');
const Chat = require('../models/Chat');
const Message = require('../models/Message');
const User = require('../models/User');
const Booth = require('../models/Booth');
const { getIO } = require('../socket/socketHandler');

// Get all chats for current user
router.get('/', authenticateToken, async (req, res) => {
    try {
        const chats = await Chat.findUserChats(req.user._id);

        const dedupeDirectChats = (chatList) => {
            const directChatsMap = new Map();
            const nonDirectChats = [];

            chatList.forEach(chat => {
                if (chat.type !== 'direct') {
                    nonDirectChats.push(chat);
                    return;
                }

                // Find the "other" participant, skipping any malformed/null entries
                const otherParticipant = (chat.participants || []).find(participant =>
                    participant &&
                    participant.user &&
                    participant.user._id &&
                    participant.user._id.toString() !== req.user._id.toString()
                );

                if (!otherParticipant || !otherParticipant.user || !otherParticipant.user._id) {
                    // Skip chats that don't have a valid second participant (legacy/invalid data)
                    return;
                }

                const key = otherParticipant.user._id.toString();
                const existingChat = directChatsMap.get(key);

                if (!existingChat || new Date(chat.updatedAt) > new Date(existingChat.updatedAt)) {
                    directChatsMap.set(key, chat);
                }
            });

            return [
                ...nonDirectChats,
                ...Array.from(directChatsMap.values())
            ].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
        };

        // Get unread count for each chat
        const chatsWithUnread = await Promise.all(
            chats.map(async (chat) => {
                const unreadCount = await chat.getUnreadCount(req.user._id);
                return {
                    ...chat.toObject(),
                    unreadCount
                };
            })
        );

        res.json(dedupeDirectChats(chatsWithUnread));
    } catch (error) {
        console.error('Error fetching chats:', error);
        res.status(500).json({ message: 'Failed to fetch chats', error: error.message });
    }
});

// Get available chat participants based on user role and booth
router.get('/participants', authenticateToken, async (req, res) => {
    try {
        const currentUser = await User.findById(req.user._id).populate('assignedBooth');
        const participants = [];

        // Define roles that can chat
        const chatEnabledRoles = ['Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport', 'Admin', 'BoothAdmin', 'JobSeeker'];

        if (!chatEnabledRoles.includes(currentUser.role)) {
            return res.status(403).json({ message: 'Your role does not have chat access' });
        }

        // Global Support can reach users in the same event only
        if (currentUser.role === 'GlobalSupport') {
            // Get the GlobalSupport user's assigned event
            const gsUser = await User.findById(req.user._id);
            const gsEventId = gsUser.assignedEvents?.[0]?.toString();

            if (!gsEventId) {
                return res.json([]); // No event assigned = no chat participants
            }

            // Find all booths assigned to this event
            const eventBooths = await Booth.find({
                $or: [{ eventId: gsEventId }, { events: gsEventId }]
            }).select('_id');
            const boothIds = eventBooths.map(b => b._id);

            // Get booth-based users from those booths
            // For Recruiters, additionally filter by their assignedEvents matching the GS event
            // Support/Interpreter don't have individual event assignments, so booth membership is enough
            const boothUsers = await User.find({
                assignedBooth: { $in: boothIds },
                isActive: true,
                _id: { $ne: currentUser._id },
                $or: [
                    { role: { $in: ['Support', 'Interpreter'] } },
                    { role: 'Recruiter', assignedEvents: gsEventId }
                ]
            })
            .select('name email avatarUrl role assignedBooth')
            .populate('assignedBooth', 'name company');

            // Get other GlobalSupport and GlobalInterpreter users in the same event
            const globalUsers = await User.find({
                role: { $in: ['GlobalSupport', 'GlobalInterpreter'] },
                assignedEvents: gsEventId,
                isActive: true,
                _id: { $ne: currentUser._id }
            })
            .select('name email avatarUrl role assignedBooth')
            .populate('assignedBooth', 'name company');

            return res.json([...boothUsers, ...globalUsers]);
        }

        // Global Interpreter – event-scoped: show Recruiters and global roles in same events
        if (currentUser.role === 'GlobalInterpreter') {
            const giUser = await User.findById(req.user._id);
            const giEventIds = (giUser.assignedEvents || []).map(e => e.toString());
            if (giEventIds.length === 0) return res.json([]);

            // Find booths in the same events
            const eventBooths = await Booth.find({
                $or: [{ eventId: { $in: giEventIds } }, { events: { $in: giEventIds } }]
            }).select('_id');
            const boothIds = eventBooths.map(b => b._id);

            // Get Recruiters from those booths who share events
            const recruiters = await User.find({
                assignedBooth: { $in: boothIds },
                role: 'Recruiter',
                assignedEvents: { $in: giEventIds },
                isActive: true,
                _id: { $ne: currentUser._id }
            }).select('name email avatarUrl role assignedBooth').populate('assignedBooth', 'name company');

            // Get GlobalSupport and GlobalInterpreter in same events
            const globalUsers = await User.find({
                role: { $in: ['GlobalSupport', 'GlobalInterpreter'] },
                assignedEvents: { $in: giEventIds },
                isActive: true,
                _id: { $ne: currentUser._id }
            }).select('name email avatarUrl role assignedBooth');

            return res.json([...recruiters, ...globalUsers]);
        }

        // For booth-specific roles (Recruiter, Interpreter, Support)
        if (['Recruiter', 'Interpreter', 'Support'].includes(currentUser.role) && currentUser.assignedBooth) {
            // Get all users in the same booth
            const boothUsers = await User.find({
                assignedBooth: currentUser.assignedBooth._id,
                role: { $in: ['Recruiter', 'Interpreter', 'Support'] },
                isActive: true,
                _id: { $ne: currentUser._id }
            })
            .select('name email avatarUrl role assignedBooth')
            .populate('assignedBooth', 'name company');

            participants.push(...boothUsers);
        }

        // Add event-matched global support and global interpreters
        if (['Recruiter', 'BoothAdmin'].includes(currentUser.role)) {
            // Recruiter/BoothAdmin have individual assignedEvents - use those for matching
            const userData = await User.findById(currentUser._id).select('assignedEvents');
            const userEventIds = (userData?.assignedEvents || []).map(e => e.toString());

            const globalUsers = await User.find({
                role: { $in: ['GlobalInterpreter', 'GlobalSupport'] },
                assignedEvents: { $in: userEventIds },
                isActive: true,
                _id: { $ne: currentUser._id }
            }).select('name email avatarUrl role');
            participants.push(...globalUsers);
        } else if (currentUser.assignedBooth) {
            // Support/Interpreter: use booth events for matching
            const currentBooth = await Booth.findById(currentUser.assignedBooth._id).select('events eventId');
            const boothEventIds = [...(currentBooth?.events || []).map(e => e.toString())];
            if (currentBooth?.eventId) boothEventIds.push(currentBooth.eventId.toString());

            const globalUsers = await User.find({
                role: { $in: ['GlobalInterpreter', 'GlobalSupport'] },
                assignedEvents: { $in: boothEventIds },
                isActive: true,
                _id: { $ne: currentUser._id }
            }).select('name email avatarUrl role');
            participants.push(...globalUsers);
        }
        // No booth + not Recruiter/BoothAdmin = no event context, so no GlobalSupport or GlobalInterpreter

        // Remove duplicates based on _id
        const uniqueParticipants = participants.filter((user, index, self) =>
            index === self.findIndex((u) => u._id.toString() === user._id.toString())
        );

        res.json(uniqueParticipants);
    } catch (error) {
        console.error('Error fetching participants:', error);
        res.status(500).json({ message: 'Failed to fetch participants', error: error.message });
    }
});

// Create or get direct chat
router.post('/direct', authenticateToken, async (req, res) => {
    try {
        const { participantId } = req.body;

        if (!participantId) {
            return res.status(400).json({ message: 'Participant ID is required' });
        }

        // Verify participant exists
        const participant = await User.findById(participantId);
        if (!participant) {
            return res.status(404).json({ message: 'Participant not found' });
        }

        const chat = await Chat.findOrCreateDirectChat(req.user._id, participantId);
        const unreadCount = await chat.getUnreadCount(req.user._id);

        res.json({
            ...chat.toObject(),
            unreadCount
        });
    } catch (error) {
        console.error('Error creating/getting direct chat:', error);
        res.status(500).json({ message: 'Failed to create/get chat', error: error.message });
    }
});

// Create group chat (booth or event-based)
router.post('/group', authenticateToken, async (req, res) => {
    try {
        const { name, participantIds, boothId, eventId } = req.body;

        if (!name || !participantIds || !Array.isArray(participantIds) || participantIds.length === 0) {
            return res.status(400).json({ message: 'Name and participant IDs are required' });
        }

        // Add current user to participants
        if (!participantIds.includes(req.user._id.toString())) {
            participantIds.push(req.user._id.toString());
        }

        // Verify all participants exist
        const users = await User.find({ _id: { $in: participantIds } });
        if (users.length !== participantIds.length) {
            return res.status(400).json({ message: 'One or more participants not found' });
        }

        const participants = users.map(user => ({
            user: user._id,
            role: user.role
        }));

        const chat = await Chat.create({
            name,
            type: boothId ? 'booth' : 'group',
            participants,
            booth: boothId || null,
            event: eventId || null
        });

        const populatedChat = await Chat.findById(chat._id)
            .populate('participants.user', 'name email avatarUrl role')
            .populate('booth', 'name company logoUrl')
            .populate('event', 'name');

        res.status(201).json(populatedChat);
    } catch (error) {
        console.error('Error creating group chat:', error);
        res.status(500).json({ message: 'Failed to create group chat', error: error.message });
    }
});

// Broadcast a message to all users in GlobalSupport's assigned event
router.post('/broadcast-event', authenticateToken, async (req, res) => {
    try {
        if (req.user.role !== 'GlobalSupport') {
            return res.status(403).json({ message: 'Only GlobalSupport can broadcast event messages' });
        }

        const { content } = req.body;
        const trimmedContent = (content || '').trim();
        if (!trimmedContent) {
            return res.status(400).json({ message: 'Broadcast message is required' });
        }

        const gsUser = await User.findById(req.user._id).select('assignedEvents');
        const eventId = gsUser?.assignedEvents?.[0]?.toString();
        if (!eventId) {
            return res.status(400).json({ message: 'GlobalSupport user is not assigned to an event' });
        }

        const eventBooths = await Booth.find({
            $or: [{ eventId }, { events: eventId }]
        }).select('_id');
        const boothIds = eventBooths.map(booth => booth._id);

        const recipientUsers = await User.find({
            isActive: true,
            _id: { $ne: req.user._id },
            $or: [
                { assignedBooth: { $in: boothIds } },
                { assignedEvents: eventId }
            ]
        }).select('_id role');

        const participantIdSet = new Set([
            req.user._id.toString(),
            ...recipientUsers.map(user => user._id.toString())
        ]);
        const participantIds = Array.from(participantIdSet);

        const participantUsers = await User.find({ _id: { $in: participantIds } }).select('_id role');
        const participants = participantUsers.map(user => ({
            user: user._id,
            role: user.role
        }));

        let chat = await Chat.findOne({
            type: 'group',
            isActive: true,
            'metadata.broadcastType': 'event',
            'metadata.broadcastEventId': eventId
        });

        if (!chat) {
            chat = await Chat.create({
                name: 'Event Broadcast',
                type: 'group',
                participants,
                event: eventId,
                metadata: {
                    broadcastType: 'event',
                    broadcastEventId: eventId,
                    createdBy: req.user._id
                }
            });
        } else {
            // Keep participants up to date as users are added/removed from event context.
            chat.participants = participants;
        }

        const message = await Message.create({
            chat: chat._id,
            sender: req.user._id,
            content: trimmedContent,
            type: 'text',
            metadata: {
                isBroadcast: true,
                broadcastType: 'event',
                broadcastEventId: eventId
            }
        });

        chat.lastMessage = {
            content: trimmedContent.substring(0, 100),
            sender: req.user._id,
            timestamp: message.createdAt
        };
        await chat.save();

        const populatedChat = await Chat.findById(chat._id)
            .populate({
                path: 'participants.user',
                select: 'name email avatarUrl role assignedBooth',
                populate: {
                    path: 'assignedBooth',
                    select: 'name company'
                }
            })
            .populate('booth', 'name company logoUrl')
            .populate('event', 'name');

        const populatedMessage = await Message.findById(message._id)
            .populate({
                path: 'sender',
                select: 'name email avatarUrl role assignedBooth',
                populate: {
                    path: 'assignedBooth',
                    select: 'name company'
                }
            });

        // Real-time delivery: active chat participants get new-message; others get notification.
        try {
            const io = getIO();
            io.to(`chat:${chat._id}`).emit('new-message', {
                chatId: chat._id.toString(),
                message: populatedMessage
            });

            participantIds
                .filter(id => id !== req.user._id.toString())
                .forEach((userId) => {
                    io.to(`user:${userId}`).emit('chat-notification', {
                        chatId: chat._id.toString(),
                        message: populatedMessage,
                        unreadCount: 1,
                        chat: populatedChat
                    });
                });
        } catch (socketError) {
            console.error('Broadcast socket delivery warning:', socketError.message);
        }

        res.status(201).json({
            chat: populatedChat,
            message: populatedMessage,
            recipientsCount: participantIds.length - 1
        });
    } catch (error) {
        console.error('Error broadcasting event message:', error);
        res.status(500).json({ message: 'Failed to broadcast event message', error: error.message });
    }
});

// Get messages for a chat
router.get('/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, skip = 0 } = req.query;

        // Verify user is participant in chat
        const chat = await Chat.findOne({
            _id: chatId,
            'participants.user': req.user._id
        });

        if (!chat) {
            return res.status(403).json({ message: 'You are not a participant in this chat' });
        }

        const messages = await Message.getChatMessages(chatId, parseInt(limit), parseInt(skip));

        // Update last read timestamp
        await chat.updateLastRead(req.user._id);

        res.json(messages.reverse()); // Reverse to show oldest first
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Failed to fetch messages', error: error.message });
    }
});

// Send message
router.post('/:chatId/messages', authenticateToken, async (req, res) => {
    try {
        const { chatId } = req.params;
        const { content, type = 'text', fileUrl, fileName, fileSize } = req.body;

        if (!content) {
            return res.status(400).json({ message: 'Message content is required' });
        }

        // Verify user is participant in chat
        const chat = await Chat.findOne({
            _id: chatId,
            'participants.user': req.user._id
        });

        if (!chat) {
            return res.status(403).json({ message: 'You are not a participant in this chat' });
        }

        const message = await Message.create({
            chat: chatId,
            sender: req.user._id,
            content,
            type,
            fileUrl,
            fileName,
            fileSize
        });

        const populatedMessage = await Message.findById(message._id)
            .populate({
                path: 'sender',
                select: 'name email avatarUrl role assignedBooth',
                populate: {
                    path: 'assignedBooth',
                    select: 'name company'
                }
            });

        // Update chat's last message
        chat.lastMessage = {
            content: content.substring(0, 100),
            sender: req.user._id,
            timestamp: message.createdAt
        };
        await chat.save();

        res.status(201).json(populatedMessage);
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Failed to send message', error: error.message });
    }
});

// Mark message as read
router.put('/messages/:messageId/read', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const message = await Message.markAsRead(messageId, req.user._id);

        if (!message) {
            return res.status(404).json({ message: 'Message not found' });
        }

        res.json({ message: 'Message marked as read' });
    } catch (error) {
        console.error('Error marking message as read:', error);
        res.status(500).json({ message: 'Failed to mark message as read', error: error.message });
    }
});

// Edit message
router.put('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;
        const { content } = req.body;

        if (!content) {
            return res.status(400).json({ message: 'Message content is required' });
        }

        const message = await Message.findOne({
            _id: messageId,
            sender: req.user._id,
            isDeleted: false
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found or you do not have permission to edit it' });
        }

        message.content = content;
        await message.markAsEdited();

        const populatedMessage = await Message.findById(message._id)
            .populate({
                path: 'sender',
                select: 'name email avatarUrl role assignedBooth',
                populate: {
                    path: 'assignedBooth',
                    select: 'name company'
                }
            });

        res.json(populatedMessage);
    } catch (error) {
        console.error('Error editing message:', error);
        res.status(500).json({ message: 'Failed to edit message', error: error.message });
    }
});

// Delete message
router.delete('/messages/:messageId', authenticateToken, async (req, res) => {
    try {
        const { messageId } = req.params;

        const message = await Message.findOne({
            _id: messageId,
            sender: req.user._id,
            isDeleted: false
        });

        if (!message) {
            return res.status(404).json({ message: 'Message not found or you do not have permission to delete it' });
        }

        await message.softDelete();

        res.json({ message: 'Message deleted successfully' });
    } catch (error) {
        console.error('Error deleting message:', error);
        res.status(500).json({ message: 'Failed to delete message', error: error.message });
    }
});

module.exports = router;
