const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
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

// Import socket handlers
const socketHandler = require('./socket/socketHandler');

const app = express();
const server = http.createServer(app);

// Initialize Socket.IO with CORS configuration
const io = socketIo(server, {
    cors: {
        origin: process.env.CORS_ORIGIN || "http://localhost:3000",
        methods: ["GET", "POST"],
        credentials: true
    }
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'"],
            scriptSrc: ["'self'"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "wss:", "https:"],
            mediaSrc: ["'self'", "blob:", "https:"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
}));

// If running behind a proxy (e.g., CRA dev server, reverse proxy, or load balancer),
// let Express know so req.ip and rate limit can read X-Forwarded-For safely.
// Use 1 hop in dev; can be made configurable via env.
app.set('trust proxy', parseInt(process.env.TRUST_PROXY_HOPS || '1'));

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
app.use(cors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3000",
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

// Socket.IO connection handling
socketHandler(io);

// Make io available to routes
app.set('io', io);

// Error handling middleware (must be last)
app.use(errorHandler);

// 404 handler
app.use('*', (req, res) => {
    res.status(404).json({
        error: 'Route not found',
        message: `Cannot ${req.method} ${req.originalUrl}`
    });
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

        const PORT = process.env.PORT || 5001;
        const HOST = process.env.HOST || 'localhost';

        server.listen(PORT, HOST, () => {
            logger.info(`Server running on ${HOST}:${PORT} in ${process.env.NODE_ENV} mode`);
            logger.info('Server is ready to accept connections');
            
            // Start queue cleanup job
            const { startQueueCleanup } = require('./utils/queueCleanup');
            startQueueCleanup();
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
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
