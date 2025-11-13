const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const { authenticateToken, requireRole } = require('../middleware/auth');
const MeetingRecord = require('../models/MeetingRecord');
const BoothQueue = require('../models/BoothQueue');
const Booth = require('../models/Booth');
const Event = require('../models/Event');
const User = require('../models/User');
const logger = require('../utils/logger');
const liveStatsStore = require('../utils/liveStatsStore');

/**
 * Helper function to build booth filter based on user role
 */
const buildBoothFilter = async (user) => {
    // Admin and GlobalSupport can see all booths
    if (['Admin', 'GlobalSupport'].includes(user.role)) {
        return {};
    }
    
    // Booth Support can only see their assigned booth
    if (user.role === 'Support' && user.assignedBooth) {
        return { boothId: user.assignedBooth };
    }
    
    // Default: no access
    return null;
};

/**
 * GET /api/analytics/overview
 * Get system-wide analytics overview
 * Admin and GlobalSupport: all data
 * Booth Support: only their booth data
 */
router.get('/overview', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const boothFilter = await buildBoothFilter(req.user);
        
        if (boothFilter === null) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { startDate, endDate, eventId, boothId } = req.query;
        
        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.startTime = {};
            if (startDate) dateFilter.startTime.$gte = new Date(startDate);
            if (endDate) dateFilter.startTime.$lte = new Date(endDate);
        }

        // Combine filters
        const matchQuery = { ...boothFilter, ...dateFilter };
        if (eventId) {
            if (!mongoose.Types.ObjectId.isValid(eventId)) {
                return res.status(400).json({ error: 'Invalid eventId format' });
            }
            matchQuery.eventId = new mongoose.Types.ObjectId(eventId);
        }
        if (boothId && !boothFilter.boothId) {
            if (!mongoose.Types.ObjectId.isValid(boothId)) {
                return res.status(400).json({ error: 'Invalid boothId format' });
            }
            matchQuery.boothId = new mongoose.Types.ObjectId(boothId);
        }

        // Get meeting statistics
        const meetingStats = await MeetingRecord.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    droppedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    },
                    totalDuration: { $sum: '$duration' },
                    averageDuration: { $avg: '$duration' },
                    meetingsOver3Min: {
                        $sum: { $cond: [{ $gt: ['$duration', 3] }, 1, 0] }
                    },
                    totalWithInterpreter: {
                        $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                    },
                    interpreterTime: {
                        $sum: {
                            $cond: [
                                { $ne: ['$interpreterId', null] },
                                '$duration',
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Get queue statistics
        let queueMatchQuery = {};
        if (boothFilter.boothId) {
            queueMatchQuery.booth = boothFilter.boothId;
        } else if (boothId && mongoose.Types.ObjectId.isValid(boothId)) {
            queueMatchQuery.booth = new mongoose.Types.ObjectId(boothId);
        }
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            queueMatchQuery.event = new mongoose.Types.ObjectId(eventId);
        }
        if (startDate || endDate) {
            queueMatchQuery.joinedAt = {};
            if (startDate) queueMatchQuery.joinedAt.$gte = new Date(startDate);
            if (endDate) queueMatchQuery.joinedAt.$lte = new Date(endDate);
        }

        const queueStats = await BoothQueue.aggregate([
            { $match: queueMatchQuery },
            {
                $group: {
                    _id: null,
                    totalQueueVisits: { $sum: 1 },
                    uniqueQueueVisits: { $addToSet: '$jobSeeker' },
                    leftWithMessage: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get user statistics
        let userStats = null;
        if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            const userDateFilter = {};
            if (startDate || endDate) {
                userDateFilter.createdAt = {};
                if (startDate) userDateFilter.createdAt.$gte = new Date(startDate);
                if (endDate) userDateFilter.createdAt.$lte = new Date(endDate);
            }

            const userStatsAgg = await User.aggregate([
                { $match: userDateFilter },
                {
                    $group: {
                        _id: '$role',
                        count: { $sum: 1 },
                        activeCount: { $sum: { $cond: ['$isActive', 1, 0] } }
                    }
                }
            ]);

            userStats = {
                totalUsers: await User.countDocuments(userDateFilter),
                activeUsers: await User.countDocuments({ ...userDateFilter, isActive: true }),
                byRole: userStatsAgg.reduce((acc, stat) => {
                    acc[stat._id] = {
                        total: stat.count,
                        active: stat.activeCount
                    };
                    return acc;
                }, {})
            };
        }

        const stats = meetingStats[0] || {
            totalMeetings: 0,
            completedMeetings: 0,
            droppedMeetings: 0,
            totalDuration: 0,
            averageDuration: 0,
            meetingsOver3Min: 0,
            totalWithInterpreter: 0,
            interpreterTime: 0
        };

        const queue = queueStats[0] || {
            totalQueueVisits: 0,
            uniqueQueueVisits: 0,
            leftWithMessage: 0
        };

        res.json({
            meetings: {
                total: stats.totalMeetings,
                completed: stats.completedMeetings,
                dropped: stats.droppedMeetings,
                averageDuration: stats.averageDuration || 0,
                meetingsOver3Min: stats.meetingsOver3Min,
                totalWithInterpreter: stats.totalWithInterpreter,
                interpreterTime: stats.interpreterTime || 0
            },
            queue: {
                totalVisits: queue.totalQueueVisits,
                uniqueVisits: queue.uniqueQueueVisits ? queue.uniqueQueueVisits.length : 0,
                leftWithMessage: queue.leftWithMessage
            },
            users: userStats
        });

    } catch (error) {
        logger.error('Error fetching analytics overview:', error);
        res.status(500).json({ error: 'Failed to fetch analytics overview', message: error.message });
    }
});

/**
 * GET /api/analytics/events
 * Get event-level analytics report
 * Admin and GlobalSupport: all events
 * Booth Support: events containing their booth
 */
router.get('/events', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const boothFilter = await buildBoothFilter(req.user);
        
        if (boothFilter === null) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { eventId, startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.startTime = {};
            if (startDate) dateFilter.startTime.$gte = new Date(startDate);
            if (endDate) dateFilter.startTime.$lte = new Date(endDate);
        }

        // Get events
        let eventMatchQuery = {};
        if (eventId) {
            if (!mongoose.Types.ObjectId.isValid(eventId)) {
                return res.status(400).json({ error: 'Invalid eventId format' });
            }
            eventMatchQuery.eventId = new mongoose.Types.ObjectId(eventId);
        }

        // If booth filter exists, get events that contain this booth
        if (boothFilter.boothId) {
            const booth = await Booth.findById(boothFilter.boothId);
            if (booth) {
                eventMatchQuery.eventId = booth.eventId;
            } else {
                return res.json({ events: [] });
            }
        }

        // Get event statistics
        const eventStats = await MeetingRecord.aggregate([
            { $match: { ...eventMatchQuery, ...dateFilter, ...boothFilter } },
            {
                $group: {
                    _id: '$eventId',
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    droppedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    },
                    totalDuration: { $sum: '$duration' },
                    averageDuration: { $avg: '$duration' },
                    meetingsOver3Min: {
                        $sum: { $cond: [{ $gt: ['$duration', 3] }, 1, 0] }
                    },
                    totalWithInterpreter: {
                        $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                    },
                    interpreterTime: {
                        $sum: {
                            $cond: [
                                { $ne: ['$interpreterId', null] },
                                '$duration',
                                0
                            ]
                        }
                    }
                }
            }
        ]);

        // Populate event details
        const eventIds = eventStats.map(s => s._id);
        const events = await Event.find({ _id: { $in: eventIds } }).select('name slug start end');

        const eventsWithStats = events.map(event => {
            const stats = eventStats.find(s => s._id.toString() === event._id.toString()) || {};
            return {
                _id: event._id,
                name: event.name,
                slug: event.slug,
                start: event.start,
                end: event.end,
                ...stats
            };
        });

        res.json({ events: eventsWithStats });

    } catch (error) {
        logger.error('Error fetching event analytics:', error);
        res.status(500).json({ error: 'Failed to fetch event analytics', message: error.message });
    }
});

