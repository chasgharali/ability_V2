/**
 * Migration: add-organization-scope
 *
 * This migration:
 * 1. Creates the default "abilityjobfair" organization
 * 2. Assigns organizationId to all existing Users (non-JobSeeker, non-SuperAdmin)
 * 3. Assigns organizationId to all Events, Booths, TermsConditions, Notes,
 *    InterpreterCategories, RoleMessages, and Settings
 * 4. Backfills RegisteredJobSeeker from existing event registrations
 *    (uses the event's settings.registrationSettings metadata if available,
 *     otherwise scans BoothQueue records for event participants)
 *
 * Run: node server/migrations/add-organization-scope.js
 * Idempotent: safe to run multiple times — already-assigned records are skipped.
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Organization = require('../models/Organization');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const User = require('../models/User');
const Event = require('../models/Event');
const Booth = require('../models/Booth');
const TermsConditions = require('../models/TermsConditions');
const Note = require('../models/Note');
const InterpreterCategory = require('../models/InterpreterCategory');
const RoleMessage = require('../models/RoleMessage');
const Settings = require('../models/Settings');
const BoothQueue = require('../models/BoothQueue');

async function run() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // -------------------------------------------------------------------------
    // 1. Create default organization
    // -------------------------------------------------------------------------
    let defaultOrg = await Organization.findOne({ slug: 'abilityjobfair' });
    if (!defaultOrg) {
        defaultOrg = await Organization.create({
            name: 'Ability Job Fair',
            slug: 'abilityjobfair',
            description: 'Default organization — all legacy data is scoped here.',
            isActive: true,
            limits: { maxEvents: 0, maxRecruiters: 0, maxJobSeekers: 0, maxBooths: 0 }
        });
        console.log(`Created default organization: ${defaultOrg.name} (${defaultOrg._id})`);
    } else {
        if (defaultOrg.limits?.maxBooths === undefined) {
            defaultOrg.limits = {
                ...defaultOrg.limits,
                maxBooths: 0
            };
            await defaultOrg.save();
            console.log('Updated default organization limits with maxBooths');
        }
        console.log(`Default organization already exists: ${defaultOrg.name} (${defaultOrg._id})`);
    }

    const orgId = defaultOrg._id;

    // -------------------------------------------------------------------------
    // 2. Assign organizationId to all org-scoped Users
    //    (skip JobSeeker and SuperAdmin — they are global)
    // -------------------------------------------------------------------------
    const orgScopedRoles = ['Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Interpreter', 'GlobalInterpreter', 'Support', 'GlobalSupport'];
    const userResult = await User.updateMany(
        { role: { $in: orgScopedRoles }, organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${userResult.modifiedCount} users`);

    // -------------------------------------------------------------------------
    // 3. Assign organizationId to Events
    // -------------------------------------------------------------------------
    const eventResult = await Event.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${eventResult.modifiedCount} events`);

    // -------------------------------------------------------------------------
    // 4. Assign organizationId to Booths
    // -------------------------------------------------------------------------
    const boothResult = await Booth.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${boothResult.modifiedCount} booths`);

    // -------------------------------------------------------------------------
    // 5. Assign organizationId to TermsConditions
    // -------------------------------------------------------------------------
    const termsResult = await TermsConditions.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${termsResult.modifiedCount} terms & conditions`);

    // -------------------------------------------------------------------------
    // 6. Assign organizationId to Notes
    // -------------------------------------------------------------------------
    const noteResult = await Note.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${noteResult.modifiedCount} notes`);

    // -------------------------------------------------------------------------
    // 7. Assign organizationId to InterpreterCategories
    // -------------------------------------------------------------------------
    const catResult = await InterpreterCategory.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${catResult.modifiedCount} interpreter categories`);

    // -------------------------------------------------------------------------
    // 8. Assign organizationId to RoleMessages
    // -------------------------------------------------------------------------
    const rmResult = await RoleMessage.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${rmResult.modifiedCount} role messages`);

    // -------------------------------------------------------------------------
    // 9. Assign organizationId to Settings
    // -------------------------------------------------------------------------
    const settingsResult = await Settings.updateMany(
        { organizationId: null },
        { $set: { organizationId: orgId } }
    );
    console.log(`Assigned organizationId to ${settingsResult.modifiedCount} settings`);

    // -------------------------------------------------------------------------
    // 10. Backfill RegisteredJobSeeker from BoothQueue records
    //     For each completed/in_meeting queue entry, register the job seeker
    //     with the org that owns the event.
    // -------------------------------------------------------------------------
    console.log('Backfilling RegisteredJobSeeker records...');

    // Get all events to build a map of eventId -> organizationId
    const events = await Event.find({}, { _id: 1, organizationId: 1 }).lean();
    const eventOrgMap = {};
    events.forEach(e => {
        if (e.organizationId) {
            eventOrgMap[e._id.toString()] = e.organizationId;
        }
    });

    // Process BoothQueue records in batches to avoid memory issues
    const batchSize = 500;
    let skip = 0;
    let totalRegistered = 0;
    let totalSkipped = 0;

    while (true) {
        const entries = await BoothQueue.find(
            { status: { $in: ['completed', 'in_meeting', 'left', 'left_with_message', 'invited'] } },
            { jobSeeker: 1, event: 1, createdAt: 1 }
        )
            .skip(skip)
            .limit(batchSize)
            .lean();

        if (entries.length === 0) break;

        for (const entry of entries) {
            const eventOrgId = eventOrgMap[entry.event?.toString()];
            if (!entry.jobSeeker || !entry.event || !eventOrgId) {
                totalSkipped++;
                continue;
            }

            try {
                await RegisteredJobSeeker.registerWithOrg(eventOrgId, entry.jobSeeker, entry.event);
                totalRegistered++;
            } catch (err) {
                // Duplicate key errors are expected (idempotent) — ignore them
                if (err.code !== 11000) {
                    console.error(`Error registering jobseeker ${entry.jobSeeker}: ${err.message}`);
                }
                totalSkipped++;
            }
        }

        skip += batchSize;
    }

    console.log(`RegisteredJobSeeker backfill: ${totalRegistered} registered, ${totalSkipped} skipped`);

    console.log('\n✅ Migration completed successfully');
}

run()
    .catch(err => {
        console.error('❌ Migration failed:', err);
        process.exit(1);
    })
    .finally(() => mongoose.connection.close());
