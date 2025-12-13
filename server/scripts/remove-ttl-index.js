/**
 * Migration Script: Remove TTL Index from Users Collection
 * 
 * This script removes the problematic TTL index on refreshTokens.createdAt
 * that was causing entire User documents to be deleted after 7 days.
 * 
 * Run this script ONCE after updating the User model.
 * 
 * Usage: node server/scripts/remove-ttl-index.js
 */

const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/ab_V2';

async function removeTTLIndex() {
    try {
        console.log('='.repeat(60));
        console.log('TTL Index Removal Script');
        console.log('='.repeat(60));
        console.log('');
        console.log('Connecting to MongoDB...');
        
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB');
        
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        
        // List all indexes on the users collection
        console.log('\nCurrent indexes on users collection:');
        const indexes = await usersCollection.indexes();
        
        let ttlIndexFound = false;
        let ttlIndexName = null;
        
        for (const index of indexes) {
            console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
            if (index.expireAfterSeconds !== undefined) {
                console.log(`    ⚠️  TTL Index found! expireAfterSeconds: ${index.expireAfterSeconds}`);
                ttlIndexFound = true;
                ttlIndexName = index.name;
            }
        }
        
        if (ttlIndexFound && ttlIndexName) {
            console.log(`\n🔧 Dropping TTL index: ${ttlIndexName}`);
            await usersCollection.dropIndex(ttlIndexName);
            console.log('✓ TTL index removed successfully!');
            
            // Verify the index was removed
            console.log('\nVerifying indexes after removal:');
            const updatedIndexes = await usersCollection.indexes();
            for (const index of updatedIndexes) {
                console.log(`  - ${index.name}: ${JSON.stringify(index.key)}`);
                if (index.expireAfterSeconds !== undefined) {
                    console.log(`    ⚠️  WARNING: TTL Index still exists!`);
                }
            }
        } else {
            console.log('\n✓ No TTL index found on users collection. Nothing to remove.');
        }
        
        // Count current users to verify database is intact
        const userCount = await usersCollection.countDocuments();
        console.log(`\n📊 Current user count: ${userCount}`);
        
        console.log('\n' + '='.repeat(60));
        console.log('Script completed successfully!');
        console.log('='.repeat(60));
        console.log('\n⚠️  IMPORTANT: Make sure you have also updated the User model');
        console.log('   to remove the "expires: 604800" from refreshTokens.createdAt');
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

if (require.main === module) {
    removeTTLIndex().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { removeTTLIndex };
