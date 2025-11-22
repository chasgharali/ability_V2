const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

async function resetMigration() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(NEW_DB_URI, {
            serverSelectionTimeoutMS: 60000,
            socketTimeoutMS: 60000
        });
        console.log('Connected successfully!');
        
        const db = mongoose.connection.db;
        
        console.log('\nDeleting unnamed-event entries...');
        const eventsResult = await db.collection('events').deleteMany({ slug: 'unnamed-event' });
        console.log('Deleted ' + eventsResult.deletedCount + ' unnamed-event entries');
        
        console.log('\nDeleting Unnamed Booth entries...');
        const boothsResult = await db.collection('booths').deleteMany({ name: 'Unnamed Booth' });
        console.log('Deleted ' + boothsResult.deletedCount + ' Unnamed Booth entries');
        
        console.log('\nDeleting booths without eventId...');
        const orphanedBoothsResult = await db.collection('booths').deleteMany({ eventId: null });
        console.log('Deleted ' + orphanedBoothsResult.deletedCount + ' orphaned booths');
        
        console.log('\n=== Current Database Counts ===');
        const userCount = await db.collection('users').countDocuments();
        const eventCount = await db.collection('events').countDocuments();
        const boothCount = await db.collection('booths').countDocuments();
        const chatCount = await db.collection('chats').countDocuments();
        
        console.log('Users: ' + userCount);
        console.log('Events: ' + eventCount);
        console.log('Booths: ' + boothCount);
        console.log('Chats: ' + chatCount);
        
        console.log('\nReset complete! Now you can run: node migrate-db.js');
        
    } catch (error) {
        console.error('Reset error:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from database');
    }
}

if (require.main === module) {
    resetMigration().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { resetMigration };
