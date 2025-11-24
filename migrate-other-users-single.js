const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Database URIs
const V1_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Prod_Ability';
const V2_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

// Connection instances
let v1Connection = null;
let v2Connection = null;

// Migration statistics
let migrationStats = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    errors: []
};

// Progress tracking (for large migrations)
let lastProgressUpdate = Date.now();
const PROGRESS_UPDATE_INTERVAL = 5000; // Update every 5 seconds

/**
 * Connect to both databases
 */
async function connectDatabases() {
    try {
        console.log('Connecting to V1 database (Prod_Ability)...');
        v1Connection = await mongoose.createConnection(V1_DB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 0,
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000
        }).asPromise();
        console.log('✅ Connected to V1 database');

        console.log('Connecting to V2 database (Ability_v2_dev)...');
        v2Connection = await mongoose.createConnection(V2_DB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 0,
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000
        }).asPromise();
        console.log('✅ Connected to V2 database');

        return true;
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        throw error;
    }
}

/**
 * Map V1 role to V2 role
 */
function mapRole(v1Role) {
    const roleMap = {
        'admin': 'Admin',
        'interviewer': 'Recruiter',
        'company': 'BoothAdmin',
        'interpreter': 'Interpreter',
        'GlobalInterpreter': 'GlobalInterpreter',
        'CompanySupport': 'Support',
        'GlobalSupport': 'GlobalSupport',
        'AdminEvent': 'AdminEvent'
    };
    
    // If role is already in V2 format, return as is
    if (roleMap[v1Role]) {
        return roleMap[v1Role];
    }
    
    // Default to Admin if role not recognized (safety fallback)
    console.warn(`⚠️  Unknown role "${v1Role}", defaulting to "Admin"`);
    return 'Admin';
}

/**
 * Transform V1 User data to V2 User format
 */
async function transformUserToV2(v1User) {
    // Combine first_name and last_name for name field
    const fullName = `${v1User.first_name || ''} ${v1User.last_name || ''}`.trim();
    
    // Map V1 role to V2 role
    const v2Role = mapRole(v1User.role);
    
    // Create base user data
    const userData = {
        // Basic Info
        name: fullName || v1User.userName || v1User.email || 'Unknown User',
        email: (v1User.email || '').toLowerCase().trim(),
        role: v2Role,
        
        // Legacy ID for reference
        legacyId: v1User._id ? v1User._id.toString() : null,
        
        // Email verification (default to false for migrated users)
        emailVerified: false,
        
        // Legacy password support (for dual password validation)
        legacyPassword: {
            hash: v1User.hash_password || null,
            salt: v1User.salt || null,
            algorithm: 'pbkdf2'
        },
        
        // Temporary bcrypt hash (will be replaced on first login)
        hashedPassword: await bcrypt.hash('temp_migration_' + Date.now() + '_' + Math.random(), 12),
        
        // Registration date (preserve original creation date)
        registrationDate: v1User.createdAt || null,
        
        // Active status
        isActive: true,
        
        // Recruiter/BoothAdmin/Support/Interpreter specific: assigned booth
        // Map V1 companyId to V2 assignedBooth
        assignedBooth: v1User.companyId ? new mongoose.Types.ObjectId(v1User.companyId) : null,
        
        // Interpreter specific fields
        languages: [], // V1 doesn't store languages in user model, leave empty
        isAvailable: false, // Default to offline
        
        // Metadata for additional user information
        metadata: {
            // V1 specific fields that don't map directly to V2
            userName: v1User.userName || null,
            field: v1User.field || null,
            eventId: v1User.eventId ? v1User.eventId.toString() : null,
            eventList: v1User.eventList ? v1User.eventList.map(id => id.toString()) : [],
            boothList: v1User.boothList ? v1User.boothList.map(id => id.toString()) : [],
            interpreterCategoryId: v1User.interpreterCategoryId ? v1User.interpreterCategoryId.toString() : null,
            
            // Migration tracking
            migratedAt: new Date(),
            migratedFrom: 'ability_v1'
        },
        
        // Timestamps
        createdAt: v1User.createdAt || new Date(),
        updatedAt: v1User.updatedAt || new Date()
    };
    
    return userData;
}

/**
 * Get total count of users in V1
 */
async function getUserCount() {
    try {
        const v1Db = v1Connection.db;
        const usersCollection = v1Db.collection('users');
        const count = await usersCollection.countDocuments({});
        return count;
    } catch (error) {
        console.error('❌ Error getting user count:', error.message);
        throw error;
    }
}

/**
 * Get user cursor for streaming (memory efficient)
 */
async function getUserCursor() {
    try {
        const v1Db = v1Connection.db;
        const usersCollection = v1Db.collection('users');
        
        // Use cursor with batch size for memory efficiency
        const cursor = usersCollection.find({}).batchSize(100);
        
        return cursor;
    } catch (error) {
        console.error('❌ Error getting user cursor:', error.message);
        throw error;
    }
}

/**
 * Check if user exists in V2 and delete if found
 */
async function deleteExistingUser(email, db) {
    try {
        const usersCollection = db.collection('users');
        const existingUser = await usersCollection.findOne({ email: email.toLowerCase().trim() });
        
        if (existingUser) {
            await usersCollection.deleteOne({ email: email.toLowerCase().trim() });
            return true;
        } else {
            return false;
        }
    } catch (error) {
        console.error('❌ Error checking/deleting existing user:', error.message);
        throw error;
    }
}

