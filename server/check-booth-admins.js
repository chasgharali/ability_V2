const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Booth = require('./models/Booth');

async function checkBoothAdmins() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability-job-fair');
        console.log('Connected to MongoDB\n');

        // Find the booth f12
        const booth = await Booth.findOne({ name: 'f12' })
            .populate('administrators', 'name email role');

        if (!booth) {
            console.log('Booth f12 not found');
            process.exit(0);
        }

        console.log('Booth: f12');
        console.log('ID:', booth._id);
        console.log('Administrators:', booth.administrators?.length || 0);
        
        if (booth.administrators && booth.administrators.length > 0) {
            booth.administrators.forEach((admin, i) => {
                console.log(`  Admin ${i + 1}:`);
                console.log(`    Name: ${admin.name}`);
                console.log(`    Email: ${admin.email}`);
                console.log(`    Role: ${admin.role}`);
            });
        } else {
            console.log('  No administrators assigned!\n');
            
            // Find recruiter accounts
            console.log('Available recruiters:');
            const recruiters = await User.find({ role: 'Recruiter' });
            recruiters.forEach((rec, i) => {
                console.log(`  ${i + 1}. ${rec.name} (${rec.email}) - ID: ${rec._id}`);
            });
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkBoothAdmins();
