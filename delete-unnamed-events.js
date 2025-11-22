const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

async function deleteUnnamedEvents() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(NEW_DB_URI, {
            serverSelectionTimeoutMS: 60000,
            socketTimeoutMS: 60000
        });
        console.log('Connected successfully!');
        
        const db = mongoose.connection.db;
        
        const unnamedEvents = await db.collection('events').find({ 
            name: 'Unnamed Event' 
        }).toArray();
        
        console.log('Found ' + unnamedEvents.length + ' unnamed events');
        
        if (unnamedEvents.length > 0) {
            console.log('\nDeleting unnamed events...');
            
            for (const event of unnamedEvents) {
                console.log('  - Deleting event: ' + event._id + ' (slug: ' + event.slug + ')');
                
                const boothsResult = await db.collection('booths').deleteMany({ eventId: event._id });
                if (boothsResult.deletedCount > 0) {
                    console.log('    Deleted ' + boothsResult.deletedCount + ' associated booths');
                }
                
                await db.collection('events').deleteOne({ _id: event._id });
            }
            
            console.log('\nDeleted ' + unnamedEvents.length + ' unnamed events');
        }
        
        console.log('\n=== Updated Database Counts ===');
        const eventCount = await db.collection('events').countDocuments();
        const boothCount = await db.collection('booths').countDocuments();
        
        console.log('Events: ' + eventCount);
        console.log('Booths: ' + boothCount);
        
        console.log('\nCleanup complete!');
        
    } catch (error) {
        console.error('Cleanup error:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from database');
    }
}

if (require.main === module) {
    deleteUnnamedEvents().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { deleteUnnamedEvents };
