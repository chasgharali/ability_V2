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
    skippedReasons: {
        eventNotFound: 0,
        boothNotFound: 0,
        recruiterNotFound: 0,
        jobseekerNotFound: 0,
        missingRequired: 0
    },
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
 * Get total count of meetings in V1
 */
async function getMeetingCount() {
    try {
        const v1Db = v1Connection.db;
        const collectionNames = await v1Db.listCollections().toArray();
        const meetingCollectionName = collectionNames.find(c => 
            c.name.toLowerCase().includes('meeting')
        )?.name || 'meetingdatas';
        
        const meetingCollection = v1Db.collection(meetingCollectionName);
        const count = await meetingCollection.countDocuments({});
        
        return { count, meetingCollectionName };
    } catch (error) {
        console.error('❌ Error getting meeting count:', error.message);
        throw error;
    }
}

/**
 * Get meeting cursor for streaming
 */
async function getMeetingCursor(meetingCollectionName) {
    try {
        const v1Db = v1Connection.db;
        const meetingCollection = v1Db.collection(meetingCollectionName);
        const cursor = meetingCollection.find({}).batchSize(100);
        return cursor;
    } catch (error) {
        console.error('❌ Error getting meeting cursor:', error.message);
        throw error;
    }
}

/**
 * Find Event in V2 by various methods
 */
async function findEventInV2(v1Meeting, v2Db) {
    // Try by legacyId first (if events have legacyId)
    if (v1Meeting.eventId) {
        const event = await v2Db.collection('events').findOne({
            legacyId: v1Meeting.eventId.toString()
        });
        if (event) return event._id;
    }
    
    // Try by name
    if (v1Meeting.eventName) {
        const event = await v2Db.collection('events').findOne({
            name: v1Meeting.eventName
        });
        if (event) return event._id;
    }
    
    // Try by slug (if eventName can be converted to slug)
    if (v1Meeting.eventName) {
        const slug = v1Meeting.eventName.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
        const event = await v2Db.collection('events').findOne({
            slug: slug
        });
        if (event) return event._id;
    }
    
    return null;
}

/**
 * Find Booth in V2 by various methods
 */
async function findBoothInV2(v1Meeting, eventId, v2Db) {
    // Try by legacyId (companyId maps to booth)
    if (v1Meeting.companyId) {
        const booth = await v2Db.collection('booths').findOne({
            $or: [
                { legacyId: v1Meeting.companyId.toString() },
                { metadata: { $exists: true, $ne: null }, 'metadata.companyId': v1Meeting.companyId.toString() }
            ]
        });
        if (booth && (!eventId || booth.eventId.toString() === eventId.toString())) {
            return booth._id;
        }
    }
    
    // Try by name within the same event
    if (v1Meeting.companyName && eventId) {
        const booth = await v2Db.collection('booths').findOne({
            name: v1Meeting.companyName,
            eventId: eventId
        });
        if (booth) return booth._id;
    }
    
    // Try by name without event constraint
    if (v1Meeting.companyName) {
        const booth = await v2Db.collection('booths').findOne({
            name: v1Meeting.companyName
        });
        if (booth) return booth._id;
    }
    
    return null;
}

/**
 * Find User (Recruiter/Interviewer) in V2
 */
async function findRecruiterInV2(v1Meeting, v2Db) {
    // Try by email (most reliable)
    if (v1Meeting.interviewerEmail) {
        const recruiter = await v2Db.collection('users').findOne({
            email: v1Meeting.interviewerEmail.toLowerCase().trim(),
            role: 'Recruiter'
        });
        if (recruiter) return recruiter._id;
    }
    
    // Try by legacyId
    if (v1Meeting.interviewerId) {
        const recruiter = await v2Db.collection('users').findOne({
            legacyId: v1Meeting.interviewerId.toString()
        });
        if (recruiter) return recruiter._id;
    }
    
    // Try by name (less reliable, but fallback)
    if (v1Meeting.interviewerName) {
        const recruiter = await v2Db.collection('users').findOne({
            name: v1Meeting.interviewerName,
            role: 'Recruiter'
        });
        if (recruiter) return recruiter._id;
    }
    
    return null;
}

/**
 * Find JobSeeker (User) in V2
 */
