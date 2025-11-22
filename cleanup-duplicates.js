const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

async function cleanupDuplicates() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(NEW_DB_URI);
        console.log('Connected successfully!');
        
        const db = mongoose.connection.db;
        
        // Find and remove duplicate "unnamed-event" entries, keeping only one
        console.log('\nCleaning up duplicate unnamed-event entries...');
        const unnamedEvents = await db.collection('events').find({ slug: 'unnamed-event' }).toArray();
        console.log(`Found ${unnamedEvents.length} unnamed-event entries`);
        
        if (unnamedEvents.length > 1) {
            // Keep the first one, delete the rest
            const idsToDelete = unnamedEvents.slice(1).map(e => e._id);
            const deleteResult = await db.collection('events').deleteMany({
                _id: { $in: idsToDelete }
            });
            console.log(`Deleted ${deleteResult.deletedCount} duplicate entries`);
        }
        
        // Clean up booths without valid eventId
        console.log('\nCleaning up booths without valid eventId...');
        const boothsWithoutEvent = await db.collection('booths').find({ eventId: null }).toArray();
        console.log(`Found ${boothsWithoutEvent.length} booths without eventId`);
        
        if (boothsWithoutEvent.length > 0) {
            const deleteResult = await db.collection('booths').deleteMany({ eventId: null });
            console.log(`Deleted ${deleteResult.deletedCount} booths`);
        }
        
        console.log('\nCleanup complete!');
        
    } catch (error) {
        console.error('Cleanup error:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('Disconnected from database');
    }
}

if (require.main === module) {
    cleanupDuplicates().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { cleanupDuplicates };

