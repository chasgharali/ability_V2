const express = require('express');
const mongoose = require('mongoose');
const JobSeekerInterest = require('../models/JobSeekerInterest');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * POST /api/job-seeker-interests
 * Create or update job seeker interest in a booth
 */
router.post('/', authenticateToken, requireRole(['JobSeeker']), async (req, res) => {
    try {
        const { eventId, boothId, company, companyLogo, isInterested, interestLevel, notes } = req.body;
        const jobSeekerId = req.user.id;

        // Validation
        if (!eventId || !boothId || !company) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Event ID, Booth ID, and Company name are required'
            });
        }

        // Check if interest already exists
        let interest = await JobSeekerInterest.findOne({
            jobSeeker: jobSeekerId,
            event: eventId,
            booth: boothId
        });

        if (interest) {
            // Update existing interest
            interest.isInterested = isInterested !== undefined ? isInterested : interest.isInterested;
            interest.interestLevel = interestLevel || interest.interestLevel;
            interest.notes = notes !== undefined ? notes : interest.notes;
            interest.company = company;
            interest.companyLogo = companyLogo || interest.companyLogo;

            await interest.save();
        } else {
            // Create new interest
            interest = new JobSeekerInterest({
                jobSeeker: jobSeekerId,
                event: eventId,
                booth: boothId,
                company,
                companyLogo,
                isInterested: isInterested !== undefined ? isInterested : true,
                interestLevel: interestLevel || 'medium',
                notes
            });

            await interest.save();
        }

        res.json({
            success: true,
            interest: {
                _id: interest._id,
                jobSeeker: interest.jobSeeker,
                event: interest.event,
                booth: interest.booth,
                company: interest.company,
                companyLogo: interest.companyLogo,
                isInterested: interest.isInterested,
                interestLevel: interest.interestLevel,
                notes: interest.notes,
                createdAt: interest.createdAt,
                updatedAt: interest.updatedAt
            }
        });
    } catch (error) {
        logger.error('Create/Update job seeker interest error:', error);

        if (error.code === 11000) {
            return res.status(409).json({
                error: 'Duplicate interest',
                message: 'Interest for this booth already exists'
            });
        }

        res.status(500).json({
            error: 'Failed to save interest',
            message: 'An error occurred while saving your interest'
        });
    }
});

/**
 * GET /api/job-seeker-interests/my-interests/:eventId
 * Get job seeker's interests for a specific event
 */
router.get('/my-interests/:eventId', authenticateToken, requireRole(['JobSeeker']), async (req, res) => {
    try {
        const { eventId } = req.params;
        const jobSeekerId = req.user.id;

        const interests = await JobSeekerInterest.getJobSeekerInterests(jobSeekerId, eventId);

        res.json({
            success: true,
            interests
        });
    } catch (error) {
        logger.error('Get job seeker interests error:', error);
        res.status(500).json({
            error: 'Failed to retrieve interests',
            message: 'An error occurred while retrieving your interests'
        });
    }
});

/**
 * GET /api/job-seeker-interests
 * Get all job seeker interests with filtering (for admins/recruiters)
 */
