const mongoose = require('mongoose');
const crypto = require('crypto');

// Database URI
const V1_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Prod_Ability';
const V2_DB_URI = 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

const TARGET_EMAIL = 'c200901052@gmail.com';
const TEST_PASSWORD = '12345678';

async function testPasswordComparison() {
    try {
        console.log('🧪 Testing Password Comparison Logic\n');
        console.log('='.repeat(60));
        
        // Connect to V1 database
        console.log('Connecting to V1 database...');
        const v1Connection = await mongoose.createConnection(V1_DB_URI).asPromise();
        const v1Db = v1Connection.db;
        
        // Get jobseeker from V1
        const jobSeekersCollection = v1Db.collection('jobseekers');
        const jobSeeker = await jobSeekersCollection.findOne({ email: TARGET_EMAIL });
        
        if (!jobSeeker) {
            throw new Error(`JobSeeker not found in V1: ${TARGET_EMAIL}`);
        }
        
        console.log(`✅ Found JobSeeker in V1: ${jobSeeker.firstName} ${jobSeeker.lastName}`);
        console.log(`   Hash: ${jobSeeker.hash_password.substring(0, 50)}...`);
        console.log(`   Salt: ${jobSeeker.salt}`);
        
        // Test V1 password validation logic
        console.log(`\n🔍 Testing V1 password validation logic:`);
        console.log(`   Password to test: ${TEST_PASSWORD}`);
        
        const v1Hash = crypto.pbkdf2Sync(
            TEST_PASSWORD,
            jobSeeker.salt,
            10000,
            512,
            'sha512'
        ).toString('hex');
        
        const v1Match = v1Hash === jobSeeker.hash_password;
        console.log(`   Computed hash: ${v1Hash.substring(0, 50)}...`);
        console.log(`   Stored hash: ${jobSeeker.hash_password.substring(0, 50)}...`);
        console.log(`   Match: ${v1Match ? '✅ YES' : '❌ NO'}`);
        
        // Connect to V2 database
        console.log('\nConnecting to V2 database...');
        const v2Connection = await mongoose.createConnection(V2_DB_URI).asPromise();
        const v2Db = v2Connection.db;
        
        // Get user from V2
        const usersCollection = v2Db.collection('users');
        const user = await usersCollection.findOne({ email: TARGET_EMAIL });
        
        if (!user) {
            throw new Error(`User not found in V2: ${TARGET_EMAIL}`);
        }
        
        console.log(`✅ Found User in V2: ${user.name}`);
        console.log(`   Legacy ID: ${user.legacyId || 'null'}`);
        
        // Check legacyPassword
        if (user.legacyPassword) {
            console.log(`\n🔍 Legacy Password in V2:`);
            console.log(`   Hash: ${user.legacyPassword.hash ? user.legacyPassword.hash.substring(0, 50) + '...' : 'null'}`);
            console.log(`   Salt: ${user.legacyPassword.salt || 'null'}`);
            
            // Test if hashes match between V1 and V2
            const hashMatch = user.legacyPassword.hash === jobSeeker.hash_password;
            const saltMatch = user.legacyPassword.salt === jobSeeker.salt;
            
            console.log(`\n🔍 Comparing V1 vs V2 stored data:`);
            console.log(`   Hash match: ${hashMatch ? '✅ YES' : '❌ NO'}`);
            console.log(`   Salt match: ${saltMatch ? '✅ YES' : '❌ NO'}`);
            
            if (!hashMatch || !saltMatch) {
                console.log(`\n❌ ERROR: Legacy password data doesn't match!`);
                console.log(`   V1 hash: ${jobSeeker.hash_password.substring(0, 30)}...`);
                console.log(`   V2 hash: ${user.legacyPassword.hash ? user.legacyPassword.hash.substring(0, 30) + '...' : 'null'}`);
            }
            
            // Test V2 password comparison logic
            console.log(`\n🔍 Testing V2 password comparison logic:`);
            const v2Hash = crypto.pbkdf2Sync(
                TEST_PASSWORD,
                user.legacyPassword.salt,
                10000,
                512,
                'sha512'
            ).toString('hex');
            
            const v2Match = v2Hash === user.legacyPassword.hash;
            console.log(`   Computed hash: ${v2Hash.substring(0, 50)}...`);
            console.log(`   Stored hash: ${user.legacyPassword.hash.substring(0, 50)}...`);
            console.log(`   Match: ${v2Match ? '✅ YES' : '❌ NO'}`);
            
            if (v1Match && !v2Match) {
                console.log(`\n❌ ERROR: V1 validation works but V2 doesn't!`);
                console.log(`   This means the migration stored incorrect data.`);
            } else if (v1Match && v2Match) {
                console.log(`\n✅ Both V1 and V2 validation work correctly!`);
                console.log(`   The issue might be in how comparePassword accesses legacyPassword.`);
            }
        } else {
            console.log(`\n❌ ERROR: legacyPassword field is missing in V2 database!`);
            console.log(`   Full user object keys: ${Object.keys(user).join(', ')}`);
        }
        
        console.log('\n' + '='.repeat(60));
        console.log('✅ Test completed');
        console.log('='.repeat(60));
        
    } catch (error) {
        console.error('\n❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        await mongoose.disconnect();
        process.exit(0);
    }
}

testPasswordComparison();

