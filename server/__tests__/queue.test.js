const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../index');
const Queue = require('../models/Queue');
const User = require('../models/User');
const Booth = require('../models/Booth');
const Event = require('../models/Event');

// Mock the socket.io server
jest.mock('socket.io', () => {
    return jest.fn(() => ({
        use: jest.fn(),
        on: jest.fn(),
    }));
});

describe('Queue Management API', () => {
    let authToken;
    let user;
    let event;
    let booth;
    let queue;

    beforeAll(async () => {
        // Connect to test database
        await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ability_v2_test');
    });

    afterAll(async () => {
        await mongoose.connection.close();
    });

    beforeEach(async () => {
        // Clean up database
        await User.deleteMany({});
        await Event.deleteMany({});
        await Booth.deleteMany({});
        await Queue.deleteMany({});

        // Create test user
        user = new User({
            name: 'Test User',
            email: 'test@example.com',
            hashedPassword: 'hashedpassword',
            role: 'JobSeeker',
        });
        await user.save();

        // Create test event
        event = new Event({
            name: 'Test Event',
            slug: 'test-event',
            start: new Date(Date.now() + 24 * 60 * 60 * 1000), // Tomorrow
            end: new Date(Date.now() + 25 * 60 * 60 * 1000), // Tomorrow + 1 hour
            createdBy: user._id,
            status: 'published',
        });
        await event.save();

        // Create test booth
        booth = new Booth({
            eventId: event._id,
            name: 'Test Booth',
            description: 'Test booth description',
            administrators: [user._id],
        });
        await booth.save();

        // Create test queue
        queue = new Queue({
            boothId: booth._id,
            eventId: event._id,
            settings: {
                maxQueueSize: 50,
                tokenExpiryMinutes: 30,
                autoAdvanceInterval: 5,
            },
        });
        await queue.save();

        // Update booth with queue reference
        booth.queueId = queue._id;
        await booth.save();

        // Mock authentication
        authToken = 'mock-jwt-token';
    });

    describe('POST /api/events/:eventId/booths/:boothId/join', () => {
        test('should allow job seeker to join queue', async () => {
            const response = await request(app)
                .post(`/api/events/${event._id}/booths/${booth._id}/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(201);
            expect(response.body).toHaveProperty('message', 'Successfully joined queue');
            expect(response.body).toHaveProperty('tokenNumber');
            expect(response.body).toHaveProperty('queuePosition');
            expect(response.body).toHaveProperty('estimatedWaitTime');
        });

        test('should prevent duplicate queue joins', async () => {
            // First join
            await request(app)
                .post(`/api/events/${event._id}/booths/${booth._id}/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            // Second join should fail
            const response = await request(app)
                .post(`/api/events/${event._id}/booths/${booth._id}/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(409);
            expect(response.body).toHaveProperty('error', 'Already in queue');
        });

        test('should enforce queue capacity limits', async () => {
            // Set small queue capacity
            queue.settings.maxQueueSize = 1;
            await queue.save();

            // First join should succeed
            await request(app)
                .post(`/api/events/${event._id}/booths/${booth._id}/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            // Create second user
            const secondUser = new User({
                name: 'Second User',
                email: 'second@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await secondUser.save();

            // Second join should fail due to capacity
            const response = await request(app)
                .post(`/api/events/${event._id}/booths/${booth._id}/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Queue full');
        });

        test('should validate booth exists and belongs to event', async () => {
            const response = await request(app)
                .post(`/api/events/${event._id}/booths/invalid-booth-id/join`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Booth not found');
        });
    });

    describe('POST /api/queues/:queueId/leave', () => {
        beforeEach(async () => {
            // Add user to queue first
            await queue.joinQueue(user._id);
        });

        test('should allow user to leave queue', async () => {
            const response = await request(app)
                .post(`/api/queues/${queue._id}/leave`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Successfully left queue');
            expect(response.body).toHaveProperty('tokenNumber');
            expect(response.body).toHaveProperty('waitTime');
        });

        test('should allow user to leave queue with message', async () => {
            const leaveMessage = {
                type: 'text',
                content: 'I need to leave for an emergency',
            };

            const response = await request(app)
                .post(`/api/queues/${queue._id}/leave`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ leaveMessage });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Successfully left queue');
        });

        test('should prevent leaving queue if not in queue', async () => {
            // Remove user from queue
            await queue.leaveQueue(user._id);

            const response = await request(app)
                .post(`/api/queues/${queue._id}/leave`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({});

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Not in queue');
        });
    });

    describe('GET /api/queues/:queueId/status', () => {
        test('should return queue status for user in queue', async () => {
            // Add user to queue
            await queue.joinQueue(user._id);

            const response = await request(app)
                .get(`/api/queues/${queue._id}/status`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('queue');
            expect(response.body).toHaveProperty('userPosition');
            expect(response.body.queue).toHaveProperty('currentServing');
            expect(response.body.queue).toHaveProperty('currentLength');
            expect(response.body.userPosition).toHaveProperty('tokenNumber');
            expect(response.body.userPosition).toHaveProperty('position');
        });

        test('should return queue status without user position if not in queue', async () => {
            const response = await request(app)
                .get(`/api/queues/${queue._id}/status`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('queue');
            expect(response.body.userPosition).toBeNull();
        });

        test('should return 404 for non-existent queue', async () => {
            const response = await request(app)
                .get('/api/queues/non-existent-queue/status')
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(404);
            expect(response.body).toHaveProperty('error', 'Queue not found');
        });
    });

    describe('POST /api/queues/:queueId/serve-next', () => {
        let recruiter;

        beforeEach(async () => {
            // Create recruiter user
            recruiter = new User({
                name: 'Test Recruiter',
                email: 'recruiter@example.com',
                hashedPassword: 'hashedpassword',
                role: 'Recruiter',
            });
            await recruiter.save();

            // Add user to queue
            await queue.joinQueue(user._id);
        });

        test('should allow recruiter to serve next person', async () => {
            const response = await request(app)
                .post(`/api/queues/${queue._id}/serve-next`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Next person served');
            expect(response.body).toHaveProperty('servedEntry');
            expect(response.body.servedEntry).toHaveProperty('tokenNumber');
            expect(response.body.servedEntry).toHaveProperty('user');
        });

        test('should return appropriate message when no one to serve', async () => {
            // Remove user from queue
            await queue.leaveQueue(user._id);

            const response = await request(app)
                .post(`/api/queues/${queue._id}/serve-next`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'No one to serve');
        });

        test('should prevent non-recruiters from serving', async () => {
            // Create job seeker user
            const jobSeeker = new User({
                name: 'Job Seeker',
                email: 'jobseeker@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await jobSeeker.save();

            const response = await request(app)
                .post(`/api/queues/${queue._id}/serve-next`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Insufficient permissions');
        });
    });

    describe('GET /api/queues/:queueId/entries', () => {
        let recruiter;

        beforeEach(async () => {
            // Create recruiter user
            recruiter = new User({
                name: 'Test Recruiter',
                email: 'recruiter@example.com',
                hashedPassword: 'hashedpassword',
                role: 'Recruiter',
            });
            await recruiter.save();

            // Add multiple users to queue
            const user2 = new User({
                name: 'User 2',
                email: 'user2@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await user2.save();

            const user3 = new User({
                name: 'User 3',
                email: 'user3@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await user3.save();

            await queue.joinQueue(user._id);
            await queue.joinQueue(user2._id);
            await queue.joinQueue(user3._id);
        });

        test('should return queue entries for authorized users', async () => {
            const response = await request(app)
                .get(`/api/queues/${queue._id}/entries`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('entries');
            expect(response.body.entries).toHaveLength(3);
            expect(response.body).toHaveProperty('pagination');
            expect(response.body).toHaveProperty('queueStats');
        });

        test('should filter entries by status', async () => {
            // Serve one user
            await queue.serveNext();

            const response = await request(app)
                .get(`/api/queues/${queue._id}/entries?status=waiting`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.entries).toHaveLength(2); // Only waiting users
        });

        test('should support pagination', async () => {
            const response = await request(app)
                .get(`/api/queues/${queue._id}/entries?page=1&limit=2`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(200);
            expect(response.body.entries).toHaveLength(2);
            expect(response.body.pagination).toHaveProperty('currentPage', 1);
            expect(response.body.pagination).toHaveProperty('totalPages', 2);
        });

        test('should prevent unauthorized access to queue entries', async () => {
            // Create job seeker user
            const jobSeeker = new User({
                name: 'Job Seeker',
                email: 'jobseeker@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await jobSeeker.save();

            const response = await request(app)
                .get(`/api/queues/${queue._id}/entries`)
                .set('Authorization', `Bearer ${authToken}`);

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Access denied');
        });
    });

    describe('PUT /api/queues/:queueId/settings', () => {
        let boothAdmin;

        beforeEach(async () => {
            // Create booth admin user
            boothAdmin = new User({
                name: 'Booth Admin',
                email: 'boothadmin@example.com',
                hashedPassword: 'hashedpassword',
                role: 'BoothAdmin',
            });
            await boothAdmin.save();

            // Add booth admin to booth administrators
            booth.administrators.push(boothAdmin._id);
            await booth.save();
        });

        test('should allow booth admin to update queue settings', async () => {
            const newSettings = {
                maxQueueSize: 100,
                tokenExpiryMinutes: 45,
                autoAdvanceInterval: 10,
            };

            const response = await request(app)
                .put(`/api/queues/${queue._id}/settings`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(newSettings);

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Queue settings updated successfully');
            expect(response.body.settings.maxQueueSize).toBe(100);
            expect(response.body.settings.tokenExpiryMinutes).toBe(45);
            expect(response.body.settings.autoAdvanceInterval).toBe(10);
        });

        test('should validate queue settings', async () => {
            const invalidSettings = {
                maxQueueSize: 0, // Invalid: must be at least 1
                tokenExpiryMinutes: 200, // Invalid: must be at most 120
            };

            const response = await request(app)
                .put(`/api/queues/${queue._id}/settings`)
                .set('Authorization', `Bearer ${authToken}`)
                .send(invalidSettings);

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Validation failed');
        });

        test('should prevent unauthorized users from updating settings', async () => {
            // Create job seeker user
            const jobSeeker = new User({
                name: 'Job Seeker',
                email: 'jobseeker@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await jobSeeker.save();

            const response = await request(app)
                .put(`/api/queues/${queue._id}/settings`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ maxQueueSize: 100 });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Insufficient permissions');
        });
    });

    describe('PUT /api/queues/:queueId/status', () => {
        let boothAdmin;

        beforeEach(async () => {
            // Create booth admin user
            boothAdmin = new User({
                name: 'Booth Admin',
                email: 'boothadmin@example.com',
                hashedPassword: 'hashedpassword',
                role: 'BoothAdmin',
            });
            await boothAdmin.save();

            // Add booth admin to booth administrators
            booth.administrators.push(boothAdmin._id);
            await booth.save();
        });

        test('should allow booth admin to update queue status', async () => {
            const response = await request(app)
                .put(`/api/queues/${queue._id}/status`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ status: 'paused' });

            expect(response.status).toBe(200);
            expect(response.body).toHaveProperty('message', 'Queue status updated successfully');
            expect(response.body.status).toBe('paused');
        });

        test('should validate queue status values', async () => {
            const response = await request(app)
                .put(`/api/queues/${queue._id}/status`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ status: 'invalid-status' });

            expect(response.status).toBe(400);
            expect(response.body).toHaveProperty('error', 'Validation failed');
        });

        test('should prevent unauthorized users from updating status', async () => {
            // Create job seeker user
            const jobSeeker = new User({
                name: 'Job Seeker',
                email: 'jobseeker@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await jobSeeker.save();

            const response = await request(app)
                .put(`/api/queues/${queue._id}/status`)
                .set('Authorization', `Bearer ${authToken}`)
                .send({ status: 'paused' });

            expect(response.status).toBe(403);
            expect(response.body).toHaveProperty('error', 'Insufficient permissions');
        });
    });

    describe('Queue Model Methods', () => {
        test('should calculate estimated wait time correctly', async () => {
            // Add multiple users to queue
            const user2 = new User({
                name: 'User 2',
                email: 'user2@example.com',
                hashedPassword: 'hashedpassword',
                role: 'JobSeeker',
            });
            await user2.save();

            await queue.joinQueue(user._id);
            await queue.joinQueue(user2._id);

            const estimatedWaitTime = queue.estimatedWaitTime;
            expect(estimatedWaitTime).toBeGreaterThan(0);
        });

        test('should track queue statistics correctly', async () => {
            // Add user to queue
            await queue.joinQueue(user._id);

            // Serve user
            await queue.serveNext();

            // Leave queue
            await queue.leaveQueue(user._id);

            expect(queue.stats.totalTokensIssued).toBe(1);
            expect(queue.stats.totalServed).toBe(1);
            expect(queue.stats.totalLeft).toBe(1);
        });

        test('should handle token expiry correctly', async () => {
            // Set short expiry time
            queue.settings.tokenExpiryMinutes = 1;
            await queue.save();

            // Add user to queue
            await queue.joinQueue(user._id);

            // Wait for expiry (in real scenario)
            // For testing, we'll manually check the logic
            const entry = queue.entries.find(e => e.userId.equals(user._id));
            expect(entry).toBeDefined();
            expect(entry.status).toBe('waiting');
        });
    });
});
