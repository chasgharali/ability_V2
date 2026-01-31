/**
 * Script to check and remove TTL indexes from Users collection
 * This will prevent automatic user deletion
 */

const mongoose = require('mongoose');
const path = require('path');

// Try to load dotenv from server directory
try {
    require('dotenv').config({ path: path.join(__dirname, 'server', '.env') });
} catch (e) {
    // If dotenv not available, try to read .env manually
    const fs = require('fs');
    const envPath = path.join(__dirname, 'server', '.env');
    if (fs.existsSync(envPath)) {
        const envContent = fs.readFileSync(envPath, 'utf8');
        envContent.split('\n').forEach(line => {
            const match = line.match(/^([^=:#]+)=(.*)$/);
            if (match) {
                const key = match[1].trim();
                const value = match[2].trim();
                if (!process.env[key]) {
                    process.env[key] = value;
                }
            }
        });
    }
}

const MONGODB_URI = process.env.MONGODB_URI;

async function checkAndFixIndexes() {
    try {
        console.log('='.repeat(70));
        console.log('USER COLLECTION INDEX CHECK & FIX');
        console.log('='.repeat(70));
        console.log('');
        console.log('MongoDB URI:', MONGODB_URI ? MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') : 'NOT SET');
        console.log('Connecting to MongoDB...');
        
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB successfully\n');
        
        const db = mongoose.connection.db;
        const usersCollection = db.collection('users');
        
        // Get current user count
        const userCount = await usersCollection.countDocuments();
        console.log(`📊 Current user count: ${userCount}\n`);
        
        // List all indexes
        console.log('Current indexes on users collection:');
        console.log('-'.repeat(70));
        const indexes = await usersCollection.indexes();
        
        let ttlIndexFound = false;
        let ttlIndexName = null;
        
        for (const index of indexes) {
            const hasExpiry = index.expireAfterSeconds !== undefined;
            const indicator = hasExpiry ? '⚠️  TTL INDEX' : '✓';
            
            console.log(`${indicator} ${index.name}`);
            console.log(`   Keys: ${JSON.stringify(index.key)}`);
            
            if (hasExpiry) {
                console.log(`   ⚠️  Expires After: ${index.expireAfterSeconds} seconds (${Math.round(index.expireAfterSeconds / 86400)} days)`);
                console.log(`   ⚠️  THIS INDEX WILL AUTOMATICALLY DELETE USER DOCUMENTS!`);
                ttlIndexFound = true;
                ttlIndexName = index.name;
            }
            console.log('');
        }
        
        console.log('='.repeat(70));
        
        // If TTL index found, offer to remove it
        if (ttlIndexFound && ttlIndexName) {
            console.log('\n🚨 CRITICAL ISSUE FOUND:');
            console.log(`   TTL index "${ttlIndexName}" will automatically delete users!`);
            console.log(`   This is what caused your admin user to be deleted.\n`);
            
            console.log(`🔧 Removing problematic TTL index: ${ttlIndexName}`);
            await usersCollection.dropIndex(ttlIndexName);
            console.log('✅ TTL index removed successfully!\n');
            
            // Verify removal
            console.log('Verifying indexes after removal:');
            console.log('-'.repeat(70));
            const updatedIndexes = await usersCollection.indexes();
            let stillHasTTL = false;
            
            for (const index of updatedIndexes) {
                const hasExpiry = index.expireAfterSeconds !== undefined;
                const indicator = hasExpiry ? '⚠️  TTL' : '✓';
                
                console.log(`${indicator} ${index.name}: ${JSON.stringify(index.key)}`);
                if (hasExpiry) {
                    stillHasTTL = true;
                    console.log(`   ⚠️  WARNING: TTL Index still exists!`);
                }
            }
            
            if (!stillHasTTL) {
                console.log('\n✅ SUCCESS: All TTL indexes removed!');
                console.log('   Your users will no longer be automatically deleted.\n');
            }
        } else {
            console.log('\n✅ GOOD NEWS: No TTL index found on users collection.');
            console.log('   Users will not be automatically deleted.\n');
        }
        
        // Check for recently deleted users (if possible)
        console.log('='.repeat(70));
        console.log('Checking for admin users...\n');
        
        const User = mongoose.model('User', new mongoose.Schema({}, { strict: false, collection: 'users' }));
        const adminUsers = await User.find({ role: 'Admin' }).select('email name createdAt').lean();
        
        console.log(`Found ${adminUsers.length} Admin users:`);
        for (const admin of adminUsers) {
            console.log(`  - ${admin.email} (${admin.name}) - Created: ${new Date(admin.createdAt).toLocaleString()}`);
        }
        
        // Check if the specific admin exists
        const specificAdmin = await User.findOne({ email: 'tadmin.ability@yopmail.com' }).lean();
        if (specificAdmin) {
            console.log(`\n✓ Admin user "tadmin.ability@yopmail.com" exists in database`);
        } else {
            console.log(`\n⚠️  Admin user "tadmin.ability@yopmail.com" NOT found in database`);
            console.log('   This user was likely deleted by the TTL index.');
            console.log('   You will need to recreate this admin user.');
        }
        
        console.log('\n' + '='.repeat(70));
        console.log('INDEX CHECK COMPLETE');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        console.error('Stack:', error.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

if (require.main === module) {
    checkAndFixIndexes().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { checkAndFixIndexes };
