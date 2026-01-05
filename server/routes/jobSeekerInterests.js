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
            search,
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
            // Check both assignedBooth field on User AND administrators array on Booth
            const Booth = require('../models/Booth');
            const User = require('../models/User');
            
            // Get the recruiter's assigned booth directly from User model
            const recruiter = await User.findById(req.user._id).select('assignedBooth');
            const boothIds = new Set();
            
            // Add assigned booth if it exists
            if (recruiter && recruiter.assignedBooth) {
                const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                boothIds.add(boothId.toString());
                console.log('Recruiter has assignedBooth:', boothId);
            }
            
            // Also check booths where recruiter is in administrators array
            const adminBooths = await Booth.find({
                administrators: req.user._id
            }).select('_id');
            
            adminBooths.forEach(booth => {
                boothIds.add(booth._id.toString());
            });
            
            const boothIdsArray = Array.from(boothIds)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
            console.log('Recruiter booths found:', boothIdsArray.length, 'IDs:', boothIdsArray);

            // If recruiter has no booths, return empty result
            if (boothIdsArray.length === 0) {
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

            query.booth = { $in: boothIdsArray };
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            // Admins can filter by recruiter or see all
            if (recruiterId) {
                const Booth = require('../models/Booth');
                const User = require('../models/User');
                
                // Get the recruiter's assigned booth directly from User model
                const recruiter = await User.findById(recruiterId).select('assignedBooth');
                const boothIds = new Set();
                
                // Add assigned booth if it exists
                if (recruiter && recruiter.assignedBooth) {
                    const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                    boothIds.add(boothId.toString());
                }
                
                // Also check booths where recruiter is in administrators array
                const adminBooths = await Booth.find({
                    administrators: recruiterId
                }).select('_id');
                
                adminBooths.forEach(booth => {
                    boothIds.add(booth._id.toString());
                });
                
                const boothIdsArray = Array.from(boothIds)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
                query.booth = { $in: boothIdsArray };
            }
        }
        if (eventId) {
            // Strip "legacy_" prefix if present (client sends "legacy_<id>" format)
            const cleanEventId = eventId.toString().replace(/^legacy_/, '');
            
            // Check if it's a legacy event ID (not a valid ObjectId format)
            if (mongoose.Types.ObjectId.isValid(cleanEventId)) {
                // Regular event ID
                query.event = cleanEventId;
                console.log('📅 Filtering by regular event ID:', cleanEventId);
            } else {
                // Legacy event ID - search by legacyEventId field
                query.legacyEventId = cleanEventId;
                console.log('📅 Filtering by legacy event ID:', cleanEventId);
            }
        }
        if (boothId) query.booth = boothId;

        // Sort options
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        console.log('Final query:', JSON.stringify(query, null, 2));

        // Helper function to check if interest matches search term
        const matchesSearch = (interest, searchTerm) => {
            // Search in event name
            if (interest.event?.name && interest.event.name.toLowerCase().includes(searchTerm)) return true;
            // Search in booth name
            if (interest.booth?.name && interest.booth.name.toLowerCase().includes(searchTerm)) return true;
            // Search in job seeker name, email, phone, city, state, country
            if (interest.jobSeeker?.name && interest.jobSeeker.name.toLowerCase().includes(searchTerm)) return true;
            if (interest.jobSeeker?.email && interest.jobSeeker.email.toLowerCase().includes(searchTerm)) return true;
            if (interest.jobSeeker?.phoneNumber && interest.jobSeeker.phoneNumber.toLowerCase().includes(searchTerm)) return true;
            if (interest.jobSeeker?.city && interest.jobSeeker.city.toLowerCase().includes(searchTerm)) return true;
            if (interest.jobSeeker?.state && interest.jobSeeker.state.toLowerCase().includes(searchTerm)) return true;
            if (interest.jobSeeker?.country && interest.jobSeeker.country.toLowerCase().includes(searchTerm)) return true;
            // Search in job seeker profile fields (metadata.profile)
            if (interest.jobSeeker?.metadata?.profile) {
                const profile = interest.jobSeeker.metadata.profile;
                if (profile.headline && profile.headline.toLowerCase().includes(searchTerm)) return true;
                if (profile.keywords && profile.keywords.toLowerCase().includes(searchTerm)) return true;
                if (profile.workLevel && profile.workLevel.toLowerCase().includes(searchTerm)) return true;
                if (profile.educationLevel && profile.educationLevel.toLowerCase().includes(searchTerm)) return true;
                if (profile.clearance && profile.clearance.toLowerCase().includes(searchTerm)) return true;
                if (profile.veteranStatus && profile.veteranStatus.toLowerCase().includes(searchTerm)) return true;
                if (Array.isArray(profile.employmentTypes) && profile.employmentTypes.some(et => et && et.toLowerCase().includes(searchTerm))) return true;
                if (Array.isArray(profile.languages) && profile.languages.some(lang => lang && lang.toLowerCase().includes(searchTerm))) return true;
            }
            // Search in interest level and notes
            if (interest.interestLevel && interest.interestLevel.toLowerCase().includes(searchTerm)) return true;
            if (interest.notes && interest.notes.toLowerCase().includes(searchTerm)) return true;
            // Search in company name (legacy field)
            if (interest.company && interest.company.toLowerCase().includes(searchTerm)) return true;
            return false;
        };

        // Fetch ALL records matching the base query (without pagination) if search is provided
        // Otherwise, fetch with pagination for better performance
        let allInterests;
        if (search && search.trim()) {
            // Fetch all records for search filtering
            allInterests = await JobSeekerInterest.find(query)
                .populate({
                    path: 'jobSeeker',
                    select: 'name email phoneNumber city state country resumeUrl metadata',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'event',
                    select: 'name slug',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'booth',
                    select: 'name description',
                    options: { strictPopulate: false }
                })
                .sort(sortOptions)
                .lean();
        } else {
            // Fetch with pagination for better performance when no search
            const skip = (page - 1) * limit;
            allInterests = await JobSeekerInterest.find(query)
                .populate({
                    path: 'jobSeeker',
                    select: 'name email phoneNumber city state country resumeUrl metadata',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'event',
                    select: 'name slug',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'booth',
                    select: 'name description',
                    options: { strictPopulate: false }
                })
                .sort(sortOptions)
                .skip(skip)
                .limit(parseInt(limit))
                .lean();
        }

        // Apply search filter if provided
        let interests = allInterests;
        if (search && search.trim()) {
            const searchTerm = search.trim().toLowerCase();
            interests = allInterests.filter(interest => matchesSearch(interest, searchTerm));
        }

        // Apply pagination if search was used (since we fetched all records)
        if (search && search.trim()) {
            const skip = (page - 1) * limit;
            interests = interests.slice(skip, skip + parseInt(limit));
        }

        // Calculate total count for pagination
        let totalInterests;
        if (search && search.trim()) {
            // Count is based on filtered records
            const searchTerm = search.trim().toLowerCase();
            const filteredCount = allInterests.filter(interest => matchesSearch(interest, searchTerm)).length;
            totalInterests = filteredCount;
        } else {
            // No search - count from database
            totalInterests = await JobSeekerInterest.countDocuments(query);
        }

        console.log('Found interests:', interests.length, 'Total in DB:', totalInterests);

        // Handle missing or unpopulated data - fetch actual user/event/booth data when populate returns null or string ID
        const User = require('../models/User');
        const Event = require('../models/Event');
        const Booth = require('../models/Booth');

        // Collect all job seeker IDs that need to be looked up (both missing and legacy)
        const jobSeekerIdsToFetch = new Set();
        const legacyJobSeekerIds = [];
        const legacyEventIds = [];
        const legacyBoothIds = [];

        for (const interest of interests) {
            // Check if jobSeeker is missing, null, or just an ObjectId string
            if (!interest.jobSeeker || typeof interest.jobSeeker === 'string') {
                const jsId = typeof interest.jobSeeker === 'string' 
                    ? interest.jobSeeker 
                    : (interest.jobSeeker?._id ? String(interest.jobSeeker._id) : null);
                
                if (jsId && mongoose.Types.ObjectId.isValid(jsId)) {
                    jobSeekerIdsToFetch.add(jsId);
                } else if (interest.legacyJobSeekerId) {
                    legacyJobSeekerIds.push(interest.legacyJobSeekerId);
                }
            }
            
            // Check for missing events
            if (!interest.event || typeof interest.event === 'string') {
                if (interest.legacyEventId && mongoose.Types.ObjectId.isValid(interest.legacyEventId)) {
                    legacyEventIds.push(new mongoose.Types.ObjectId(interest.legacyEventId));
                } else if (typeof interest.event === 'string' && mongoose.Types.ObjectId.isValid(interest.event)) {
                    legacyEventIds.push(new mongoose.Types.ObjectId(interest.event));
                }
            }
            
            // Check for missing booths
            if (!interest.booth || typeof interest.booth === 'string') {
                if (interest.legacyBoothId && mongoose.Types.ObjectId.isValid(interest.legacyBoothId)) {
                    legacyBoothIds.push(new mongoose.Types.ObjectId(interest.legacyBoothId));
                } else if (typeof interest.booth === 'string' && mongoose.Types.ObjectId.isValid(interest.booth)) {
                    legacyBoothIds.push(new mongoose.Types.ObjectId(interest.booth));
                }
            }
        }

        // Batch fetch missing job seekers
        let jobSeekersMap = {};
        if (jobSeekerIdsToFetch.size > 0) {
            try {
                const jobSeekerIdsArray = Array.from(jobSeekerIdsToFetch)
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
                
                const jobSeekers = await User.find({ _id: { $in: jobSeekerIdsArray } })
                    .select('name email phoneNumber city state country resumeUrl metadata')
                    .lean();
                
                jobSeekers.forEach(user => {
                    jobSeekersMap[String(user._id)] = user;
                });
                
                console.log(`📋 Batch fetched ${jobSeekers.length} missing job seekers`);
            } catch (error) {
                console.error('Error batch fetching missing job seekers:', error);
            }
        }

        // Batch fetch legacy users
        let legacyUsersMap = {};
        if (legacyJobSeekerIds.length > 0) {
            try {
                const legacyUsers = await User.find({ legacyId: { $in: legacyJobSeekerIds } })
                    .select('name email phoneNumber city state country resumeUrl metadata legacyId')
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

        // Populate missing data in interests (both regular and legacy)
        for (const interest of interests) {
            // Handle job seeker - try regular fetch first, then legacy
            if (!interest.jobSeeker || typeof interest.jobSeeker === 'string') {
                const jsId = typeof interest.jobSeeker === 'string' 
                    ? interest.jobSeeker 
                    : (interest.jobSeeker?._id ? String(interest.jobSeeker._id) : null);
                
                if (jsId && jobSeekersMap[jsId]) {
                    interest.jobSeeker = jobSeekersMap[jsId];
                } else if (interest.legacyJobSeekerId && legacyUsersMap[interest.legacyJobSeekerId]) {
                    interest.jobSeeker = legacyUsersMap[interest.legacyJobSeekerId];
                }
            }
            
            // Handle event - try regular fetch first, then legacy
            if (!interest.event || typeof interest.event === 'string') {
                const eventId = typeof interest.event === 'string' 
                    ? interest.event 
                    : (interest.event?._id ? String(interest.event._id) : null);
                
                if (eventId && legacyEventsMap[eventId]) {
                    interest.event = legacyEventsMap[eventId];
                } else if (interest.legacyEventId && legacyEventsMap[interest.legacyEventId]) {
                    interest.event = legacyEventsMap[interest.legacyEventId];
                }
            }
            
            // Handle booth - try regular fetch first, then legacy
            if (!interest.booth || typeof interest.booth === 'string') {
                const boothId = typeof interest.booth === 'string' 
                    ? interest.booth 
                    : (interest.booth?._id ? String(interest.booth._id) : null);
                
                if (boothId && legacyBoothsMap[boothId]) {
                    interest.booth = legacyBoothsMap[boothId];
                } else if (interest.legacyBoothId && legacyBoothsMap[interest.legacyBoothId]) {
                    interest.booth = legacyBoothsMap[interest.legacyBoothId];
                }
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
 * DELETE /api/job-seeker-interests/bulk-delete
 * Bulk delete job seeker interests (Admin/GlobalSupport only)
 */
router.delete('/bulk-delete', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { interestIds } = req.body;
        const { user } = req;

        if (!interestIds || !Array.isArray(interestIds) || interestIds.length === 0) {
            return res.status(400).json({ message: 'No interest IDs provided' });
        }

        // Delete the interests
        const result = await JobSeekerInterest.deleteMany({
            _id: { $in: interestIds }
        });

        logger.info(`Bulk deleted ${result.deletedCount} job seeker interests by ${user.email}`);

        res.json({
            message: `Successfully deleted ${result.deletedCount} interest(s)`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        logger.error('Bulk delete job seeker interests error:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message 
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

/**
 * GET /api/job-seeker-interests/export/csv
 * Export job seeker interests as CSV
 */
router.get('/export/csv', authenticateToken, requireRole(['Recruiter', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        // Get query params and filter out undefined/empty values
        const eventId = req.query.eventId && req.query.eventId !== 'undefined' && req.query.eventId !== '' 
            ? req.query.eventId 
            : undefined;
        const boothId = req.query.boothId && req.query.boothId !== 'undefined' && req.query.boothId !== '' 
            ? req.query.boothId 
            : undefined;
        const recruiterId = req.query.recruiterId && req.query.recruiterId !== 'undefined' && req.query.recruiterId !== '' 
            ? req.query.recruiterId 
            : undefined;


        // Build query based on user role and filters (same logic as GET endpoint)
        // When no filters are provided, this will export ALL interests (for Admin/GlobalSupport)
        let query = { isInterested: true };

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            const Booth = require('../models/Booth');
            const User = require('../models/User');
            
            const recruiter = await User.findById(new mongoose.Types.ObjectId(req.user._id)).select('assignedBooth');
            const boothIds = new Set();
            
            if (recruiter && recruiter.assignedBooth) {
                const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                boothIds.add(boothId.toString());
            }
            
            const adminBooths = await Booth.find({
                administrators: new mongoose.Types.ObjectId(req.user._id)
            }).select('_id');
            
            adminBooths.forEach(booth => {
                boothIds.add(booth._id.toString());
            });
            
            const boothIdsArray = Array.from(boothIds)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
            
            if (boothIdsArray.length === 0) {
                return res.json({ interests: [] });
            }

            query.booth = { $in: boothIdsArray };
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            if (recruiterId && recruiterId !== 'undefined' && recruiterId !== '' && mongoose.Types.ObjectId.isValid(recruiterId)) {
                const Booth = require('../models/Booth');
                const User = require('../models/User');
                
                const recruiter = await User.findById(new mongoose.Types.ObjectId(recruiterId)).select('assignedBooth');
                const boothIds = new Set();
                
                if (recruiter && recruiter.assignedBooth) {
                    const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                    boothIds.add(boothId.toString());
                }
                
                const adminBooths = await Booth.find({
                    administrators: new mongoose.Types.ObjectId(recruiterId)
                }).select('_id');
                
                adminBooths.forEach(booth => {
                    boothIds.add(booth._id.toString());
                });
                
                const boothIdsArray = Array.from(boothIds)
                .filter(id => id && mongoose.Types.ObjectId.isValid(id))
                .map(id => new mongoose.Types.ObjectId(id));
                query.booth = { $in: boothIdsArray };
            }
        }

        // Apply additional filters - ensure ObjectIds are valid (only if provided)
        if (eventId && eventId !== 'undefined' && eventId !== '') {
            if (mongoose.Types.ObjectId.isValid(eventId)) {
                query.event = new mongoose.Types.ObjectId(eventId);
            } else {
                return res.status(400).json({ error: 'Invalid eventId format' });
            }
        }
        if (boothId && boothId !== 'undefined' && boothId !== '') {
            // Only set boothId if it's not already set by role-based filtering
            if (!query.booth) {
                if (mongoose.Types.ObjectId.isValid(boothId)) {
                    query.booth = new mongoose.Types.ObjectId(boothId);
                } else {
                    return res.status(400).json({ error: 'Invalid boothId format' });
                }
            }
        }

        // First, get ALL job seeker IDs from interests (before populate) to ensure we capture all IDs
        const User = require('../models/User');
        const rawInterests = await JobSeekerInterest.find(query)
            .select('_id jobSeeker legacyJobSeekerId')
            .lean();
        
        // Create a map: interest._id -> jobSeeker ID for easy lookup later
        const interestToJobSeekerMap = {};
        
        // Collect ALL job seeker IDs (both regular and legacy)
        const allJobSeekerIds = new Set();
        rawInterests.forEach((interest, idx) => {
            // Store mapping for this interest
            const interestId = String(interest._id);
            // Get job seeker ID from the raw document
            // When using .lean(), jobSeeker will be an ObjectId object (not populated)
            if (interest.jobSeeker) {
                let jsId = null;
                
                // Handle ObjectId object (from Mongoose .lean())
                try {
                    // Try multiple methods to extract the ID
                    if (typeof interest.jobSeeker === 'string') {
                        jsId = interest.jobSeeker.trim();
                    } else if (interest.jobSeeker.toString && typeof interest.jobSeeker.toString === 'function') {
                        // Call toString() to get the string representation
                        jsId = String(interest.jobSeeker.toString()).trim();
                    } else if (interest.jobSeeker._id) {
                        jsId = String(interest.jobSeeker._id).trim();
                    } else {
                        // Last resort: try String() conversion
                        jsId = String(interest.jobSeeker).trim();
                    }
                    
                    // Validate and add
                    if (jsId && mongoose.Types.ObjectId.isValid(jsId)) {
                        allJobSeekerIds.add(jsId);
                        // Store mapping
                        interestToJobSeekerMap[interestId] = jsId;
                    } else if (idx < 3) {
                    }
                } catch (e) {
                    // Ignore extraction errors
                }
            }
            // Also add legacy IDs
            if (interest.legacyJobSeekerId) {
                const legacyId = String(interest.legacyJobSeekerId).trim();
                if (legacyId) {
                    allJobSeekerIds.add(legacyId);
                    // Store mapping with legacy ID as well
                    if (!interestToJobSeekerMap[interestId]) {
                        interestToJobSeekerMap[interestId] = legacyId;
                    }
                }
            }
        });
        
        
        // Batch fetch ALL job seekers upfront
        const jobSeekersMap = {};
        if (allJobSeekerIds.size > 0) {
            try {
                // Separate valid ObjectIds from legacy IDs
                const validObjectIds = [];
                const legacyIds = [];
                
                allJobSeekerIds.forEach(id => {
                    const idStr = String(id).trim();
                    if (mongoose.Types.ObjectId.isValid(idStr)) {
                        try {
                            // Create ObjectId instance - handle both string and ObjectId input
                            const objectId = idStr instanceof mongoose.Types.ObjectId 
                                ? idStr 
                                : new mongoose.Types.ObjectId(idStr);
                            validObjectIds.push(objectId);
                        } catch (e) {
                            legacyIds.push(idStr);
                        }
                    } else {
                        legacyIds.push(idStr);
                    }
                });
                
                // Fetch by _id for valid ObjectIds
                if (validObjectIds.length > 0) {
                    // Don't use .select() to ensure we get all fields including full metadata
                    const jobSeekers = await User.find({ _id: { $in: validObjectIds } })
                        .lean();
                    
                    jobSeekers.forEach(js => {
                        // Store with both _id and any legacyId for lookup
                        const jsId = String(js._id);
                        jobSeekersMap[jsId] = js;
                        if (js.legacyId) {
                            jobSeekersMap[String(js.legacyId)] = js;
                        }
                    });
                }
                
                // Fetch by legacyId for legacy IDs
                if (legacyIds.length > 0) {
                    // Don't use .select() to ensure we get all fields including full metadata
                    const legacyJobSeekers = await User.find({ legacyId: { $in: legacyIds } })
                        .lean();
                    
                    legacyJobSeekers.forEach(js => {
                        if (js.legacyId) {
                            jobSeekersMap[String(js.legacyId)] = js;
                        }
                        // Also map by _id for easier lookup
                        jobSeekersMap[String(js._id)] = js;
                    });
                    
                }
            } catch (fetchError) {
                console.error('Error batch fetching job seekers:', fetchError);
            }
        }

        // Get ALL interests (no pagination for export) - use populated data and enhance with batch-fetched
        let interests;
        try {
            // Use the populated interests we already fetched, but re-fetch with full populate for events/booths
            interests = await JobSeekerInterest.find(query)
                .populate({
                    path: 'jobSeeker',
                    select: 'name email phoneNumber city state country resumeUrl metadata',
                    model: 'User',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'event',
                    select: 'name slug',
                    options: { strictPopulate: false }
                })
                .populate({
                    path: 'booth',
                    select: 'name description administrators',
                    options: { strictPopulate: false },
                    populate: {
                        path: 'administrators',
                        select: '_id name email',
                        options: { strictPopulate: false }
                    }
                })
                .sort({ createdAt: -1 })
                .lean();
            
            // If populate failed (jobSeeker is null), we need to fetch by legacy IDs
            // Collect all legacy job seeker IDs from interests where populate failed
            const legacyJobSeekerIdsToFetch = new Set();
            interests.forEach(interest => {
                if (!interest.jobSeeker || (typeof interest.jobSeeker === 'object' && !interest.jobSeeker._id)) {
                    // Populate failed - try legacy ID
                    if (interest.legacyJobSeekerId) {
                        legacyJobSeekerIdsToFetch.add(String(interest.legacyJobSeekerId));
                    }
                }
            });
            
            // Batch fetch users by legacyId
            if (legacyJobSeekerIdsToFetch.size > 0) {
                try {
                    const legacyUsers = await User.find({ 
                        legacyId: { $in: Array.from(legacyJobSeekerIdsToFetch) } 
                    })
                    .select('name email phoneNumber city state country resumeUrl metadata legacyId')
                    .lean();
                    
                    legacyUsers.forEach(user => {
                        if (user.legacyId) {
                            jobSeekersMap[String(user.legacyId)] = user;
                        }
                        // Also map by _id
                        jobSeekersMap[String(user._id)] = user;
                    });
                } catch (legacyError) {
                    logger.error('Error fetching legacy users:', legacyError);
                }
            }
        } catch (queryError) {
            logger.error('Error querying interests for export:', queryError);
            throw new Error(`Failed to query interests: ${queryError.message}`);
        }
        
        // Batch fetch recruiters for booths that weren't populated properly
        const Booth = require('../models/Booth');
        const boothIdsToFetch = new Set();
        interests.forEach(interest => {
            // If booth is not populated or administrators are missing, fetch it
            if (!interest.booth || 
                (typeof interest.booth === 'object' && (!interest.booth.administrators || 
                 (Array.isArray(interest.booth.administrators) && interest.booth.administrators.length === 0)))) {
                const bid = (interest.booth && typeof interest.booth === 'object' && interest.booth._id) 
                    ? String(interest.booth._id) 
                    : (interest.booth ? String(interest.booth) : '');
                if (bid && mongoose.Types.ObjectId.isValid(bid)) {
                    boothIdsToFetch.add(bid);
                } else if (interest.legacyBoothId) {
                    // Try to find booth by legacy ID
                    boothIdsToFetch.add(interest.legacyBoothId);
                }
            }
        });
        
        // Batch fetch booths with administrators
        const boothRecruitersMap = {};
        if (boothIdsToFetch.size > 0) {
            try {
                const boothIdsArray = Array.from(boothIdsToFetch)
                    .filter(id => mongoose.Types.ObjectId.isValid(id))
                    .map(id => new mongoose.Types.ObjectId(id));
                
                if (boothIdsArray.length > 0) {
                    const booths = await Booth.find({ _id: { $in: boothIdsArray } })
                        .populate({
                            path: 'administrators',
                            select: '_id name email',
                            options: { strictPopulate: false }
                        })
                        .select('administrators')
                        .lean();
                    
                    booths.forEach(booth => {
                        if (booth && booth.administrators && Array.isArray(booth.administrators) && booth.administrators.length > 0) {
                            boothRecruitersMap[String(booth._id)] = booth.administrators[0];
                        }
                    });
                    
                }
            } catch (fetchError) {
                console.warn('Error batch fetching booth recruiters:', fetchError.message);
            }
        }

        // Helper function to escape CSV fields
        const escapeCSV = (value) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }
            const stringValue = String(value);
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        // CSV Headers
        const csvHeaders = [
            'Event ID',
            'Event Name',
            'Booth ID',
            'Booth Name',
            'Recruiter ID',
            'Recruiter Name',
            'Recruiter Email',
            'Company',
            'Job Seeker First Name',
            'Job Seeker Last Name',
            'Job Seeker Email',
            'Job Seeker Phone',
            'Job Seeker Location',
            'Job Seeker Headline',
            'Job Seeker Keywords',
            'Work Experience Level',
            'Highest Education Level',
            'Employment Types',
            'Language(s)',
            'Security Clearance',
            'Veteran/Military Status',
            'Interest Level',
            'Notes',
            'Date Expressed'
        ];

        const csvRows = interests.map((interest, index) => {
            // Extract IDs from raw interest document first (in case populate failed)
            const rawEventId = interest.event ? (typeof interest.event === 'object' && interest.event._id ? String(interest.event._id) : String(interest.event)) : '';
            const rawBoothId = interest.booth ? (typeof interest.booth === 'object' && interest.booth._id ? String(interest.booth._id) : String(interest.booth)) : '';
            
            // Extract job seeker info - handle null/undefined/array cases like Meeting Records
            let jobSeeker = interest.jobSeeker;
            
            // If populate failed (jobSeeker is null or invalid), try to get from legacy ID
            if (!jobSeeker || (typeof jobSeeker === 'object' && !jobSeeker._id && !jobSeeker.name)) {
                if (interest.legacyJobSeekerId && jobSeekersMap[String(interest.legacyJobSeekerId)]) {
                    jobSeeker = jobSeekersMap[String(interest.legacyJobSeekerId)];
                }
            }
            
            // Handle jobSeeker - could be ObjectId string, populated object, or null
            // First, try to get from populated data, then fallback to batch-fetched map
            let jobSeekerData = jobSeeker;
            
            // Get the job seeker ID to lookup in batch-fetched map
            // Use the mapping we created earlier for reliable lookup
            let jsIdForLookup = null;
            const interestId = String(interest._id);
            
            // First, try to get ID from our mapping (most reliable)
            if (interestToJobSeekerMap[interestId]) {
                jsIdForLookup = interestToJobSeekerMap[interestId];
            } else {
                // Fallback: try to get ID from the raw interest document
                const rawInterest = rawInterests.find(ri => String(ri._id) === interestId);
                if (rawInterest && rawInterest.jobSeeker) {
                    try {
                        // Extract ID from raw ObjectId
                        if (typeof rawInterest.jobSeeker === 'string') {
                            jsIdForLookup = rawInterest.jobSeeker.trim();
                        } else if (rawInterest.jobSeeker.toString && typeof rawInterest.jobSeeker.toString === 'function') {
                            jsIdForLookup = String(rawInterest.jobSeeker.toString()).trim();
                        } else if (rawInterest.jobSeeker._id) {
                            jsIdForLookup = String(rawInterest.jobSeeker._id).trim();
                        } else {
                            jsIdForLookup = String(rawInterest.jobSeeker).trim();
                        }
                    } catch (e) {
                        // Fallback
                        jsIdForLookup = String(rawInterest.jobSeeker).trim();
                    }
                }
            }
            
            // Fallback: try to get from populated jobSeeker
            if (!jsIdForLookup && jobSeekerData) {
                if (typeof jobSeekerData === 'object' && jobSeekerData._id) {
                    jsIdForLookup = String(jobSeekerData._id);
                } else if (typeof jobSeekerData === 'string') {
                    jsIdForLookup = jobSeekerData;
                } else if (jobSeekerData && jobSeekerData.toString) {
                    jsIdForLookup = String(jobSeekerData);
                }
            }
            
            // Also check the raw interest.jobSeeker field (might be ObjectId)
            if (!jsIdForLookup && interest.jobSeeker) {
                const rawJsId = interest.jobSeeker;
                if (typeof rawJsId === 'object' && rawJsId._id) {
                    jsIdForLookup = String(rawJsId._id);
                } else if (typeof rawJsId === 'string') {
                    jsIdForLookup = rawJsId;
                } else if (rawJsId && rawJsId.toString) {
                    jsIdForLookup = String(rawJsId);
                }
            }
            
            // Check legacy ID
            if (!jsIdForLookup && interest.legacyJobSeekerId) {
                jsIdForLookup = String(interest.legacyJobSeekerId);
            }
            
            // Use populated data if available (Mongoose successfully resolved it)
            // If populate failed, try legacy ID lookup
            if (jobSeekerData && typeof jobSeekerData === 'object' && jobSeekerData._id && jobSeekerData.name) {
                // Populated data exists and is valid - use it
            } else if (interest.legacyJobSeekerId && jobSeekersMap[String(interest.legacyJobSeekerId)]) {
                // Populate failed - use legacy ID lookup (most common case for legacy data)
                jobSeekerData = jobSeekersMap[String(interest.legacyJobSeekerId)];
            } else if (jsIdForLookup && jobSeekersMap[jsIdForLookup]) {
                // Try regular ID lookup as fallback
                jobSeekerData = jobSeekersMap[jsIdForLookup];
            }
            
            let jobSeekerName = '';
            let email = '';
            let phone = '';
            let city = '';
            let state = '';
            let country = '';
            let profile = null;
            
            if (jobSeekerData && typeof jobSeekerData === 'object' && !Array.isArray(jobSeekerData)) {
                // Populated job seeker object or batch-fetched object
                jobSeekerName = jobSeekerData.name ? String(jobSeekerData.name).trim() : '';
                email = jobSeekerData.email ? String(jobSeekerData.email).trim() : '';
                phone = jobSeekerData.phoneNumber ? String(jobSeekerData.phoneNumber).trim() : '';
                city = jobSeekerData.city ? String(jobSeekerData.city).trim() : '';
                state = jobSeekerData.state ? String(jobSeekerData.state).trim() : '';
                country = jobSeekerData.country ? String(jobSeekerData.country).trim() : '';
                
                // Extract metadata.profile - handle different metadata structures
                if (jobSeekerData.metadata) {
                    if (typeof jobSeekerData.metadata === 'object') {
                        // Check if profile exists directly
                        if (jobSeekerData.metadata.profile) {
                            profile = jobSeekerData.metadata.profile;
                        }
                    } else if (typeof jobSeekerData.metadata === 'string') {
                        // Metadata might be a JSON string
                        try {
                            const parsedMetadata = JSON.parse(jobSeekerData.metadata);
                            if (parsedMetadata && parsedMetadata.profile) {
                                profile = parsedMetadata.profile;
                            }
                        } catch (e) {
                            // Not JSON, ignore
                        }
                    }
                }
            } else if (jobSeekerData && typeof jobSeekerData === 'string') {
                // jobSeeker is just an ObjectId string - try batch-fetched map
                if (jobSeekersMap[jobSeekerData]) {
                    const fetched = jobSeekersMap[jobSeekerData];
                    jobSeekerName = fetched.name ? String(fetched.name).trim() : '';
                    email = fetched.email ? String(fetched.email).trim() : '';
                    phone = fetched.phoneNumber ? String(fetched.phoneNumber).trim() : '';
                    city = fetched.city ? String(fetched.city).trim() : '';
                    state = fetched.state ? String(fetched.state).trim() : '';
                    country = fetched.country ? String(fetched.country).trim() : '';
                    if (fetched.metadata) {
                        if (typeof fetched.metadata === 'object' && fetched.metadata.profile) {
                            profile = fetched.metadata.profile;
                        } else if (typeof fetched.metadata === 'string') {
                            try {
                                const parsedMetadata = JSON.parse(fetched.metadata);
                                if (parsedMetadata && parsedMetadata.profile) {
                                    profile = parsedMetadata.profile;
                                }
                            } catch (e) {
                                // Not JSON, ignore
                            }
                        }
                    }
                }
            }
            
            // Split name
            const nameParts = jobSeekerName ? jobSeekerName.split(/\s+/) : [];
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            // Format location - include country
            let location = '';
            const locationParts = [];
            if (city) locationParts.push(city);
            if (state) locationParts.push(state);
            if (country) locationParts.push(country);
            location = locationParts.join(', ');
            
            // Extract profile fields
            const headline = (profile && profile.headline) ? String(profile.headline).trim() : '';
            const keywords = (profile && profile.keywords) ? String(profile.keywords).trim() : '';
            const workLevel = (profile && profile.workLevel) ? String(profile.workLevel).trim() : '';
            const educationLevel = (profile && profile.educationLevel) ? String(profile.educationLevel).trim() : '';
            const employmentTypes = (profile && Array.isArray(profile.employmentTypes)) 
                ? profile.employmentTypes.filter(Boolean).join(', ') 
                : '';
            const languages = (profile && Array.isArray(profile.languages)) 
                ? profile.languages.filter(Boolean).join(', ') 
                : '';
            const clearance = (profile && profile.clearance) ? String(profile.clearance).trim() : '';
            const veteranStatus = (profile && profile.veteranStatus) ? String(profile.veteranStatus).trim() : '';
            
            // Extract interest info - IDs and names
            // Event ID and Name - handle both populated objects and raw ObjectIds
            let eventId = rawEventId || '';
            let eventName = '';
            if (interest.event) {
                if (typeof interest.event === 'object' && interest.event._id) {
                    // Populated event object
                    eventId = String(interest.event._id).trim();
                    eventName = interest.event.name ? String(interest.event.name).trim() : '';
                } else if (typeof interest.event === 'object' && !interest.event._id && !interest.event.name) {
                    // Might be ObjectId object - use raw ID we extracted
                    eventId = rawEventId || String(interest.event).trim();
                } else if (typeof interest.event === 'object' && interest.event.name) {
                    // Has name but might not have _id
                    eventName = String(interest.event.name).trim();
                    eventId = rawEventId || (interest.event._id ? String(interest.event._id).trim() : '');
                } else {
                    // Raw ObjectId string
                    eventId = String(interest.event).trim();
                }
            } else if (interest.legacyEventId) {
                // Fallback to legacy ID
                eventId = String(interest.legacyEventId).trim();
            }
            
            // Booth ID and Name - handle both populated objects and raw ObjectIds
            let boothId = rawBoothId || '';
            let boothName = '';
            if (interest.booth) {
                if (typeof interest.booth === 'object' && interest.booth._id) {
                    // Populated booth object
                    boothId = String(interest.booth._id).trim();
                    boothName = interest.booth.name ? String(interest.booth.name).trim() : '';
                } else if (typeof interest.booth === 'object' && !interest.booth._id && !interest.booth.name) {
                    // Might be ObjectId object - use raw ID we extracted
                    boothId = rawBoothId || String(interest.booth).trim();
                } else if (typeof interest.booth === 'object' && interest.booth.name) {
                    // Has name but might not have _id
                    boothName = String(interest.booth.name).trim();
                    boothId = rawBoothId || (interest.booth._id ? String(interest.booth._id).trim() : '');
                } else {
                    // Raw ObjectId string
                    boothId = String(interest.booth).trim();
                }
            } else if (interest.legacyBoothId) {
                // Fallback to legacy ID
                boothId = String(interest.legacyBoothId).trim();
            }
            
            // Recruiter ID, Name, and Email (from booth administrators - get first recruiter)
            let recruiterId = '';
            let recruiterName = '';
            let recruiterEmail = '';
            
            // Try to get recruiter from populated booth administrators
            if (interest.booth && typeof interest.booth === 'object' && interest.booth.administrators) {
                // Check if administrators are populated
                if (Array.isArray(interest.booth.administrators)) {
                    // Get first administrator (recruiter) - administrators are populated objects
                    if (interest.booth.administrators.length > 0) {
                        const recruiter = interest.booth.administrators[0];
                        if (recruiter && typeof recruiter === 'object') {
                            recruiterId = recruiter._id ? String(recruiter._id).trim() : '';
                            recruiterName = recruiter.name ? String(recruiter.name).trim() : '';
                            recruiterEmail = recruiter.email ? String(recruiter.email).trim() : '';
                        } else if (typeof recruiter === 'string' || (recruiter && recruiter.toString)) {
                            recruiterId = String(recruiter).trim();
                        }
                    }
                } else if (!Array.isArray(interest.booth.administrators)) {
                    // Single administrator (not an array)
                    const recruiter = interest.booth.administrators;
                    if (recruiter && typeof recruiter === 'object') {
                        recruiterId = recruiter._id ? String(recruiter._id).trim() : '';
                        recruiterName = recruiter.name ? String(recruiter.name).trim() : '';
                        recruiterEmail = recruiter.email ? String(recruiter.email).trim() : '';
                    } else if (typeof recruiter === 'string' || (recruiter && recruiter.toString)) {
                        recruiterId = String(recruiter).trim();
                    }
                }
            }
            
            // If recruiter not found from populated data, try to get from batch-fetched map
            if (!recruiterId && boothId && boothRecruitersMap) {
                const recruiter = boothRecruitersMap[boothId];
                if (recruiter && typeof recruiter === 'object') {
                    recruiterId = recruiter._id ? String(recruiter._id).trim() : '';
                    recruiterName = recruiter.name ? String(recruiter.name).trim() : '';
                    recruiterEmail = recruiter.email ? String(recruiter.email).trim() : '';
                }
            }
            
            const company = interest.company ? String(interest.company).trim() : '';
            const interestLevel = interest.interestLevel ? String(interest.interestLevel).trim() : '';
            const notes = interest.notes ? String(interest.notes).trim() : '';
            
            // Format date - handle both Date objects and ISO strings
            let dateExpressed = '';
            if (interest.createdAt) {
                try {
                    const date = interest.createdAt instanceof Date 
                        ? interest.createdAt 
                        : new Date(interest.createdAt);
                    if (!isNaN(date.getTime())) {
                        dateExpressed = date.toISOString().replace('T', ' ').substring(0, 19);
                    }
                } catch (dateError) {
                    // If date parsing fails, just use empty string
                    dateExpressed = '';
                }
            }

            const row = [
                escapeCSV(eventId),
                escapeCSV(eventName),
                escapeCSV(boothId),
                escapeCSV(boothName),
                escapeCSV(recruiterId),
                escapeCSV(recruiterName),
                escapeCSV(recruiterEmail),
                escapeCSV(company),
                escapeCSV(firstName),
                escapeCSV(lastName),
                escapeCSV(email),
                escapeCSV(phone),
                escapeCSV(location),
                escapeCSV(headline),
                escapeCSV(keywords),
                escapeCSV(workLevel),
                escapeCSV(educationLevel),
                escapeCSV(employmentTypes),
                escapeCSV(languages),
                escapeCSV(clearance),
                escapeCSV(veteranStatus),
                escapeCSV(interestLevel),
                escapeCSV(notes),
                escapeCSV(dateExpressed)
            ];

            // Validate row has correct number of columns
            if (row.length !== csvHeaders.length) {
                // Pad with empty strings if missing columns
                while (row.length < csvHeaders.length) {
                    row.push('');
                }
                // Truncate if too many columns
                if (row.length > csvHeaders.length) {
                    row.splice(csvHeaders.length);
                }
            }

            return row;
        });

        // Build CSV content (always include headers, even if no rows)
        const csvContent = [
            csvHeaders.map(h => escapeCSV(h)).join(','),
            ...csvRows.map(row => row.join(','))
        ].join('\r\n');
        
        // Add BOM for Excel compatibility
        const BOM = '\uFEFF';
        const finalContent = BOM + csvContent;

        // Set response headers
        res.setHeader('Content-Type', 'text/csv;charset=utf-8;');
        res.setHeader('Content-Disposition', 'attachment; filename="job-seeker-interests.csv"');
        
        // Send response - use res.end() for binary data to avoid encoding issues
        try {
            res.end(finalContent, 'utf8');
        } catch (sendError) {
            // If response already sent, just log the error
            if (!res.headersSent) {
                logger.error('Error sending CSV response:', sendError);
                res.status(500).json({
                    error: 'Failed to send export',
                    message: 'An error occurred while sending the export file'
                });
            } else {
                logger.warn('Response already sent, but error occurred:', sendError);
            }
        }

    } catch (error) {
        logger.error('Export job seeker interests error:', error);
        // Only send error response if headers haven't been sent
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to export interests',
                message: error.message || 'An error occurred while exporting interests'
            });
        }
    }
});

module.exports = router;
