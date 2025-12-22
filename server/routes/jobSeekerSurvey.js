const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

/**
 * GET /api/job-seeker-survey
 * Get all job seeker survey data with filtering (for admins)
 */
router.get('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const {
            page = 1,
            limit = 50,
            sortBy = 'survey.updatedAt',
            sortOrder = 'desc',
            search = '',
            race,
            genderIdentity,
            ageGroup,
            countryOfOrigin
        } = req.query;

        // Build query - only get JobSeekers with survey data
        let query = {
            role: 'JobSeeker',
            $or: [
                { 'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.genderIdentity': { $exists: true, $ne: '' } },
                { 'survey.ageGroup': { $exists: true, $ne: '' } },
                { 'survey.countryOfOrigin': { $exists: true, $ne: '' } },
                { 'survey.disabilities': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.updatedAt': { $exists: true, $ne: null } }
            ]
        };

        // Search filter (by name or email)
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$and = [
                {
                    $or: [
                        { name: searchRegex },
                        { email: searchRegex }
                    ]
                }
            ];
        }

        // Filter by race (race is an array field)
        if (race && race.trim()) {
            query['survey.race'] = race.trim();
        }

        // Filter by gender identity
        if (genderIdentity && genderIdentity.trim()) {
            query['survey.genderIdentity'] = genderIdentity.trim();
        }

        // Filter by age group
        if (ageGroup && ageGroup.trim()) {
            query['survey.ageGroup'] = ageGroup.trim();
        }

        // Filter by country of origin
        if (countryOfOrigin && countryOfOrigin.trim()) {
            query['survey.countryOfOrigin'] = countryOfOrigin.trim();
        }

        // Pagination
        const skip = (page - 1) * limit;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query
        const users = await User.find(query)
            .select('name email phoneNumber city state country survey createdAt updatedAt')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit))
            .lean();

        // Get total count for pagination
        const totalUsers = await User.countDocuments(query);

        res.json({
            surveys: users,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(totalUsers / limit),
                totalSurveys: totalUsers,
                hasNext: page * limit < totalUsers,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        logger.error('Get job seeker survey data error:', error);
        res.status(500).json({
            error: 'Failed to retrieve survey data',
            message: 'An error occurred while retrieving survey data'
        });
    }
});

/**
 * GET /api/job-seeker-survey/export/csv
 * Export job seeker survey data as CSV
 */
router.get('/export/csv', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const {
            search = '',
            race,
            genderIdentity,
            ageGroup,
            countryOfOrigin
        } = req.query;

        // Build query (same as GET endpoint, but no pagination)
        let query = {
            role: 'JobSeeker',
            $or: [
                { 'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.genderIdentity': { $exists: true, $ne: '' } },
                { 'survey.ageGroup': { $exists: true, $ne: '' } },
                { 'survey.countryOfOrigin': { $exists: true, $ne: '' } },
                { 'survey.disabilities': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.updatedAt': { $exists: true, $ne: null } }
            ]
        };

        // Search filter
        if (search && search.trim()) {
            const searchRegex = new RegExp(search.trim(), 'i');
            query.$and = [
                {
                    $or: [
                        { name: searchRegex },
                        { email: searchRegex }
                    ]
                }
            ];
        }

        // Apply filters (race is an array field)
        if (race && race.trim()) {
            query['survey.race'] = race.trim();
        }
        if (genderIdentity && genderIdentity.trim()) {
            query['survey.genderIdentity'] = genderIdentity.trim();
        }
        if (ageGroup && ageGroup.trim()) {
            query['survey.ageGroup'] = ageGroup.trim();
        }
        if (countryOfOrigin && countryOfOrigin.trim()) {
            query['survey.countryOfOrigin'] = countryOfOrigin.trim();
        }

        // Get all users (no pagination for export)
        const users = await User.find(query)
            .select('name email phoneNumber city state country survey createdAt updatedAt')
            .sort({ 'survey.updatedAt': -1 })
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

        // CSV Headers (Name and Email removed for anonymity)
        const csvHeaders = [
            'Phone Number',
            'City',
            'State',
            'Country',
            'Race',
            'Gender Identity',
            'Age Group',
            'Country of Origin',
            'Disabilities',
            'Other Disability',
            'Survey Updated At',
            'Profile Created At'
        ];

        const csvRows = users.map((user) => {
            const survey = user.survey || {};
            const raceArray = Array.isArray(survey.race) ? survey.race : [];
            const disabilitiesArray = Array.isArray(survey.disabilities) ? survey.disabilities : [];
            
            const row = [
                escapeCSV(user.phoneNumber),
                escapeCSV(user.city),
                escapeCSV(user.state),
                escapeCSV(user.country),
                escapeCSV(raceArray.join('; ')),
                escapeCSV(survey.genderIdentity || ''),
                escapeCSV(survey.ageGroup || ''),
                escapeCSV(survey.countryOfOrigin || ''),
                escapeCSV(disabilitiesArray.join('; ')),
                escapeCSV(survey.otherDisability || ''),
                escapeCSV(survey.updatedAt ? new Date(survey.updatedAt).toISOString() : ''),
                escapeCSV(user.createdAt ? new Date(user.createdAt).toISOString() : '')
            ];

            return row;
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
        res.setHeader('Content-Disposition', 'attachment; filename="job-seeker-survey-data.csv"');
        
        // Send response
        try {
            res.end(finalContent, 'utf8');
        } catch (sendError) {
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
        logger.error('Export job seeker survey data error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to export survey data',
                message: error.message || 'An error occurred while exporting survey data'
            });
        }
    }
});

