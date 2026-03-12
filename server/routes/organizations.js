const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const AWS = require('aws-sdk');
const multer = require('multer');

const Organization = require('../models/Organization');
const User = require('../models/User');
const Event = require('../models/Event');
const Booth = require('../models/Booth');
const RegisteredJobSeeker = require('../models/RegisteredJobSeeker');
const { authenticateToken, requireRole, requireSuperAdmin, requireOrgAccess } = require('../middleware/auth');
const logger = require('../utils/logger');

// ─── Helpers ─────────────────────────────────────────────────────────────────

const isValidObjectId = (id) => mongoose.Types.ObjectId.isValid(id);
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});
const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const logoUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed for organization logos'), false);
        }
    }
});

// Build org stats (reused in several endpoints)
async function buildOrgStats(orgId) {
    const [
        totalEvents,
        totalBooths,
        totalUsers,
        totalRegisteredJobSeekers
    ] = await Promise.all([
        Event.countDocuments({ organizationId: orgId }),
        Booth.countDocuments({ organizationId: orgId }),
        User.countDocuments({ organizationId: orgId, isActive: true }),
        RegisteredJobSeeker.countDocuments({ organizationId: orgId })
    ]);

    const recruiterCount = await User.countDocuments({
        organizationId: orgId,
        role: { $in: ['Recruiter', 'BoothAdmin'] },
        isActive: true
    });

    return { totalEvents, totalBooths, totalUsers, totalRegisteredJobSeekers, recruiterCount };
}

// ─── Routes ──────────────────────────────────────────────────────────────────

/**
 * GET /api/organizations
 * List all organizations (SuperAdmin only) or current user's org (Admin).
 */
router.get('/', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const isSuperAdmin = req.user.role === 'SuperAdmin';

        if (!isSuperAdmin) {
            // Admin: return only their own org
            if (!req.orgId) {
                return res.status(404).json({ error: 'No organization assigned' });
            }
            const org = await Organization.findById(req.orgId);
            if (!org) return res.status(404).json({ error: 'Organization not found' });
            const stats = await buildOrgStats(org._id);
            return res.json({ organizations: [{ ...org.toObject(), stats }], total: 1 });
        }

        // SuperAdmin: list all
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100);
        const skip = (page - 1) * limit;
        const search = req.query.search?.trim();

        const query = {};
        if (search) query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { slug: { $regex: search, $options: 'i' } }
        ];
        if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';

        const [orgs, total] = await Promise.all([
            Organization.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
            Organization.countDocuments(query)
        ]);

        // Attach stats to each org
        const orgsWithStats = await Promise.all(
            orgs.map(async (org) => ({
                ...org,
                stats: await buildOrgStats(org._id)
            }))
        );

        res.json({
            organizations: orgsWithStats,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        logger.error('Error listing organizations:', error);
        res.status(500).json({ error: 'Failed to fetch organizations' });
    }
});

/**
 * POST /api/organizations
 * Create a new organization (SuperAdmin only).
 */
