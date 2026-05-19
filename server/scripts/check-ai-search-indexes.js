'use strict';

const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const { checkAiSearchIndexHealth } = require('../utils/aiSearchIndexHealth');

async function run() {
    const uri = process.env.MONGODB_URI;
    if (!uri) {
        console.error('MONGODB_URI is not configured');
        process.exitCode = 1;
        return;
    }

    await mongoose.connect(uri);
    try {
        const result = await checkAiSearchIndexHealth({
            logger: console,
            syncMongoIndexes: process.env.AI_SEARCH_SYNC_INDEXES === 'true'
        });

        console.log('\nAI Search Index Health');
        console.log(JSON.stringify(result, null, 2));

        if (!result.ok) process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}

run().catch(error => {
    console.error(error);
    process.exit(1);
});