/**
 * GET /api/analytics/booths
 * Get booth-level analytics report
 * Admin and GlobalSupport: all booths
 * Booth Support: only their booth
 */
router.get('/booths', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const boothFilter = await buildBoothFilter(req.user);
        
        if (boothFilter === null) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { eventId, boothId, startDate, endDate } = req.query;

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.startTime = {};
            if (startDate) dateFilter.startTime.$gte = new Date(startDate);
            if (endDate) dateFilter.startTime.$lte = new Date(endDate);
        }

        // Build booth filter query for fetching booth list
        let boothMatchQuery = {};
        if (boothFilter.boothId) {
            boothMatchQuery._id = boothFilter.boothId;
        } else if (boothId) {
            if (!mongoose.Types.ObjectId.isValid(boothId)) {
                return res.status(400).json({ error: 'Invalid boothId format' });
            }
            boothMatchQuery._id = new mongoose.Types.ObjectId(boothId);
        }
        if (eventId) {
            if (!mongoose.Types.ObjectId.isValid(eventId)) {
                return res.status(400).json({ error: 'Invalid eventId format' });
            }
            boothMatchQuery.eventId = new mongoose.Types.ObjectId(eventId);
        }

        // First, get all booths matching the filter criteria
        const booths = await Booth.find(boothMatchQuery)
            .populate('eventId', 'name slug')
            .select('name eventId');

        if (booths.length === 0) {
            return res.json({ booths: [] });
        }

        const boothIds = booths.map(b => b._id);

        // Build query for meeting stats
        let matchQuery = { ...dateFilter, boothId: { $in: boothIds } };
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            matchQuery.eventId = new mongoose.Types.ObjectId(eventId);
        }

        // Get booth statistics
        const boothStats = await MeetingRecord.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$boothId',
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    droppedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    },
                    totalDuration: { $sum: '$duration' },
                    averageDuration: { $avg: '$duration' },
                    meetingsOver3Min: {
                        $sum: { $cond: [{ $gt: ['$duration', 3] }, 1, 0] }
                    },
                    totalWithInterpreter: {
                        $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                    },
                    interpreterTime: {
                        $sum: {
                            $cond: [
                                { $ne: ['$interpreterId', null] },
                                '$duration',
                                0
                            ]
                        }
                    },
                    uniqueJobSeekers: { $addToSet: '$jobseekerId' },
                    uniqueRecruiters: { $addToSet: '$recruiterId' }
                }
            }
        ]);

        // Get queue statistics per booth
        let queueMatchQuery = { booth: { $in: boothIds } };
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            queueMatchQuery.event = new mongoose.Types.ObjectId(eventId);
        }
        if (startDate || endDate) {
            queueMatchQuery.joinedAt = {};
            if (startDate) queueMatchQuery.joinedAt.$gte = new Date(startDate);
            if (endDate) queueMatchQuery.joinedAt.$lte = new Date(endDate);
        }

        const queueStats = await BoothQueue.aggregate([
            { $match: queueMatchQuery },
            {
                $group: {
                    _id: '$booth',
                    totalQueueVisits: { $sum: 1 },
                    uniqueQueueVisits: { $addToSet: '$jobSeeker' },
                    leftWithMessage: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    }
                }
            }
        ]);

        // Get job seeker interests per booth
        const JobSeekerInterest = require('../models/JobSeekerInterest');
        let interestMatchQuery = { booth: { $in: boothIds } };
        if (eventId && mongoose.Types.ObjectId.isValid(eventId)) {
            interestMatchQuery.event = new mongoose.Types.ObjectId(eventId);
        }

        const interestStats = await JobSeekerInterest.aggregate([
            { $match: interestMatchQuery },
            {
                $group: {
                    _id: '$booth',
                    totalInterests: { $sum: 1 },
                    uniqueJobSeekers: { $addToSet: '$jobSeeker' }
                }
            }
        ]);

        const boothsWithStats = booths.map(booth => {
            const stats = boothStats.find(s => s._id.toString() === booth._id.toString()) || {};
            const queue = queueStats.find(s => s._id.toString() === booth._id.toString()) || {};
            const interests = interestStats.find(s => s._id.toString() === booth._id.toString()) || {};
            
            const uniqueRecruiters = stats.uniqueRecruiters ? stats.uniqueRecruiters.length : 0;
            const avgMeetingsPerRecruiter = uniqueRecruiters > 0 
                ? (stats.totalMeetings / uniqueRecruiters).toFixed(2) 
                : 0;

            return {
                _id: booth._id,
                name: booth.name,
                eventId: booth.eventId?._id,
                eventName: booth.eventId?.name,
                jobSeekerInterest: interests.totalInterests || 0,
                uniqueQueueVisits: queue.uniqueQueueVisits ? queue.uniqueQueueVisits.length : 0,
                totalQueueVisits: queue.totalQueueVisits || 0,
                uniqueMeetings: stats.uniqueJobSeekers ? stats.uniqueJobSeekers.length : 0,
                totalJobSeekerMeetings: stats.totalMeetings || 0,
                droppedMeetings: stats.droppedMeetings || 0,
                meetingsOver3Min: stats.meetingsOver3Min || 0,
                averageMeetingTime: stats.averageDuration || 0,
                avgMeetingsPerRecruiter: parseFloat(avgMeetingsPerRecruiter),
                interpreterMeetings: stats.totalWithInterpreter || 0,
                interpreterTime: stats.interpreterTime || 0
            };
        });

        res.json({ booths: boothsWithStats });

    } catch (error) {
        logger.error('Error fetching booth analytics:', error);
        res.status(500).json({ error: 'Failed to fetch booth analytics', message: error.message });
    }
});

