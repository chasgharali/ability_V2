const express = require('express');
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
