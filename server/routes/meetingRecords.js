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
            page = 1,
            limit = 10,
            sortBy = 'startTime',
            sortOrder = 'desc'
        } = req.query;

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

        // Pagination
        const skip = (page - 1) * limit;
        const sortOptions = {};
        sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

        // Execute query with population
        const meetingRecords = await MeetingRecord.find(query)
            .populate('eventId', 'name slug')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email')
            .populate('jobseekerId', 'name email city state metadata resumeUrl')
            .populate('interpreterId', 'name email')
            .populate('queueId')
            .populate('videoCallId')
            .sort(sortOptions)
            .skip(skip)
            .limit(parseInt(limit));

        console.log(`Found ${meetingRecords.length} meeting records`);
        if (meetingRecords.length > 0) {
            console.log('Sample record statuses:', meetingRecords.map(r => r.status));
        }

        // Calculate duration for records that don't have it
        let processedRecords = meetingRecords.map(record => {
            const recordObj = record.toObject();
            // If duration is null but we have start and end times, calculate it
            if (!recordObj.duration && recordObj.startTime && recordObj.endTime) {
                recordObj.duration = Math.round((new Date(recordObj.endTime) - new Date(recordObj.startTime)) / (1000 * 60));
            }
            return recordObj;
        });

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

        // Get total count for pagination
        // Note: For recruiters, count may include duplicates from old records (especially left_with_message)
        // but the deduplication filter above will remove them from display
        const totalRecords = await MeetingRecord.countDocuments(query);
        
        // Adjust count for recruiters to account for deduplication of left_with_message records
        // Count unique left_with_message records by queueId
        let adjustedCount = totalRecords;
        if (req.user.role === 'Recruiter') {
            // Count how many duplicate left_with_message records exist
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
            adjustedCount = totalRecords - duplicateCount;
        }

        // Use adjusted count for pagination if we deduplicated
        const finalCount = adjustedCount;
        
        res.json({
            meetingRecords: processedRecords,
            pagination: {
                currentPage: parseInt(page),
                totalPages: Math.ceil(finalCount / limit),
                totalRecords: finalCount,
                hasNext: page * limit < finalCount,
                hasPrev: page > 1
            }
        });

    } catch (error) {
        console.error('Error fetching meeting records:', error);
        res.status(500).json({ message: 'Server error', error: error.message });
    }
});

// Get single meeting record
router.get('/:id', authenticateToken, async (req, res) => {
    try {
        const meetingRecord = await MeetingRecord.findById(req.params.id)
            .populate('eventId', 'name slug')
            .populate('boothId', 'name logoUrl')
            .populate('recruiterId', 'name email')
            .populate('jobseekerId', 'name email city state metadata resumeUrl')
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
        const { recruiterId, eventId, startDate, endDate } = req.query;

        let matchQuery = {};

        // Role-based filtering
        if (req.user.role === 'Recruiter') {
            // Get recruiter's assigned booth and filter by boothId to show all records from the booth
            const recruiter = await User.findById(req.user._id).select('assignedBooth').populate('assignedBooth');
            const recruiterBoothId = recruiter?.assignedBooth?._id || recruiter?.assignedBooth;
            
            if (recruiterBoothId) {
                matchQuery.boothId = recruiterBoothId;
            } else {
                // If no booth assigned, only show their own records
                matchQuery.recruiterId = req.user._id;
            }
        } else if (recruiterId) {
            matchQuery.recruiterId = recruiterId;
        }

        if (eventId) matchQuery.eventId = eventId;

        // Date range filtering
        if (startDate || endDate) {
            matchQuery.startTime = {};
            if (startDate) matchQuery.startTime.$gte = new Date(startDate);
            if (endDate) matchQuery.startTime.$lte = new Date(endDate);
        }

        const stats = await MeetingRecord.aggregate([
            { $match: matchQuery },
            {
                $group: {
                    _id: null,
                    totalMeetings: { $sum: 1 },
                    completedMeetings: {
                        $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
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
            averageDuration: 0,
            averageRating: 0,
            totalWithRating: 0,
            totalWithInterpreter: 0
        };

        res.json(result);

    } catch (error) {
        console.error('Error fetching meeting stats:', error);
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

// Bulk delete meeting records (Admin/GlobalSupport only)
router.delete('/bulk-delete', authenticateToken, requireRole(['Admin', 'GlobalSupport']), async (req, res) => {
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
