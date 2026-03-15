/**
 * Migration: backfill-report-organization-scope
 *
 * Backfills organization ownership for report collections and ensures
 * RegisteredJobSeeker memberships exist for historical records.
 *
 * Run:
 *   node server/migrations/backfill-report-organization-scope.js
 *   node server/migrations/backfill-report-organization-scope.js --dry-run
 */

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

const Event = require('../models/Event');
const Booth = require('../models/Booth');
const BoothQueue = require('../models/BoothQueue');
const MeetingRecord = require('../models/MeetingRecord');
const JobSeekerInterest = require('../models/JobSeekerInterest');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');

const DRY_RUN = process.argv.includes('--dry-run');
const BATCH_SIZE = 500;

async function buildOrgMaps() {
    const [events, booths] = await Promise.all([
        Event.find({}, { _id: 1, organizationId: 1 }).lean(),
        Booth.find({}, { _id: 1, organizationId: 1 }).lean()
    ]);

    const eventOrgMap = new Map();
    const boothOrgMap = new Map();

    events.forEach(event => {
        if (event.organizationId) eventOrgMap.set(event._id.toString(), event.organizationId);
    });
    booths.forEach(booth => {
        if (booth.organizationId) boothOrgMap.set(booth._id.toString(), booth.organizationId);
    });

    return { eventOrgMap, boothOrgMap };
}

function unresolvedOrgQuery(lastId) {
    return {
        $and: [
            {
                $or: [
                    { organizationId: null },
                    { organizationId: { $exists: false } }
                ]
            },
            ...(lastId ? [{ _id: { $gt: lastId } }] : [])
        ]
    };
}

async function backfillCollectionOrg({ model, name, eventField, boothField, eventOrgMap, boothOrgMap }) {
    let lastId = null;
    let processed = 0;
    let updated = 0;
    let unresolved = 0;

    while (true) {
        const docs = await model.find(unresolvedOrgQuery(lastId))
            .select(`_id ${eventField} ${boothField}`)
            .sort({ _id: 1 })
            .limit(BATCH_SIZE)
            .lean();

        if (!docs.length) break;

        const ops = [];
        for (const doc of docs) {
            processed += 1;
            const eventId = doc[eventField] ? doc[eventField].toString() : null;
            const boothId = doc[boothField] ? doc[boothField].toString() : null;
            const orgId = (eventId && eventOrgMap.get(eventId)) || (boothId && boothOrgMap.get(boothId)) || null;

            if (!orgId) {
                unresolved += 1;
                continue;
            }

            ops.push({
                updateOne: {
                    filter: {
                        _id: doc._id,
                        $or: [{ organizationId: null }, { organizationId: { $exists: false } }]
                    },
                    update: { $set: { organizationId: orgId } }
                }
            });
        }

        if (!DRY_RUN && ops.length) {
            const result = await model.bulkWrite(ops, { ordered: false });
            updated += result.modifiedCount || 0;
        } else if (DRY_RUN) {
            updated += ops.length;
        }

        lastId = docs[docs.length - 1]._id;
    }

    console.log(`${name}: processed=${processed}, updated=${updated}, unresolved=${unresolved}${DRY_RUN ? ' (dry-run)' : ''}`);
}

async function registerFromSource(sourceName, docs, eventOrgMap, counters) {
    for (const doc of docs) {
        const jobSeekerId = doc.jobSeekerId || doc.jobseekerId || doc.jobSeeker;
        const eventId = doc.eventId || doc.event;
        if (!jobSeekerId || !eventId) {
            counters.skipped += 1;
            continue;
        }

        const eventKey = eventId.toString();
        const orgId = doc.organizationId || eventOrgMap.get(eventKey);
        if (!orgId) {
            counters.unresolved += 1;
            continue;
        }

        if (DRY_RUN) {
            counters.upserted += 1;
            continue;
        }

        try {
            await RegisteredJobSeeker.registerWithOrg(orgId, jobSeekerId, eventId);
            counters.upserted += 1;
        } catch (error) {
            if (error.code === 11000) {
                counters.skipped += 1;
            } else {
                counters.errors += 1;
                console.error(`RegisteredJobSeeker upsert error (${sourceName}):`, error.message);
            }
        }
    }
}

async function backfillRegisteredJobSeekers(eventOrgMap) {
    const counters = { upserted: 0, skipped: 0, unresolved: 0, errors: 0 };

    const [meetings, interests, queueEntries] = await Promise.all([
        MeetingRecord.find({}, { organizationId: 1, eventId: 1, jobseekerId: 1 }).lean(),
        JobSeekerInterest.find({}, { organizationId: 1, event: 1, jobSeeker: 1 }).lean(),
        BoothQueue.find({}, { event: 1, jobSeeker: 1 }).lean()
    ]);

    await registerFromSource('meetingRecords', meetings, eventOrgMap, counters);
    await registerFromSource('jobSeekerInterests', interests, eventOrgMap, counters);
    await registerFromSource('boothQueue', queueEntries, eventOrgMap, counters);

    console.log(
        `RegisteredJobSeeker: upserted=${counters.upserted}, skipped=${counters.skipped}, unresolved=${counters.unresolved}, errors=${counters.errors}${DRY_RUN ? ' (dry-run)' : ''}`
    );
}

async function run() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        throw new Error('MONGODB_URI environment variable is not set');
    }

    await mongoose.connect(mongoUri);
    console.log(`Connected to MongoDB (${DRY_RUN ? 'dry-run' : 'write mode'})`);

    const { eventOrgMap, boothOrgMap } = await buildOrgMaps();
    console.log(`Loaded org maps: events=${eventOrgMap.size}, booths=${boothOrgMap.size}`);

    await backfillCollectionOrg({
        model: MeetingRecord,
        name: 'MeetingRecord',
        eventField: 'eventId',
        boothField: 'boothId',
        eventOrgMap,
        boothOrgMap
    });

    await backfillCollectionOrg({
        model: JobSeekerInterest,
        name: 'JobSeekerInterest',
        eventField: 'event',
        boothField: 'booth',
        eventOrgMap,
        boothOrgMap
    });

    await backfillRegisteredJobSeekers(eventOrgMap);

    console.log('Migration complete');
}

run()
    .catch(error => {
        console.error('Migration failed:', error);
        process.exit(1);
    })
    .finally(() => mongoose.connection.close());