/**
 * GET /api/analytics/live-stats
 * Live system stats (online users, calls, queue)
 */
router.get('/live-stats', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const boothFilter = await buildBoothFilter(req.user);
        if (boothFilter === null) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { eventId, boothId } = req.query;
        const requestedBoothId = (boothFilter.boothId || boothId || '').toString() || null;
        const requestedEventId = eventId || null;

        const onlineUsersRaw = liveStatsStore.getOnlineUsers();
        const callParticipantsRaw = liveStatsStore.getCallParticipants();

        // Build lookup map for booth meta (name + event)
        const boothIdsToLookup = new Set();
        onlineUsersRaw.forEach(user => {
            if (user.assignedBooth) {
                boothIdsToLookup.add(user.assignedBooth.toString());
            }
        });
        callParticipantsRaw.forEach(participant => {
            if (participant.boothId) {
                boothIdsToLookup.add(participant.boothId.toString());
            }
        });

        const boothMeta = {};
        if (boothIdsToLookup.size > 0) {
            const booths = await Booth.find({ _id: { $in: Array.from(boothIdsToLookup) } }).select('name eventId');
            booths.forEach(booth => {
                boothMeta[booth._id.toString()] = {
                    name: booth.name,
                    eventId: booth.eventId ? booth.eventId.toString() : null
                };
            });
        }

        const filterByScope = (itemBoothId, itemEventId) => {
            if (requestedBoothId && itemBoothId && itemBoothId.toString() !== requestedBoothId) {
                return false;
            }
            if (requestedBoothId && !itemBoothId) {
                return false;
            }
            if (requestedEventId) {
                if (itemEventId) {
                    return itemEventId.toString() === requestedEventId;
                }
                if (itemBoothId) {
                    const meta = boothMeta[itemBoothId.toString()];
                    return meta?.eventId === requestedEventId;
                }
                return false;
            }
            return true;
        };

        const onlineUsers = onlineUsersRaw
            .filter(user => filterByScope(user.assignedBooth, null))
            .map(user => ({
                userId: user.userId,
                name: user.name,
                role: user.role,
                email: user.email,
                assignedBooth: user.assignedBooth || null,
                boothName: user.assignedBooth ? boothMeta[user.assignedBooth]?.name || null : null,
                lastOnline: user.lastOnline,
                connectedAt: user.connectedAt
            }));

        const callParticipants = callParticipantsRaw
            .filter(participant => filterByScope(participant.boothId, participant.eventId))
            .map(participant => ({
                userId: participant.userId,
                sessionId: participant.sessionId,
                name: participant.name,
                role: participant.role,
                email: participant.email,
                boothId: participant.boothId,
                boothName: participant.boothId ? boothMeta[participant.boothId]?.name || null : null,
                eventId: participant.eventId || (participant.boothId ? boothMeta[participant.boothId]?.eventId || null : null),
                joinedAt: participant.joinedAt
            }));

        const uniqueSessions = new Set(callParticipants.map(p => p.sessionId));

        // Queue stats (waiting job seekers)
        const queueMatch = {
            status: { $in: ['waiting', 'invited'] }
        };
        if (requestedBoothId && mongoose.Types.ObjectId.isValid(requestedBoothId)) {
            queueMatch.booth = new mongoose.Types.ObjectId(requestedBoothId);
        } else if (boothId && mongoose.Types.ObjectId.isValid(boothId)) {
            queueMatch.booth = new mongoose.Types.ObjectId(boothId);
        }
        if (requestedEventId && mongoose.Types.ObjectId.isValid(requestedEventId)) {
            queueMatch.event = new mongoose.Types.ObjectId(requestedEventId);
        }

        const queueEntries = await BoothQueue.find(queueMatch)
            .populate('jobSeeker', 'name email role')
            .populate('booth', 'name')
            .populate('event', 'name start end')
            .sort({ joinedAt: 1 })
            .limit(200);

        const queueData = queueEntries.map(entry => ({
            id: entry._id,
            jobSeeker: entry.jobSeeker ? {
                id: entry.jobSeeker._id,
                name: entry.jobSeeker.name,
                email: entry.jobSeeker.email,
                role: entry.jobSeeker.role
            } : null,
            boothId: entry.booth?._id,
            boothName: entry.booth?.name || null,
            eventId: entry.event?._id,
            eventName: entry.event?.name || null,
            status: entry.status,
            joinedAt: entry.joinedAt,
            position: entry.position
        }));

        res.json({
            onlineUsers: {
                total: onlineUsers.length,
                users: onlineUsers
            },
            calls: {
                totalParticipants: callParticipants.length,
                totalSessions: uniqueSessions.size,
                participants: callParticipants
            },
            queue: {
                totalWaiting: queueData.length,
                entries: queueData
            }
        });
    } catch (error) {
        logger.error('Error fetching live stats:', error);
        res.status(500).json({ error: 'Failed to fetch live stats', message: error.message });
    }
});

