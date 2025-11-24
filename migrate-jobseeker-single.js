const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Database URIs
const V1_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Prod_Ability';
const V2_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

// Connection instances
let v1Connection = null;
let v2Connection = null;
let User = null;

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
            socketTimeoutMS: 0, // No timeout for long-running operations
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000 // Keep connection alive
        }).asPromise();
        console.log('✅ Connected to V1 database');

        console.log('Connecting to V2 database (Ability_v2_dev)...');
        v2Connection = await mongoose.createConnection(V2_DB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 0, // No timeout for long-running operations
            maxPoolSize: 10,
            minPoolSize: 2,
            maxIdleTimeMS: 30000,
            heartbeatFrequencyMS: 10000 // Keep connection alive
        }).asPromise();
        console.log('✅ Connected to V2 database');

        return true;
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        throw error;
    }
}

/**
 * Map V1 camelCase disability keys to frontend display format
 */
function mapDisabilityKeyToDisplay(key) {
    const mapping = {
        'adhd': 'ADHD',
        'arthritis': 'Arthritis',
        'autoimmune': 'Autoimmune',
        'vision': 'Blindness / Vision Loss',
        'bloodRelated': 'Blood Related',
        'cancer': 'Cancer',
        'cardiovascular': 'Cardiovascular',
        'cerebralPalsy': 'Cerebral Palsy',
        'chronicPainMigraine': 'Chronic Pain/Migraine',
        'cognitive': 'Cognitive',
        'deafness': 'Deafness',
        'depression': 'Depression',
        'diabetes': 'Diabetes',
        'digestive': 'Digestive',
        'downSyndrome': 'Down Syndrome',
        'dyslexia': 'Dyslexia',
        'endocrine': 'Endocrine',
        'hearingLoss': 'Hearing Loss',
        'limbDiffAmputee': 'Limb Diff / Amputee',
        'mentalHealth': 'Mental Health',
        'multipleSclerosis': 'Multiple Sclerosis',
        'musculoskeletal': 'Musculoskeletal',
        'neurodevelopment': 'Neurodivergent', // Map neurodevelopment to Neurodivergent (frontend uses this)
        'neurological': 'Neurological',
        'paralysis': 'Paralysis',
        'postTraumaticStress': 'Post Traumatic Stress',
        'respiratory': 'Respiratory',
        'skin': 'Skin',
        'speech': 'Speech',
        'traumaticBrainInjury': 'Traumatic Brain Injury'
    };
    
    return mapping[key] || key; // Return mapped value or original key if not found
}

/**
 * Transform V1 disabilities boolean object to V2 string array with frontend display format
 */
function transformDisabilities(oldDisabilities) {
    if (!oldDisabilities || typeof oldDisabilities !== 'object') {
        return [];
    }

    // List of all disability keys from V1 schema
    const disabilityKeys = [
        'autoimmune',
        'bloodRelated',
        'cancer',
        'cardiovascular',
        'cognitive',
        'digestive',
        'endocrine',
        'hearingLoss',
        'limbDiffAmputee',
        'mentalHealth',
        'musculoskeletal',
        'neurodevelopment',
        'neurological',
        'paralysis',
        'respiratory',
        'skin',
        'speech',
        'vision',
        'deafness',
        'depression',
        'diabetes',
        'arthritis',
        'adhd',
        'downSyndrome',
        'dyslexia',
        'multipleSclerosis',
        'cerebralPalsy',
        'chronicPainMigraine',
        'postTraumaticStress',
        'traumaticBrainInjury'
    ];

    // Extract only true values and map to frontend display format
    const disabilityArray = disabilityKeys
        .filter(key => {
            if (key === 'otherDisability') return false;
            return oldDisabilities[key] === true;
        })
        .map(key => mapDisabilityKeyToDisplay(key)); // Map to display format

    return disabilityArray;
}

/**
 * Transform V1 JobSeeker data to V2 User format
 */
