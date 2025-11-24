const mongoose = require('mongoose');

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

// Progress tracking
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
 * Get total count of EventInterests in V1
 */
async function getEventInterestCount() {
    try {
        const v1Db = v1Connection.db;
        const eventInterestsCollection = v1Db.collection('eventinterests');
        const count = await eventInterestsCollection.countDocuments({});
        return count;
    } catch (error) {
        console.error('❌ Error getting EventInterest count:', error.message);
        throw error;
    }
}

/**
 * Get EventInterest cursor for streaming (memory efficient)
 */
async function getEventInterestCursor() {
    try {
        const v1Db = v1Connection.db;
        const eventInterestsCollection = v1Db.collection('eventinterests');
        
        // Use cursor with batch size for memory efficiency
        const cursor = eventInterestsCollection.find({}).batchSize(100);
        
        return cursor;
    } catch (error) {
        console.error('❌ Error getting EventInterest cursor:', error.message);
        throw error;
    }
}

/**
 * Fetch related data from V1 (Company info for each interestedInCompanies ID)
 */
async function fetchCompanyInfo(companyId, v1Db) {
    try {
        const companiesCollection = v1Db.collection('companies');
        const company = await companiesCollection.findOne({ _id: companyId });
        return company;
    } catch (error) {
        console.error(`❌ Error fetching company ${companyId}:`, error.message);
        return null;
    }
}


/**
 * Transform V1 EventInterest to V2 JobSeekerInterest format
 * Note: One V1 record with multiple companies becomes multiple V2 records
 * Uses V1 ObjectIds directly (no validation)
 */
async function transformEventInterestToV2(eventInterest) {
    const v1Db = v1Connection.db;
    
    // V1 structure:
    // - eventId: ObjectId (ref Event)
    // - userId: ObjectId (ref JobSeekers)
    // - interestedInCompanies: [ObjectId] (array of Company refs)
    // - createdAt, updatedAt
    
    const v1EventId = eventInterest.eventId;
    const v1UserId = eventInterest.userId;
    const interestedInCompanies = eventInterest.interestedInCompanies || [];
    
    // Use V1 ObjectIds directly (no validation)
    const v2JobSeekerId = v1UserId ? new mongoose.Types.ObjectId(v1UserId) : null;
    const v2EventId = v1EventId ? new mongoose.Types.ObjectId(v1EventId) : null;
    
    if (!v2JobSeekerId || !v2EventId) {
        return null; // Skip if no valid IDs
    }
    
    // Transform each company interest into a V2 JobSeekerInterest record
    const v2InterestRecords = [];
    
    for (const companyId of interestedInCompanies) {
        if (!companyId) continue;
        
        // Fetch company info from V1 for name and logo
        const company = await fetchCompanyInfo(companyId, v1Db);
        
        // Use V1 companyId as boothId (V1 companies map to V2 booths)
        const v2BoothId = new mongoose.Types.ObjectId(companyId);
        
        // Get company name from V1
        const companyName = company?.name || company?.companyName || `Company_${companyId}`;
        const companyLogo = company?.logo || company?.logoUrl || company?.logoURL || null;
        
        // V2 JobSeekerInterest structure (complete object matching schema)
        const v2Interest = {
            // Required fields - using V1 ObjectIds directly
            jobSeeker: v2JobSeekerId,
            event: v2EventId,
            booth: v2BoothId,
            company: companyName,
            
            // Optional fields
            companyLogo: companyLogo,
            isInterested: true,
            interestLevel: 'medium',
            notes: null,
            
            // Legacy IDs for tracking
            legacyEventId: v1EventId ? v1EventId.toString() : null,
            legacyBoothId: companyId ? companyId.toString() : null,
            legacyJobSeekerId: v1UserId ? v1UserId.toString() : null,
            
            // Timestamps
            createdAt: eventInterest.createdAt || new Date(),
            updatedAt: eventInterest.updatedAt || new Date()
        };
        
        v2InterestRecords.push(v2Interest);
    }
    
    return v2InterestRecords;
}

/**
 * Check if interest already exists in V2 (by legacy IDs)
 */
async function interestExistsInV2(legacyJobSeekerId, legacyEventId, legacyBoothId, v2Db) {
    try {
        const existing = await v2Db.collection('jobseekerinterests').findOne({
            legacyJobSeekerId: legacyJobSeekerId,
            legacyEventId: legacyEventId,
            legacyBoothId: legacyBoothId
        });
        return existing !== null;
    } catch (error) {
        return false;
    }
}

/**
 * Insert JobSeekerInterest into V2 database
 */
async function insertInterestToV2(interestData, v2Db) {
    try {
        const interestsCollection = v2Db.collection('jobseekerinterests');
        
        // Check if already exists by legacy IDs
        const exists = await interestExistsInV2(
            interestData.legacyJobSeekerId,
            interestData.legacyEventId,
            interestData.legacyBoothId,
            v2Db
        );
        
        if (exists) {
            return false; // Already migrated
        }
        
        // Insert the interest
        await interestsCollection.insertOne(interestData);
        return true;
    } catch (error) {
        // Check if it's a duplicate key error (compound index)
        if (error.code === 11000) {
            return false; // Already exists
        }
        throw error;
    }
}

