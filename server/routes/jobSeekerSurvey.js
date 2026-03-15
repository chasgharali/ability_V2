const express = require('express');
const mongoose = require('mongoose');
const User = require('../models/User');
const BoothQueue = require('../models/BoothQueue');
const Event = require('../models/Event');
const Booth = require('../models/Booth');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const { authenticateToken, requireRole } = require('../middleware/auth');
const { toCountryDisplayName } = require('../utils/countryNames');
const { toRaceDisplayName } = require('../utils/raceNames');
const { toGenderDisplayName } = require('../utils/genderNames');
const logger = require('../utils/logger');

const router = express.Router();

const isSuperAdmin = (req) => req.user?.role === 'SuperAdmin';

const ensureOrgContext = (req, res) => {
    if (!isSuperAdmin(req) && !req.orgId) {
        res.status(403).json({ message: 'No organization assigned to user' });
        return false;
    }
    return true;
};

/**
 * Resolve job seeker IDs for event/booth filter.
 * - eventId only: job seekers who registered for the event (metadata.registeredEvents)
 * - eventId + boothId: job seekers who joined the booth queue (BoothQueue)
 * - boothId only: job seekers who joined that booth's queue
 * Returns null when no filter is applied.
 */
async function getJobSeekerIdsForEvent(req, eventId, boothId) {
  const e = (v) => (v && String(v).trim()) || '';
  const ev = e(eventId);
  const bv = e(boothId);
  const orgScoped = !isSuperAdmin(req);
  const orgId = req.orgId ? req.orgId.toString() : null;

  let orgRegisteredIds = null;
  if (orgScoped) {
    const registeredQuery = { organizationId: req.orgId };
    if (ev && mongoose.Types.ObjectId.isValid(ev)) {
      const scopedEvent = await Event.findOne({ _id: ev, organizationId: req.orgId }).select('_id').lean();
      if (!scopedEvent) return [];
      registeredQuery.eventId = scopedEvent._id;
    } else if (ev) {
      return [];
    }

    orgRegisteredIds = await RegisteredJobSeeker.find(registeredQuery).distinct('jobSeekerId');
  }

  if (bv && mongoose.Types.ObjectId.isValid(boothId)) {
    if (orgScoped) {
      const scopedBooth = await Booth.findOne({ _id: boothId, organizationId: req.orgId }).select('_id').lean();
      if (!scopedBooth) return [];
    }

    const q = { booth: new mongoose.Types.ObjectId(boothId) };
    if (ev && mongoose.Types.ObjectId.isValid(eventId)) q.event = new mongoose.Types.ObjectId(eventId);
    const ids = await BoothQueue.find(q).distinct('jobSeeker');
    if (!orgScoped) return ids.length ? ids : null;
    const orgSet = new Set(orgRegisteredIds.map(id => id.toString()));
    const scopedIds = ids.filter(id => orgSet.has(id.toString()));
    return scopedIds.length ? scopedIds : [];
  }

  if (orgScoped) {
    return orgRegisteredIds;
  }

  if (ev) {
    const conditions = [{ 'metadata.registeredEvents': { $elemMatch: { slug: eventId } } }];
    if (mongoose.Types.ObjectId.isValid(eventId)) {
      const oid = new mongoose.Types.ObjectId(eventId);
      conditions.unshift(
        { 'metadata.registeredEvents': { $elemMatch: { id: oid } } },
        { 'metadata.registeredEvents': { $elemMatch: { id: eventId } } },
        { 'metadata.registeredEvents': { $elemMatch: { id: oid.toString() } } }
      );
    }
    const users = await User.find({ role: 'JobSeeker', $or: conditions }).select('_id').lean();
    const ids = users.map((u) => u._id);
    return ids.length ? ids : null;
  }

  return null;
}

/**
 * GET /api/job-seeker-survey
 * Get all job seeker survey data with filtering (for admins)
 */
