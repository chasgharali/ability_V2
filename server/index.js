const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const connectDB = require('./config/database');
const { connectRedis } = require('./config/redis');
const logger = require('./utils/logger');
const errorHandler = require('./middleware/errorHandler');

// Import routes
const authRoutes = require('./routes/auth');
const eventRoutes = require('./routes/events');
const boothRoutes = require('./routes/booths');
const queueRoutes = require('./routes/queues');
const callRoutes = require('./routes/calls');
const meetingRoutes = require('./routes/meetings');
const uploadRoutes = require('./routes/uploads');
const userRoutes = require('./routes/users');
const termsConditionsRoutes = require('./routes/termsConditions');
const jobSeekerInterestsRoutes = require('./routes/jobSeekerInterests');
const interpreterCategoriesRoutes = require('./routes/interpreterCategories');
const boothQueueRoutes = require('./routes/boothQueue');
const videoCallRoutes = require('./routes/videoCall');
const meetingRecordsRoutes = require('./routes/meetingRecords');
const settingsRoutes = require('./routes/settings');
const chatRoutes = require('./routes/chat');
const analyticsRoutes = require('./routes/analytics');
const notesRoutes = require('./routes/notes');
const roleMessagesRoutes = require('./routes/roleMessages');

// Import socket handlers
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
// Support multiple origins if CORS_ORIGIN is a comma-separated string
const corsOrigin = process.env.CORS_ORIGIN || "http://localhost:3000";
const allowedOrigins = corsOrigin.split(',').map(origin => origin.trim());

const io = socketIo(server, {
    cors: {
        origin: allowedOrigins.length === 1 ? allowedOrigins[0] : allowedOrigins,
        methods: ["GET", "POST"],
        credentials: true
    },
    // Configuration for running behind a proxy/load balancer (Elastic Beanstalk)
    allowUpgrades: true,
    transports: ['websocket', 'polling'],
    // Increase ping timeout for load balancers
    pingTimeout: 60000,
    pingInterval: 25000,
    // Important: allow Socket.IO to work behind proxies
    allowEIO3: true
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:", "ws:"],
            mediaSrc: ["'self'", "blob:", "https:"],
            fontSrc: ["'self'", "https://fonts.gstatic.com", "data:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// If running behind a proxy (e.g., CRA dev server, reverse proxy, or load balancer),
// let Express know so req.ip and rate limit can read X-Forwarded-For safely.
// Elastic Beanstalk uses a load balancer, so trust proxy is important
// Use 1 hop in dev; can be made configurable via env.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || (process.env.NODE_ENV === 'production' ? '2' : '1')));

// Rate limiting
const limiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100, // limit each IP to 100 requests per windowMs
    message: {
        error: 'Too many requests from this IP, please try again later.',
        retryAfter: Math.ceil((parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000) / 1000)
    },
    standardHeaders: true,
    legacyHeaders: false,
});

app.use(limiter);

// CORS configuration
// Using allowedOrigins already declared above for Socket.IO
app.use(cors({
    origin: allowedOrigins.length === 1 ? allowedOrigins[0] : (origin, callback) => {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);
        // Always allow localhost origins (for development and local testing)
        const localhostPatterns = ['http://localhost', 'http://127.0.0.1'];
        if (localhostPatterns.some(pattern => origin.startsWith(pattern))) {
            return callback(null, true);
        }
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        status: 'OK',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: process.env.NODE_ENV
    });
});

// API routes
app.use('/api/auth', authRoutes);
app.use('/api/events', eventRoutes);
app.use('/api/booths', boothRoutes);
app.use('/api/queues', queueRoutes);
app.use('/api/calls', callRoutes);
app.use('/api/meetings', meetingRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/users', userRoutes);
app.use('/api/terms-conditions', termsConditionsRoutes);
app.use('/api/job-seeker-interests', jobSeekerInterestsRoutes);
app.use('/api/interpreter-categories', interpreterCategoriesRoutes);
app.use('/api/booth-queue', boothQueueRoutes);
app.use('/api/video-call', videoCallRoutes);
app.use('/api/meeting-records', meetingRecordsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/notes', notesRoutes);
app.use('/api/role-messages', roleMessagesRoutes);

// Socket.IO connection handling
socketHandler(io);

// Make io available to routes
app.set('io', io);

// Serve static files from the React app build directory (only if build directory exists)
const buildPath = path.join(__dirname, 'build');

if (fs.existsSync(buildPath) && fs.existsSync(path.join(buildPath, 'index.html'))) {
    app.use(express.static(buildPath));

    // Serve React app for all non-API routes (React Router support)
    // This must come after API routes but before error handler
    app.get('*', (req, res, next) => {
        // Skip if it's an API route
        if (req.path.startsWith('/api')) {
            return next();
        }
        // Skip if it's the health check endpoint
        if (req.path === '/health') {
            return next();
        }
        // Serve index.html for all other routes (React Router)
        res.sendFile(path.join(buildPath, 'index.html'));
    });
}

// 404 handler for unmatched API routes
app.use('*', (req, res) => {
    // Only handle API routes that weren't matched
    if (req.path.startsWith('/api')) {
        res.status(404).json({
            error: 'Route not found',
            message: `Cannot ${req.method} ${req.originalUrl}`
        });
    } else {
        // For non-API routes that aren't GET, also return 404
        // (GET requests are handled by React Router catch-all above)
        res.status(404).json({
            error: 'Route not found',
            message: `Cannot ${req.method} ${req.originalUrl}`
        });
    }
});

// Error handling middleware (must be absolutely last)
app.use(errorHandler);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception:', error);
    logger.error('Stack:', error.stack);
    process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise);
    logger.error('Reason:', reason);
    // Don't exit in development, but log the error
    if (process.env.NODE_ENV === 'production') {
        process.exit(1);
    }
});

// Database and Redis connection
const startServer = async () => {
    try {
        // Connect to MongoDB (optional in development)
        await connectDB();
        logger.info('MongoDB connection attempted');

        // Connect to Redis (optional in development)
        const redisClient = await connectRedis();
        if (redisClient) {
            logger.info('Connected to Redis');
        } else {
            logger.info('Redis connection skipped');
        }

        const PORT = process.env.PORT || 5000;
        // Use 0.0.0.0 for production to accept connections from outside the container
        // Elastic Beanstalk sets PORT automatically, but we need to listen on all interfaces
        const HOST = process.env.HOST || (process.env.NODE_ENV === 'production' ? '0.0.0.0' : 'localhost');

        server.listen(PORT, HOST, () => {
            logger.info(`Server running on ${HOST}:${PORT} in ${process.env.NODE_ENV || 'development'} mode`);
            logger.info('Server is ready to accept connections');
            logger.info(`API endpoints available at http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}/api`);

            // Start queue cleanup job
            const { startQueueCleanup } = require('./utils/queueCleanup');
            startQueueCleanup();
        });

        // Handle server errors
        server.on('error', (error) => {
            if (error.code === 'EADDRINUSE') {
                logger.error(`Port ${PORT} is already in use. Please use a different port or stop the process using port ${PORT}.`);
            } else {
                logger.error('Server error:', error);
            }
            process.exit(1);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        logger.error('Error stack:', error.stack);
        process.exit(1);
    }
};

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    server.close(() => {
        logger.info('Process terminated');
        process.exit(0);
    });
});

startServer();

module.exports = { app, server, io };
