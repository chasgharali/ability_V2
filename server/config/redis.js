const redis = require('redis');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Connect to Redis
 */
const connectRedis = async () => {
    try {
        // Check if Redis URL is provided
        if (!process.env.REDIS_URL) {
            logger.warn('REDIS_URL not provided. Server will start without Redis connection.');
            return null;
        }

        redisClient = redis.createClient({
            url: process.env.REDIS_URL,
            socket: {
                reconnectStrategy: (retries) => {
                    if (retries > 3) {
                        logger.warn('Redis connection failed after 3 retries. Continuing without Redis.');
                        return false; // Stop retrying
                    }
                    return Math.min(retries * 100, 3000); // Exponential backoff
                }
            }
        });

        redisClient.on('error', (err) => {
            logger.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            logger.info('Redis Client Connected');
        });

        redisClient.on('ready', () => {
            logger.info('Redis Client Ready');
        });

        redisClient.on('end', () => {
            logger.warn('Redis Client Disconnected');
        });

        await redisClient.connect();

        return redisClient;
    } catch (error) {
        logger.error('Redis connection failed:', error);

        // In development, don't throw error if Redis is not available
        if (process.env.NODE_ENV === 'development') {
            logger.warn('Continuing without Redis connection in development mode');
            return null;
        }

        throw error;
    }
};

/**
 * Get Redis client instance
 */
const getRedisClient = () => {
    if (!redisClient) {
        logger.warn('Redis client not available');
        return null;
    }
    return redisClient;
};

/**
 * Close Redis connection
 */
const closeRedis = async () => {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
    }
};

module.exports = {
    connectRedis,
    getRedisClient,
    closeRedis
};
