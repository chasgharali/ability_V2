class LiveStatsStore {
    constructor() {
        this.onlineUsers = new Map(); // userId -> user info
        this.callParticipants = new Map(); // userId -> participant info
        this.interpreterStatuses = new Map(); // userId -> status (online, away, busy)
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

        // If interpreter, set default status to 'online'
        if (user.role === 'Interpreter' || user.role === 'GlobalInterpreter') {
            if (!this.interpreterStatuses.has(userId)) {
                this.interpreterStatuses.set(userId, 'online');
            }
        }
    }

    userDisconnected(userId) {
        if (!userId) return;
        this.callParticipants.delete(userId.toString());
        this.onlineUsers.delete(userId.toString());
        this.interpreterStatuses.delete(userId.toString());
    }

    // Interpreter status management
    setInterpreterStatus(userId, status) {
        if (!userId) return false;
        const validStatuses = ['online', 'away', 'busy'];
        if (!validStatuses.includes(status)) return false;
        
        this.interpreterStatuses.set(userId.toString(), status);
        return true;
    }

    getInterpreterStatus(userId) {
        if (!userId) return null;
        return this.interpreterStatuses.get(userId.toString()) || null;
    }

    getAllInterpreterStatuses() {
        return Object.fromEntries(this.interpreterStatuses);
    }

    isInterpreterAvailable(userId) {
        if (!userId) return false;
        const status = this.interpreterStatuses.get(userId.toString());
        // Must be online (in the store) AND have 'online' status (not away or busy)
        return this.onlineUsers.has(userId.toString()) && status === 'online';
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

