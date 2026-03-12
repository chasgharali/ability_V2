const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Organization = require('../models/Organization');

// ─── Default Organization ────────────────────────────────────────────────────
const DEFAULT_ORG = {
    name: 'Ability Job Fair',
    slug: 'abilityjobfair',
    description: 'Default organization.',
    isActive: true,
    limits: { maxEvents: 0, maxRecruiters: 0, maxJobSeekers: 0, maxBooths: 0 }
};

// ─── Seed Users ──────────────────────────────────────────────────────────────
const testUsers = [
    {
        name: 'Super Admin',
        email: 'superadmin@abilityconnect.online',
        password: 'SuperAdmin123!',
        role: 'SuperAdmin',
        organizationId: null, // global — no org scope
        avatarUrl: null,
        metadata: { department: 'Platform' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability2.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@abilit32.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability4.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability5.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability6.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@abilit72.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability8.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability9.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability10.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability11.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability12.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability13.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability14.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability15.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability16.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    },
    {
        name: 'Admin User',
        email: 'admin@ability17.com',
        password: 'Admin123!',
        role: 'Admin',
        avatarUrl: null,
        metadata: { department: 'IT', phone: '+1-555-0101' }
    }
];

async function seedUsers() {
    try {
        const mongoUri = process.env.MONGODB_URI;
        await mongoose.connect(mongoUri);
        console.log('Connected to MongoDB');

        // ── Ensure default org exists ──────────────────────────────────────
        let defaultOrg = await Organization.findOne({ slug: DEFAULT_ORG.slug });
        if (!defaultOrg) {
            defaultOrg = await Organization.create(DEFAULT_ORG);
            console.log(`Created default organization: ${defaultOrg.name}`);
        } else {
            if (defaultOrg.limits?.maxBooths === undefined) {
                defaultOrg.limits = { ...defaultOrg.limits, maxBooths: 0 };
                await defaultOrg.save();
                console.log('Updated default organization limits with maxBooths');
            }
            console.log(`Default organization already exists: ${defaultOrg.name}`);
        }

        const forceMode = process.argv.includes('--force');
        if (forceMode) {
            console.log('⚠️  Force mode: Will delete and recreate existing users');
        }

        const createdUsers = [];

        for (const userData of testUsers) {
            const existingUser = await User.findOne({ email: userData.email });
            if (existingUser) {
                if (forceMode) {
                    await User.deleteOne({ email: userData.email });
                    console.log(`Deleted existing user: ${userData.email}`);
                } else {
                    console.log(`User ${userData.email} already exists, skipping... (use --force to recreate)`);
                    continue;
                }
            }

            // Assign default org to non-global roles
            const orgScopedRoles = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport'];
            const organizationId = orgScopedRoles.includes(userData.role) ? defaultOrg._id : null;

            const user = new User({
                name: userData.name,
                email: userData.email,
                hashedPassword: userData.password,
                role: userData.role,
                avatarUrl: userData.avatarUrl,
                metadata: userData.metadata,
                organizationId,
                isActive: true,
                emailVerified: true
            });

            await user.save();
            createdUsers.push(user);
            console.log(`Created user: ${userData.name} (${userData.email}) - Role: ${userData.role}`);
        }

        console.log(`\n✅ Successfully seeded ${createdUsers.length} users`);

        console.log('\n📋 Test User Credentials:');
        console.log('=====================================');
        testUsers.forEach(u => {
            console.log(`${u.role}: ${u.email} / ${u.password}`);
        });

    } catch (error) {
        console.error('❌ Error seeding users:', error);
    } finally {
        await mongoose.connection.close();
        console.log('\n🔌 Disconnected from MongoDB');
    }
}

if (require.main === module) {
    seedUsers();
}

module.exports = seedUsers;
