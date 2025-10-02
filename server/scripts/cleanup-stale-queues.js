const mongoose = require('mongoose');
const BoothQueue = require('../models/BoothQueue');

async function cleanupStaleQueues() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ab_V2');
        
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        
        console.log('Finding stale queue entries...');
        const staleEntries = await BoothQueue.find({
            status: { $in: ['waiting', 'invited'] },
            $or: [
                { lastActivity: { $lt: thirtyMinutesAgo } },
                { lastActivity: { $exists: false }, createdAt: { $lt: thirtyMinutesAgo } }
            ]
        }).populate('jobSeeker', 'name email');
        
        console.log(`Found ${staleEntries.length} stale queue entries`);
        
        for (const entry of staleEntries) {
            console.log(`Cleaning up entry for ${entry.jobSeeker?.email || 'unknown'} in booth ${entry.booth}`);
            await entry.leaveQueue();
        }
        
        console.log('✓ Cleanup completed');
        
    } catch (error) {
        console.error('Cleanup failed:', error);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Load environment variables
require('dotenv').config();

cleanupStaleQueues();
