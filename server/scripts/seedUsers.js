const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('../models/User');

const testUsers = [
    {
        name: 'Admin User',
        email: 'admin@ability2.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability2.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@abilit32.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability4.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability5.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability6.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability2.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@abilit72.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability8.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability9.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability10.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability11.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability12.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability13.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability14.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability15.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability16.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Admin User',
        email: 'admin@ability17.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
  
];

async function seedUsers() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');



        // Hash passwords and create users
        const createdUsers = [];

        // Check if --force flag is passed to delete existing users
        const forceMode = process.argv.includes('--force');
        if (forceMode) {
            console.log('⚠️  Force mode: Will delete and recreate existing users');
        }

        for (const userData of testUsers) {
            // Check if user already exists
            const existingUser = await User.findOne({ email: userData.email });
            if (existingUser) {
                if (forceMode) {
                    await User.deleteOne({ email: userData.email });
                    console.log(`🗑️  Deleted existing user: ${userData.email}`);
                } else {
                    console.log(`User ${userData.email} already exists, skipping... (use --force to recreate)`);
                    continue;
                }
            }

            // Create user with plain password - the pre-save middleware will hash it
            const user = new User({
                name: userData.name,
                email: userData.email,
                hashedPassword: userData.password, // Store plain password, middleware will hash it
                role: userData.role,
                avatarUrl: userData.avatarUrl,
                metadata: userData.metadata,
                isActive: true,           // Required for login
                emailVerified: true       // Skip email verification for seeded users
            });

            await user.save();
            createdUsers.push(user);
            console.log(`Created user: ${userData.name} (${userData.email}) - Role: ${userData.role}`);
        }

        console.log(`\n✅ Successfully seeded ${createdUsers.length} users`);

        // Display login credentials
        console.log('\n📋 Test User Credentials:');
        console.log('=====================================');
        testUsers.forEach(user => {
            console.log(`${user.role}: ${user.email} / ${user.password}`);
        });

    } catch (error) {
        console.error('❌ Error seeding users:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

// Run the seed function
if (require.main === module) {
    seedUsers();
}

module.exports = seedUsers;
