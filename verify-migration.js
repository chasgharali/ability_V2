const mongoose = require('mongoose');
require('dotenv').config({ path: './server/.env' });

// Import all models
const User = require('./server/models/User');
const Event = require('./server/models/Event');
const Booth = require('./server/models/Booth');
const Chat = require('./server/models/Chat');
const Note = require('./server/models/Note');
const MeetingRecord = require('./server/models/MeetingRecord');
const BoothQueue = require('./server/models/BoothQueue');
const VideoCall = require('./server/models/VideoCall');
const InterpreterCategory = require('./server/models/InterpreterCategory');
const JobSeekerInterest = require('./server/models/JobSeekerInterest');
const TermsConditions = require('./server/models/TermsConditions');

const NEW_DB_URI = process.env.MONGODB_URI || 'mongodb+srv://daniotech:JHogHMs8nvUmvWHO@cluster-ability.okhfe.mongodb.net/Ability_v2_dev';

async function verifyMigration() {
    try {
        console.log('Connecting to database...');
        await mongoose.connect(NEW_DB_URI, {
            useNewUrlParser: true,
            useUnifiedTopology: true
        });
        console.log('Connected successfully!\n');

        const results = {
            users: { total: 0, byRole: {}, issues: [] },
            events: { total: 0, byStatus: {}, issues: [] },
            booths: { total: 0, byStatus: {}, issues: [] },
            chats: { total: 0, byType: {}, issues: [] },
            notes: { total: 0, byType: {}, issues: [] },
            boothQueues: { total: 0, byStatus: {}, issues: [] },
            videoCalls: { total: 0, byStatus: {}, issues: [] },
            meetingRecords: { total: 0, byStatus: {}, issues: [] },
            interpreterCategories: { total: 0, issues: [] },
            jobSeekerInterests: { total: 0, issues: [] },
            termsConditions: { total: 0, issues: [] }
        };

        // Verify Users
        console.log('=== Verifying Users ===');
        const users = await User.find({});
        results.users.total = users.length;
        users.forEach(user => {
            results.users.byRole[user.role] = (results.users.byRole[user.role] || 0) + 1;
            
            if (!user.email) {
                results.users.issues.push(`User ${user._id} missing email`);
            }
            if (!user.hashedPassword || user.hashedPassword === 'temp_password_123') {
                results.users.issues.push(`User ${user.email} has temporary password`);
            }
        });
        console.log(`Total: ${results.users.total}`);
        console.log('By Role:', results.users.byRole);
        if (results.users.issues.length > 0) {
            console.log('Issues:', results.users.issues.slice(0, 5));
        }

        // Verify Events
        console.log('\n=== Verifying Events ===');
        const events = await Event.find({});
        results.events.total = events.length;
        events.forEach(event => {
            results.events.byStatus[event.status] = (results.events.byStatus[event.status] || 0) + 1;
            
            if (!event.slug) {
                results.events.issues.push(`Event ${event._id} missing slug`);
            }
            if (!event.createdBy) {
                results.events.issues.push(`Event ${event.name} missing createdBy`);
            }
        });
        console.log(`Total: ${results.events.total}`);
        console.log('By Status:', results.events.byStatus);
        if (results.events.issues.length > 0) {
            console.log('Issues:', results.events.issues.slice(0, 5));
        }

        // Verify Booths
        console.log('\n=== Verifying Booths ===');
        const booths = await Booth.find({});
        results.booths.total = booths.length;
        booths.forEach(booth => {
            results.booths.byStatus[booth.status] = (results.booths.byStatus[booth.status] || 0) + 1;
            
            if (!booth.eventId) {
                results.booths.issues.push(`Booth ${booth._id} missing eventId`);
            }
        });
        console.log(`Total: ${results.booths.total}`);
        console.log('By Status:', results.booths.byStatus);
        if (results.booths.issues.length > 0) {
            console.log('Issues:', results.booths.issues.slice(0, 5));
        }

        // Verify Relationships
        console.log('\n=== Verifying Relationships ===');
        
        // Check booth-event relationships
        const boothsWithoutEvent = await Booth.find({ eventId: { $exists: false } });
        if (boothsWithoutEvent.length > 0) {
            console.log(`⚠️  ${boothsWithoutEvent.length} booths without eventId`);
        }
        
        // Check booth queue relationships
        const queuesWithoutBooth = await BoothQueue.find({ booth: { $exists: false } });
        if (queuesWithoutBooth.length > 0) {
            console.log(`⚠️  ${queuesWithoutBooth.length} queue entries without booth`);
        }
        
        // Check video call relationships
        const videoCalls = await VideoCall.find({});
        results.videoCalls.total = videoCalls.length;
        videoCalls.forEach(call => {
            results.videoCalls.byStatus[call.status] = (results.videoCalls.byStatus[call.status] || 0) + 1;
            
            if (!call.recruiter || !call.jobSeeker) {
                results.videoCalls.issues.push(`VideoCall ${call._id} missing participants`);
            }
        });
        console.log(`Video Calls: ${results.videoCalls.total}`);

        // Check meeting record relationships
        const meetingRecords = await MeetingRecord.find({});
        results.meetingRecords.total = meetingRecords.length;
        meetingRecords.forEach(record => {
            results.meetingRecords.byStatus[record.status] = (results.meetingRecords.byStatus[record.status] || 0) + 1;
            
            if (!record.recruiterId || !record.jobseekerId) {
                results.meetingRecords.issues.push(`MeetingRecord ${record._id} missing participants`);
            }
        });
        console.log(`Meeting Records: ${results.meetingRecords.total}`);

        // Summary
        console.log('\n=== Migration Verification Summary ===');
        console.log(`Users: ${results.users.total}`);
        console.log(`Events: ${results.events.total}`);
        console.log(`Booths: ${results.booths.total}`);
        console.log(`Chats: ${results.chats.total}`);
        console.log(`Notes: ${results.notes.total}`);
        console.log(`Booth Queues: ${results.boothQueues.total}`);
        console.log(`Video Calls: ${results.videoCalls.total}`);
        console.log(`Meeting Records: ${results.meetingRecords.total}`);
        
        const totalIssues = Object.values(results).reduce((sum, r) => sum + (r.issues?.length || 0), 0);
        if (totalIssues > 0) {
            console.log(`\n⚠️  Total Issues Found: ${totalIssues}`);
            console.log('Review the issues above and fix as needed.');
        } else {
            console.log('\n✅ No issues found! Migration appears successful.');
        }

    } catch (error) {
        console.error('Verification error:', error);
        throw error;
    } finally {
        await mongoose.disconnect();
        console.log('\nDisconnected from database');
    }
}

// Run verification if called directly
if (require.main === module) {
    verifyMigration().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

module.exports = { verifyMigration };

