const BoothQueue = require('../models/BoothQueue');
const logger = require('./logger');
const { getIO } = require('../socket/socketHandler');

/**
 * Clean up stale queue entries
 * Runs periodically to remove entries where users have disconnected
 */
const cleanupStaleQueueEntries = async () => {
    try {
        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        
        // Find stale entries (waiting status, no activity for 10+ minutes)
        const staleEntries = await BoothQueue.find({
            status: 'waiting',
            lastActivity: { $lt: tenMinutesAgo }
        }).populate('jobSeeker', 'name email');

        if (staleEntries.length > 0) {
            logger.info(`Found ${staleEntries.length} stale queue entries to clean up`);
            
            const io = getIO();
            
            for (const entry of staleEntries) {
                // Mark as left
                await entry.leaveQueue();
                
                // Notify booth management
                io.to(`booth_${entry.booth}`).emit('queue-updated', {
                    type: 'left',
                    queueEntry: {
                        _id: entry._id,
                        jobSeeker: entry.jobSeeker,
                        position: entry.position,
                        status: 'left'
                    }
                });
                
                logger.info(`Auto-cleaned stale queue entry for user ${entry.jobSeeker.email} in booth ${entry.booth}`);
            }
        }
    } catch (error) {
        logger.error('Queue cleanup error:', error);
    }
};

/**
 * Start the periodic cleanup job
 */
const startQueueCleanup = () => {
    // Run cleanup every 5 minutes
    setInterval(cleanupStaleQueueEntries, 5 * 60 * 1000);
    logger.info('Queue cleanup job started - running every 5 minutes');
};

module.exports = {
    cleanupStaleQueueEntries,
    startQueueCleanup
};