/**
 * GET /api/job-seeker-survey/stats
 * Get statistics about survey data
 */
router.get('/stats', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        // Total users with survey data
        const totalWithSurvey = await User.countDocuments({
            role: 'JobSeeker',
            $or: [
                { 'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.genderIdentity': { $exists: true, $ne: '' } },
                { 'survey.ageGroup': { $exists: true, $ne: '' } },
                { 'survey.countryOfOrigin': { $exists: true, $ne: '' } },
                { 'survey.disabilities': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.updatedAt': { $exists: true, $ne: null } }
            ]
        });

        // Total JobSeekers
        const totalJobSeekers = await User.countDocuments({ role: 'JobSeeker' });

        // Distinct counts
        const distinctRaces = await User.distinct('survey.race', { 
            role: 'JobSeeker',
            'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } }
        });
        const distinctGenders = await User.distinct('survey.genderIdentity', {
            role: 'JobSeeker',
            'survey.genderIdentity': { $exists: true, $ne: '' }
        });
        const distinctAgeGroups = await User.distinct('survey.ageGroup', {
            role: 'JobSeeker',
            'survey.ageGroup': { $exists: true, $ne: '' }
        });
        const distinctCountriesOfOrigin = await User.distinct('survey.countryOfOrigin', {
            role: 'JobSeeker',
            'survey.countryOfOrigin': { $exists: true, $ne: '' }
        });

        // Flatten race arrays and count unique
        const allRaces = await User.find({
            role: 'JobSeeker',
            'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } }
        }).select('survey.race').lean();
        const uniqueRaces = new Set();
        allRaces.forEach(user => {
            if (user.survey && Array.isArray(user.survey.race)) {
                user.survey.race.forEach(race => {
                    if (race) uniqueRaces.add(race);
                });
            }
        });

        res.json({
            totalWithSurvey,
            totalJobSeekers,
            distinctRaces: uniqueRaces.size,
            distinctGenders: distinctGenders.filter(g => g && g.trim()).length,
            distinctAgeGroups: distinctAgeGroups.filter(a => a && a.trim()).length,
            distinctCountriesOfOrigin: distinctCountriesOfOrigin.filter(c => c && c.trim()).length
        });

    } catch (error) {
        logger.error('Get survey stats error:', error);
        res.status(500).json({
            error: 'Failed to retrieve statistics',
            message: 'An error occurred while retrieving statistics'
        });
    }
});

module.exports = router;

