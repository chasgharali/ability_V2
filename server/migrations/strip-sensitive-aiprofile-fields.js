/**
 * Migration: strip-sensitive-aiprofile-fields
 *
 * Removes `disabilities` and `accessibilityNeeds` arrays from the legacy
 * `aiProfile` subdocument on User and RegisteredJobSeeker collections.
 *
 * Background:
 *   The previous job seeker search service indexed survey fields,
 *   including disabilities and accessibility needs. That violated the
 *   product policy that recruiters/admins cannot filter or rank job
 *   seekers by protected attributes.
 *
 *   The schemas have already been updated to remove those fields, but
 *   any document persisted before the fix still has the data on disk.
 *   This migration scrubs it.
 *
 *   Search itself has been migrated to the new ParsedResume collection
 *   which has a strict schema-level allowlist + denylist (see
 *   models/ParsedResume.js). After running this migration, run
 *   `POST /api/users/job-seekers/parse-resumes` (SuperAdmin) or the
 *   per-org endpoint to populate ParsedResume.
 *
 * Run: node server/migrations/strip-sensitive-aiprofile-fields.js
 * Idempotent: safe to run repeatedly — uses $unset which is a no-op when
 *             the field doesn't exist.
 */

'use strict';

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') });

async function run() {
    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGODB_URI is not set');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB');

    // Use the raw driver — the Mongoose schema no longer knows about these
    // fields, so a regular Model.updateMany would fail strict mode.
    const db = mongoose.connection.db;

    const sensitiveFields = {
        'aiProfile.disabilities': '',
        'aiProfile.accessibilityNeeds': ''
    };

    const userResult = await db.collection('users').updateMany(
        {
            $or: [
                { 'aiProfile.disabilities': { $exists: true } },
                { 'aiProfile.accessibilityNeeds': { $exists: true } }
            ]
        },
        { $unset: sensitiveFields }
    );
    console.log(`Users updated: matched=${userResult.matchedCount} modified=${userResult.modifiedCount}`);

    const regResult = await db.collection('registeredjobseekers').updateMany(
        {
            $or: [
                { 'aiProfile.disabilities': { $exists: true } },
                { 'aiProfile.accessibilityNeeds': { $exists: true } }
            ]
        },
        { $unset: sensitiveFields }
    );
    console.log(`RegisteredJobSeekers updated: matched=${regResult.matchedCount} modified=${regResult.modifiedCount}`);

    await mongoose.disconnect();
    console.log('Done.');
}

if (require.main === module) {
    run().catch(err => {
        console.error('Migration failed:', err);
        process.exit(1);
    });
}

module.exports = { run };