async function transformJobSeekerToUser(jobSeeker, survey, resume) {
    // Combine firstName and lastName
    const fullName = `${jobSeeker.firstName || ''} ${jobSeeker.lastName || ''}`.trim();
    
    // Create base user data
    const userData = {
        // Basic Info
        name: fullName || null,
        email: (jobSeeker.email || '').toLowerCase().trim() || null,
        role: 'JobSeeker',
        
        // Legacy ID for reference
        legacyId: jobSeeker._id ? jobSeeker._id.toString() : null,
        
        // Email verification
        emailVerified: jobSeeker.isEmailVerified || false,
        
        // Location fields (use NULL if missing)
        phoneNumber: jobSeeker.phone || null,
        state: jobSeeker.state || null,
        city: jobSeeker.city || null,
        country: jobSeeker.country || null, // Use null instead of default
        
        // Accessibility preferences (from accessibilityOptions object)
        usesScreenMagnifier: jobSeeker.accessibilityOptions?.screenMagnifier ?? false,
        usesScreenReader: jobSeeker.accessibilityOptions?.screenReader ?? false,
        needsASL: jobSeeker.accessibilityOptions?.asl ?? false,
        needsCaptions: jobSeeker.accessibilityOptions?.captions ?? false,
        needsOther: jobSeeker.accessibilityOptions?.others ?? false,
        subscribeAnnouncements: jobSeeker.announcements ?? false,
        
        // Legacy password support (for dual password validation)
        legacyPassword: {
            hash: jobSeeker.hash_password || null,
            salt: jobSeeker.salt || null,
            algorithm: 'pbkdf2'
        },
        
        // Temporary bcrypt hash (will be replaced on first login)
        hashedPassword: await bcrypt.hash('temp_migration_' + Date.now() + '_' + Math.random(), 12),
        
        // Registration date (preserve original registration/creation date)
        registrationDate: jobSeeker.createdAt || 
                         (jobSeeker.timestamps && jobSeeker.timestamps.createdAt) || 
                         jobSeeker.registrationDate || 
                         null,
        
        // Survey data (embedded)
        survey: {
            race: survey?.race || [],
            genderIdentity: survey?.gender || survey?.customGender || null,
            ageGroup: survey?.ageGroup || null,
            countryOfOrigin: survey?.countryOfOrigin || null,
            disabilities: transformDisabilities(survey?.disabilities),
            otherDisability: survey?.disabilities?.otherDisability || null,
            updatedAt: survey?.updatedAt || survey?.createdAt || null
        },
        
        // Resume URL
        resumeUrl: resume?.resumeFile || null,
        
        // Languages from resume
        languages: resume?.languages || [],
        
        // Active status
        isActive: true,
        
        // Metadata for additional fields
        metadata: {
            // Address fields
            address: jobSeeker.address || null,
            postalCode: jobSeeker.postalCode || null,
            
            // Event registrations
            events: jobSeeker.events || [],
            
            // Leave message
            leaveMessage: jobSeeker.leaveMessage || null,
            
            // Recording info
            recording: jobSeeker.recording || null,
            recordingThumbnail: jobSeeker.recordingThumbnail || null,
            
            // Pass through flag
            passThrough: jobSeeker.passThrough || false,
            
            // Profile details (transformed to match frontend expectations)
            profile: resume ? (() => {
                // Transform keywords: if array, join with comma; if string, keep as is
                let keywordsValue = null;
                if (Array.isArray(resume.keywords) && resume.keywords.length > 0) {
                    keywordsValue = resume.keywords.join(', ');
                } else if (resume.keywords && typeof resume.keywords === 'string') {
                    keywordsValue = resume.keywords;
                }
                
                const profileData = {
                    headline: resume.headline || null,
                    keywords: keywordsValue || null,
                    primaryExperience: Array.isArray(resume.primaryJobExperiences) ? resume.primaryJobExperiences : [],
                    workLevel: resume.workExperienceLevel || null,
                    educationLevel: resume.highestEducationLevel || null,
                    languages: Array.isArray(resume.languages) ? resume.languages : [],
                    employmentTypes: Array.isArray(resume.employmentTypes) ? resume.employmentTypes : [],
                    clearance: resume.securityClearance || null,
                    veteranStatus: resume.veteranStatus || resume.militaryStatus || null,
                    updatedAt: new Date()
                };
                
                // Remove null/empty values
                Object.keys(profileData).forEach(key => {
                    if (profileData[key] === null || profileData[key] === undefined || 
                        (key === 'keywords' && profileData[key] === '') ||
                        ((key === 'primaryExperience' || key === 'languages' || key === 'employmentTypes') && Array.isArray(profileData[key]) && profileData[key].length === 0)) {
                        delete profileData[key];
                    }
                });
                
                // Only include profile if it has data
                return Object.keys(profileData).length > 0 ? profileData : null;
            })() : null,
            
            // Survey submission status
            isPersonalSurveySubmitted: jobSeeker.isPersonalSurveySubmitted || false
        },
        
        // Timestamps
        createdAt: jobSeeker.createdAt || new Date(),
        updatedAt: jobSeeker.updatedAt || new Date()
    };

    return userData;
}

