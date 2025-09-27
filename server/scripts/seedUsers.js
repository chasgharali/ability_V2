const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();

// Import User model
const User = require('../models/User');

const testUsers = [
    {
        name: 'Admin User',
        email: 'admin@ability.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: {
            department: 'IT',
            phone: '+1-555-0101'
        }
    },
    {
        name: 'Event Admin',
        email: 'eventadmin@ability.com',
        password: 'Event123!',
        role: 'AdminEvent',
        avatarUrl: null,
        metadata: {
            department: 'Events',
            phone: '+1-555-0102'
        }
    },
    {
        name: 'Booth Admin',
        email: 'boothadmin@ability.com',
        password: 'Booth123!',
        role: 'BoothAdmin',
        avatarUrl: null,
        metadata: {
            department: 'Recruitment',
            phone: '+1-555-0103'
        }
    },
    {
        name: 'John Recruiter',
        email: 'recruiter@ability.com',
        password: 'Recruit123!',
        role: 'Recruiter',
        avatarUrl: null,
        metadata: {
            department: 'HR',
            phone: '+1-555-0104',
            company: 'Tech Corp'
        }
    },
    {
        name: 'Sarah Interpreter',
        email: 'interpreter@ability.com',
        password: 'Interp123!',
        role: 'Interpreter',
        avatarUrl: null,
        metadata: {
            languages: ['English', 'Spanish', 'French'],
            phone: '+1-555-0105'
        }
    },
    {
        name: 'Global Interpreter',
        email: 'globalinterp@ability.com',
        password: 'Global123!',
        role: 'GlobalInterpreter',
        avatarUrl: null,
        metadata: {
            languages: ['English', 'Spanish', 'French', 'German', 'Italian'],
            phone: '+1-555-0106'
        }
    },
    {
        name: 'Support Agent',
        email: 'support@ability.com',
        password: 'Support123!',
        role: 'Support',
        avatarUrl: null,
        metadata: {
            department: 'Customer Support',
            phone: '+1-555-0107'
        }
    },
    {
        name: 'Global Support',
        email: 'globalsupport@ability.com',
        password: 'GlobalSup123!',
        role: 'GlobalSupport',
        avatarUrl: null,
        metadata: {
            department: 'Global Support',
            phone: '+1-555-0108'
        }
    },
    {
        name: 'Jane JobSeeker',
        email: 'jobseeker@ability.com',
        password: 'JobSeeker123!',
        role: 'JobSeeker',
        avatarUrl: null,
        metadata: {
            phone: '+1-555-0109',
            location: 'New York, NY',
            experience: '5 years',
            skills: ['JavaScript', 'React', 'Node.js']
        }
    },
    {
        name: 'Mike Candidate',
        email: 'candidate@ability.com',
        password: 'Candidate123!',
        role: 'JobSeeker',
        avatarUrl: null,
        metadata: {
            phone: '+1-555-0110',
            location: 'San Francisco, CA',
            experience: '3 years',
            skills: ['Python', 'Django', 'PostgreSQL']
        }
    }
];

async function seedUsers() {
    try {
        // Connect to MongoDB
        const mongoUri = process.env.MONGODB_URI || 'mongodb://localhost:27017/ability_v2_dev';
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // Clear existing users to fix password hashing issue
        await User.deleteMany({});
        console.log('Cleared existing users');

        // Hash passwords and create users
        const createdUsers = [];

        for (const userData of testUsers) {
            // Check if user already exists
            const existingUser = await User.findOne({ email: userData.email });
            if (existingUser) {
                console.log(`User ${userData.email} already exists, skipping...`);
                continue;
            }

            // Create user with plain password - the pre-save middleware will hash it
            const user = new User({
                name: userData.name,
                email: userData.email,
                hashedPassword: userData.password, // Store plain password, middleware will hash it
                role: userData.role,
                avatarUrl: userData.avatarUrl,
                metadata: userData.metadata
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