/**
 * GET /api/analytics/full-event-report
 * Get comprehensive event report with booth breakdown
 * Admin and GlobalSupport: all events
 * Booth Support: only their booth's event
 */
router.get('/full-event-report', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const boothFilter = await buildBoothFilter(req.user);
        
        if (boothFilter === null) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const { eventId, startDate, endDate } = req.query;

        if (!eventId) {
            return res.status(400).json({ error: 'eventId is required' });
        }

        // Convert eventId to ObjectId
        if (!mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ error: 'Invalid eventId format' });
        }
        const eventObjectId = new mongoose.Types.ObjectId(eventId);

        // Build date filter
        let dateFilter = {};
        if (startDate || endDate) {
            dateFilter.startTime = {};
            if (startDate) dateFilter.startTime.$gte = new Date(startDate);
            if (endDate) dateFilter.startTime.$lte = new Date(endDate);
        }

        // Build booth filter query
        let boothMatchQuery = { eventId: eventObjectId };
        if (boothFilter.boothId) {
            boothMatchQuery._id = boothFilter.boothId;
        }

        // First, get all booths for this event
        const booths = await Booth.find(boothMatchQuery).select('name');

        if (booths.length === 0) {
            return res.json({ eventId, booths: [], eventTotal: {} });
        }

        const boothIds = booths.map(b => b._id);

        // Get booth statistics for this event
        const matchQuery = { eventId: eventObjectId, boothId: { $in: boothIds }, ...dateFilter };

        const boothStats = await MeetingRecord.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: '$boothId',
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                    },
                    droppedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                    },
                    totalDuration: { $sum: '$duration' },
                    averageDuration: { $avg: '$duration' },
                    meetingsOver3Min: {
                        $sum: { $cond: [{ $gt: ['$duration', 3] }, 1, 0] }
                    },
                    totalWithInterpreter: {
                        $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                    },
                    interpreterTime: {
                        $sum: {
                            $cond: [
                                { $ne: ['$interpreterId', null] },
                                '$duration',
                                0
                            ]
                        }
                    },
                    uniqueJobSeekers: { $addToSet: '$jobseekerId' },
                    uniqueRecruiters: { $addToSet: '$recruiterId' }
                }
            }
        ]);

        // Get queue statistics
        let queueMatchQuery = { event: eventObjectId, booth: { $in: boothIds } };
        if (startDate || endDate) {
            queueMatchQuery.joinedAt = {};
            if (startDate) queueMatchQuery.joinedAt.$gte = new Date(startDate);
            if (endDate) queueMatchQuery.joinedAt.$lte = new Date(endDate);
        }

        const queueStats = await BoothQueue.aggregate([
            { $match: queueMatchQuery },
            {
                $group: {
                    _id: '$booth',
                    totalQueueVisits: { $sum: 1 },
                    uniqueQueueVisits: { $addToSet: '$jobSeeker' }
                }
            }
        ]);

        // Get job seeker interests
        const JobSeekerInterest = require('../models/JobSeekerInterest');
        let interestMatchQuery = { event: eventObjectId, booth: { $in: boothIds } };

        const interestStats = await JobSeekerInterest.aggregate([
            { $match: interestMatchQuery },
            {
                $group: {
                    _id: '$booth',
                    totalInterests: { $sum: 1 }
                }
            }
        ]);

        const boothsWithStats = booths.map(booth => {
            const stats = boothStats.find(s => s._id.toString() === booth._id.toString()) || {};
            const queue = queueStats.find(s => s._id.toString() === booth._id.toString()) || {};
            const interests = interestStats.find(s => s._id.toString() === booth._id.toString()) || {};
            
            const uniqueRecruiters = stats.uniqueRecruiters ? stats.uniqueRecruiters.length : 0;
            const avgMeetingsPerRecruiter = uniqueRecruiters > 0 
                ? (stats.totalMeetings / uniqueRecruiters).toFixed(2) 
                : 0;

            return {
                boothId: booth._id,
                boothName: booth.name,
                jobSeekerInterest: interests.totalInterests || 0,
                uniqueQueueVisits: queue.uniqueQueueVisits ? queue.uniqueQueueVisits.length : 0,
                totalQueueVisits: queue.totalQueueVisits || 0,
                uniqueMeetings: stats.uniqueJobSeekers ? stats.uniqueJobSeekers.length : 0,
                totalJobSeekerMeetings: stats.totalMeetings || 0,
                droppedMeetings: stats.droppedMeetings || 0,
                meetingsOver3Min: stats.meetingsOver3Min || 0,
                averageMeetingTime: stats.averageDuration || 0,
                avgMeetingsPerRecruiter: parseFloat(avgMeetingsPerRecruiter),
                interpreterMeetings: stats.totalWithInterpreter || 0,
                interpreterTime: stats.interpreterTime || 0
            };
        });

        // Calculate event totals
        const eventTotals = boothsWithStats.reduce((acc, booth) => {
            acc.jobSeekerInterest += booth.jobSeekerInterest;
            acc.uniqueQueueVisits += booth.uniqueQueueVisits;
            acc.totalQueueVisits += booth.totalQueueVisits;
            acc.uniqueMeetings += booth.uniqueMeetings;
            acc.totalJobSeekerMeetings += booth.totalJobSeekerMeetings;
            acc.droppedMeetings += booth.droppedMeetings;
            acc.meetingsOver3Min += booth.meetingsOver3Min;
            acc.interpreterMeetings += booth.interpreterMeetings;
            acc.interpreterTime += booth.interpreterTime;
            
            // Calculate weighted average for meeting time
            const totalDuration = boothsWithStats.reduce((sum, b) => sum + (b.averageMeetingTime * b.totalJobSeekerMeetings), 0);
            const totalMeetings = acc.totalJobSeekerMeetings;
            acc.averageMeetingTime = totalMeetings > 0 ? totalDuration / totalMeetings : 0;
            
            // Calculate weighted average for meetings per recruiter
            const totalRecruiterMeetings = boothsWithStats.reduce((sum, b) => sum + (b.avgMeetingsPerRecruiter * b.totalJobSeekerMeetings), 0);
            acc.avgMeetingsPerRecruiter = totalMeetings > 0 ? totalRecruiterMeetings / totalMeetings : 0;
            
            return acc;
        }, {
            jobSeekerInterest: 0,
            uniqueQueueVisits: 0,
            totalQueueVisits: 0,
            uniqueMeetings: 0,
            totalJobSeekerMeetings: 0,
            droppedMeetings: 0,
            meetingsOver3Min: 0,
            averageMeetingTime: 0,
            avgMeetingsPerRecruiter: 0,
            interpreterMeetings: 0,
            interpreterTime: 0
        });

        res.json({
            eventId,
            booths: boothsWithStats,
            eventTotal: eventTotals
        });

    } catch (error) {
        logger.error('Error fetching full event report:', error);
        res.status(500).json({ error: 'Failed to fetch full event report', message: error.message });
    }
});