router.get('/', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        if (!ensureOrgContext(req, res)) {
            return;
        }

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

        // Filter by event or booth: event = registered for event; booth = joined that booth's queue
        const ids = await getJobSeekerIdsForEvent(req, eventId, boothId);
        if (ids) query._id = { $in: ids };

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
        if (!ensureOrgContext(req, res)) {
            return;
        }

        const {
            eventId,
            boothId
        } = req.query;

        // Build query - only get JobSeekers with survey data
        let query = {
            role: 'JobSeeker'
        };

        // Filter by event or booth: event = registered for event; booth = joined that booth's queue
        const ids = await getJobSeekerIdsForEvent(req, eventId, boothId);
        if (ids) {
            query._id = { $in: ids };
            logger.info(`Found ${ids.length} job seekers for eventId=${eventId}, boothId=${boothId}`);
        }

        // Get all users (no pagination for export)
        const users = await User.find(query)
            .select('name email phoneNumber city state country survey createdAt updatedAt')
            .sort({ 'survey.updatedAt': -1 })
            .lean();

        logger.info(`Export: Found ${users.length} users for eventId=${eventId}, boothId=${boothId}`);

        // Helper function to calculate stats for a field. Uses full country names for country/countryOfOrigin.
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
                            const key = toRaceDisplayName(v);
                            counts[key] = (counts[key] || 0) + 1;
                            total++;
                        }
                    });
                } else if (value && typeof value === 'string' && value.trim()) {
                    const key = (field === 'country' || field === 'countryOfOrigin')
                        ? toCountryDisplayName(value)
                        : (field === 'genderIdentity' ? toGenderDisplayName(value) : value.trim());
                    counts[key] = (counts[key] || 0) + 1;
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
 * Get statistics about survey data with optional filtering
 */
router.get('/stats', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        if (!ensureOrgContext(req, res)) {
            return;
        }

        const { eventId, boothId } = req.query;

        // Build base query - only get JobSeekers
        let baseQuery = {
            role: 'JobSeeker'
        };

        // Filter by event or booth: event = registered for event; booth = joined that booth's queue
        const ids = await getJobSeekerIdsForEvent(req, eventId, boothId);
        if (ids) baseQuery._id = { $in: ids };

        // Build query for users with survey data
        const surveyQuery = {
            ...baseQuery,
            $or: [
                { 'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.genderIdentity': { $exists: true, $ne: '' } },
                { 'survey.ageGroup': { $exists: true, $ne: '' } },
                { 'survey.countryOfOrigin': { $exists: true, $ne: '' } },
                { 'survey.disabilities': { $exists: true, $ne: [], $not: { $size: 0 } } },
                { 'survey.updatedAt': { $exists: true, $ne: null } }
            ]
        };

        // Total users with survey data
        const totalWithSurvey = await User.countDocuments(surveyQuery);

        // Total JobSeekers (filtered by event/booth if provided)
        const totalJobSeekers = await User.countDocuments(baseQuery);

        // Distinct counts with filters
        const distinctRacesQuery = {
            ...baseQuery,
            'survey.race': { $exists: true, $ne: [], $not: { $size: 0 } }
        };
        const distinctGendersQuery = {
            ...baseQuery,
            'survey.genderIdentity': { $exists: true, $ne: '' }
        };
        const distinctAgeGroupsQuery = {
            ...baseQuery,
            'survey.ageGroup': { $exists: true, $ne: '' }
        };
        const distinctCountriesOfOriginQuery = {
            ...baseQuery,
            'survey.countryOfOrigin': { $exists: true, $ne: '' }
        };

        const distinctRaces = await User.distinct('survey.race', distinctRacesQuery);
        const distinctGenders = await User.distinct('survey.genderIdentity', distinctGendersQuery);
        const distinctAgeGroups = await User.distinct('survey.ageGroup', distinctAgeGroupsQuery);
        const distinctCountriesOfOrigin = await User.distinct('survey.countryOfOrigin', distinctCountriesOfOriginQuery);

        // Flatten race arrays and count unique (with filters)
        const allRaces = await User.find(distinctRacesQuery).select('survey.race').lean();
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

/**
 * GET /api/job-seeker-survey/breakdown
 * Get demographic breakdown statistics for all filtered records (not paginated)
 */
router.get('/breakdown', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
    try {
        if (!ensureOrgContext(req, res)) {
            return;
        }

        const { eventId, boothId } = req.query;

        // Build query - only get JobSeekers
        let query = {
            role: 'JobSeeker'
        };

        // Filter by event or booth: event = registered for event; booth = joined that booth's queue
        const ids = await getJobSeekerIdsForEvent(req, eventId, boothId);
        if (ids) query._id = { $in: ids };

        // Get all users matching the filter (no pagination)
        const users = await User.find(query)
            .select('name email phoneNumber city state country survey createdAt updatedAt')
            .lean();

        // Helper function to calculate stats for a field. Uses full country names for country/countryOfOrigin.
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
                            const key = toRaceDisplayName(v);
                            counts[key] = (counts[key] || 0) + 1;
                            total++;
                        }
                    });
                } else if (value && typeof value === 'string' && value.trim()) {
                    const key = (field === 'country' || field === 'countryOfOrigin')
                        ? toCountryDisplayName(value)
                        : (field === 'genderIdentity' ? toGenderDisplayName(value) : value.trim());
                    counts[key] = (counts[key] || 0) + 1;
                    total++;
                }
            });

            const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            return { counts: sorted, total };
        };

        // Calculate breakdowns for each field
        const breakdowns = {
            countryOfOrigin: calculateStats('countryOfOrigin'),
            country: calculateStats('country'),
            race: calculateStats('race'),
            genderIdentity: calculateStats('genderIdentity'),
            ageGroup: calculateStats('ageGroup')
        };

        res.json(breakdowns);

    } catch (error) {
        logger.error('Get survey breakdown error:', error);
        res.status(500).json({
            error: 'Failed to retrieve breakdown statistics',
            message: 'An error occurred while retrieving breakdown statistics'
        });
    }
});

module.exports = router;