/**
 * Get collection names from V1 database
 */
async function getCollectionNames() {
    try {
        const v1Db = v1Connection.db;
        const collections = await v1Db.listCollections().toArray();
        return collections.map(c => c.name);
    } catch (error) {
        console.error('❌ Error getting collection names:', error.message);
        throw error;
    }
}

/**
 * Get total count of JobSeekers in V1
 */
async function getJobSeekerCount() {
    try {
        const v1Db = v1Connection.db;
        const collectionNames = await getCollectionNames();
        
        // Find jobseeker collection
        let jobSeekersCollectionName = null;
        const possibleNames = ['jobseekers', 'JobSeekers', 'jobSeekers'];
        for (const name of possibleNames) {
            if (collectionNames.includes(name)) {
                jobSeekersCollectionName = name;
                break;
            }
        }
        
        if (!jobSeekersCollectionName) {
            throw new Error('Could not find jobseekers collection');
        }
        
        const jobSeekersCollection = v1Db.collection(jobSeekersCollectionName);
        const count = await jobSeekersCollection.countDocuments({});
        
        return { count, jobSeekersCollectionName, collectionNames };
    } catch (error) {
        console.error('❌ Error getting jobseeker count:', error.message);
        throw error;
    }
}

/**
 * Get JobSeeker cursor for streaming (memory efficient)
 */
async function getJobSeekerCursor(jobSeekersCollectionName) {
    try {
        const v1Db = v1Connection.db;
        const jobSeekersCollection = v1Db.collection(jobSeekersCollectionName);
        
        // Use cursor with batch size for memory efficiency
        const cursor = jobSeekersCollection.find({}).batchSize(100);
        
        return cursor;
    } catch (error) {
        console.error('❌ Error getting jobseeker cursor:', error.message);
        throw error;
    }
}

/**
 * Fetch Survey and Resume for a given JobSeeker from V1
 */
async function fetchRelatedData(jobSeeker, collectionNames) {
    try {
        const v1Db = v1Connection.db;
        
        // Fetch related Survey
        const surveyCollectionName = collectionNames.find(name => 
            name.toLowerCase().includes('survey')
        ) || 'surveys';
        
        const surveysCollection = v1Db.collection(surveyCollectionName);
        const survey = await surveysCollection.findOne({
            userId: jobSeeker._id
        });
        
        // Fetch related Resume
        const resumeCollectionName = collectionNames.find(name => 
            name.toLowerCase().includes('resume')
        ) || 'resumes';
        
        const resumesCollection = v1Db.collection(resumeCollectionName);
        let resume = await resumesCollection.findOne({
            userId: jobSeeker._id
        });
        
        // If not found by userId, try by resumeId
        if (!resume && jobSeeker.resumeId) {
            resume = await resumesCollection.findOne({
                _id: jobSeeker.resumeId
            });
        }
        
        return { survey, resume };
    } catch (error) {
        console.error('❌ Error fetching related data:', error.message);
        throw error;
    }
}

