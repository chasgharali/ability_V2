const mongoose = require('mongoose');
const BoothQueue = require('../models/BoothQueue');
const logger = require('../utils/logger');

async function fixQueueIndex() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ab_V2');
        
        console.log('Dropping existing unique index...');
        try {
            await BoothQueue.collection.dropIndex('jobSeeker_1_booth_1');
            console.log('✓ Dropped old unique index');
        } catch (error) {
            if (error.code === 27) {
                console.log('✓ Index already doesn\'t exist');
            } else {
                console.log('Warning: Could not drop index:', error.message);
            }
        }
        
        console.log('Creating new partial unique index...');
        await BoothQueue.collection.createIndex(
            { jobSeeker: 1, booth: 1 }, 
            { 
                unique: true, 
                partialFilterExpression: { status: { $in: ['waiting', 'invited', 'in_meeting'] } },
                name: 'jobSeeker_1_booth_1_partial'
            }
        );
        console.log('✓ Created new partial unique index');
        
        console.log('Cleaning up any duplicate active entries...');
        const duplicates = await BoothQueue.aggregate([
            {
                $match: {
                    status: { $in: ['waiting', 'invited', 'in_meeting'] }
                }
            },
            {
                $group: {
                    _id: { jobSeeker: '$jobSeeker', booth: '$booth' },
                    entries: { $push: '$$ROOT' },
                    count: { $sum: 1 }
                }
            },
            {
                $match: { count: { $gt: 1 } }
            }
        ]);
        
        for (const duplicate of duplicates) {
            // Keep the most recent entry, mark others as 'left'
            const entries = duplicate.entries.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const toKeep = entries[0];
            const toRemove = entries.slice(1);
            
            console.log(`Found duplicate entries for user ${duplicate._id.jobSeeker} in booth ${duplicate._id.booth}`);
            console.log(`Keeping entry ${toKeep._id}, removing ${toRemove.length} others`);
            
            for (const entry of toRemove) {
                await BoothQueue.findByIdAndUpdate(entry._id, {
                    status: 'left',
                    leftAt: new Date()
                });
            }
        }
        
        console.log('✓ Queue index migration completed successfully');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

// Load environment variables
require('dotenv').config();

fixQueueIndex();
