const crypto = require('crypto');
const { getRedisClient } = require('../config/redis');
const logger = require('./logger');

function stableSerialize(value) {
    if (value === null || value === undefined) return String(value);
    if (Array.isArray(value)) return `[${value.map(stableSerialize).join(',')}]`;
    if (typeof value === 'object') {
        const keys = Object.keys(value).sort();
        return `{${keys.map(k => `${JSON.stringify(k)}:${stableSerialize(value[k])}`).join(',')}}`;
    }
    return JSON.stringify(value);
}

function buildCacheKey(prefix, payload) {
    const hash = crypto
        .createHash('sha1')
        .update(stableSerialize(payload))
        .digest('hex');
    return `${prefix}:${hash}`;
}

async function getCachedJson(key) {
    try {
        const redis = getRedisClient({ silent: true });
        if (!redis) return null;
        const raw = await redis.get(key);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch (error) {
        logger.warn(`searchCache get failed for key ${key}: ${error.message}`);
        return null;
    }
}

async function setCachedJson(key, value, ttlSeconds = 120) {
    try {
        const redis = getRedisClient({ silent: true });
        if (!redis) return false;
        const payload = JSON.stringify(value);
        await redis.set(key, payload, 'EX', Math.max(1, ttlSeconds));
        return true;
    } catch (error) {
        logger.warn(`searchCache set failed for key ${key}: ${error.message}`);
        return false;
    }
}

module.exports = {
    buildCacheKey,
    getCachedJson,
    setCachedJson
};