async function findJobSeekerInV2(v1Meeting, v2Db) {
    // Try by email (most reliable - jobseekers are being migrated)
    if (v1Meeting.jobSeekerEmail) {
        const jobseeker = await v2Db.collection('users').findOne({
            email: v1Meeting.jobSeekerEmail.toLowerCase().trim(),
            role: 'JobSeeker'
        });
        if (jobseeker) return jobseeker._id;
    }
    
    // Try by legacyId
    if (v1Meeting.jobSeekerId) {
        const jobseeker = await v2Db.collection('users').findOne({
            legacyId: v1Meeting.jobSeekerId.toString()
        });
        if (jobseeker) return jobseeker._id;
    }
    
    return null;
}

/**
 * Find Interpreter in V2 (optional)
 */
async function findInterpreterInV2(v1Meeting, v2Db) {
    if (!v1Meeting.interpreterId && !v1Meeting.interpreterEmail) {
        return null;
    }
    
    // Try by email
    if (v1Meeting.interpreterEmail) {
        const interpreter = await v2Db.collection('users').findOne({
            email: v1Meeting.interpreterEmail.toLowerCase().trim(),
            role: { $in: ['Interpreter', 'GlobalInterpreter'] }
        });
        if (interpreter) return interpreter._id;
    }
    
    // Try by legacyId
    if (v1Meeting.interpreterId) {
        const interpreter = await v2Db.collection('users').findOne({
            legacyId: v1Meeting.interpreterId.toString()
        });
        if (interpreter) return interpreter._id;
    }
    
    return null;
}

/**
 * Create synthetic queue entry (required field)
 */
async function createSyntheticQueue(jobseekerId, boothId, eventId, v1Meeting, v2Db) {
    try {
        const queueEntry = {
            jobSeeker: jobseekerId,
            booth: boothId,
            event: eventId,
            position: 0,
            queueToken: `legacy-${v1Meeting.meetingId || v1Meeting._id.toString()}-${Date.now()}`,
            status: 'completed',
            joinedAt: v1Meeting.meetingStartTime || v1Meeting.jobSeekerJoinTime || v1Meeting.createdAt || new Date(),
            leftAt: v1Meeting.meetingEndTime || v1Meeting.jobSeekerLeaveTime || v1Meeting.updatedAt || null,
            invitedAt: v1Meeting.meetingStartTime || v1Meeting.createdAt || new Date(),
            lastActivity: v1Meeting.updatedAt || v1Meeting.createdAt || new Date(),
            metadata: {
                isLegacyQueue: true,
                legacyMeetingId: v1Meeting.meetingId || v1Meeting._id.toString()
            },
            createdAt: v1Meeting.createdAt || new Date(),
            updatedAt: v1Meeting.updatedAt || new Date()
        };
        
        const result = await v2Db.collection('boothqueues').insertOne(queueEntry);
        return result.insertedId;
    } catch (error) {
        console.error('❌ Error creating synthetic queue:', error.message);
        throw error;
    }
}

/**
 * Map V1 meeting status to V2 status
 */
function mapStatus(v1Status) {
    const statusMap = {
        'active': 'active',
        'ended': 'completed',
        'cancelled': 'cancelled'
    };
    return statusMap[v1Status] || 'completed';
}

/**
 * Transform V1 meeting to V2 meeting record format
 * Uses V2 model fields directly where possible, only uses metadata for V1-specific data
 */