router.post('/', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { name, slug, description, logoUrl, logoAltText, limits } = req.body;

        if (!name?.trim()) {
            return res.status(400).json({ error: 'Organization name is required' });
        }

        const existingSlug = await Organization.findOne({ slug: slug?.toLowerCase().trim() });
        if (existingSlug) {
            return res.status(409).json({ error: 'An organization with this slug already exists' });
        }

        const org = new Organization({
            name: name.trim(),
            slug: slug?.trim() || undefined,
            description: description?.trim() || '',
            logoUrl: logoUrl || null,
            logoAltText: logoAltText?.trim() || '',
            limits: limits || {},
            createdBy: req.user._id
        });

        await org.save();
        logger.info(`Organization created: ${org.name} by ${req.user.email}`);

        res.status(201).json({ organization: org });
    } catch (error) {
        logger.error('Error creating organization:', error);
        if (error.code === 11000) {
            return res.status(409).json({ error: 'Organization slug already exists' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to create organization' });
    }
});

/**
 * GET /api/organizations/:id
 * Get a single organization with stats.
 * SuperAdmin can get any. Admin can only get their own.
 */
router.get('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        // Non-SuperAdmin can only see their own org
        if (req.user.role !== 'SuperAdmin' && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const org = await Organization.findById(id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const stats = await buildOrgStats(org._id);
        res.json({ organization: { ...org.toObject(), stats } });
    } catch (error) {
        logger.error('Error fetching organization:', error);
        res.status(500).json({ error: 'Failed to fetch organization' });
    }
});

/**
 * PUT /api/organizations/:id
 * Update an organization.
 * SuperAdmin can update any. Admin can only update their own (limited fields).
 */
router.put('/:id', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        const isSuperAdmin = req.user.role === 'SuperAdmin';

        if (!isSuperAdmin && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const org = await Organization.findById(id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const { name, description, logoUrl, logoAltText, isActive, limits, slug } = req.body;

        // OrgAdmin can update description, logoUrl, logoAltText
        if (name !== undefined) org.name = name.trim();
        if (description !== undefined) org.description = description.trim();
        if (logoUrl !== undefined) org.logoUrl = logoUrl;
        if (logoAltText !== undefined) org.logoAltText = logoAltText.trim();

        // Only SuperAdmin can change slug, limits, isActive
        if (isSuperAdmin) {
            if (slug !== undefined) org.slug = slug.toLowerCase().trim();
            if (limits !== undefined) org.limits = { ...org.limits, ...limits };
            if (isActive !== undefined) org.isActive = isActive;
        }

        await org.save();
        logger.info(`Organization updated: ${org.name} by ${req.user.email}`);

        res.json({ organization: org });
    } catch (error) {
        logger.error('Error updating organization:', error);
        if (error.code === 11000) {
            return res.status(409).json({ error: 'Organization slug already exists' });
        }
        if (error.name === 'ValidationError') {
            return res.status(400).json({ error: error.message });
        }
        res.status(500).json({ error: 'Failed to update organization' });
    }
});

/**
 * POST /api/organizations/:id/logo-upload
 * Upload org logo to S3 and persist logoUrl on organization.
 * FormData field name: "logo"
 */
router.post('/:id/logo-upload', authenticateToken, requireRole(['SuperAdmin', 'Admin']), logoUpload.single('logo'), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        if (req.user.role !== 'SuperAdmin' && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Logo image file is required' });
        }
        if (!BUCKET_NAME) {
            return res.status(500).json({ error: 'S3 bucket is not configured' });
        }

        const org = await Organization.findById(id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const original = req.file.originalname || 'logo.png';
        const safeName = original.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200);
        const key = `organization-logo/${org._id}/${Date.now()}-${safeName}`;

        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: req.file.buffer,
            ContentType: req.file.mimetype,
            Metadata: {
                uploadedBy: req.user._id.toString(),
                organizationId: org._id.toString()
            }
        }).promise();

        const logoUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 604800 // 7 days
        });

        org.logoUrl = logoUrl;
        await org.save();

        logger.info(`Organization logo uploaded for ${org.name} by ${req.user.email}`);
        res.json({
            message: 'Organization logo uploaded successfully',
            logoUrl,
            key,
            organization: org
        });
    } catch (error) {
        logger.error('Organization logo upload error:', error);
        res.status(500).json({ error: 'Failed to upload organization logo' });
    }
});

/**
 * DELETE /api/organizations/:id
 * Delete an organization (SuperAdmin only).
 * Will not delete the default "abilityjobfair" org.
 */
router.delete('/:id', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        const org = await Organization.findById(id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        if (org.slug === 'abilityjobfair') {
            return res.status(400).json({ error: 'The default organization cannot be deleted' });
        }

        // Check if org has any users/events before deleting
        const [userCount, eventCount] = await Promise.all([
            User.countDocuments({ organizationId: id }),
            Event.countDocuments({ organizationId: id })
        ]);

        if (userCount > 0 || eventCount > 0) {
            return res.status(400).json({
                error: 'Organization has associated data',
                message: `This organization has ${userCount} user(s) and ${eventCount} event(s). Please reassign or remove them before deleting.`
            });
        }

        await Organization.findByIdAndDelete(id);
        logger.info(`Organization deleted: ${org.name} by ${req.user.email}`);

        res.json({ message: 'Organization deleted successfully' });
    } catch (error) {
        logger.error('Error deleting organization:', error);
        res.status(500).json({ error: 'Failed to delete organization' });
    }
});

/**
 * POST /api/organizations/:id/assign-user
 * Assign or move a user to this organization (SuperAdmin only).
 * Body: { userId, unassignFromCurrent? }
 */
