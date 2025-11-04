const mongoose = require('mongoose');
require('dotenv').config();

const User = require('./models/User');
const Booth = require('./models/Booth');
const MeetingRecord = require('./models/MeetingRecord');

async function fixBoothAndRecords() {
    try {
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability-job-fair');
        console.log('Connected to MongoDB\n');

        // Get the recruiter
        const recruiter = await User.findOne({ email: 'recruiter@ability.com' });
        if (!recruiter) {
            console.log('Recruiter not found!');
            process.exit(1);
        }
        console.log(`Found recruiter: ${recruiter.name} (${recruiter.email})`);
        console.log(`Recruiter ID: ${recruiter._id}\n`);

        // Find booth f12
        const booth = await Booth.findOne({ name: 'f12' });
        if (!booth) {
            console.log('Booth f12 not found!');
            process.exit(1);
        }

        // Assign recruiter as administrator
        if (!booth.administrators) {
            booth.administrators = [];
        }
        
        if (!booth.administrators.includes(recruiter._id)) {
            booth.administrators.push(recruiter._id);
            await booth.save();
            console.log(`✅ Added ${recruiter.name} as administrator to booth f12\n`);
        } else {
            console.log(`✓ ${recruiter.name} is already an administrator of booth f12\n`);
        }

        // Update existing meeting records with wrong recruiter
        const wrongRecords = await MeetingRecord.find({
            boothId: booth._id,
            status: 'left_with_message',
            recruiterId: { $ne: recruiter._id }
        });

        console.log(`Found ${wrongRecords.length} meeting records with incorrect recruiter\n`);

        if (wrongRecords.length > 0) {
            for (const record of wrongRecords) {
                const oldRecruiterId = record.recruiterId;
                record.recruiterId = recruiter._id;
                await record.save();
                console.log(`✅ Updated record ${record._id}`);
                console.log(`   Changed recruiterId from ${oldRecruiterId} to ${recruiter._id}`);
            }
            console.log(`\n✅ Updated ${wrongRecords.length} meeting records`);
        }

        // Verify the fix
        console.log('\nVerification:');
        const allLeaveRecords = await MeetingRecord.find({ 
            boothId: booth._id,
            status: 'left_with_message' 
        }).populate('recruiterId', 'name email');

        console.log(`Total leave message records for booth f12: ${allLeaveRecords.length}`);
        if (allLeaveRecords.length > 0) {
            allLeaveRecords.forEach((record, i) => {
                console.log(`  ${i + 1}. Recruiter: ${record.recruiterId.name} (${record.recruiterId.email})`);
            });
        }

        console.log('\n✅ All done! The recruiter should now see leave messages in Meeting Records.');
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

fixBoothAndRecords();
