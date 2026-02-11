/**
 * Migration Script: Move eventId to events array for booths
 * 
 * This script migrates existing booths from using a single eventId
 * to using the new events array for multi-event support.
 * 
 * Run this script once after deploying the updated Booth model.
 * 
 * Usage (from server directory):
 *   node migrate-booth-events.js
 * 
 * The script will:
 * 1. Find all booths with eventId but empty/missing events array
 * 2. Copy the eventId to the events array
 * 3. Keep eventId for backward compatibility
 */

require('dotenv').config();
const mongoose = require('mongoose');

// MongoDB connection
const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
    console.error('Error: MONGODB_URI environment variable is not set');
    console.error('Please ensure .env file exists with MONGODB_URI');
    process.exit(1);
}

async function migrateBoothEvents() {
    console.log('='.repeat(60));
    console.log('Booth Events Migration Script');
    console.log('='.repeat(60));
    console.log('');
    
    try {
        // Connect to MongoDB
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI);
        console.log('Connected to MongoDB successfully');
        console.log('');
        
        // Get the Booth collection directly (avoid loading model validation)
        const db = mongoose.connection.db;
        const boothsCollection = db.collection('booths');
        
        // Find booths that have eventId but no events array or empty events array
        const boothsToMigrate = await boothsCollection.find({
            eventId: { $exists: true, $ne: null },
            $or: [
                { events: { $exists: false } },
                { events: { $size: 0 } },
                { events: null }
            ]
        }).toArray();
        
        console.log(`Found ${boothsToMigrate.length} booths to migrate`);
        console.log('');
        
        if (boothsToMigrate.length === 0) {
            console.log('No booths need migration. All booths already have events array populated.');
            await mongoose.disconnect();
            return;
        }
        
        // Migrate each booth
        let successCount = 0;
        let errorCount = 0;
        
        for (const booth of boothsToMigrate) {
            try {
                const eventId = booth.eventId;
                
                // Update the booth: add eventId to events array
                const result = await boothsCollection.updateOne(
                    { _id: booth._id },
                    { 
                        $set: { 
                            events: [eventId] 
                        }
                    }
                );
                
                if (result.modifiedCount === 1) {
                    console.log(`✓ Migrated booth: ${booth.name || booth._id} (eventId: ${eventId})`);
                    successCount++;
                } else {
                    console.log(`✗ Failed to migrate booth: ${booth.name || booth._id}`);
                    errorCount++;
                }
            } catch (error) {
                console.error(`✗ Error migrating booth ${booth.name || booth._id}:`, error.message);
                errorCount++;
            }
        }
        
        console.log('');
        console.log('='.repeat(60));
        console.log('Migration Summary');
        console.log('='.repeat(60));
        console.log(`Total booths processed: ${boothsToMigrate.length}`);
        console.log(`Successfully migrated: ${successCount}`);
        console.log(`Failed: ${errorCount}`);
        console.log('');
        
        // Verify migration
        console.log('Verifying migration...');
        const remainingBooths = await boothsCollection.countDocuments({
            eventId: { $exists: true, $ne: null },
            $or: [
                { events: { $exists: false } },
                { events: { $size: 0 } },
                { events: null }
            ]
        });
        
        if (remainingBooths === 0) {
            console.log('✓ All booths have been successfully migrated!');
        } else {
            console.log(`✗ ${remainingBooths} booths still need migration`);
        }
        
        // Disconnect from MongoDB
        await mongoose.disconnect();
        console.log('');
        console.log('Disconnected from MongoDB');
        console.log('Migration complete!');
        
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}

// Run the migration
migrateBoothEvents();
