const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');

// Database URIs
const V1_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Prod_Ability';
const V2_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

// Connection instances
let v1Connection = null;
let v2Connection = null;

/**
 * Connect to both databases
 */
async function connectDatabases() {
    try {
        console.log('Connecting to V1 database (Prod_Ability)...');
        v1Connection = await mongoose.createConnection(V1_DB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        }).asPromise();
        console.log('✅ Connected to V1 database');

        console.log('Connecting to V2 database (Ability_v2_dev)...');
        v2Connection = await mongoose.createConnection(V2_DB_URI, {
            serverSelectionTimeoutMS: 30000,
            socketTimeoutMS: 45000
        }).asPromise();
        console.log('✅ Connected to V2 database');

        return true;
    } catch (error) {
        console.error('❌ Database connection error:', error.message);
        throw error;
    }
}

/**
 * Transform V1 disabilities boolean object to V2 string array
 */
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
        country: jobSeeker.country || 'US', // Default to US if missing
        
        // Accessibility preferences (from accessibilityOptions object)
        usesScreenMagnifier: jobSeeker.accessibilityOptions?.screenMagnifier ?? false,
        usesScreenReader: jobSeeker.accessibilityOptions?.screenReader ?? false,
        needsASL: jobSeeker.accessibilityOptions?.asl ?? false, // This should be true if ASL is enabled
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
        
        // Survey data (embedded)
        survey: {
            race: survey?.race || [],
            genderIdentity: survey?.gender || survey?.customGender || null,
            ageGroup: survey?.ageGroup || null,
            countryOfOrigin: survey?.countryOfOrigin || null,
            disabilities: transformDisabilities(survey?.disabilities),
            otherDisability: survey?.disabilities?.otherDisability || null,
            updatedAt: survey?.updatedAt || survey?.createdAt || null // Use createdAt if updatedAt not available
        },
        
        // Resume URL
        resumeUrl: resume?.resumeFile || null,
        
        // Languages from resume
        languages: resume?.languages || [],
        
        // Active status
        isActive: true,
        
        // Registration date (preserve original registration/creation date)
        // MongoDB timestamps might be stored differently, check all variations
        registrationDate: jobSeeker.createdAt || 
                         (jobSeeker.timestamps && jobSeeker.timestamps.createdAt) || 
                         jobSeeker.registrationDate || 
                         null,
        
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
 * Fetch one JobSeeker with related Survey and Resume from V1
 */