router.post('/:id/assign-user', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });
        if (!userId || !isValidObjectId(userId)) return res.status(400).json({ error: 'Valid userId is required' });

        const [org, user] = await Promise.all([
            Organization.findById(id),
            User.findById(userId)
        ]);

        if (!org) return res.status(404).json({ error: 'Organization not found' });
        if (!user) return res.status(404).json({ error: 'User not found' });

        if (user.role === 'SuperAdmin') {
            return res.status(400).json({ error: 'SuperAdmin users cannot be assigned to an organization' });
        }
        if (user.role === 'JobSeeker') {
            return res.status(400).json({ error: 'JobSeeker users are not assigned to organizations directly. They join via event registration.' });
        }

        const previousOrgId = user.organizationId;
        user.organizationId = org._id;
        await user.save();

        logger.info(`User ${user.email} assigned to org ${org.name} by ${req.user.email} (prev: ${previousOrgId || 'none'})`);

        res.json({
            message: `User assigned to ${org.name}`,
            user: { _id: user._id, name: user.name, email: user.email, role: user.role, organizationId: user.organizationId },
            previousOrganizationId: previousOrgId || null
        });
    } catch (error) {
        logger.error('Error assigning user to organization:', error);
        res.status(500).json({ error: 'Failed to assign user to organization' });
    }
});

/**
 * POST /api/organizations/:id/remove-user
 * Remove a user from this organization (SuperAdmin only).
 * Sets organizationId to null — user will be "unassigned".
 */
router.post('/:id/remove-user', authenticateToken, requireSuperAdmin, async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });
        if (!userId || !isValidObjectId(userId)) return res.status(400).json({ error: 'Valid userId is required' });

        const user = await User.findOne({ _id: userId, organizationId: id });
        if (!user) return res.status(404).json({ error: 'User not found in this organization' });

        user.organizationId = null;
        await user.save();

        logger.info(`User ${user.email} removed from org ${id} by ${req.user.email}`);
        res.json({ message: 'User removed from organization', userId: user._id });
    } catch (error) {
        logger.error('Error removing user from organization:', error);
        res.status(500).json({ error: 'Failed to remove user from organization' });
    }
});

/**
 * GET /api/organizations/:id/users
 * List users belonging to this organization.
 * SuperAdmin can list any org. Admin can only list their own.
 */
router.get('/:id/users', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        if (req.user.role !== 'SuperAdmin' && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip = (page - 1) * limit;
        const { role, search, isActive, sortBy = 'createdAt', sortDir = 'desc' } = req.query;

        const query = { organizationId: id };
        if (role) query.role = role;
        if (isActive !== undefined) query.isActive = isActive === 'true';
        if (search?.trim()) {
            query.$or = [
                { name: { $regex: search.trim(), $options: 'i' } },
                { email: { $regex: search.trim(), $options: 'i' } }
            ];
        }

        const sortObj = { [sortBy]: sortDir === 'asc' ? 1 : -1 };

        const [users, total] = await Promise.all([
            User.find(query)
                .select('-hashedPassword -refreshTokens -legacyPassword')
                .sort(sortObj)
                .skip(skip)
                .limit(limit),
            User.countDocuments(query)
        ]);

        res.json({ users, total, page, totalPages: Math.ceil(total / limit) });
    } catch (error) {
        logger.error('Error listing org users:', error);
        res.status(500).json({ error: 'Failed to fetch organization users' });
    }
});

/**
 * GET /api/organizations/:id/job-seekers
 * List registered job seekers for this organization.
 * SuperAdmin or Admin of the same org.
 */
