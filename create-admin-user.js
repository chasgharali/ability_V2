/**
 * Script to Create Admin User
 * 
 * This script creates an admin user in the database.
 * Use this to recreate the admin user that was deleted.
 */

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const path = require('path');

// Try to load dotenv
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

// Admin user details
const ADMIN_EMAIL = 'tadmin.ability@yopmail.com';
const ADMIN_PASSWORD = 'Admin@123'; // Change this to a secure password
const ADMIN_NAME = 'Test Admin';

async function createAdminUser() {
    try {
        console.log('='.repeat(70));
        console.log('ADMIN USER CREATION SCRIPT');
        console.log('='.repeat(70));
        console.log('');
        console.log('MongoDB URI:', MONGODB_URI ? MONGODB_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:****@') : 'NOT SET');
        console.log('Connecting to MongoDB...');
        
        await mongoose.connect(MONGODB_URI);
        console.log('✓ Connected to MongoDB successfully\n');
        
        // Define User model
        const userSchema = new mongoose.Schema({
            name: { type: String, required: true },
            email: { type: String, required: true, unique: true },
            hashedPassword: { type: String, required: true },
            role: { type: String, required: true },
            emailVerified: { type: Boolean, default: true },
            isActive: { type: Boolean, default: true },
            refreshTokens: [{
                token: String,
                createdAt: { type: Date, default: Date.now }
            }]
        }, { timestamps: true, collection: 'users' });
        
        const User = mongoose.model('User', userSchema);
        
        // Check if admin user already exists
        const existingUser = await User.findOne({ email: ADMIN_EMAIL });
        
        if (existingUser) {
            console.log(`⚠️  Admin user "${ADMIN_EMAIL}" already exists in database.`);
            console.log('   User details:');
            console.log(`   - Name: ${existingUser.name}`);
            console.log(`   - Email: ${existingUser.email}`);
            console.log(`   - Role: ${existingUser.role}`);
            console.log(`   - Created: ${new Date(existingUser.createdAt).toLocaleString()}`);
            console.log(`   - Active: ${existingUser.isActive}`);
            console.log(`   - Email Verified: ${existingUser.emailVerified}`);
            
            console.log('\n❓ Do you want to:');
            console.log('   1. Keep the existing user');
            console.log('   2. Update the existing user');
            console.log('   3. Delete and recreate');
            console.log('\n   Please modify this script to choose an option.');
            
        } else {
            console.log(`Creating admin user: ${ADMIN_EMAIL}`);
            
            // Hash password
            const salt = await bcrypt.genSalt(12);
            const hashedPassword = await bcrypt.hash(ADMIN_PASSWORD, salt);
            
            // Create admin user
            const adminUser = new User({
                name: ADMIN_NAME,
                email: ADMIN_EMAIL,
                hashedPassword: hashedPassword,
                role: 'Admin',
                emailVerified: true,
                isActive: true,
                refreshTokens: []
            });
            
            await adminUser.save();
            
            console.log('✅ Admin user created successfully!');
            console.log('');
            console.log('User details:');
            console.log(`   - Email: ${ADMIN_EMAIL}`);
            console.log(`   - Password: ${ADMIN_PASSWORD}`);
            console.log(`   - Name: ${ADMIN_NAME}`);
            console.log(`   - Role: Admin`);
            console.log(`   - Created: ${new Date().toLocaleString()}`);
            console.log('');
            console.log('⚠️  IMPORTANT: Change the password after first login!');
        }
        
        // List all admin users
        console.log('\n' + '='.repeat(70));
        console.log('All Admin Users in Database:');
        console.log('-'.repeat(70));
        
        const allAdmins = await User.find({ role: 'Admin' }).select('email name createdAt isActive emailVerified').lean();
        
        if (allAdmins.length === 0) {
            console.log('No admin users found.');
        } else {
            allAdmins.forEach((admin, index) => {
                console.log(`${index + 1}. ${admin.email}`);
                console.log(`   Name: ${admin.name}`);
                console.log(`   Created: ${new Date(admin.createdAt).toLocaleString()}`);
                console.log(`   Active: ${admin.isActive}`);
                console.log(`   Email Verified: ${admin.emailVerified}`);
                console.log('');
            });
        }
        
        console.log('='.repeat(70));
        console.log('SCRIPT COMPLETE');
        console.log('='.repeat(70));
        
    } catch (error) {
        console.error('\n❌ Error:', error.message);
        if (error.code === 11000) {
            console.error('\n   This is a duplicate key error. The user already exists.');
            console.error('   Try running the script again or check your database.');
        }
        console.error('\nStack:', error.stack);
        process.exit(1);
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from MongoDB');
    }
}

if (require.main === module) {
    createAdminUser().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { createAdminUser };