/**
 * Fetch JobSeeker with related Survey and Resume from V1 (for single email lookup)
 */
async function fetchJobSeekerData(email, collectionNames) {
    try {
        const v1Db = v1Connection.db;
        
        // Find jobseeker collection
        let jobSeekersCollectionName = null;
        const possibleNames = ['jobseekers', 'JobSeekers', 'jobSeekers'];
        for (const name of possibleNames) {
            if (collectionNames.includes(name)) {
                jobSeekersCollectionName = name;
                break;
            }
        }
        
        if (!jobSeekersCollectionName) {
            throw new Error('Could not find jobseekers collection');
        }
        
        const jobSeekersCollection = v1Db.collection(jobSeekersCollectionName);
        
        // Find specific jobseeker by email
        const jobSeeker = await jobSeekersCollection.findOne({
            email: email
        });
        
        if (!jobSeeker) {
            return { jobSeeker: null, survey: null, resume: null };
        }
        
        // Fetch related data
        const { survey, resume } = await fetchRelatedData(jobSeeker, collectionNames);
        
        return { jobSeeker, survey, resume };
    } catch (error) {
        console.error('❌ Error fetching jobseeker data:', error.message);
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
 * Main migration function
 */
async function main() {
    try {
        console.log('🚀 Starting JobSeeker Migration Script - ALL JOBSEEKERS\n');
        console.log('='.repeat(60));
        
        // Connect to databases
        await connectDatabases();
        
        // Get V2 database reference for native operations
        const v2Db = v2Connection.db;
        
        // Get total count and collection info
        const { count, jobSeekersCollectionName, collectionNames } = await getJobSeekerCount();
        migrationStats.total = count;
        
        console.log(`\n📊 Found ${migrationStats.total} JobSeekers in V1 database`);
        console.log(`📊 Starting migration using streaming cursor (memory efficient)...`);
        console.log('='.repeat(60));
        
        // Get cursor for streaming (memory efficient - processes one at a time)
        const cursor = await getJobSeekerCursor(jobSeekersCollectionName);
        
        let currentIndex = 0;
        let verboseLogging = migrationStats.total <= 100; // Only verbose for small migrations
        
        // Process jobseekers using cursor (streaming - memory efficient)
        while (await cursor.hasNext()) {
            const jobSeeker = await cursor.next();
            currentIndex++;
            
            const email = (jobSeeker.email || '').toLowerCase().trim();
            
            try {
                // Log progress periodically or for first/last items
                if (verboseLogging || currentIndex === 1 || currentIndex === migrationStats.total || 
                    (currentIndex % 100 === 0) || 
                    (Date.now() - lastProgressUpdate) > PROGRESS_UPDATE_INTERVAL) {
                    console.log(`\n[${currentIndex}/${migrationStats.total}] Processing: ${email || 'NO EMAIL'}`);
                    if (verboseLogging) {
                        console.log(`   Name: ${jobSeeker.firstName || ''} ${jobSeeker.lastName || ''}`);
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
                
                // Fetch related survey and resume
                const { survey, resume } = await fetchRelatedData(jobSeeker, collectionNames);
                
                // Transform data to V2 format
                const transformedUserData = await transformJobSeekerToUser(jobSeeker, survey || null, resume || null);
                
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
                // Continue with next jobseeker instead of stopping
            }
        }
        
        // Close cursor
        await cursor.close();
        
        // Print final summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 MIGRATION COMPLETED');
        console.log('='.repeat(60));
        console.log(`\n📈 Final Statistics:`);
        console.log(`   Total JobSeekers: ${migrationStats.total}`);
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
    transformJobSeekerToUser,
    transformDisabilities,
    fetchJobSeekerData,
    fetchRelatedData,
    getJobSeekerCount,
    getJobSeekerCursor,
    getCollectionNames,
    deleteExistingUser,
    insertUserToV2
};

