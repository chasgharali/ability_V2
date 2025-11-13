class LiveStatsStore {
    constructor() {
        this.onlineUsers = new Map(); // userId -> user info
        this.callParticipants = new Map(); // userId -> participant info
    }

    userConnected(user) {
        if (!user) return;
        const userId = user._id ? user._id.toString() : user.id || user.userId;
        if (!userId) return;

        const now = new Date();
        this.onlineUsers.set(userId, {
            userId,
            name: user.name,
            email: user.email,
            role: user.role,
            assignedBooth: user.assignedBooth ? user.assignedBooth.toString() : null,
            connectedAt: now,
            lastOnline: now
        });
    }

    userDisconnected(userId) {
        if (!userId) return;
        this.callParticipants.delete(userId.toString());
        this.onlineUsers.delete(userId.toString());
    }

    userJoinedCall({ sessionId, boothId, eventId }, user) {
        if (!user) return;
        const userId = user._id ? user._id.toString() : user.userId;
        if (!userId || !sessionId) return;

        this.callParticipants.set(userId, {
            userId,
            sessionId: sessionId.toString(),
            name: user.name,
            role: user.role,
            email: user.email,
            assignedBooth: user.assignedBooth ? user.assignedBooth.toString() : null,
            boothId: boothId ? boothId.toString() : null,
            eventId: eventId ? eventId.toString() : null,
            joinedAt: new Date()
        });
    }

    userLeftCall(userId) {
        if (!userId) return;
        this.callParticipants.delete(userId.toString());
    }

    getOnlineUsers() {
        return Array.from(this.onlineUsers.values());
    }

    getCallParticipants() {
        return Array.from(this.callParticipants.values());
    }
}

module.exports = new LiveStatsStore();