async function fetchJobSeekerData() {
    try {
        const v1Db = v1Connection.db;
        
        // Try to find collection name (MongoDB pluralizes model names)
        // Common variations: jobseekers, jobseekers, JobSeekers
        const collections = await v1Db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);
        
        // Find jobseeker collection (try common variations)
        let jobSeekersCollectionName = null;
        const possibleNames = ['jobseekers', 'JobSeekers', 'jobSeekers'];
        for (const name of possibleNames) {
            if (collectionNames.includes(name)) {
                jobSeekersCollectionName = name;
                break;
            }
        }
        
        if (!jobSeekersCollectionName) {
            console.log('Available collections:', collectionNames.join(', '));
            throw new Error('Could not find jobseekers collection. Available: ' + collectionNames.join(', '));
        }
        
        console.log(`📁 Using collection: ${jobSeekersCollectionName}`);
        const jobSeekersCollection = v1Db.collection(jobSeekersCollectionName);
        
        // Find specific jobseeker by email or one with complete data
        console.log('\n📋 Fetching JobSeeker from V1 database...');
        
        // Try to find specific email first
        const targetEmail = 'c200901052@gmail.com';
        let jobSeeker = await jobSeekersCollection.findOne({
            email: targetEmail
        });
        
        // If not found, use generic query
        if (!jobSeeker) {
            console.log(`⚠️  JobSeeker with email ${targetEmail} not found, fetching first available...`);
            jobSeeker = await jobSeekersCollection.findOne({
                email: { $exists: true, $ne: null, $ne: '' }
            });
        } else {
            console.log(`✅ Found specific JobSeeker with email: ${targetEmail}`);
        }
        
        if (!jobSeeker) {
            throw new Error('No jobseeker found in V1 database with valid email');
        }
        
        console.log(`✅ Found JobSeeker: ${jobSeeker.firstName || ''} ${jobSeeker.lastName || ''} (${jobSeeker.email})`);
        console.log(`   JobSeeker ID: ${jobSeeker._id}`);
        
        // Debug: Print raw jobseeker data (important fields)
        console.log('\n🔍 Raw JobSeeker Data:');
        console.log(`   - Email: ${jobSeeker.email}`);
        console.log(`   - ASL (accessibilityOptions.asl): ${jobSeeker.accessibilityOptions?.asl}`);
        console.log(`   - CreatedAt: ${jobSeeker.createdAt}`);
        console.log(`   - ResumeId: ${jobSeeker.resumeId}`);
        console.log(`   - All JobSeeker fields:`, Object.keys(jobSeeker));
        console.log(`   - Full JobSeeker document:`, JSON.stringify(jobSeeker, null, 2));
        console.log(`   - AccessibilityOptions:`, JSON.stringify(jobSeeker.accessibilityOptions || {}, null, 2));
        
        // Fetch related Survey (try common collection name variations)
        console.log('\n📋 Fetching related Survey...');
        const surveyCollectionName = collectionNames.find(name => 
            name.toLowerCase().includes('survey')
        ) || 'surveys';
        
        console.log(`   Using collection: ${surveyCollectionName}`);
        const surveysCollection = v1Db.collection(surveyCollectionName);
        const survey = await surveysCollection.findOne({
            userId: jobSeeker._id
        });
        
        if (survey) {
            const disabilityCount = survey.disabilities ? Object.keys(survey.disabilities).filter(
                key => survey.disabilities[key] === true && key !== 'otherDisability'
            ).length : 0;
            console.log(`✅ Found Survey with ${disabilityCount} disabilities selected`);
            console.log(`   - Race: ${JSON.stringify(survey.race || [])}`);
            console.log(`   - Gender: ${survey.gender || survey.customGender || 'null'}`);
            console.log(`   - Age Group: ${survey.ageGroup || 'null'}`);
            console.log(`   - Country of Origin: ${survey.countryOfOrigin || 'null'}`);
            console.log(`   - Full Survey document:`, JSON.stringify(survey, null, 2));
            console.log(`   - Disabilities Object:`, JSON.stringify(survey.disabilities || {}, null, 2));
        } else {
            console.log('⚠️  No survey found for this jobseeker');
            console.log(`   Searched for userId: ${jobSeeker._id}`);
        }
        
        // Fetch related Resume (try common collection name variations)
        console.log('\n📋 Fetching related Resume...');
        const resumeCollectionName = collectionNames.find(name => 
            name.toLowerCase().includes('resume')
        ) || 'resumes';
        
        console.log(`   Using collection: ${resumeCollectionName}`);
        const resumesCollection = v1Db.collection(resumeCollectionName);
        // Try both userId and resumeId reference
        let resume = await resumesCollection.findOne({
            userId: jobSeeker._id
        });
        
        // If not found by userId, try by resumeId
        if (!resume && jobSeeker.resumeId) {
            console.log(`   Trying resumeId: ${jobSeeker.resumeId}`);
            resume = await resumesCollection.findOne({
                _id: jobSeeker.resumeId
            });
        }
        
        if (resume) {
            console.log(`✅ Found Resume ${resume.resumeFile ? 'with file: ' + resume.resumeFile : '(no file URL)'}`);
            console.log(`   - Full Resume document:`, JSON.stringify(resume, null, 2));
            console.log(`   - Veteran Status: ${resume.veteranStatus || 'null'}`);
            console.log(`   - Military Status: ${resume.militaryStatus || 'null'}`);
            console.log(`   - Languages: ${JSON.stringify(resume.languages || [])}`);
        } else {
            console.log('⚠️  No resume found for this jobseeker');
            console.log(`   Searched userId: ${jobSeeker._id}`);
            if (jobSeeker.resumeId) {
                console.log(`   Searched resumeId: ${jobSeeker.resumeId}`);
            }
        }
        
        return { jobSeeker, survey, resume };
    } catch (error) {
        console.error('❌ Error fetching jobseeker data:', error.message);
        throw error;
    }
}

/**
 * Main function to test migration transformation
 */
