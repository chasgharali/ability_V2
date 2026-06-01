const mongoose = require('mongoose');
const logger = require('../utils/logger');

/**
 * Connect to MongoDB database
 */
const connectDB = async () => {
    // Fail fast instead of buffering model operations when MongoDB is unavailable.
    mongoose.set('bufferCommands', false);

    const mongoUri = process.env.MONGODB_URI;
    if (!mongoUri) {
        logger.error('MongoDB connection failed: MONGODB_URI is not configured');
        if (process.env.NODE_ENV === 'development') {
            logger.warn('Continuing without database connection in development mode');
            return false;
        }
        process.exit(1);
    }

    try {
        const conn = await mongoose.connect(mongoUri);

        logger.info(`MongoDB Connected: ${conn.connection.host}`);

        // Handle connection events
        mongoose.connection.on('error', (err) => {
            logger.error('MongoDB connection error:', err);
        });

        mongoose.connection.on('disconnected', () => {
            logger.warn('MongoDB disconnected');
        });

        mongoose.connection.on('reconnected', () => {
            logger.info('MongoDB reconnected');
        });

        // Server-level shutdown is handled in server/index.js.
        // Keep connection setup here to avoid duplicate signal handlers
        // racing each other and attempting to close an already closed topology.
        return true;

    } catch (error) {
        logger.error('MongoDB connection failed:', error);

        // In development, don't exit the process if MongoDB is not available
        if (process.env.NODE_ENV === 'development') {
            logger.warn('Continuing without database connection in development mode');
            return false;
        }

        process.exit(1);
    }
};

module.exports = connectDB;