async function transformMeetingToV2(v1Meeting, eventId, boothId, queueId, recruiterId, jobseekerId, interpreterId) {
    // Calculate duration if not provided but we have start/end times
    let duration = v1Meeting.meetingDuration || null;
    if (!duration && v1Meeting.meetingStartTime && v1Meeting.meetingEndTime) {
        duration = Math.round((new Date(v1Meeting.meetingEndTime) - new Date(v1Meeting.meetingStartTime)) / (1000 * 60));
    }
    
    return {
        // ========== REQUIRED FIELDS (V2 Model) ==========
        eventId: eventId,
        boothId: boothId,
        queueId: queueId,
        recruiterId: recruiterId,
        jobseekerId: jobseekerId,
        
        // ========== OPTIONAL OBJECT IDS (V2 Model) ==========
        interpreterId: interpreterId || null,
        videoCallId: null,  // V1 doesn't have this - use null
        
        // ========== TIMING FIELDS (V2 Model) ==========
        startTime: v1Meeting.meetingStartTime || v1Meeting.createdAt || new Date(),
        endTime: v1Meeting.meetingEndTime || null,
        duration: duration,
        
        // ========== STATUS (V2 Model) ==========
        status: mapStatus(v1Meeting.meetingStatus),
        
        // ========== ROOM/TWILIO INFO (V2 Model) ==========
        twilioRoomId: v1Meeting.roomId || null,
        twilioRoomSid: null,  // V1 doesn't have this - use null
        
        // ========== QUALITY METRICS (V2 Model) ==========
        // V1 doesn't have quality metrics - use null (schema default)
        qualityMetrics: null,
        
        // ========== FEEDBACK (V2 Model) ==========
        // V1 doesn't have structured feedback - use null
        feedback: null,
        recruiterRating: null,
        recruiterFeedback: null,
        
        // ========== INTERPRETER REQUEST (V2 Model) ==========
        // V1 doesn't have structured interpreter request - use null
        interpreterRequest: null,
        
        // ========== ARRAYS (V2 Model) ==========
        // V1 has participants array, but V2 uses different structure
        // Store in metadata, use empty arrays for V2 fields
        attachments: [],
        chatMessages: [],
        jobSeekerMessages: [],  // V1 doesn't have this structure - empty array
        
        // ========== METADATA (V2 Model) - ONLY for V1 fields that don't exist in V2 model ==========
        // V2 model already has these fields used above: eventId, boothId, recruiterId, jobseekerId, 
        // interpreterId, startTime, endTime, duration, status, twilioRoomId, attachments, chatMessages
        // V2 uses populate() to get names - so we DON'T store denormalized names in metadata
        metadata: {
            // Recording URLs - V2 model doesn't have recordingUrl/recordingThumbnail fields
            recordingUrl: (v1Meeting.recordingUrl && v1Meeting.recordingUrl.trim()) || null,
            recordingThumbnail: (v1Meeting.recordingThumbnail && v1Meeting.recordingThumbnail.trim()) || null,
            
            // V1-specific metrics - V2 model doesn't have these boolean fields
            meetingType: v1Meeting.meetingType || 'interview',
            isUniqueMeeting: v1Meeting.isUniqueMeeting || false,
            isDroppedMeeting: v1Meeting.isDroppedMeeting || false,
            isLongerThan3Minutes: v1Meeting.isLongerThan3Minutes || false,
            
            // V1 participants array - V2 has individual IDs (recruiterId, jobseekerId, interpreterId) 
            // but not this detailed array with join/leave times per participant
            participants: v1Meeting.participants || [],
            
            // JobSeeker-specific timing - V2 doesn't have separate fields for jobseeker join/leave times
            jobSeekerJoinTime: v1Meeting.jobSeekerJoinTime || null,
            jobSeekerLeaveTime: v1Meeting.jobSeekerLeaveTime || null,
            jobSeekerDuration: v1Meeting.jobSeekerDuration || null,
            
            // Migration tracking
            migratedAt: new Date(),
            migratedFrom: 'ability_v1'
        },
        
        // ========== LEGACY ID (V2 Model) ==========
        legacyId: v1Meeting.meetingId || v1Meeting._id?.toString() || null,
        
        // ========== TIMESTAMPS (V2 Model) ==========
        createdAt: v1Meeting.createdAt || v1Meeting.meetingStartTime || new Date(),
        updatedAt: v1Meeting.updatedAt || new Date()
    };
}

/**
 * Insert meeting record into V2
 * SAFETY: Only operates on records with legacyId - won't affect new V2 meetings
 * New V2 meetings have legacyId: null, so they won't match our queries
 */
