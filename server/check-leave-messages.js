const mongoose = require('mongoose');
require('dotenv').config();

// Load all models
const User = require('./models/User');
const Event = require('./models/Event');
const Booth = require('./models/Booth');
const BoothQueue = require('./models/BoothQueue');
const MeetingRecord = require('./models/MeetingRecord');

async function checkLeaveMessages() {
    try {
        // Connect to MongoDB
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability-job-fair');
        console.log('Connected to MongoDB');

        // Find all meeting records with left_with_message status
        const leaveMessages = await MeetingRecord.find({ status: 'left_with_message' })
            .populate('recruiterId', 'name email')
            .populate('jobseekerId', 'name email')
            .populate('eventId', 'name')
            .populate('boothId', 'name');

        console.log(`\nFound ${leaveMessages.length} meeting records with 'left_with_message' status\n`);

        if (leaveMessages.length > 0) {
            leaveMessages.forEach((record, index) => {
                console.log(`Record ${index + 1}:`);
                console.log(`  ID: ${record._id}`);
                console.log(`  Status: ${record.status}`);
                console.log(`  Event: ${record.eventId?.name || 'N/A'}`);
                console.log(`  Booth: ${record.boothId?.name || 'N/A'}`);
                console.log(`  Recruiter: ${record.recruiterId?.name || 'N/A'} (${record.recruiterId?.email || 'N/A'})`);
                console.log(`  Job Seeker: ${record.jobseekerId?.name || 'N/A'} (${record.jobseekerId?.email || 'N/A'})`);
                console.log(`  Created: ${record.createdAt}`);
                console.log(`  Messages: ${record.jobSeekerMessages?.length || 0}`);
                if (record.jobSeekerMessages && record.jobSeekerMessages.length > 0) {
                    record.jobSeekerMessages.forEach((msg, i) => {
                        console.log(`    Message ${i + 1}: ${msg.type} (${msg.isLeaveMessage ? 'Leave Message' : 'Regular'})`);
                    });
                }
                console.log('');
            });
        } else {
            console.log('No leave message records found.');
            console.log('\nChecking all meeting records:');
            const allRecords = await MeetingRecord.find({});
            console.log(`Total meeting records: ${allRecords.length}`);
            if (allRecords.length > 0) {
                console.log('Statuses found:', [...new Set(allRecords.map(r => r.status))]);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

checkLeaveMessages();