router.get('/', authenticateToken, requireRole(['Recruiter', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const {
            eventId,
            boothId,
            recruiterId,
            page = 1,
            limit = 50,
            sortBy = 'createdAt',
            sortOrder = 'desc'
        } = req.query;

        console.log('JobSeeker Interests API called by user:', req.user.role, req.user._id);
        console.log('Query params:', { eventId, boothId, recruiterId, page, limit });

        // Build query based on user role and filters
        let query = { isInterested: true };

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            // Recruiters can only see interests for their booths
            const Booth = require('../models/Booth');
            const recruiterBooths = await Booth.find({
                administrators: req.user._id
            }).select('_id');

            const boothIds = recruiterBooths.map(booth => booth._id);
            console.log('Recruiter booths found:', recruiterBooths.length, 'IDs:', boothIds);

            // If recruiter has no booths, return empty result
            if (boothIds.length === 0) {
                console.log('Recruiter has no assigned booths, returning empty result');
                return res.json({
                    interests: [],
                    pagination: {
                        currentPage: 1,
                        totalPages: 0,
                        totalInterests: 0,
                        hasNext: false,
                        hasPrev: false
                    }
                });
            }

            query.booth = { $in: boothIds };
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            // Admins can filter by recruiter or see all
            if (recruiterId) {
                const Booth = require('../models/Booth');
                const recruiterBooths = await Booth.find({
                    administrators: recruiterId
                }).select('_id');

                const boothIds = recruiterBooths.map(booth => booth._id);
                query.booth = { $in: boothIds };
            }
        }

        // Apply additional filters
        if (eventId) query.event = eventId;
        if (boothId) query.booth = boothId;

        // Pagination
        const skip = (page - 1) * limit;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        console.log('Final query:', JSON.stringify(query, null, 2));

        // Execute query with population
        const interests = await JobSeekerInterest.find(query)
            .populate('jobSeeker', 'name email city state')
            .populate('event', 'name slug')
            .populate('booth', 'name description')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean(); // Use lean() for better performance and to work with the data directly

        // Get total count for pagination
        const totalInterests = await JobSeekerInterest.countDocuments(query);

        console.log('Found interests:', interests.length, 'Total in DB:', totalInterests);

        // Handle legacy data - fetch actual user/event/booth data when populate returns null
        const User = require('../models/User');
        const Event = require('../models/Event');
        const Booth = require('../models/Booth');

        // Collect all legacy IDs that need to be looked up
        const legacyJobSeekerIds = [];
        const legacyEventIds = [];
        const legacyBoothIds = [];

        for (const interest of interests) {
            if (!interest.jobSeeker && interest.legacyJobSeekerId) {
                legacyJobSeekerIds.push(interest.legacyJobSeekerId);
            }
            if (!interest.event && interest.legacyEventId && mongoose.Types.ObjectId.isValid(interest.legacyEventId)) {
                legacyEventIds.push(new mongoose.Types.ObjectId(interest.legacyEventId));
            }
            if (!interest.booth && interest.legacyBoothId && mongoose.Types.ObjectId.isValid(interest.legacyBoothId)) {
                legacyBoothIds.push(new mongoose.Types.ObjectId(interest.legacyBoothId));
            }
        }

        // Batch fetch legacy users
        let legacyUsersMap = {};
        if (legacyJobSeekerIds.length > 0) {
            try {
                const legacyUsers = await User.find({ legacyId: { $in: legacyJobSeekerIds } })
                    .select('name email city state legacyId')
                    .lean();
                legacyUsers.forEach(user => {
                    legacyUsersMap[user.legacyId] = user;
                });
            } catch (error) {
                console.error('Error batch fetching legacy users:', error);
            }
        }

        // Batch fetch legacy events
        let legacyEventsMap = {};
        if (legacyEventIds.length > 0) {
            try {
                const legacyEvents = await Event.find({ _id: { $in: legacyEventIds } })
                    .select('name slug')
                    .lean();
                legacyEvents.forEach(event => {
                    legacyEventsMap[event._id.toString()] = event;
                });
            } catch (error) {
                console.error('Error batch fetching legacy events:', error);
            }
        }

        // Batch fetch legacy booths
        let legacyBoothsMap = {};
        if (legacyBoothIds.length > 0) {
            try {
                const legacyBooths = await Booth.find({ _id: { $in: legacyBoothIds } })
                    .select('name description')
                    .lean();
                legacyBooths.forEach(booth => {
                    legacyBoothsMap[booth._id.toString()] = booth;
                });
            } catch (error) {
                console.error('Error batch fetching legacy booths:', error);
            }
        }

        // Populate legacy data in interests
        for (const interest of interests) {
            if (!interest.jobSeeker && interest.legacyJobSeekerId && legacyUsersMap[interest.legacyJobSeekerId]) {
                interest.jobSeeker = legacyUsersMap[interest.legacyJobSeekerId];
            }
            if (!interest.event && interest.legacyEventId && legacyEventsMap[interest.legacyEventId]) {
                interest.event = legacyEventsMap[interest.legacyEventId];
            }
            if (!interest.booth && interest.legacyBoothId && legacyBoothsMap[interest.legacyBoothId]) {
                interest.booth = legacyBoothsMap[interest.legacyBoothId];
            }
        }

        res.json({
            interests,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalInterests / limit),
                totalInterests,
                hasNext: page * limit < totalInterests,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        logger.error('Get job seeker interests error:', error);
        res.status(500).json({
            error: 'Failed to retrieve interests',
            message: 'An error occurred while retrieving interests'
        });
    }
});

/**
 * GET /api/job-seeker-interests/booth/:boothId
 * Get all job seekers interested in a specific booth (for recruiters/admins)
 */
router.get('/booth/:boothId', authenticateToken, requireRole(['Recruiter', 'Admin', 'AdminEvent']), async (req, res) => {
    try {
        const { boothId } = req.params;

        const interests = await JobSeekerInterest.getBoothInterests(boothId);

        res.json({
            success: true,
            interests
        });
    } catch (error) {
        logger.error('Get booth interests error:', error);
        res.status(500).json({
            error: 'Failed to retrieve booth interests',
            message: 'An error occurred while retrieving booth interests'
        });
    }
});

/**
 * DELETE /api/job-seeker-interests/:interestId
 * Remove job seeker interest
 */
router.delete('/:interestId', authenticateToken, requireRole(['JobSeeker']), async (req, res) => {
    try {
        const { interestId } = req.params;
        const jobSeekerId = req.user.id;

        const interest = await JobSeekerInterest.findOne({
            _id: interestId,
            jobSeeker: jobSeekerId
        });

        if (!interest) {
            return res.status(404).json({
                error: 'Interest not found',
                message: 'The specified interest does not exist or you do not have permission to delete it'
            });
        }

        await JobSeekerInterest.findByIdAndDelete(interestId);

        res.json({
            success: true,
            message: 'Interest removed successfully'
        });
    } catch (error) {
        logger.error('Delete job seeker interest error:', error);
        res.status(500).json({
            error: 'Failed to remove interest',
            message: 'An error occurred while removing your interest'
        });
    }
});

/**
 * PUT /api/job-seeker-interests/:interestId/toggle
 * Toggle job seeker interest status
 */
router.put('/:interestId/toggle', authenticateToken, requireRole(['JobSeeker']), async (req, res) => {
    try {
        const { interestId } = req.params;
        const jobSeekerId = req.user.id;

        const interest = await JobSeekerInterest.findOne({
            _id: interestId,
            jobSeeker: jobSeekerId
        });

        if (!interest) {
            return res.status(404).json({
                error: 'Interest not found',
                message: 'The specified interest does not exist or you do not have permission to modify it'
            });
        }

        await interest.toggleInterest();

        res.json({
            success: true,
            interest: {
                _id: interest._id,
                isInterested: interest.isInterested,
                updatedAt: interest.updatedAt
            }
        });
    } catch (error) {
        logger.error('Toggle job seeker interest error:', error);
        res.status(500).json({
            error: 'Failed to toggle interest',
            message: 'An error occurred while updating your interest'
        });
    }
});

module.exports = router;
