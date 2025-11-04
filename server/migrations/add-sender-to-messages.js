const mongoose = require('mongoose');
const BoothQueue = require('../models/BoothQueue');
require('dotenv').config();

async function migrateSenderField() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability-job-fair');
        console.log('Connected to MongoDB');

        // Find all queue entries with messages
        const queueEntries = await BoothQueue.find({ 'messages.0': { $exists: true } });
        console.log(`Found ${queueEntries.length} queue entries with messages`);

        let updatedCount = 0;
        for (const entry of queueEntries) {
            let needsUpdate = false;

            // Check each message for missing sender field
            entry.messages.forEach(message => {
                if (!message.sender) {
                    message.sender = 'jobseeker'; // Default to jobseeker for old messages
                    needsUpdate = true;
                }
            });

            if (needsUpdate) {
                await entry.save();
                updatedCount++;
                console.log(`Updated queue entry ${entry._id}`);
            }
        }

        console.log(`\nMigration complete! Updated ${updatedCount} queue entries.`);
        process.exit(0);
    } catch (error) {
        console.error('Migration error:', error);
        process.exit(1);
    }
}

migrateSenderField();