/**
 * Main migration function
 */
async function main() {
    try {
        console.log('🚀 Starting JobSeeker Interests Migration - ALL EVENT INTERESTS\n');
        console.log('='.repeat(60));
        
        // Connect to databases
        await connectDatabases();
        
        // Get V2 database reference
        const v2Db = v2Connection.db;
        
        // Get total count
        const count = await getEventInterestCount();
        migrationStats.total = count;
        
        console.log(`\n📊 Found ${migrationStats.total} EventInterest records in V1 database`);
        console.log(`📊 Starting migration using streaming cursor (memory efficient)...`);
        console.log('='.repeat(60));
        
        // Get cursor for streaming (memory efficient - processes one at a time)
        const cursor = await getEventInterestCursor();
        
        let currentIndex = 0;
        let verboseLogging = migrationStats.total <= 100; // Only verbose for small migrations
        
        // Process event interests using cursor (streaming - memory efficient)
        while (await cursor.hasNext()) {
            const eventInterest = await cursor.next();
            currentIndex++;
            
            try {
                // Log progress periodically
                if (verboseLogging || currentIndex === 1 || currentIndex === migrationStats.total || 
                    (currentIndex % 100 === 0) || 
                    (Date.now() - lastProgressUpdate) > PROGRESS_UPDATE_INTERVAL) {
                    const v1UserId = eventInterest.userId ? eventInterest.userId.toString() : 'NO USER ID';
                    const companyCount = (eventInterest.interestedInCompanies || []).length;
                    console.log(`\n[${currentIndex}/${migrationStats.total}] Processing EventInterest`);
                    console.log(`   V1 User ID: ${v1UserId}`);
                    console.log(`   Companies: ${companyCount}`);
                    lastProgressUpdate = Date.now();
                }
                
                // Skip if no user or event ID
                if (!eventInterest.userId || !eventInterest.eventId) {
                    if (verboseLogging) {
                        console.log(`   ⚠️  SKIPPED: Missing userId or eventId`);
                    }
                    migrationStats.skipped++;
                    continue;
                }
                
                // Transform to V2 format (returns array of interest records)
                const v2InterestRecords = await transformEventInterestToV2(eventInterest);
                
                if (!v2InterestRecords || v2InterestRecords.length === 0) {
                    if (verboseLogging) {
                        console.log(`   ⚠️  SKIPPED: No companies in interest or transformation failed`);
                    }
                    migrationStats.skipped++;
                    continue;
                }
                
                // Insert each interest record
                let insertedCount = 0;
                for (const interestData of v2InterestRecords) {
                    try {
                        const inserted = await insertInterestToV2(interestData, v2Db);
                        if (inserted) {
                            insertedCount++;
                        }
                    } catch (error) {
                        // Individual record insertion error
                        if (verboseLogging || currentIndex % 50 === 0) {
                            console.error(`   ⚠️  Failed to insert interest: ${error.message}`);
                        }
                    }
                }
                
                if (insertedCount > 0) {
                    migrationStats.successful += insertedCount;
                } else {
                    migrationStats.skipped++; // All were duplicates
                }
                
                // Print progress every 100 records
                if (!verboseLogging && (currentIndex % 100 === 0 || currentIndex === migrationStats.total)) {
                    const successRate = ((migrationStats.successful / (migrationStats.successful + migrationStats.skipped + migrationStats.failed)) * 100).toFixed(1);
                    console.log(`   Progress: ${currentIndex}/${migrationStats.total} | ✅ ${migrationStats.successful} | ❌ ${migrationStats.failed} | ⚠️ ${migrationStats.skipped} | Success Rate: ${successRate}%`);
                }
                
            } catch (error) {
                migrationStats.failed++;
                migrationStats.errors.push({ 
                    index: currentIndex, 
                    error: error.message 
                });
                if (verboseLogging || currentIndex % 50 === 0) {
                    console.error(`   ❌ FAILED [${currentIndex}]: ${error.message}`);
                }
                // Continue with next event interest instead of stopping
            }
        }
        
        // Close cursor
        await cursor.close();
        
        // Print final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`\n📈 Final Statistics:`);
        console.log(`   Total EventInterests: ${migrationStats.total}`);
        console.log(`   ✅ Successful Records: ${migrationStats.successful}`);
        console.log(`   ❌ Failed: ${migrationStats.failed}`);
        console.log(`   ⚠️  Skipped: ${migrationStats.skipped}`);
        
        if (migrationStats.errors.length > 0) {
            console.log(`\n❌ Errors encountered:`);
            migrationStats.errors.slice(0, 10).forEach((err, idx) => {
                console.log(`   ${idx + 1}. Record ${err.index}: ${err.error}`);
            });
            if (migrationStats.errors.length > 10) {
                console.log(`   ... and ${migrationStats.errors.length - 10} more errors`);
            }
        }
        
        console.log(`\n💡 All event interests migrated to V2`);
        console.log(`   Using V1 ObjectIds directly (legacy IDs stored for reference)`);
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
    transformEventInterestToV2,
    fetchCompanyInfo,
    getEventInterestCount,
    getEventInterestCursor,
    insertInterestToV2,
    interestExistsInV2
};

