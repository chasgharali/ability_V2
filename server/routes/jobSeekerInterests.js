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
            
            const boothIdsArray = Array.from(boothIds).map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
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
                
                const boothIdsArray = Array.from(boothIds).map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
                query.booth = { $in: boothIdsArray };
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
            .populate('jobSeeker', 'name email phoneNumber city state country metadata')
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
                    .select('name email phoneNumber city state country metadata legacyId')
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

/**
 * GET /api/job-seeker-interests/export/csv
 * Export job seeker interests as CSV
 */
router.get('/export/csv', authenticateToken, requireRole(['Recruiter', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const {
            eventId,
            boothId,
            recruiterId
        } = req.query;

        // Build query based on user role and filters (same logic as GET endpoint)
        let query = { isInterested: true };

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            const Booth = require('../models/Booth');
            const User = require('../models/User');
            
            const recruiter = await User.findById(req.user._id).select('assignedBooth');
            const boothIds = new Set();
            
            if (recruiter && recruiter.assignedBooth) {
                const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                boothIds.add(boothId.toString());
            }
            
            const adminBooths = await Booth.find({
                administrators: req.user._id
            }).select('_id');
            
            adminBooths.forEach(booth => {
                boothIds.add(booth._id.toString());
            });
            
            const boothIdsArray = Array.from(boothIds).map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
            
            if (boothIdsArray.length === 0) {
                return res.json({ interests: [] });
            }

            query.booth = { $in: boothIdsArray };
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            if (recruiterId) {
                const Booth = require('../models/Booth');
                const User = require('../models/User');
                
                const recruiter = await User.findById(recruiterId).select('assignedBooth');
                const boothIds = new Set();
                
                if (recruiter && recruiter.assignedBooth) {
                    const boothId = recruiter.assignedBooth._id || recruiter.assignedBooth;
                    boothIds.add(boothId.toString());
                }
                
                const adminBooths = await Booth.find({
                    administrators: recruiterId
                }).select('_id');
                
                adminBooths.forEach(booth => {
                    boothIds.add(booth._id.toString());
                });
                
                const boothIdsArray = Array.from(boothIds).map(id => mongoose.Types.ObjectId.isValid(id) ? new mongoose.Types.ObjectId(id) : id);
                query.booth = { $in: boothIdsArray };
            }
        }

        // Apply additional filters
        if (eventId) query.event = eventId;
        if (boothId) query.booth = boothId;

        // Get ALL interests (no pagination for export)
        const interests = await JobSeekerInterest.find(query)
            .populate('jobSeeker', 'name email phoneNumber city state country metadata')
            .populate('event', 'name slug')
            .populate('booth', 'name description')
            .sort({ createdAt: -1 })
            .lean();

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
            'Event Name',
            'Booth Name',
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

        const csvRows = interests.map(interest => {
            // Extract job seeker info
            const jobSeeker = interest.jobSeeker;
            const jobSeekerName = (jobSeeker && typeof jobSeeker === 'object' && jobSeeker.name) 
                ? String(jobSeeker.name).trim() 
                : '';
            
            // Split name
            const nameParts = jobSeekerName ? jobSeekerName.split(/\s+/) : [];
            const firstName = nameParts[0] || '';
            const lastName = nameParts.slice(1).join(' ') || '';
            
            const email = (jobSeeker && typeof jobSeeker === 'object' && jobSeeker.email) 
                ? String(jobSeeker.email).trim() 
                : '';
            const phone = (jobSeeker && typeof jobSeeker === 'object' && jobSeeker.phoneNumber) 
                ? String(jobSeeker.phoneNumber).trim() 
                : '';
            const city = (jobSeeker && typeof jobSeeker === 'object' && jobSeeker.city) 
                ? String(jobSeeker.city).trim() 
                : '';
            const state = (jobSeeker && typeof jobSeeker === 'object' && jobSeeker.state) 
                ? String(jobSeeker.state).trim() 
                : '';
            
            // Format location
            let location = '';
            if (city && state) {
                location = `${city}, ${state}`;
            } else if (city) {
                location = city;
            } else if (state) {
                location = state;
            }
            
            // Extract profile data
            const profile = (jobSeeker && jobSeeker.metadata && jobSeeker.metadata.profile) ? jobSeeker.metadata.profile : null;
            const headline = profile && profile.headline ? String(profile.headline).trim() : '';
            const keywords = profile && profile.keywords ? String(profile.keywords).trim() : '';
            const workLevel = profile && profile.workLevel ? String(profile.workLevel).trim() : '';
            const educationLevel = profile && profile.educationLevel ? String(profile.educationLevel).trim() : '';
            const employmentTypes = (profile && Array.isArray(profile.employmentTypes)) 
                ? profile.employmentTypes.filter(Boolean).join(', ') 
                : '';
            const languages = (profile && Array.isArray(profile.languages)) 
                ? profile.languages.filter(Boolean).join(', ') 
                : '';
            const clearance = profile && profile.clearance ? String(profile.clearance).trim() : '';
            const veteranStatus = profile && profile.veteranStatus ? String(profile.veteranStatus).trim() : '';
            
            // Extract interest info
            const eventName = (interest.event && typeof interest.event === 'object' && interest.event.name) 
                ? String(interest.event.name).trim() 
                : '';
            const boothName = (interest.booth && typeof interest.booth === 'object' && interest.booth.name) 
                ? String(interest.booth.name).trim() 
                : '';
            const company = interest.company ? String(interest.company).trim() : '';
            const interestLevel = interest.interestLevel ? String(interest.interestLevel).trim() : '';
            const notes = interest.notes ? String(interest.notes).trim() : '';
            
            // Format date
            const dateExpressed = interest.createdAt 
                ? new Date(interest.createdAt).toISOString().replace('T', ' ').substring(0, 19)
                : '';

            return [
                escapeCSV(eventName),
                escapeCSV(boothName),
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
        });

        // Build CSV content
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
        
        res.send(finalContent);

    } catch (error) {
        logger.error('Export job seeker interests error:', error);
        res.status(500).json({
            error: 'Failed to export interests',
            message: 'An error occurred while exporting interests'
        });
    }
});

module.exports = router;