async function insertMeetingToV2(meetingData, v2Db) {
    try {
        const meetingRecordsCollection = v2Db.collection('meetingrecords');
        
        // SAFETY: Only check/update records with legacyId
        // New V2 meetings have legacyId: null, so they're completely safe
        if (!meetingData.legacyId) {
            throw new Error('Cannot insert meeting without legacyId - migration safety check failed');
        }
        
        // Check if already migrated (by legacyId only)
        // New V2 meetings won't match because they have legacyId: null
        const existing = await meetingRecordsCollection.findOne({
            legacyId: meetingData.legacyId
        });
        
        if (existing) {
            // Update existing migrated record
            await meetingRecordsCollection.updateOne(
                { legacyId: meetingData.legacyId },
                { $set: meetingData }
            );
            return existing._id;
        } else {
            // Insert new migrated record
            // This won't conflict with new V2 meetings because:
            // - Migrated: legacyId = "meeting_xxx"
            // - New V2: legacyId = null
            // - Query by legacyId only matches migrated records
            const result = await meetingRecordsCollection.insertOne(meetingData);
            return result.insertedId;
        }
    } catch (error) {
        console.error('❌ Error inserting meeting:', error.message);
        throw error;
    }
}

/**
 * Test function - Get ONE meeting and print transformed V2 object
 * Just transforms the data structure, doesn't check V2 references
 */
async function testTransformOneMeeting() {
    try {
        console.log('🧪 Testing Meeting Record Transformation\n');
        console.log('='.repeat(60));
        
        // Connect ONLY to V1 database
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
        
        const v1Db = v1Connection.db;
        
        // Get collection name
        const collectionNames = await v1Db.listCollections().toArray();
        const meetingCollectionName = collectionNames.find(c => 
            c.name.toLowerCase().includes('meeting')
        )?.name || 'meetingdatas';
        
        console.log(`📋 Collection: ${meetingCollectionName}`);
        
        // Get ONE meeting record
        const meetingCollection = v1Db.collection(meetingCollectionName);
        const v1Meeting = await meetingCollection.findOne({});
        
        if (!v1Meeting) {
            console.log('❌ No meetings found in V1 database');
            return;
        }
        
        console.log('\n📄 V1 Meeting Data:');
        console.log(JSON.stringify(v1Meeting, null, 2));
        console.log('\n' + '='.repeat(60));
        
        // Transform to V2 format - just map the data structure
        // Use placeholder ObjectIds for required fields (will be real IDs in actual migration)
        console.log('\n🔄 Transforming to V2 format...');
        const transformedMeeting = await transformMeetingToV2Structure(v1Meeting);
        
        // Print the complete V2 object
        console.log('\n' + '='.repeat(60));
        console.log('📊 TRANSFORMED V2 MEETING RECORD STRUCTURE:');
        console.log('='.repeat(60));
        console.log(JSON.stringify(transformedMeeting, null, 2));
        console.log('='.repeat(60));
        console.log('\n✅ Transformation complete!');
        console.log('\nNote: This shows the structure. ObjectIds are placeholders.');
        console.log('In actual migration, real ObjectIds will be found/created.');
        
    } catch (error) {
        console.error('\n❌ Error:', error);
        console.error(error.stack);
    } finally {
        if (v1Connection) await v1Connection.close();
        process.exit(0);
    }
}

/**
 * Transform V1 meeting to V2 structure - just data transformation, no V2 lookups
 * This shows what the V2 object will look like
 */