/**
 * Insert migrated user into V2 database
 */
async function insertUserToV2(userData, db) {
    try {
        // Use native MongoDB driver to insert (bypass mongoose validation for migration)
        const usersCollection = db.collection('users');
        
        // Insert the user document
        const result = await usersCollection.insertOne(userData);
        
        return result.insertedId;
    } catch (error) {
        console.error('❌ Error inserting user:', error.message);
        if (error.code === 11000) {
            console.error('   Duplicate email error - user might already exist');
        }
        throw error;
    }
}

/**
 * Main function - Migrate all users from V1 to V2
 */
async function main() {
    try {
        console.log('🚀 Starting Other Users Migration Script - ALL USERS\n');
        console.log('='.repeat(60));
        
        // Connect to both databases
        await connectDatabases();
        
        // Get V2 database reference
        const v2Db = v2Connection.db;
        
        // Get total count
        const count = await getUserCount();
        migrationStats.total = count;
        
        console.log(`\n📊 Found ${migrationStats.total} Users in V1 database`);
        console.log(`📊 Starting migration using streaming cursor (memory efficient)...`);
        console.log('='.repeat(60));
        
        // Get cursor for streaming (memory efficient - processes one at a time)
        const cursor = await getUserCursor();
        
        let currentIndex = 0;
        let verboseLogging = migrationStats.total <= 100; // Only verbose for small migrations
        
        // Process users using cursor (streaming - memory efficient)
        while (await cursor.hasNext()) {
            const v1User = await cursor.next();
            currentIndex++;
            
            const email = (v1User.email || '').toLowerCase().trim();
            
            try {
                // Log progress periodically or for first/last items
                if (verboseLogging || currentIndex === 1 || currentIndex === migrationStats.total || 
                    (currentIndex % 100 === 0) || 
                    (Date.now() - lastProgressUpdate) > PROGRESS_UPDATE_INTERVAL) {
                    console.log(`\n[${currentIndex}/${migrationStats.total}] Processing: ${email || 'NO EMAIL'}`);
                    if (verboseLogging) {
                        console.log(`   Name: ${v1User.first_name || ''} ${v1User.last_name || ''}`);
                        console.log(`   Role: ${v1User.role || 'N/A'}`);
                    }
                    lastProgressUpdate = Date.now();
                }
                
                // Skip if no email
                if (!email) {
                    if (verboseLogging) {
                        console.log(`   ⚠️  SKIPPED: No email address`);
                    }
                    migrationStats.skipped++;
                    migrationStats.errors.push({ email: 'NO EMAIL', error: 'No email address' });
                    continue;
                }
                
                // Delete existing user if found
                await deleteExistingUser(email, v2Db);
                
                // Transform data to V2 format
                const transformedUserData = await transformUserToV2(v1User);
                
                // Insert into V2 database
                await insertUserToV2(transformedUserData, v2Db);
                
                migrationStats.successful++;
                
                if (verboseLogging) {
                    console.log(`   ✅ SUCCESS: Migrated successfully`);
                }
                
                // Print progress every 100 records or on first/last
                if (!verboseLogging && (currentIndex % 100 === 0 || currentIndex === migrationStats.total)) {
                    const successRate = ((migrationStats.successful / currentIndex) * 100).toFixed(1);
                    console.log(`   Progress: ${currentIndex}/${migrationStats.total} | ✅ ${migrationStats.successful} | ❌ ${migrationStats.failed} | ⚠️ ${migrationStats.skipped} | Success Rate: ${successRate}%`);
                }
                
            } catch (error) {
                migrationStats.failed++;
                migrationStats.errors.push({ 
                    email: email || 'NO EMAIL', 
                    error: error.message 
                });
                if (verboseLogging || currentIndex % 50 === 0) {
                    console.error(`   ❌ FAILED [${currentIndex}]: ${error.message}`);
                }
                // Continue with next user instead of stopping
            }
        }
        
        // Close cursor
        await cursor.close();
        
        // Print final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`\n📈 Final Statistics:`);
        console.log(`   Total Users: ${migrationStats.total}`);
        console.log(`   ✅ Successful: ${migrationStats.successful}`);
        console.log(`   ❌ Failed: ${migrationStats.failed}`);
        console.log(`   ⚠️  Skipped: ${migrationStats.skipped}`);
        
        if (migrationStats.errors.length > 0) {
            console.log(`\n❌ Errors encountered:`);
            migrationStats.errors.slice(0, 10).forEach((err, idx) => {
                console.log(`   ${idx + 1}. ${err.email}: ${err.error}`);
            });
            if (migrationStats.errors.length > 10) {
                console.log(`   ... and ${migrationStats.errors.length - 10} more errors`);
            }
        }
        
        console.log(`\n💡 All migrated users can login with their V1 password`);
        console.log(`   Passwords will be auto-migrated to bcrypt on first login`);
        console.log('\n');
        
    } catch (error) {
        console.error('\n❌ Migration failed:', error);
        console.error(error.stack);
        process.exit(1);
    } finally {
        // Close database connections
        if (v1Connection) {
            await v1Connection.close();
            console.log('🔌 Closed V1 database connection');
        }
        if (v2Connection) {
            await v2Connection.close();
            console.log('🔌 Closed V2 database connection');
        }
        process.exit(0);
    }
}

// Run the script
if (require.main === module) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    transformUserToV2,
    mapRole,
    deleteExistingUser,
    insertUserToV2,
    getUserCount,
    getUserCursor
};

