/**
 * Migration: fix-registered-jobseeker-per-event
 *
 * 1. Drops the old unique index { organizationId, jobSeekerId } on RegisteredJobSeeker
 *    (replaced by the new { organizationId, jobSeekerId, eventId } unique index in the schema)
 * 2. Backfills missing per-event rows from user.metadata.registeredEvents
 *    so that job seekers who registered for multiple events each have a row per event.
 *
 * Run:
 *   node server/migrations/fix-registered-jobseeker-per-event.js
 *   node server/migrations/fix-registered-jobseeker-per-event.js --dry-run
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const User = require('../models/User');
const Event = require('../models/Event');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');

const DRY_RUN = process.argv.includes('--dry-run');

async function run() {
    await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
    console.log('Connected to MongoDB');
    if (DRY_RUN) console.log('[DRY RUN] No writes will be made.\n');

    const collection = RegisteredJobSeeker.collection;

    // 1. Drop the old compound unique index if it still exists
    const indexes = await collection.indexes();
    const oldIndex = indexes.find(idx =>
        idx.unique &&
        idx.key &&
        idx.key.organizationId === 1 &&
        idx.key.jobSeekerId === 1 &&
        !idx.key.eventId
    );
    if (oldIndex) {
        console.log(`Dropping old index: ${oldIndex.name}`);
        if (!DRY_RUN) {
            await collection.dropIndex(oldIndex.name);
            // Ensure the new per-event unique index is created before backfilling
            await RegisteredJobSeeker.syncIndexes();
            console.log('New { organizationId, jobSeekerId, eventId } unique index ensured.');
        }
    } else {
        console.log('Old { organizationId, jobSeekerId } unique index not found — already removed or never existed.');
        if (!DRY_RUN) await RegisteredJobSeeker.syncIndexes();
    }

    // 2. Backfill: for each JobSeeker with metadata.registeredEvents, ensure
    //    a RegisteredJobSeeker row exists per (org, jobSeeker, event).
    const jobSeekers = await User.find(
        { role: 'JobSeeker', 'metadata.registeredEvents.0': { $exists: true } },
        { _id: 1, 'metadata.registeredEvents': 1 }
    ).lean();

    // Build a map of event._id → organizationId for fast lookup
    const allEvents = await Event.find({}, { _id: 1, organizationId: 1 }).lean();
    const eventOrgMap = new Map(allEvents.map(e => [e._id.toString(), e.organizationId?.toString()]));

    let inserted = 0;
    let skipped = 0;
    let errors = 0;

    for (const js of jobSeekers) {
        const entries = js.metadata?.registeredEvents || [];
        for (const entry of entries) {
            const eventId = entry.id?.toString();
            if (!eventId) continue;
            const orgId = eventOrgMap.get(eventId);
            if (!orgId) continue;

            if (DRY_RUN) {
                inserted++;
                continue;
            }

            try {
                await RegisteredJobSeeker.registerWithOrg(
                    new mongoose.Types.ObjectId(orgId),
                    js._id,
                    new mongoose.Types.ObjectId(eventId),
                    entry.resumeId ? new mongoose.Types.ObjectId(entry.resumeId) : null
                );
                inserted++;
            } catch (err) {
                if (err.code === 11000) {
                    skipped++;
                } else {
                    console.error(`Error for jobSeeker ${js._id} / event ${eventId}:`, err.message);
                    errors++;
                }
            }
        }
    }

    console.log(`\nBackfill complete: ${inserted} inserted, ${skipped} already existed, ${errors} errors`);
    await mongoose.disconnect();
    console.log('Done.');
}

run().catch(err => {
    console.error(err);
    process.exit(1);
});