async function transformMeetingToV2Structure(v1Meeting) {
    // Calculate duration if not provided but we have start/end times
    let duration = v1Meeting.meetingDuration || null;
    if (!duration && v1Meeting.meetingStartTime && v1Meeting.meetingEndTime) {
        duration = Math.round((new Date(v1Meeting.meetingEndTime) - new Date(v1Meeting.meetingStartTime)) / (1000 * 60));
    }
    
    // Map status
    const statusMap = {
        'active': 'active',
        'ended': 'completed',
        'cancelled': 'cancelled'
    };
    const status = statusMap[v1Meeting.meetingStatus] || 'completed';
    
    // Get actual V1 IDs (these will be mapped to V2 IDs during actual migration)
    const v1EventId = v1Meeting.eventId ? v1Meeting.eventId.toString() : null;
    const v1CompanyId = v1Meeting.companyId ? v1Meeting.companyId.toString() : null;
    const v1InterviewerId = v1Meeting.interviewerId ? v1Meeting.interviewerId.toString() : null;
    const v1JobSeekerId = v1Meeting.jobSeekerId ? v1Meeting.jobSeekerId.toString() : null;
    const v1InterpreterId = v1Meeting.interpreterId ? v1Meeting.interpreterId.toString() : null;
    
    return {
        // ========== REQUIRED FIELDS (V2 Model) ==========
        // These show the V1 IDs - will be mapped to V2 ObjectIds during actual migration
        eventId: v1EventId || null,  // V1: v1Meeting.eventId -> Will map to V2 event ObjectId
        boothId: v1CompanyId || null,  // V1: v1Meeting.companyId (companyId = boothId in V2) -> Will map to V2 booth ObjectId
        queueId: 'WILL_BE_CREATED_DURING_MIGRATION',  // V2 REQUIRES queueId (cannot be null) - will create synthetic BoothQueue entry during actual migration
        recruiterId: v1InterviewerId || null,  // V1: v1Meeting.interviewerId -> Will map to V2 user ObjectId (Recruiter role)
        jobseekerId: v1JobSeekerId || null,  // V1: v1Meeting.jobSeekerId -> Will map to V2 user ObjectId (JobSeeker role)
        
        // ========== OPTIONAL OBJECT IDS (V2 Model) ==========
        interpreterId: v1InterpreterId || null,  // V1: v1Meeting.interpreterId -> Will map to V2 user ObjectId (Interpreter role)
        videoCallId: null,  // V1 doesn't have this - use null
        
        // ========== TIMING FIELDS (V2 Model) ==========
        startTime: v1Meeting.meetingStartTime || v1Meeting.createdAt || new Date(),
        endTime: v1Meeting.meetingEndTime || null,
        duration: duration,
        
        // ========== STATUS (V2 Model) ==========
        status: status,
        
        // ========== ROOM/TWILIO INFO (V2 Model) ==========
        twilioRoomId: v1Meeting.roomId || null,
        twilioRoomSid: null,  // V1 doesn't have this - use null
        
        // ========== QUALITY METRICS (V2 Model) ==========
        qualityMetrics: null,  // V1 doesn't have this - use null
        
        // ========== FEEDBACK (V2 Model) ==========
        feedback: null,  // V1 doesn't have structured feedback - use null
        recruiterRating: null,
        recruiterFeedback: null,
        
        // ========== INTERPRETER REQUEST (V2 Model) ==========
        interpreterRequest: null,  // V1 doesn't have structured request - use null
        
        // ========== ARRAYS (V2 Model) ==========
        attachments: [],  // Empty array - V1 doesn't have this structure
        chatMessages: [],  // Empty array - V1 doesn't have this structure
        jobSeekerMessages: [],  // Empty array - V1 doesn't have this structure
        
        // ========== METADATA (V2 Model) - ONLY for V1 fields that don't exist in V2 model ==========
        // V2 model already has these fields used above: eventId, boothId, recruiterId, jobseekerId, 
        // interpreterId, startTime, endTime, duration, status, twilioRoomId, attachments, chatMessages
        // V2 uses populate() to get names - so we DON'T store denormalized names in metadata
        metadata: {
            // Recording URLs - V2 model doesn't have recordingUrl/recordingThumbnail fields
            recordingUrl: (v1Meeting.recordingUrl && v1Meeting.recordingUrl.trim()) || null,
            recordingThumbnail: (v1Meeting.recordingThumbnail && v1Meeting.recordingThumbnail.trim()) || null,
            
            // V1-specific metrics - V2 model doesn't have these boolean fields
            meetingType: v1Meeting.meetingType || 'interview',
            isUniqueMeeting: v1Meeting.isUniqueMeeting || false,
            isDroppedMeeting: v1Meeting.isDroppedMeeting || false,
            isLongerThan3Minutes: v1Meeting.isLongerThan3Minutes || false,
            
            // V1 participants array - V2 has individual IDs (recruiterId, jobseekerId, interpreterId) 
            // but not this detailed array with join/leave times per participant
            participants: v1Meeting.participants || [],
            
            // JobSeeker-specific timing - V2 doesn't have separate fields for jobseeker join/leave times
            jobSeekerJoinTime: v1Meeting.jobSeekerJoinTime || null,
            jobSeekerLeaveTime: v1Meeting.jobSeekerLeaveTime || null,
            jobSeekerDuration: v1Meeting.jobSeekerDuration || null,
            
            // Migration tracking
            migratedAt: new Date(),
            migratedFrom: 'ability_v1'
        },
        
        // ========== LEGACY ID (V2 Model) ==========
        legacyId: v1Meeting.meetingId || v1Meeting._id?.toString() || null,
        
        // ========== TIMESTAMPS (V2 Model) ==========
        createdAt: v1Meeting.createdAt || v1Meeting.meetingStartTime || new Date(),
        updatedAt: v1Meeting.updatedAt || new Date()
    };
}

