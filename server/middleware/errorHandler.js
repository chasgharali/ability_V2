const logger = require('../utils/logger');

/**
 * Global error handling middleware
 * Must be the last middleware in the stack
 */
const errorHandler = (err, req, res, next) => {
    let error = { ...err };
    error.message = err.message;

    // Log error
    logger.error(err);

    // Mongoose bad ObjectId
    if (err.name === 'CastError') {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Mongoose duplicate key
    if (err.code === 11000) {
        const message = 'Duplicate field value entered';
        error = { message, statusCode: 400 };
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const message = Object.values(err.errors).map(val => val.message).join(', ');
        error = { message, statusCode: 400 };
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        const message = 'Invalid token';
        error = { message, statusCode: 401 };
    }

    if (err.name === 'TokenExpiredError') {
        const message = 'Token expired';
        error = { message, statusCode: 401 };
    }

    // File upload errors
    if (err.code === 'LIMIT_FILE_SIZE') {
        const message = 'File too large';
        error = { message, statusCode: 400 };
    }

    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
        const message = 'Unexpected file field';
        error = { message, statusCode: 400 };
    }

    // AWS S3 errors
    if (err.code === 'NoSuchKey') {
        const message = 'File not found';
        error = { message, statusCode: 404 };
    }

    if (err.code === 'AccessDenied') {
        const message = 'Access denied to file';
        error = { message, statusCode: 403 };
    }

    // Twilio errors
    if (err.code === 20003) {
        const message = 'Authentication failed';
        error = { message, statusCode: 401 };
    }

    if (err.code === 20404) {
        const message = 'Resource not found';
        error = { message, statusCode: 404 };
    }

    // Default to 500 server error
    const statusCode = error.statusCode || 500;
    const message = error.message || 'Server Error';

    res.status(statusCode).json({
        success: false,
        error: message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};

module.exports = errorHandler;