async function main() {
    try {
        console.log('🚀 Starting JobSeeker Migration Test Script\n');
        console.log('='.repeat(60));
        
        // Connect to databases
        await connectDatabases();
        
        // Fetch one jobseeker with related data
        const { jobSeeker, survey, resume } = await fetchJobSeekerData();
        
        // Transform data to V2 format
        console.log('\n🔄 Transforming data to V2 format...');
        const transformedUserData = await transformJobSeekerToUser(jobSeeker, survey, resume);
        
        // Print transformed data (formatted for readability)
        console.log('\n' + '='.repeat(60));
        console.log('📊 TRANSFORMED USER DATA (Ready for V2 Database)');
        console.log('='.repeat(60));
        
        // Pretty print the data
        console.log('\n📄 Complete User Document:');
        console.log(JSON.stringify(transformedUserData, null, 2));
        
        // Print summary
        console.log('\n' + '='.repeat(60));
        console.log('📊 DATA TRANSFORMATION SUMMARY');
        console.log('='.repeat(60));
        console.log(`✅ Name: ${transformedUserData.name}`);
        console.log(`✅ Email: ${transformedUserData.email}`);
        console.log(`✅ Legacy ID: ${transformedUserData.legacyId}`);
        console.log(`✅ Phone: ${transformedUserData.phoneNumber || 'NULL'}`);
        console.log(`✅ Location: ${transformedUserData.city || 'NULL'}, ${transformedUserData.state || 'NULL'}, ${transformedUserData.country}`);
        console.log(`✅ Resume URL: ${transformedUserData.resumeUrl || 'NULL'}`);
        console.log(`✅ Languages: ${transformedUserData.languages.length > 0 ? transformedUserData.languages.join(', ') : 'None'}`);
        console.log(`✅ ASL (needsASL): ${transformedUserData.needsASL}`);
        console.log(`✅ Registration Date: ${transformedUserData.registrationDate || 'NULL'}`);
        console.log(`✅ Disabilities (array): ${transformedUserData.survey.disabilities.length} items`);
        console.log(`   - ${transformedUserData.survey.disabilities.join(', ') || 'None'}`);
        console.log(`✅ Other Disability: ${transformedUserData.survey.otherDisability || 'NULL'}`);
        console.log(`✅ Gender Identity: ${transformedUserData.survey.genderIdentity || 'NULL'}`);
        console.log(`✅ Age Group: ${transformedUserData.survey.ageGroup || 'NULL'}`);
        console.log(`✅ Race: ${transformedUserData.survey.race.length > 0 ? transformedUserData.survey.race.join(', ') : 'None'}`);
        console.log(`✅ Veteran Status: ${transformedUserData.metadata.profile?.veteranStatus || 'NULL'}`);
        console.log(`✅ Legacy Password Hash: ${transformedUserData.legacyPassword.hash ? 'Present' : 'NULL'}`);
        console.log(`✅ Legacy Password Salt: ${transformedUserData.legacyPassword.salt ? 'Present' : 'NULL'}`);
        console.log(`✅ Profile Metadata: ${transformedUserData.metadata.profile ? 'Present' : 'NULL'}`);
        if (transformedUserData.metadata.profile) {
            console.log(`   - Headline: ${transformedUserData.metadata.profile.headline || 'NULL'}`);
            console.log(`   - Primary Experience: ${Array.isArray(transformedUserData.metadata.profile.primaryExperience) ? transformedUserData.metadata.profile.primaryExperience.length + ' items' : 'NULL'}`);
            console.log(`   - Work Level: ${transformedUserData.metadata.profile.workLevel || 'NULL'}`);
        }
        console.log(`✅ Events Registered: ${transformedUserData.metadata.events.length} events`);
        
        // Check for NULL values
        const nullFields = [];
        Object.keys(transformedUserData).forEach(key => {
            if (transformedUserData[key] === null) {
                nullFields.push(key);
            }
        });
        
        if (nullFields.length > 0) {
            console.log(`\n⚠️  Fields with NULL values: ${nullFields.join(', ')}`);
        } else {
            console.log(`\n✅ No NULL fields in top level (as expected)`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Migration test completed successfully!');
        console.log('='.repeat(60));
        console.log('\n💡 Next steps:');
        console.log('   1. Review the transformed data above');
        console.log('   2. Verify all fields are correctly mapped');
        console.log('   3. Check that disabilities array is correct');
        console.log('   4. Ensure legacy password fields are present');
        console.log('   5. Confirm NULL values are used for missing data');
        console.log('\n');
        
    } catch (error) {
        console.error('\n❌ Migration test failed:', error);
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
    fetchJobSeekerData
};