/**
 * Main migration function
 */
async function main() {
    try {
        console.log('🚀 Starting Meeting Records Migration\n');
        console.log('='.repeat(60));
        
        // Connect to databases
        await connectDatabases();
        
        const v2Db = v2Connection.db;
        
        // Get meeting count and collection name
        const { count, meetingCollectionName } = await getMeetingCount();
        migrationStats.total = count;
        
        console.log(`\n📊 Found ${migrationStats.total} meetings in V1 database`);
        console.log(`📊 Collection: ${meetingCollectionName}`);
        console.log(`📊 Starting migration of all meeting records to V2...`);
        console.log('='.repeat(60));
        
        // Get cursor for streaming
        const cursor = await getMeetingCursor(meetingCollectionName);
        
        let currentIndex = 0;
        
        // Process meetings
        while (await cursor.hasNext()) {
            const v1Meeting = await cursor.next();
            currentIndex++;
            
            // Log progress every meeting for first 10, then every 10 meetings
            if (currentIndex <= 10 || currentIndex % 10 === 0 || currentIndex === migrationStats.total) {
                console.log(`\n[${currentIndex}/${migrationStats.total}] Processing meeting...`);
            }
            
            try {
                // Use V1 ObjectIds directly - convert all IDs from V1
                let eventId = null;
                let boothId = null;
                let recruiterId = null;
                let jobseekerId = null;
                let interpreterId = null;
                
                // Convert V1 ObjectIds to mongoose ObjectIds
                // Handle both ObjectId instances and string representations
                if (v1Meeting.eventId) {
                    try {
                        const v2EventId = await findEventInV2(v1Meeting, v2Db);
                        eventId = v2EventId || (typeof v1Meeting.eventId === 'string' 
                            ? new mongoose.Types.ObjectId(v1Meeting.eventId)
                            : v1Meeting.eventId);
                    } catch (e) {
                        eventId = typeof v1Meeting.eventId === 'string' 
                            ? new mongoose.Types.ObjectId(v1Meeting.eventId)
                            : v1Meeting.eventId;
                    }
                }
                
                if (v1Meeting.companyId) {
                    try {
                        const v2BoothId = eventId ? await findBoothInV2(v1Meeting, eventId, v2Db) : null;
                        boothId = v2BoothId || (typeof v1Meeting.companyId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.companyId)
                            : v1Meeting.companyId);
                    } catch (e) {
                        boothId = typeof v1Meeting.companyId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.companyId)
                            : v1Meeting.companyId;
                    }
                }
                
                if (v1Meeting.interviewerId) {
                    try {
                        const v2RecruiterId = await findRecruiterInV2(v1Meeting, v2Db);
                        recruiterId = v2RecruiterId || (typeof v1Meeting.interviewerId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.interviewerId)
                            : v1Meeting.interviewerId);
                    } catch (e) {
                        recruiterId = typeof v1Meeting.interviewerId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.interviewerId)
                            : v1Meeting.interviewerId;
                    }
                }
                
                // jobSeekerId - check both jobSeekerId and jobseekerId (case variations)
                const jobSeekerIdValue = v1Meeting.jobSeekerId || v1Meeting.jobseekerId;
                if (jobSeekerIdValue) {
                    try {
                        const v2JobseekerId = await findJobSeekerInV2(v1Meeting, v2Db);
                        jobseekerId = v2JobseekerId || (typeof jobSeekerIdValue === 'string'
                            ? new mongoose.Types.ObjectId(jobSeekerIdValue)
                            : jobSeekerIdValue);
                    } catch (e) {
                        jobseekerId = typeof jobSeekerIdValue === 'string'
                            ? new mongoose.Types.ObjectId(jobSeekerIdValue)
                            : jobSeekerIdValue;
                    }
                }
                
                if (v1Meeting.interpreterId) {
                    try {
                        const v2InterpreterId = await findInterpreterInV2(v1Meeting, v2Db);
                        interpreterId = v2InterpreterId || (typeof v1Meeting.interpreterId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.interpreterId)
                            : v1Meeting.interpreterId);
                    } catch (e) {
                        interpreterId = typeof v1Meeting.interpreterId === 'string'
                            ? new mongoose.Types.ObjectId(v1Meeting.interpreterId)
                            : v1Meeting.interpreterId;
                    }
                }
                
                // Check if we have minimum required IDs from V1
                if (!eventId || !boothId || !recruiterId || !jobseekerId) {
                    migrationStats.skipped++;
                    const successRate = ((migrationStats.successful / currentIndex) * 100).toFixed(1);
                    console.log(`   ⚠️  SKIPPED | ✅ ${migrationStats.successful} | ⚠️ ${migrationStats.skipped} | ❌ ${migrationStats.failed} | Success Rate: ${successRate}% | Missing: ${!eventId ? 'eventId' : ''} ${!boothId ? 'boothId' : ''} ${!recruiterId ? 'recruiterId' : ''} ${!jobseekerId ? 'jobseekerId' : ''}`);
                    continue;
                }
                
                // Create synthetic queue entry (required by V2 schema)
                const queueId = await createSyntheticQueue(jobseekerId, boothId, eventId, v1Meeting, v2Db);
                
                // Transform meeting data
                const transformedMeeting = await transformMeetingToV2(
                    v1Meeting, eventId, boothId, queueId, recruiterId, jobseekerId, interpreterId
                );
                
                // Insert into V2
                await insertMeetingToV2(transformedMeeting, v2Db);
                
                migrationStats.successful++;
                
                // Progress logging - show stats for every meeting
                const successRate = ((migrationStats.successful / currentIndex) * 100).toFixed(1);
                console.log(`   ✅ Migrated | ✅ ${migrationStats.successful} | ⚠️ ${migrationStats.skipped} | ❌ ${migrationStats.failed} | Success Rate: ${successRate}%`);
                
            } catch (error) {
                migrationStats.failed++;
                migrationStats.errors.push({
                    meetingId: v1Meeting.meetingId || v1Meeting._id?.toString() || 'unknown',
                    error: error.message
                });
                
                // Log errors with stats for all meetings
                const successRate = ((migrationStats.successful / currentIndex) * 100).toFixed(1);
                console.error(`   ❌ FAILED: ${error.message} | ✅ ${migrationStats.successful} | ⚠️ ${migrationStats.skipped} | ❌ ${migrationStats.failed} | Success Rate: ${successRate}%`);
                // Continue with next meeting
            }
        }
        
        // Close cursor
        await cursor.close();
        
        // Print final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`\n📈 Final Statistics:`);
        console.log(`   Total Meetings: ${migrationStats.total}`);
        console.log(`   ✅ Successful: ${migrationStats.successful}`);
        console.log(`   ❌ Failed: ${migrationStats.failed}`);
        console.log(`   ⚠️  Skipped: ${migrationStats.skipped}`);
        
        if (migrationStats.skipped > 0) {
            console.log(`\n📋 Skip Reasons:`);
            console.log(`   Event not found: ${migrationStats.skippedReasons.eventNotFound}`);
            console.log(`   Booth not found: ${migrationStats.skippedReasons.boothNotFound}`);
            console.log(`   Recruiter not found: ${migrationStats.skippedReasons.recruiterNotFound}`);
            console.log(`   JobSeeker not found: ${migrationStats.skippedReasons.jobseekerNotFound}`);
        }
        
        if (migrationStats.errors.length > 0) {
            console.log(`\n❌ Errors encountered (showing first 10):`);
            migrationStats.errors.slice(0, 10).forEach((err, idx) => {
                console.log(`   ${idx + 1}. Meeting ${err.meetingId}: ${err.error}`);
            });
            if (migrationStats.errors.length > 10) {
                console.log(`   ... and ${migrationStats.errors.length - 10} more errors`);
            }
        }
        
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
    // Run full migration - migrate all meeting records to V2
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = {
    transformMeetingToV2,
    findEventInV2,
    findBoothInV2,
    findRecruiterInV2,
    findJobSeekerInV2,
    createSyntheticQueue
};

