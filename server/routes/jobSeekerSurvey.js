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
            countryOfOrigin,
            eventId,
            boothId
        } = req.query;

        // Build query - only get JobSeekers
        let query = {
            role: 'JobSeeker'
        };

        // Filter by event or booth using MeetingRecord
        if (eventId || boothId) {
            const MeetingRecord = require('../models/MeetingRecord');
            const meetingQuery = {};
            if (eventId) meetingQuery.eventId = new mongoose.Types.ObjectId(eventId);
            if (boothId) meetingQuery.boothId = new mongoose.Types.ObjectId(boothId);
            
            const meetings = await MeetingRecord.find(meetingQuery).distinct('jobseekerId');
            query._id = { $in: meetings };
        }

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
 * Export job seeker survey data as CSV with demographic breakdowns
 */
router.get('/export/csv', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const {
            eventId,
            boothId
        } = req.query;

        // Build query - only get JobSeekers with survey data
        let query = {
            role: 'JobSeeker'
        };

        // Filter by event or booth using MeetingRecord
        if (eventId || boothId) {
            const MeetingRecord = require('../models/MeetingRecord');
            const meetingQuery = {};
            if (eventId) meetingQuery.eventId = new mongoose.Types.ObjectId(eventId);
            if (boothId) meetingQuery.boothId = new mongoose.Types.ObjectId(boothId);
            
            const meetings = await MeetingRecord.find(meetingQuery).distinct('jobseekerId');
            logger.info(`Found ${meetings.length} job seekers in meetings for eventId=${eventId}, boothId=${boothId}`);
            query._id = { $in: meetings };
        }

        // Get all users (no pagination for export)
        const users = await User.find(query)
            .select('name email phoneNumber city state country survey createdAt updatedAt')
            .sort({ 'survey.updatedAt': -1 })
            .lean();

        logger.info(`Export: Found ${users.length} users for eventId=${eventId}, boothId=${boothId}`);

        // Helper function to calculate stats for a field
        const calculateStats = (field) => {
            const counts = {};
            let total = 0;

            users.forEach(user => {
                let value;
                if (field === 'country') {
                    value = user.country || user.survey?.country;
                } else {
                    value = user.survey?.[field];
                }
                
                if (field === 'race' && Array.isArray(value)) {
                    value.forEach(v => {
                        if (v && v.trim()) {
                            counts[v] = (counts[v] || 0) + 1;
                            total++;
                        }
                    });
                } else if (value && typeof value === 'string' && value.trim()) {
                    counts[value] = (counts[value] || 0) + 1;
                    total++;
                }
            });

            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            return { counts: sorted, total };
        };

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

        // Build CSV sections
        const sections = [
            { field: 'countryOfOrigin', title: 'Country of Origin' },
            { field: 'country', title: 'Country' },
            { field: 'race', title: 'Race' },
            { field: 'genderIdentity', title: 'Gender' },
            { field: 'ageGroup', title: 'Age Group' }
        ];

        const csvLines = [];
        
        sections.forEach((section, idx) => {
            const { counts, total } = calculateStats(section.field);
            
            // Add section header
            if (idx > 0) csvLines.push(''); // Empty line between sections
            csvLines.push(`Distribution of '${section.title}'`);
            csvLines.push(`${section.title},Count of ${section.title},% of ${section.title}`);
            
            // Add data rows
            counts.forEach(([name, count]) => {
                const percentage = total > 0 ? ((count / total) * 100).toFixed(2) : 0;
                csvLines.push(`${escapeCSV(name)},${count},${percentage}%`);
            });
            
            // Add grand total
            csvLines.push(`Grand Total,${total},100.00%`);
        });

        // Build CSV content
        const csvContent = csvLines.join('\r\n');
        
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

