const mongoose = require('mongoose');
const BoothQueue = require('../models/BoothQueue');
const logger = require('./logger');
const { getIO } = require('../socket/socketHandler');

/** Substrings in MongoDB/Mongoose errors that indicate a temporary connectivity issue (log at warn, retry next interval). */
const TRANSIENT_DB_ERROR_PATTERNS = [
    'buffering timed out',
    'ECONNRESET',
    'ECONNREFUSED',
    'ETIMEDOUT',
    'ENOTFOUND',
    'getaddrinfo',
    'server monitor timeout',
    'interrupted due to server monitor',
    "Socket 'secureConnect'",
];

function isTransientMongoError(err) {
    const msg = String(err?.message || '');
    if (TRANSIENT_DB_ERROR_PATTERNS.some((p) => msg.includes(p))) {
        return true;
    }
    return msg.includes('timed out') && (msg.includes('connection') || msg.includes('Socket'));
}

/**
 * Clean up stale queue entries
 * Runs periodically to remove entries where users have truly disconnected
 * Note: We use a 5-hour timeout to allow job seekers to wait for extended periods
 * They will only be removed if they explicitly leave, join a meeting, or are inactive for 5+ hours
 */
const cleanupStaleQueueEntries = async () => {
    try {
        if (mongoose.connection.readyState !== 1) {
            const rs = mongoose.connection.readyState;
            if (process.env.NODE_ENV === 'production') {
                logger.warn(`Queue cleanup skipped: MongoDB not connected (readyState=${rs})`);
            } else {
                logger.debug(`Queue cleanup skipped: MongoDB not connected (readyState=${rs})`);
            }
            return;
        }

        // Use 5 hours - job seekers can wait up to 5 hours before being considered inactive
        // Only clean up entries that are truly abandoned (no activity for 5+ hours)
        const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);

        // Find stale entries (waiting status, no activity for 5+ hours)
        const staleEntries = await BoothQueue.find({
            status: 'waiting',
            lastActivity: { $lt: fiveHoursAgo }
        }).populate('jobSeeker', 'name email');

        if (staleEntries.length > 0) {
            logger.info(`Found ${staleEntries.length} stale queue entries to clean up`);

            const io = getIO();

            for (const entry of staleEntries) {
                // Mark as left
                await entry.leaveQueue();

                // Notify booth management
                const updateData = {
                    boothId: entry.booth,
                    action: 'left',
                    queueEntry: {
                        _id: entry._id,
                        jobSeeker: entry.jobSeeker,
                        position: entry.position,
                        status: 'left'
                    }
                };
                io.to(`booth_${entry.booth}`).emit('queue-updated', updateData);
                io.to(`booth_management_${entry.booth}`).emit('queue-updated', updateData);

                logger.info(`Auto-cleaned stale queue entry for user ${entry.jobSeeker.email} in booth ${entry.booth}`);
            }
        }
    } catch (error) {
        if (isTransientMongoError(error)) {
            logger.warn(`Queue cleanup deferred (database unavailable): ${error.message}`);
        } else {
            logger.error('Queue cleanup error:', error);
        }
    }
};

/**
 * Start the periodic cleanup job
 */
const startQueueCleanup = () => {
    // Run cleanup every 15 minutes (less frequent)
    setInterval(cleanupStaleQueueEntries, 15 * 60 * 1000);
    logger.info('Queue cleanup job started - running every 15 minutes');
};

module.exports = {
    cleanupStaleQueueEntries,
    startQueueCleanup
};