router.get('/:id/job-seekers', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        if (req.user.role !== 'SuperAdmin' && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 50, 200);
        const skip = (page - 1) * limit;
        const { search, sortBy = 'registeredAt', sortDir = 'desc', eventId, status } = req.query;

        // Build user filter for search/status. When status is empty (All Status), do NOT restrict
        // by jobSeekerIds — return all registrations including inactive users.
        let jobSeekerIds = null;
        const hasStatusFilter = status === 'active' || status === 'inactive';
        const hasSearch = search?.trim();

        if (hasSearch || hasStatusFilter) {
            const userQuery = { role: 'JobSeeker' };
            if (status === 'active') userQuery.isActive = true;
            if (status === 'inactive') userQuery.isActive = false;
            if (hasSearch) {
                userQuery.$or = [
                    { name: { $regex: search.trim(), $options: 'i' } },
                    { email: { $regex: search.trim(), $options: 'i' } }
                ];
            }
            const matchedUsers = await User.find(userQuery).select('_id');
            jobSeekerIds = matchedUsers.map(u => u._id);
        }

        const regQuery = {
            organizationId: id,
            // Exclude corrupted legacy rows where jobSeekerId is null/missing
            jobSeekerId: { $ne: null }
        };
        if (jobSeekerIds !== null) regQuery.jobSeekerId = { $in: jobSeekerIds };
        if (eventId && isValidObjectId(eventId)) regQuery.eventId = eventId;

        // Build aggregate $match with ObjectIds (aggregate does not auto-cast)
        const aggregateMatch = {
            organizationId: new mongoose.Types.ObjectId(id),
            jobSeekerId: { $ne: null }
        };
        if (jobSeekerIds !== null) aggregateMatch.jobSeekerId = { $in: jobSeekerIds };
        if (eventId && isValidObjectId(eventId)) aggregateMatch.eventId = new mongoose.Types.ObjectId(eventId);

        const usersCollection = User.collection.name;
        const sortObj = { [sortBy]: sortDir === 'asc' ? 1 : -1 };

        // Use aggregate for both ID fetch and count so orphaned registrations
        // (where the referenced user was deleted) are excluded consistently.
        // Without this, skip/limit runs over raw rows including orphans, causing
        // fewer valid records than expected to appear on each page.
        const [validIdsResult, totalCountResult] = await Promise.all([
            RegisteredJobSeeker.aggregate([
                { $match: aggregateMatch },
                {
                    $lookup: {
                        from: usersCollection,
                        localField: 'jobSeekerId',
                        foreignField: '_id',
                        as: 'jobSeekerDoc'
                    }
                },
                { $match: { 'jobSeekerDoc.0': { $exists: true } } },
                { $sort: sortObj },
                { $skip: skip },
                { $limit: limit },
                { $project: { _id: 1 } }
            ]),
            RegisteredJobSeeker.aggregate([
                { $match: aggregateMatch },
                {
                    $lookup: {
                        from: usersCollection,
                        localField: 'jobSeekerId',
                        foreignField: '_id',
                        as: 'jobSeekerDoc'
                    }
                },
                { $match: { 'jobSeekerDoc.0': { $exists: true } } },
                { $count: 'total' }
            ])
        ]);

        const validIds = validIdsResult.map(r => r._id);
        const registrations = await RegisteredJobSeeker.find({ _id: { $in: validIds } })
            .populate('jobSeekerId', '-hashedPassword -refreshTokens -legacyPassword -survey')
            .populate('eventId', 'name slug start')
            .sort(sortObj);

        const total = totalCountResult?.[0]?.total || 0;

        res.json({
            jobSeekers: registrations,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        });
    } catch (error) {
        logger.error('Error listing org job seekers:', error);
        res.status(500).json({ error: 'Failed to fetch registered job seekers' });
    }
});

/**
 * GET /api/organizations/:id/dashboard-stats
 * Full dashboard stats for an org (SuperAdmin dropdown / OrgAdmin own dashboard).
 */
router.get('/:id/dashboard-stats', authenticateToken, requireRole(['SuperAdmin', 'Admin']), async (req, res) => {
    try {
        const { id } = req.params;
        if (!isValidObjectId(id)) return res.status(400).json({ error: 'Invalid organization ID' });

        if (req.user.role !== 'SuperAdmin' && req.orgId?.toString() !== id) {
            return res.status(403).json({ error: 'Access denied' });
        }

        const org = await Organization.findById(id);
        if (!org) return res.status(404).json({ error: 'Organization not found' });

        const stats = await buildOrgStats(id);

        // Per-role breakdown
        const roleCounts = await User.aggregate([
            { $match: { organizationId: new mongoose.Types.ObjectId(id), isActive: true } },
            { $group: { _id: '$role', count: { $sum: 1 } } }
        ]);

        const roleBreakdown = {};
        roleCounts.forEach(r => { roleBreakdown[r._id] = r.count; });

        // Recent events
        const recentEvents = await Event.find({ organizationId: id })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('name slug status start end stats');

        res.json({
            organization: org.getSummary(),
            stats: { ...stats, roleBreakdown },
            recentEvents,
            limits: org.limits
        });
    } catch (error) {
        logger.error('Error fetching org dashboard stats:', error);
        res.status(500).json({ error: 'Failed to fetch dashboard statistics' });
    }
});

module.exports = router;
