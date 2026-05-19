'use strict';

const ParsedResume = require('../models/ParsedResume');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const User = require('../models/User');

const VECTOR_INDEX_NAME = process.env.PARSED_RESUME_VECTOR_INDEX || 'parsed_resume_vector_index';
const VECTOR_DIMS = Number(process.env.OPENAI_EMBEDDING_DIMENSIONS || 1536);
const ATLAS_VECTOR_SEARCH_ENABLED = process.env.ATLAS_VECTOR_SEARCH_ENABLED !== 'false';

function keySpec(index) {
    return JSON.stringify(index.key || {});
}

function hasIndex(indexes, expectedSpec) {
    return indexes.some(i => keySpec(i) === expectedSpec);
}

function requiredIndexChecks() {
    return [
        {
            collection: ParsedResume.collection,
            modelName: 'ParsedResume',
            required: [
                JSON.stringify({ userId: 1 }),
                JSON.stringify({ organizationIds: 1 }),
                JSON.stringify({ organizationIds: 1, parsedAt: -1 }),
                JSON.stringify({ parsedAt: -1 }),
                JSON.stringify({ _fts: 'text', _ftsx: 1 })
            ]
        },
        {
            collection: RegisteredJobSeeker.collection,
            modelName: 'RegisteredJobSeeker',
            required: [
                JSON.stringify({ organizationId: 1, jobSeekerId: 1, eventId: 1 }),
                JSON.stringify({ organizationId: 1 }),
                JSON.stringify({ jobSeekerId: 1 })
            ]
        },
        {
            collection: User.collection,
            modelName: 'User',
            required: [
                JSON.stringify({ role: 1 }),
                JSON.stringify({ isActive: 1 }),
                JSON.stringify({ organizationId: 1 }),
                JSON.stringify({ organizationId: 1, role: 1 })
            ]
        }
    ];
}

async function ensureMongoIndexesSynced(logger) {
    await ParsedResume.syncIndexes();
    logger.info('aiSearchIndexHealth: ParsedResume indexes synced');
}

async function checkMongoIndexes() {
    const checks = requiredIndexChecks();
    const status = {
        ok: true,
        collections: []
    };

    for (const check of checks) {
        const indexes = await check.collection.indexes();
        const existingSpecs = indexes.map(i => keySpec(i));
        const missing = check.required.filter(spec => !hasIndex(indexes, spec));
        status.collections.push({
            model: check.modelName,
            existing: existingSpecs,
            missing
        });
        if (missing.length > 0) status.ok = false;
    }

    return status;
}

async function probeAtlasVectorIndex() {
    if (!ATLAS_VECTOR_SEARCH_ENABLED) {
        return { enabled: false, ok: true, skipped: true, reason: 'ATLAS_VECTOR_SEARCH_ENABLED=false' };
    }

    const probeVector = Array.from({ length: VECTOR_DIMS }, (_, idx) => (idx === 0 ? 1 : 0));
    try {
        await ParsedResume.aggregate([
            {
                $vectorSearch: {
                    index: VECTOR_INDEX_NAME,
                    path: 'embedding',
                    queryVector: probeVector,
                    numCandidates: 10,
                    limit: 1
                }
            },
            { $project: { _id: 1 } }
        ]);
        return { enabled: true, ok: true, indexName: VECTOR_INDEX_NAME };
    } catch (error) {
        return {
            enabled: true,
            ok: false,
            indexName: VECTOR_INDEX_NAME,
            error: error.message
        };
    }
}

async function checkAiSearchIndexHealth(opts = {}) {
    const {
        logger = console,
        syncMongoIndexes = false
    } = opts;

    if (syncMongoIndexes) {
        await ensureMongoIndexesSynced(logger);
    }

    const mongo = await checkMongoIndexes();
    const vector = await probeAtlasVectorIndex();
    const ok = mongo.ok && vector.ok;

    return { ok, mongo, vector };
}

module.exports = {
    checkAiSearchIndexHealth
};
