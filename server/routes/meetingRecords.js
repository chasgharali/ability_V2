const express = require('express');
const router = express.Router();
const MeetingRecord = require('../models/MeetingRecord');
const VideoCall = require('../models/VideoCall');
const BoothQueue = require('../models/BoothQueue');
const User = require('../models/User');
const { authenticateToken, requireRole } = require('../middleware/auth');

// Get meeting records with filtering
router.get('/', authenticateToken, async (req, res) => {
    try {
        const {
            recruiterId,
            eventId,
            boothId,
            status,
            startDate,
            endDate,
            search,
            page = 1,
            limit = 10,
            sortBy = 'startTime',
            sortOrder = 'desc'
        } = req.query;

        // Validate and sanitize inputs
        const mongoose = require('mongoose');
        const parsedPage = Math.max(1, parseInt(page) || 1);
        const parsedLimit = Math.min(1000, Math.max(1, parseInt(limit) || 10)); // Cap at 1000 to prevent memory issues
        const validSortFields = ['startTime', 'endTime', 'duration', 'status', 'createdAt'];
        const validSortOrder = ['asc', 'desc'];
        const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'startTime';
        const finalSortOrder = validSortOrder.includes(sortOrder.toLowerCase()) ? sortOrder.toLowerCase() : 'desc';

        // Validate ObjectIds if provided
        if (eventId && !mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ 
                message: 'Invalid eventId format',
                error: 'eventId must be a valid MongoDB ObjectId'
            });
        }
        if (boothId && !mongoose.Types.ObjectId.isValid(boothId)) {
            return res.status(400).json({ 
                message: 'Invalid boothId format',
                error: 'boothId must be a valid MongoDB ObjectId'
            });
        }
        if (recruiterId && !mongoose.Types.ObjectId.isValid(recruiterId)) {
            return res.status(400).json({ 
                message: 'Invalid recruiterId format',
                error: 'recruiterId must be a valid MongoDB ObjectId'
            });
        }

        // Build query based on user role and filters
        let query = {};

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            // Get recruiter's assigned booth
            const recruiter = await User.findById(req.user._id).select('assignedBooth').populate('assignedBooth');
            const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
            
            // Recruiters see ALL meeting records from their assigned booth
            // This allows all recruiters in the same booth to see each other's meeting records
            if (recruiterBoothId) {
                // Filter by boothId to show all records from the assigned booth
                query.boothId = recruiterBoothId;
                
                // Apply status filter if provided
                if (status) {
                    query.status = status;
                }
            } else {
                // If no booth assigned, only show their own records
                query.recruiterId = req.user._id;
                if (status) {
                    query.status = status;
                }
            }
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            // Admins can filter by recruiter or see all
            if (recruiterId) {
                query.recruiterId = recruiterId;
            }
            if (status) {
                query.status = status;
            }
        } else {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Apply additional filters (these apply to all conditions in $or)
        if (eventId) query.eventId = eventId;
        if (boothId) query.boothId = boothId;

        console.log('Meeting records query:', JSON.stringify(query));

        // Date range filtering
        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate);
            if (endDate) query.startTime.$lte = new Date(endDate);
        }

        // Sort options
        const sortOptions = {};
        sortOptions[finalSortBy] = finalSortOrder === 'desc' ? -1 : 1;

        // Helper function to check if record matches search term
        const matchesSearch = (record, searchTerm) => {
            if (record.eventId?.name && record.eventId.name.toLowerCase().includes(searchTerm)) return true;
            if (record.boothId?.name && record.boothId.name.toLowerCase().includes(searchTerm)) return true;
            if (record.recruiterId?.name && record.recruiterId.name.toLowerCase().includes(searchTerm)) return true;
            if (record.recruiterId?.email && record.recruiterId.email.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.name && record.jobseekerId.name.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.email && record.jobseekerId.email.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.phoneNumber && record.jobseekerId.phoneNumber.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.city && record.jobseekerId.city.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.state && record.jobseekerId.state.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.country && record.jobseekerId.country.toLowerCase().includes(searchTerm)) return true;
            if (record.jobseekerId?.metadata?.profile) {
                const profile = record.jobseekerId.metadata.profile;
                if (profile.headline && profile.headline.toLowerCase().includes(searchTerm)) return true;
                if (profile.keywords && profile.keywords.toLowerCase().includes(searchTerm)) return true;
                if (profile.workLevel && profile.workLevel.toLowerCase().includes(searchTerm)) return true;
                if (profile.educationLevel && profile.educationLevel.toLowerCase().includes(searchTerm)) return true;
                if (profile.clearance && profile.clearance.toLowerCase().includes(searchTerm)) return true;
                if (profile.veteranStatus && profile.veteranStatus.toLowerCase().includes(searchTerm)) return true;
                if (Array.isArray(profile.employmentTypes) && profile.employmentTypes.some(et => et.toLowerCase().includes(searchTerm))) return true;
                if (Array.isArray(profile.languages) && profile.languages.some(lang => lang.toLowerCase().includes(searchTerm))) return true;
            }
            if (record.interpreterId?.name && record.interpreterId.name.toLowerCase().includes(searchTerm)) return true;
            if (record.interpreterId?.email && record.interpreterId.email.toLowerCase().includes(searchTerm)) return true;
            if (record.status && record.status.toLowerCase().includes(searchTerm)) return true;
            if (record.recruiterFeedback && record.recruiterFeedback.toLowerCase().includes(searchTerm)) return true;
            return false;
        };

        // Fetch ALL records matching the base query (without pagination) if search is provided
        // Otherwise, fetch with pagination for better performance
        let allRecords;
        if (search && search.trim()) {
            // Fetch all records for search filtering
            allRecords = await MeetingRecord.find(query)
                .populate('eventId', 'name slug')
                .populate('boothId', 'name logoUrl')
                .populate('recruiterId', 'name email')
                .populate('jobseekerId', 'name email phoneNumber city state country resumeUrl metadata')
                .populate('interpreterId', 'name email')
                .populate('queueId')
                .populate('videoCallId')
                .sort(sortOptions)
                .lean();
        } else {
            // Fetch with pagination for better performance when no search
            const skip = (parsedPage - 1) * parsedLimit;
            allRecords = await MeetingRecord.find(query)
                .populate('eventId', 'name slug')
                .populate('boothId', 'name logoUrl')
                .populate('recruiterId', 'name email')
                .populate('jobseekerId', 'name email phoneNumber city state country resumeUrl metadata')
                .populate('interpreterId', 'name email')
                .populate('queueId')
                .populate('videoCallId')
                .sort(sortOptions)
                .skip(skip)
                .limit(parsedLimit)
                .lean();
        }

        // Calculate duration for records that don't have it
        let processedRecords = allRecords.map(record => {
            // If duration is null but we have start and end times, calculate it
            if (!record.duration && record.startTime && record.endTime) {
                record.duration = Math.round((new Date(record.endTime) - new Date(record.startTime)) / (1000 * 60));
            }
            return record;
        });

        // Apply search filter if provided (search across all populated fields)
        if (search && search.trim()) {
            const searchTerm = search.trim().toLowerCase();
            processedRecords = processedRecords.filter(record => matchesSearch(record, searchTerm));
        }

        // Deduplicate left_with_message records by queueId
        // If multiple left_with_message records exist for the same queueId, keep only one
        if (req.user.role === 'Recruiter') {
            const seenQueueIds = new Set();
            processedRecords = processedRecords.filter(record => {
                // For left_with_message records, deduplicate by queueId
                if (record.status === 'left_with_message' && record.queueId) {
                    const queueIdStr = record.queueId._id?.toString() || record.queueId.toString();
                    if (seenQueueIds.has(queueIdStr)) {
                        return false; // Skip duplicate
                    }
                    seenQueueIds.add(queueIdStr);
                }
                return true; // Keep all other records
            });
        }

        // Apply pagination if search was used (since we fetched all records)
        if (search && search.trim()) {
            const skip = (parsedPage - 1) * parsedLimit;
            processedRecords = processedRecords.slice(skip, skip + parsedLimit);
        }

        // Calculate total count for pagination
        // If search was used, we already have the filtered count from processedRecords
        // Otherwise, we need to count from database
        let finalCount;
        if (search && search.trim()) {
            // Count is based on filtered and deduplicated records
            // We need to recalculate the full filtered list to get accurate count
            // (since we already filtered above, we can use that count)
            const allRecordsForCount = await MeetingRecord.find(query)
                .populate('eventId', 'name slug')
                .populate('boothId', 'name logoUrl')
                .populate('recruiterId', 'name email')
                .populate('jobseekerId', 'name email phoneNumber city state country resumeUrl metadata')
                .populate('interpreterId', 'name email')
                .populate('queueId')
                .lean();
            
            const searchTerm = search.trim().toLowerCase();
            let filteredForCount = allRecordsForCount.filter(record => matchesSearch(record, searchTerm));
            
            // Apply deduplication for recruiters
            if (req.user.role === 'Recruiter') {
                const seenQueueIds = new Set();
                filteredForCount = filteredForCount.filter(record => {
                    if (record.status === 'left_with_message' && record.queueId) {
                        const queueIdStr = record.queueId._id?.toString() || record.queueId.toString();
                        if (seenQueueIds.has(queueIdStr)) {
                            return false;
                        }
                        seenQueueIds.add(queueIdStr);
                    }
                    return true;
                });
            }
            
            finalCount = filteredForCount.length;
        } else {
            // No search - count from database
            let totalRecords = await MeetingRecord.countDocuments(query);
            
            // Adjust count for recruiters to account for deduplication of left_with_message records
            if (req.user.role === 'Recruiter') {
                const duplicateQuery = {
                    ...query,
                    status: 'left_with_message'
                };
                const leftMessageRecords = await MeetingRecord.find(duplicateQuery).select('queueId');
                const uniqueQueueIds = new Set();
                let duplicateCount = 0;
                leftMessageRecords.forEach(record => {
                    const queueIdStr = record.queueId?.toString();
                    if (queueIdStr) {
                        if (uniqueQueueIds.has(queueIdStr)) {
                            duplicateCount++;
                        } else {
                            uniqueQueueIds.add(queueIdStr);
                        }
                    }
                });
                finalCount = totalRecords - duplicateCount;
            } else {
                finalCount = totalRecords;
            }
        }
        
        res.json({
            meetingRecords: processedRecords,
            pagination: {
                currentPage: parsedPage,
                totalPages: Math.ceil(finalCount / parsedLimit),
                totalRecords: finalCount,
                hasNext: parsedPage * parsedLimit < finalCount,
                hasPrev: parsedPage > 1
            }
        });

    } catch (error) {
        console.error('Error fetching meeting records:', error);
        const logger = require('../utils/logger');
        logger.error('Error fetching meeting records:', error);
        res.status(500).json({ 
            message: 'Server error', 
            error: error.message,
            stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
        });
    }
});