/**
 * GET /api/analytics/export/csv
 * Export analytics data as CSV
 */
router.get('/export/csv', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Support']), async (req, res) => {
    try {
        const { type, eventId, startDate, endDate } = req.query;

        if (!type || !['booths', 'events', 'full-event'].includes(type)) {
            return res.status(400).json({ error: 'Invalid export type' });
        }

        let data = [];
        let filename = 'analytics-export.csv';

        if (type === 'full-event') {
            if (!eventId) {
                return res.status(400).json({ error: 'eventId is required for full-event export' });
            }

            // Get full event report
            const boothFilter = await buildBoothFilter(req.user);
            if (boothFilter === null) {
                return res.status(403).json({ error: 'Access denied' });
            }

            // Convert eventId to ObjectId
            if (!mongoose.Types.ObjectId.isValid(eventId)) {
                return res.status(400).json({ error: 'Invalid eventId format' });
            }
            const eventObjectId = new mongoose.Types.ObjectId(eventId);

            // Build date filter
            let dateFilter = {};
            if (startDate || endDate) {
                dateFilter.startTime = {};
                if (startDate) dateFilter.startTime.$gte = new Date(startDate);
                if (endDate) dateFilter.startTime.$lte = new Date(endDate);
            }

            // Build booth filter query
            let boothMatchQuery = { eventId: eventObjectId };
            if (boothFilter.boothId) {
                boothMatchQuery._id = boothFilter.boothId;
            }

            // First, get all booths for this event
            const boothsForExport = await Booth.find(boothMatchQuery).select('name');
            const boothIdsForExport = boothsForExport.map(b => b._id);

            const matchQuery = { eventId: eventObjectId, boothId: { $in: boothIdsForExport }, ...dateFilter };

            const boothStats = await MeetingRecord.aggregate([
                { $match: matchQuery },
                {
                    $group: {
                        _id: '$boothId',
                        totalMeetings: { $sum: 1 },
                        droppedMeetings: {
                            $sum: { $cond: [{ $eq: ['$status', 'left_with_message'] }, 1, 0] }
                        },
                        meetingsOver3Min: {
                            $sum: { $cond: [{ $gt: ['$duration', 3] }, 1, 0] }
                        },
                        averageDuration: { $avg: '$duration' },
                        uniqueRecruiters: { $addToSet: '$recruiterId' },
                        totalWithInterpreter: {
                            $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                        },
                        interpreterTime: {
                            $sum: {
                                $cond: [
                                    { $ne: ['$interpreterId', null] },
                                    '$duration',
                                    0
                                ]
                            }
                        }
                    }
                }
            ]);

            data = boothsForExport.map(booth => {
                const stats = boothStats.find(s => s._id.toString() === booth._id.toString()) || {};
                const uniqueRecruiters = stats.uniqueRecruiters ? stats.uniqueRecruiters.length : 0;
                const avgMeetingsPerRecruiter = uniqueRecruiters > 0 
                    ? (stats.totalMeetings / uniqueRecruiters).toFixed(2) 
                    : 0;

                return [
                    booth.name,
                    0, // Job Seeker Interest (would need separate query)
                    0, // Unique Queue Visits (would need separate query)
                    0, // Total Queue Visits (would need separate query)
                    stats.totalMeetings || 0,
                    stats.totalMeetings || 0,
                    stats.droppedMeetings || 0,
                    stats.meetingsOver3Min || 0,
                    formatDuration(stats.averageDuration || 0),
                    avgMeetingsPerRecruiter,
                    stats.totalWithInterpreter || 0,
                    formatDuration(stats.interpreterTime || 0)
                ];
            });

            filename = `event-${eventId}-report.csv`;
        }

        // Convert to CSV
        const csvHeaders = [
            'Booth',
            'Job Seeker Interest',
            'Unique Queue Visits',
            'Total Queue Visits',
            'Unique Meetings',
            'Total Job Seeker Meetings',
            'Dropped Meetings',
            'Meetings Longer than 3 Minutes',
            'Average Meeting Time',
            'Avg Meetings per Recruiter',
            'Interpreter Meetings',
            'Interpreter Time in Meetings'
        ];

        const csvContent = [csvHeaders, ...data]
            .map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
            .join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(csvContent);

    } catch (error) {
        logger.error('Error exporting analytics:', error);
        res.status(500).json({ error: 'Failed to export analytics', message: error.message });
    }
});

/**
 * Helper function to format duration in minutes to readable format
 */
function formatDuration(minutes) {
    if (!minutes || minutes === 0) return '0 sec';
    const hours = Math.floor(minutes / 60);
    const mins = Math.floor(minutes % 60);
    const secs = Math.floor((minutes % 1) * 60);
    
    if (hours > 0) {
        return `${hours} min ${mins} sec`;
    } else if (mins > 0) {
        return `${mins} min ${secs} sec`;
    } else {
        return `${secs} sec`;
    }
}

module.exports = router;

