const Redis = require('ioredis');
const logger = require('../utils/logger');

let redisClient = null;

// Wait for a single event once
const once = (emitter, event) => new Promise((resolve, reject) => {
    const onError = (err) => {
        emitter.off(event, onReady);
        reject(err);
    };
    const onReady = () => {
        emitter.off('error', onError);
        resolve();
    };
    emitter.once(event, onReady);
    emitter.once('error', onError);
});

/**
 * Connect to Redis (ElastiCache or standalone)
 * - Cluster: set REDIS_CLUSTER_ENDPOINT=host:port
 * - Standalone: set REDIS_URL=rediss://host:port (or redis://)
 */
const connectRedis = async () => {
    try {
        const clusterEndpoint = process.env.REDIS_CLUSTER_ENDPOINT; // e.g. clustercfg.xxxxxx.use1.cache.amazonaws.com:6379
        const url = process.env.REDIS_URL; // e.g. rediss://host:6379

        if (!clusterEndpoint && !url) {
            logger.warn('Redis not configured. Provide REDIS_CLUSTER_ENDPOINT or REDIS_URL. Continuing without Redis.');
            return null;
        }

        if (clusterEndpoint) {
            let host;
            let port;
            if (clusterEndpoint.includes('://')) {
                try {
                    const u = new URL(clusterEndpoint);
                    host = u.hostname;
                    port = parseInt(u.port || '6379', 10);
                } catch (e) {
                    logger.warn('Invalid REDIS_CLUSTER_ENDPOINT URL, falling back to host:port parsing');
                }
            }
            if (!host || !port) {
                const parts = clusterEndpoint.split(':');
                host = parts[0];
                port = parseInt(parts[1] || '6379', 10);
            }
            if (!port || Number.isNaN(port) || port <= 0 || port >= 65536) {
                throw new Error('Invalid Redis port from REDIS_CLUSTER_ENDPOINT');
            }
            try {
                // Attempt cluster-mode connection first
                redisClient = new Redis.Cluster(
                    [{ host, port }],
                    {
                        dnsLookup: (address, callback) => callback(null, address),
                        redisOptions: (
                            host === 'localhost' || host === '127.0.0.1'
                        ) ? {} : { tls: { servername: host } },
                    }
                );
                await once(redisClient, 'ready');
            } catch (err) {
                // Fallback to single-node if cluster slots fail (cluster mode disabled)
                logger.warn('Redis cluster connection failed, falling back to single-node TLS:', err.message);
                try {
                    if (redisClient) {
                        try { await redisClient.quit(); } catch (_) { redisClient.disconnect(); }
                    }
                    const tlsOpts = (host === 'localhost' || host === '127.0.0.1') ? undefined : { servername: host };
                    redisClient = new Redis({ host, port, ...(tlsOpts ? { tls: tlsOpts } : {}) });
                    await once(redisClient, 'ready');
                } catch (err2) {
                    throw err2;
                }
            }
        } else {
            const useTLS = url.startsWith('rediss://');
            const sni = process.env.REDIS_TLS_SERVERNAME; // optional SNI override for tunnels
            const tlsOptions = useTLS ? (sni ? { servername: sni } : {}) : undefined;
            redisClient = new Redis(url, tlsOptions ? { tls: tlsOptions } : {});
        }

        // Event hooks
        redisClient.on('connect', () => logger.info('Redis Client Connected'));
        redisClient.on('ready', () => logger.info('Redis Client Ready'));
        redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
        redisClient.on('end', () => logger.warn('Redis Client Disconnected'));

        return redisClient;
    } catch (error) {
        logger.error('Redis connection failed:', error);
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
        try {
            await redisClient.quit();
        } catch (_) {
            redisClient.disconnect();
        }
        redisClient = null;
    }
};

module.exports = {
    connectRedis,
    getRedisClient,
    closeRedis
};