// Get single meeting record
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const meetingRecord = await MeetingRecord.findById(req.params.id)
            .populate('eventId', 'name slug')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email')
            .populate('jobseekerId', 'name email phoneNumber city state country resumeUrl metadata')
            .populate('interpreterId', 'name email')
            .populate('queueId')
            .populate('videoCallId');

        if (!meetingRecord) {
            return res.status(404).json({ message: 'Meeting record not found' });
        }

        // Check access permissions
        let canAccess = req.user.role === 'Admin' ||
            req.user.role === 'GlobalSupport' ||
            meetingRecord.jobseekerId._id.toString() === req.user._id.toString() ||
            (meetingRecord.interpreterId && meetingRecord.interpreterId._id.toString() === req.user._id.toString());

        // For recruiters: check if they can access the record
        if (req.user.role === 'Recruiter') {
            // Recruiters can access any meeting record from their assigned booth
            const User = require('../models/User');
            const recruiter = await User.findById(req.user._id).select('assignedBooth');
            const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
            const recordBoothId = meetingRecord.boothId?._id || meetingRecord.boothId;
            
            if (recruiterBoothId && recordBoothId && 
                recruiterBoothId.toString() === recordBoothId.toString()) {
                canAccess = true;
            } else if (!recruiterBoothId && meetingRecord.recruiterId && 
                       meetingRecord.recruiterId._id.toString() === req.user._id.toString()) {
                // If no booth assigned, only allow access to their own records
                canAccess = true;
            }
        } else if (meetingRecord.recruiterId && 
                   meetingRecord.recruiterId._id.toString() === req.user._id.toString()) {
            canAccess = true;
        }

        if (!canAccess) {
            return res.status(403).json({ message: 'Access denied' });
        }

        // Calculate duration if missing
        const recordObj = meetingRecord.toObject();
        if (!recordObj.duration && recordObj.startTime && recordObj.endTime) {
            recordObj.duration = Math.round((new Date(recordObj.endTime) - new Date(recordObj.startTime)) / (1000 * 60));
        }

        res.json(recordObj);

    } catch (error) {
        console.error('Error fetching meeting record:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Create meeting record from video call
router.post('/create-from-call', authenticateToken, requireRole(['Recruiter', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { videoCallId } = req.body;

        const videoCall = await VideoCall.findById(videoCallId)
            .populate('queueEntry')
            .populate('recruiter')
            .populate('jobSeeker')
            .populate('event')
            .populate('booth')
            .populate('interpreters.interpreter', 'name email');

        if (!videoCall) {
            return res.status(404).json({ message: 'Video call not found' });
        }

        // Check if meeting record already exists
        const existingRecord = await MeetingRecord.findOne({ videoCallId });
        if (existingRecord) {
            return res.json(existingRecord);
        }

        // Get job seeker messages from queue entry
        const jobSeekerMessages = videoCall.queueEntry?.messages || [];

        // Transform chat messages from VideoCall schema to MeetingRecord schema
        // VideoCall uses 'sender' field, MeetingRecord uses 'userId' field
        const transformedChatMessages = (videoCall.chatMessages || []).map(msg => ({
            userId: msg.sender,
            message: msg.message,
            timestamp: msg.timestamp,
            messageType: msg.messageType || 'text'
        }));

        // Get interpreter if one joined the call (status: 'joined')
        const joinedInterpreter = videoCall.interpreters?.find(i => i.status === 'joined');
        const interpreterId = joinedInterpreter?.interpreter?._id || null;

        // Create meeting record
        const meetingRecord = new MeetingRecord({
            eventId: videoCall.event._id,
            boothId: videoCall.booth._id,
            queueId: videoCall.queueEntry._id,
            videoCallId: videoCall._id,
            recruiterId: videoCall.recruiter._id,
            jobseekerId: videoCall.jobSeeker._id,
            interpreterId: interpreterId,
            twilioRoomId: videoCall.roomName,
            twilioRoomSid: videoCall.roomSid,
            startTime: videoCall.startedAt,
            endTime: videoCall.endedAt,
            duration: videoCall.duration ? Math.floor(videoCall.duration / 60) :
                (videoCall.startedAt && videoCall.endedAt ?
                    Math.floor((new Date(videoCall.endedAt) - new Date(videoCall.startedAt)) / (1000 * 60)) : null),
            status: videoCall.status === 'ended' ? 'completed' : videoCall.status,
            jobSeekerMessages: jobSeekerMessages,
            chatMessages: transformedChatMessages
        });

        await meetingRecord.save();

        // Populate the created record
        const populatedRecord = await MeetingRecord.findById(meetingRecord._id)
            .populate('eventId', 'name slug')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email')
            .populate('jobseekerId', 'name email city state metadata')
            .populate('interpreterId', 'name email');

        res.status(201).json(populatedRecord);

    } catch (error) {
        console.error('Error creating meeting record:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Submit recruiter rating and feedback
router.post('/:id/rating', authenticateToken, requireRole(['Recruiter', 'Admin', 'GlobalSupport']), async (req, res) => {
    try {
        const { rating, feedback } = req.body;

        if (!rating || rating < 1 || rating > 5) {
            return res.status(400).json({ message: 'Rating must be between 1 and 5' });
        }

        const meetingRecord = await MeetingRecord.findById(req.params.id);
        if (!meetingRecord) {
            return res.status(404).json({ message: 'Meeting record not found' });
        }

        // Check if user is the recruiter or admin
        const canRate = req.user.role === 'Admin' ||
            req.user.role === 'GlobalSupport' ||
            meetingRecord.recruiterId.toString() === req.user._id.toString();

        if (!canRate) {
            return res.status(403).json({ message: 'Only the recruiter can rate this meeting' });
        }

        await meetingRecord.submitRecruiterRating(rating, feedback);

        res.json({
            message: 'Rating submitted successfully',
            rating: meetingRecord.recruiterRating,
            feedback: meetingRecord.recruiterFeedback
        });

    } catch (error) {
        console.error('Error submitting rating:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get meeting statistics
router.get('/stats/overview', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Recruiter']), async (req, res) => {
    try {
        const { recruiterId, eventId, boothId, status, startDate, endDate } = req.query;
        const mongoose = require('mongoose');
        const logger = require('../utils/logger');

        // Validate ObjectIds if provided
        if (eventId && !mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ 
                message: 'Invalid eventId format',
                error: 'eventId must be a valid MongoDB ObjectId'
            });
        }
        if (boothId && !mongoose.Types.ObjectId.isValid(boothId)) {
            return res.status(400).json({ 
                message: 'Invalid boothId format',
                error: 'boothId must be a valid MongoDB ObjectId'
            });
        }
        if (recruiterId && !mongoose.Types.ObjectId.isValid(recruiterId)) {
            return res.status(400).json({ 
                message: 'Invalid recruiterId format',
                error: 'recruiterId must be a valid MongoDB ObjectId'
            });
        }

        let matchQuery = {};

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            // Get recruiter's assigned booth and filter by boothId to show all records from the booth
            const recruiter = await User.findById(req.user._id).select('assignedBooth').populate('assignedBooth');
            const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
            
            if (recruiterBoothId) {
                // Filter by boothId to show all records from the assigned booth
                matchQuery.boothId = recruiterBoothId;
                
                // Apply status filter if provided
                if (status) {
                    matchQuery.status = status;
                }
            } else {
                // If no booth assigned, only show their own records
                matchQuery.recruiterId = req.user._id;
                if (status) {
                    matchQuery.status = status;
                }
            }
        } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
            // Admins can filter by recruiter or see all
            if (recruiterId) {
                matchQuery.recruiterId = new mongoose.Types.ObjectId(recruiterId);
            }
            if (status) {
                matchQuery.status = status;
            }
        }

        // Apply additional filters (these apply to all conditions)
        if (eventId) {
            matchQuery.eventId = new mongoose.Types.ObjectId(eventId);
        }
        if (boothId) {
            matchQuery.boothId = new mongoose.Types.ObjectId(boothId);
        }

        // Date range filtering
        if (startDate || endDate) {
            matchQuery.startTime = {};
            if (startDate) matchQuery.startTime.$gte = new Date(startDate);
            if (endDate) matchQuery.startTime.$lte = new Date(endDate);
        }

        logger.info(`Stats query: ${JSON.stringify(matchQuery)}`);

        const stats = await MeetingRecord.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { 
                            $cond: [
                                { 
                                    $or: [
                                        { $eq: [{ $toLower: '$status' }, 'completed'] },
                                        { $eq: ['$status', 'completed'] },
                                        { $eq: ['$status', 'Completed'] },
                                        { $eq: ['$status', 'COMPLETED'] }
                                    ]
                                }, 
                                1, 
                                0
                            ] 
                        }
                    },
                    averageDuration: { $avg: '$duration' },
                    averageRating: { $avg: '$recruiterRating' },
                    totalWithRating: {
                        $sum: { $cond: [{ $ne: ['$recruiterRating', null] }, 1, 0] }
                    },
                    totalWithInterpreter: {
                        $sum: { $cond: [{ $ne: ['$interpreterId', null] }, 1, 0] }
                    }
                }
            }
        ]);

        const result = stats[0] || {
            totalMeetings: 0,
            completedMeetings: 0,
            averageDuration: null,
            averageRating: null,
            totalWithRating: 0,
            totalWithInterpreter: 0
        };

        logger.info(`Stats result: ${JSON.stringify(result)}`);

        res.json(result);

    } catch (error) {
        console.error('Error fetching meeting stats:', error);
        const logger = require('../utils/logger');
        logger.error('Error fetching meeting stats:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Export meeting records (CSV)
router.get('/export/csv', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Recruiter']), async (req, res) => {
    try {
        const { recruiterId, eventId, boothId, status, startDate, endDate, search } = req.query;

        let query = {};

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            // Get recruiter's assigned booth and filter by boothId to show all records from the booth
            const recruiter = await User.findById(req.user._id).select('assignedBooth').populate('assignedBooth');
            const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
            
            if (recruiterBoothId) {
                query.boothId = recruiterBoothId;
            } else {
                // If no booth assigned, only show their own records
                query.recruiterId = req.user._id;
            }
        } else if (recruiterId) {
            query.recruiterId = recruiterId;
        }

        if (eventId) query.eventId = eventId;
        if (boothId) query.boothId = boothId;
        if (status) query.status = status;

        // Date range filtering
        if (startDate || endDate) {
            query.startTime = {};
            if (startDate) query.startTime.$gte = new Date(startDate);
            if (endDate) query.startTime.$lte = new Date(endDate);
        }

        // Note: Text search is handled by populating and filtering in memory if needed
        // For now, we'll export all records matching the other filters

        // Get ALL records (no limit for export)
        const meetingRecords = await MeetingRecord.find(query)
            .populate({
                path: 'eventId',
                select: 'name',
                model: 'Event'
            })
            .populate({
                path: 'boothId',
                select: 'name',
                model: 'Booth'
            })
            .populate({
                path: 'recruiterId',
                select: 'name email',
                model: 'User'
            })
            .populate({
                path: 'jobseekerId',
                select: 'name email phoneNumber city state country resumeUrl metadata',
                model: 'User'
            })
            .populate({
                path: 'interpreterId',
                select: 'name email',
                model: 'User',
                options: { strictPopulate: false } // Allow null interpreterId
            })
            .sort({ startTime: -1 })
            .lean(); // Use lean() for better performance


        // Helper function to escape CSV fields properly
        const escapeCSV = (value) => {
            if (value === null || value === undefined || value === '') {
                return '';
            }
            const stringValue = String(value);
            // If value contains comma, quote, or newline, wrap in quotes and escape quotes
            if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n') || stringValue.includes('\r')) {
                return `"${stringValue.replace(/"/g, '""')}"`;
            }
            return stringValue;
        };

        // Helper function to format date consistently
        const formatDate = (date) => {
            if (!date) return '';
            try {
                const d = new Date(date);
                if (isNaN(d.getTime())) return '';
                // Format: YYYY-MM-DD HH:MM:SS
                const year = d.getFullYear();
                const month = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                const hours = String(d.getHours()).padStart(2, '0');
                const minutes = String(d.getMinutes()).padStart(2, '0');
                const seconds = String(d.getSeconds()).padStart(2, '0');
                return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
            } catch (e) {
                return '';
            }
        };

        // Convert to CSV format
        const csvHeaders = [
            'Event Name',
            'Booth',
            'Recruiter Name',
            'Recruiter Email',
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
            'Job Seeker Resume Link',
            'Interpreter',
            'Start Time',
            'End Time',
            'Duration (minutes)',
            'Status',
            'Rating',
            'Feedback',
            'Messages Count'
        ];

        const csvRows = meetingRecords.map((record, index) => {
            // Safely extract populated fields - handle both populated objects, ObjectIds, and null values
            // Check if field exists and is an object (populated) or if it's null/undefined
            const eventName = (record.eventId && typeof record.eventId === 'object' && !Array.isArray(record.eventId) && record.eventId.name) 
                ? String(record.eventId.name).trim() 
                : '';
            const boothName = (record.boothId && typeof record.boothId === 'object' && !Array.isArray(record.boothId) && record.boothId.name) 
                ? String(record.boothId.name).trim() 
                : '';
            const recruiterName = (record.recruiterId && typeof record.recruiterId === 'object' && !Array.isArray(record.recruiterId) && record.recruiterId.name) 
                ? String(record.recruiterId.name).trim() 
                : '';
            const recruiterEmail = (record.recruiterId && typeof record.recruiterId === 'object' && !Array.isArray(record.recruiterId) && record.recruiterId.email) 
                ? String(record.recruiterId.email).trim() 
                : '';
            // Extract job seeker basic info
            const jobSeeker = record.jobseekerId;
            const jobSeekerName = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.name) 
                ? String(jobSeeker.name).trim() 
                : '';
            
            // Split name into first and last name
            const nameParts = jobSeekerName ? jobSeekerName.split(/\s+/) : [];
            const jobSeekerFirstName = nameParts[0] || '';
            const jobSeekerLastName = nameParts.slice(1).join(' ') || '';
            
            const jobSeekerEmail = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.email) 
                ? String(jobSeeker.email).trim() 
                : '';
            const jobSeekerPhone = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.phoneNumber) 
                ? String(jobSeeker.phoneNumber).trim() 
                : '';
            const jobSeekerCity = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.city) 
                ? String(jobSeeker.city).trim() 
                : '';
            const jobSeekerState = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.state) 
                ? String(jobSeeker.state).trim() 
                : '';
            const jobSeekerResumeUrl = (jobSeeker && typeof jobSeeker === 'object' && !Array.isArray(jobSeeker) && jobSeeker.resumeUrl) 
                ? String(jobSeeker.resumeUrl).trim() 
                : '';
            
            // Extract profile data from metadata
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
            
            // Interpreter can be null, so handle it specially
            let interpreterName = '';
            if (record.interpreterId && typeof record.interpreterId === 'object' && !Array.isArray(record.interpreterId)) {
                interpreterName = record.interpreterId.name ? String(record.interpreterId.name).trim() : '';
            }
            if (!interpreterName) {
                interpreterName = 'None';
            }
            
            // Format location
            let location = '';
            if (jobSeekerCity && jobSeekerState) {
                location = `${jobSeekerCity}, ${jobSeekerState}`;
            } else if (jobSeekerCity) {
                location = jobSeekerCity;
            } else if (jobSeekerState) {
                location = jobSeekerState;
            }

            // Calculate duration if missing or 0
            let duration = record.duration;
            if ((!duration || duration === 0) && record.startTime && record.endTime) {
                try {
                    const start = new Date(record.startTime);
                    const end = new Date(record.endTime);
                    if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && end > start) {
                        duration = Math.round((end - start) / (1000 * 60));
                    }
                } catch (e) {
                    console.warn(`Error calculating duration for record ${record._id}:`, e);
                }
            }
            const durationValue = (duration !== null && duration !== undefined && duration !== '') 
                ? String(duration) 
                : '';

            // Format status
            const statusLabels = {
                'scheduled': 'Scheduled',
                'active': 'Active',
                'completed': 'Completed',
                'cancelled': 'Cancelled',
                'failed': 'Failed',
                'left_with_message': 'Left Message'
            };
            const status = statusLabels[record.status] || record.status || '';

            // Format rating (ensure it's a number or empty)
            const rating = (record.recruiterRating !== null && record.recruiterRating !== undefined && record.recruiterRating !== '') 
                ? String(record.recruiterRating) 
                : '';

            // Format feedback - handle null, undefined, and empty string
            const feedback = (record.recruiterFeedback !== null && record.recruiterFeedback !== undefined) 
                ? String(record.recruiterFeedback).trim() 
                : '';

            // Messages count - ensure we always have a number
            let messagesCount = '0';
            if (Array.isArray(record.jobSeekerMessages)) {
                messagesCount = String(record.jobSeekerMessages.length);
            } else if (record.jobSeekerMessages !== null && record.jobSeekerMessages !== undefined) {
                messagesCount = '0';
            }

            const row = [
                escapeCSV(eventName),
                escapeCSV(boothName),
                escapeCSV(recruiterName),
                escapeCSV(recruiterEmail),
                escapeCSV(jobSeekerFirstName),
                escapeCSV(jobSeekerLastName),
                escapeCSV(jobSeekerEmail),
                escapeCSV(jobSeekerPhone),
                escapeCSV(location),
                escapeCSV(headline),
                escapeCSV(keywords),
                escapeCSV(workLevel),
                escapeCSV(educationLevel),
                escapeCSV(employmentTypes),
                escapeCSV(languages),
                escapeCSV(clearance),
                escapeCSV(veteranStatus),
                escapeCSV(jobSeekerResumeUrl),
                escapeCSV(interpreterName),
                escapeCSV(formatDate(record.startTime)),
                escapeCSV(formatDate(record.endTime)),
                escapeCSV(durationValue),
                escapeCSV(status),
                escapeCSV(rating),
                escapeCSV(feedback),
                escapeCSV(messagesCount)
            ];

            // Validate row has correct number of columns
            if (row.length !== csvHeaders.length) {
                // Pad with empty strings if missing columns
                while (row.length < csvHeaders.length) {
                    row.push('');
                }
            }

            return row;
        });

        // Validate all rows have correct number of columns
        const expectedColumns = csvHeaders.length;

        // Build CSV content with proper escaping
        const csvContent = [
            csvHeaders.map(h => escapeCSV(h)).join(','),
            ...csvRows.map(row => {
                // Ensure row has exactly the right number of columns
                const paddedRow = [...row];
                while (paddedRow.length < expectedColumns) {
                    paddedRow.push('');
                }
                return paddedRow.slice(0, expectedColumns).join(',');
            })
        ].join('\r\n');

        // Add BOM for Excel compatibility (UTF-8 BOM)
        const BOM = '\uFEFF';
        const finalContent = BOM + csvContent;

        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', 'attachment; filename="meeting-records.csv"');
        res.send(finalContent);

    } catch (error) {
        console.error('Error exporting meeting records:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Export resumes - Get meeting records for resume export with proper filtering
router.get('/export/resumes', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'Recruiter']), async (req, res) => {
    try {
        const { recruiterId, eventId, boothId, status, startDate, endDate, selectedIds } = req.query;
        const mongoose = require('mongoose');

        console.log('🎯 Resume Export Request:', {
            user: req.user.email,
            role: req.user.role,
            selectedIds: selectedIds ? (Array.isArray(selectedIds) ? selectedIds.length : selectedIds.split(',').length) : 'none',
            filters: { recruiterId, eventId, boothId, status, startDate, endDate }
        });

        // Validate ObjectIds if provided
        if (eventId && !mongoose.Types.ObjectId.isValid(eventId)) {
            return res.status(400).json({ 
                message: 'Invalid eventId format',
                error: 'eventId must be a valid MongoDB ObjectId'
            });
        }
        if (boothId && !mongoose.Types.ObjectId.isValid(boothId)) {
            return res.status(400).json({ 
                message: 'Invalid boothId format',
                error: 'boothId must be a valid MongoDB ObjectId'
            });
        }
        if (recruiterId && !mongoose.Types.ObjectId.isValid(recruiterId)) {
            return res.status(400).json({ 
                message: 'Invalid recruiterId format',
                error: 'recruiterId must be a valid MongoDB ObjectId'
            });
        }

        let query = {};

        // If specific record IDs are provided, use those (selected records)
        if (selectedIds) {
            const idsArray = Array.isArray(selectedIds) ? selectedIds : selectedIds.split(',');
            const validIds = idsArray.filter(id => mongoose.Types.ObjectId.isValid(id));
            
            if (validIds.length === 0) {
                return res.status(400).json({ message: 'No valid record IDs provided' });
            }
            
            query._id = { $in: validIds.map(id => new mongoose.Types.ObjectId(id)) };
            
            console.log(`✅ Using selected IDs: ${validIds.length} record(s)`);
        } else {
            // No selection - apply filters
            console.log('📋 No selection - applying filters and role-based access');
            
            // Role-based filtering
            if (req.user.role === 'Recruiter') {
                // Get recruiter's assigned booth and filter by boothId to show all records from the booth
                const recruiter = await User.findById(req.user._id).select('assignedBooth').populate('assignedBooth');
                const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
                
                if (recruiterBoothId) {
                    query.boothId = recruiterBoothId;
                    console.log(`👤 Recruiter booth filter: ${recruiterBoothId}`);
                    
                    // Apply status filter if provided
                    if (status) {
                        query.status = status;
                        console.log(`📊 Status filter: ${status}`);
                    }
                } else {
                    // If no booth assigned, only show their own records
                    query.recruiterId = req.user._id;
                    console.log(`👤 Recruiter ID filter (no booth): ${req.user._id}`);
                    if (status) {
                        query.status = status;
                        console.log(`📊 Status filter: ${status}`);
                    }
                }
            } else if (['Admin', 'GlobalSupport'].includes(req.user.role)) {
                console.log(`👑 Admin/GlobalSupport - applying filters`);
                // Admins can filter by recruiter or see all
                if (recruiterId) {
                    query.recruiterId = new mongoose.Types.ObjectId(recruiterId);
                    console.log(`👤 Recruiter filter: ${recruiterId}`);
                }
                if (status) {
                    query.status = status;
                    console.log(`📊 Status filter: ${status}`);
                }
            }

            // Apply additional filters (these apply to all conditions)
            if (eventId) {
                query.eventId = new mongoose.Types.ObjectId(eventId);
                console.log(`🎪 Event filter: ${eventId}`);
            }
            if (boothId) {
                query.boothId = new mongoose.Types.ObjectId(boothId);
                console.log(`🏢 Booth filter: ${boothId}`);
            }

            // Date range filtering
            if (startDate || endDate) {
                query.startTime = {};
                if (startDate) {
                    query.startTime.$gte = new Date(startDate);
                    console.log(`📅 Start date filter: ${startDate}`);
                }
                if (endDate) {
                    query.startTime.$lte = new Date(endDate);
                    console.log(`📅 End date filter: ${endDate}`);
                }
            }

            console.log(`📋 Final query:`, JSON.stringify(query));
        }

        // Get ALL records matching the query (no pagination for export)
        const meetingRecords = await MeetingRecord.find(query)
            .populate('jobseekerId', 'name email resumeUrl')
            .select('jobseekerId')
            .lean();

        console.log(`✅ Found ${meetingRecords.length} meeting records for resume export`);

        // Extract unique job seekers with resume URLs
        const uniqueJobSeekers = [];
        const seenJobSeekerIds = new Set();

        meetingRecords.forEach(record => {
            const jobSeeker = record.jobseekerId;
            if (!jobSeeker) return;

            const jobSeekerId = jobSeeker._id.toString();
            
            // Skip if already processed
            if (seenJobSeekerIds.has(jobSeekerId)) return;
            
            // Skip if no resume URL
            if (!jobSeeker.resumeUrl || !jobSeeker.resumeUrl.trim()) return;

            seenJobSeekerIds.add(jobSeekerId);
            uniqueJobSeekers.push({
                id: jobSeekerId,
                name: jobSeeker.name || 'Unknown',
                email: jobSeeker.email || '',
                resumeUrl: jobSeeker.resumeUrl.trim()
            });
        });

        console.log(`✅ Returning ${uniqueJobSeekers.length} unique job seekers with resume URLs`);

        res.json({
            jobSeekers: uniqueJobSeekers,
            totalRecords: meetingRecords.length,
            uniqueJobSeekers: uniqueJobSeekers.length
        });

    } catch (error) {
        console.error('❌ Error fetching records for resume export:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Bulk delete meeting records (Admin/GlobalSupport/AdminEvent only)
router.delete('/bulk-delete', authenticateToken, requireRole(['Admin', 'GlobalSupport', 'AdminEvent']), async (req, res) => {
    try {
        const { recordIds } = req.body;

        if (!recordIds || !Array.isArray(recordIds) || recordIds.length === 0) {
            return res.status(400).json({ message: 'No record IDs provided' });
        }

        // Delete the records
        const result = await MeetingRecord.deleteMany({
            _id: { $in: recordIds }
        });

        console.log(`Deleted ${result.deletedCount} meeting records`);

        res.json({
            message: `Successfully deleted ${result.deletedCount} meeting record(s)`,
            deletedCount: result.deletedCount
        });

    } catch (error) {
        console.error('Error deleting meeting records:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

module.exports = router;
