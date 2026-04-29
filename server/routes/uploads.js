const express = require('express');
const { body, validationResult } = require('express-validator');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const multer = require('multer');
const { authenticateToken, requireRole } = require('../middleware/auth');
const logger = require('../utils/logger');
const { extractS3KeyFromUrl, encodeKeyForPath } = require('../utils/mediaUrl');

// Multer configured for memory storage (files buffered in RAM then streamed to S3)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
    fileFilter: (_req, file, cb) => {
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed'), false);
        }
    }
});

const router = express.Router();

// Allow auth via `?token=` for media tags (video/audio) that can't set headers
const authenticateTokenFromHeaderOrQuery = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        if (!authHeader && req.query && req.query.token) {
            req.headers['authorization'] = `Bearer ${req.query.token}`;
        }
        return authenticateToken(req, res, next);
    } catch (e) {
        return res.status(401).json({
            error: 'Access token required',
            message: 'Please provide a valid access token'
        });
    }
};

// Configure AWS S3
const s3 = new AWS.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;

/**
 * POST /api/uploads/presign
 * Generate presigned URL for file upload
 */
router.post('/presign', authenticateToken, [
    body('fileName')
        .notEmpty()
        .withMessage('File name is required')
        .isLength({ max: 255 })
        .withMessage('File name cannot exceed 255 characters'),
    body('fileType')
        .notEmpty()
        .withMessage('File type is required')
        .isIn(['resume', 'document', 'image', 'audio', 'video', 'avatar', 'booth-logo'])
        .withMessage('Invalid file type'),
    body('mimeType')
        .notEmpty()
        .withMessage('MIME type is required')
        .matches(/^[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_]*\/[a-zA-Z0-9][a-zA-Z0-9!#$&\-\^_.]*$/)
        .withMessage('Invalid MIME type format')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { fileName, fileType, mimeType } = req.body;
        const { user } = req;

        // Validate file type and MIME type combination
        const allowedMimeTypes = {
            resume: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
            document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'text/plain'],
            image: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            audio: ['audio/mpeg', 'audio/wav', 'audio/ogg', 'audio/mp4', 'audio/webm'],
            video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime', 'video/x-msvideo', 'video/x-ms-wmv'],
            avatar: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
            'booth-logo': ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
        };

        if (!allowedMimeTypes[fileType]?.includes(mimeType)) {
            return res.status(400).json({
                error: 'Invalid file type',
                message: `File type ${fileType} does not support MIME type ${mimeType}`
            });
        }

        // Check file size limits
        const maxSizes = {
            resume: 10 * 1024 * 1024, // 10MB
            document: 10 * 1024 * 1024, // 10MB
            image: 5 * 1024 * 1024, // 5MB
            audio: 50 * 1024 * 1024, // 50MB
            video: 100 * 1024 * 1024, // 100MB
            avatar: 2 * 1024 * 1024, // 2MB
            'booth-logo': 2 * 1024 * 1024 // 2MB
        };

        const maxSize = maxSizes[fileType];
        if (!maxSize) {
            return res.status(400).json({
                error: 'Invalid file type',
                message: 'Unsupported file type'
            });
        }

        // Generate file key using original filename with a safe prefix
        // Example: resume/<userId>/Original File Name.pdf => sanitized as needed
        const baseName = fileName.replace(/^.*[\\\/]/, ''); // strip any path
        const safeFileName = baseName.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 200); // sanitize and cap length
        const uniqueFileName = `${fileType}/${user._id}/${safeFileName}`;

        // Generate presigned URL for upload
        const presignedUrl = s3.getSignedUrl('putObject', {
            Bucket: BUCKET_NAME,
            Key: uniqueFileName,
            ContentType: mimeType,
            Expires: 300, // 5 minutes
            Metadata: {
                userId: user._id.toString(),
                fileType: fileType,
                originalName: fileName
            }
        });

        // Generate presigned URL for download (for immediate access after upload)
        const downloadUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: uniqueFileName,
            Expires: 3600 // 1 hour
        });

        logger.info(`Presigned URL generated for user ${user.email}: ${fileType}/${fileName}`);

        res.json({
            message: 'Presigned URL generated successfully',
            upload: {
                url: presignedUrl,
                key: uniqueFileName,
                expiresIn: 300
            },
            download: {
                url: downloadUrl,
                expiresIn: 3600
            },
            fileInfo: {
                fileName,
                fileType,
                mimeType,
                maxSize
            }
        });
    } catch (error) {
        logger.error('Presigned URL generation error:', error);
        res.status(500).json({
            error: 'Failed to generate presigned URL',
            message: 'An error occurred while generating the upload URL'
        });
    }
});

/**
 * POST /api/uploads/complete
 * Confirm file upload completion
 */
router.post('/complete', authenticateToken, [
    body('fileKey')
        .notEmpty()
        .withMessage('File key is required'),
    body('fileType')
        .notEmpty()
        .withMessage('File type is required')
        .isIn(['resume', 'document', 'image', 'audio', 'video', 'avatar', 'booth-logo'])
        .withMessage('Invalid file type'),
    body('fileName')
        .notEmpty()
        .withMessage('File name is required'),
    body('mimeType')
        .notEmpty()
        .withMessage('MIME type is required'),
    body('size')
        .isInt({ min: 1 })
        .withMessage('File size must be a positive integer')
], async (req, res) => {
    try {
        // Check for validation errors
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({
                error: 'Validation failed',
                message: 'Please check your input data',
                details: errors.array()
            });
        }

        const { fileKey, fileType, fileName, mimeType, size } = req.body;
        const { user } = req;

        // Verify file exists in S3
        try {
            await s3.headObject({
                Bucket: BUCKET_NAME,
                Key: fileKey
            }).promise();
        } catch (s3Error) {
            if (s3Error.statusCode === 404) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The uploaded file was not found in storage'
                });
            }
            throw s3Error;
        }

        // Verify file key belongs to user
        if (!fileKey.startsWith(`${fileType}/${user._id}/`)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You can only confirm uploads for your own files'
            });
        }

        // NOTE:
        // S3 presigned URLs (SigV4) support a MAX of 7 days (604800 seconds).
        // Using longer expirations can create URLs that fail to load in browsers (video won't play).
        const downloadUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Expires: 604800 // 7 days (max for SigV4)
        });

        const stablePublicUrl = `/api/uploads/public/${encodeKeyForPath(fileKey)}`;

        // Update user profile if it's an avatar — store stable app URL (redirects to fresh S3 URL)
        if (fileType === 'avatar') {
            const User = require('../models/User');
            await User.findByIdAndUpdate(user._id, { avatarUrl: stablePublicUrl });
        }

        // Update user resume if it's a resume (presigned URL; documents are not served via /public)
        if (fileType === 'resume') {
            const User = require('../models/User');
            await User.findByIdAndUpdate(user._id, { resumeUrl: downloadUrl });
        }

        logger.info(`File upload confirmed for user ${user.email}: ${fileKey}`);

        res.json({
            message: 'File upload confirmed successfully',
            file: {
                key: fileKey,
                fileName,
                fileType,
                mimeType,
                size,
                downloadUrl,
                // Stable URL that redirects to a fresh presigned URL.
                // Use this for <video>/<audio> tags so playback doesn't break when URLs expire.
                streamUrl: `/api/uploads/stream?key=${encodeURIComponent(fileKey)}`,
                publicUrl: /^((image|booth-logo|organization-logo|avatar)\/)/.test(fileKey)
                    ? `/api/uploads/public/${encodeKeyForPath(fileKey)}`
                    : null,
                uploadedAt: new Date()
            }
        });
    } catch (error) {
        logger.error('File upload confirmation error:', error);
        res.status(500).json({
            error: 'Failed to confirm file upload',
            message: 'An error occurred while confirming the file upload'
        });
    }
});

/**
 * GET /api/uploads/public/*
 * Public image/logo proxy for stable image URLs.
 * No auth required; only serves safe image/logo key prefixes.
 */
router.get('/public/*', async (req, res) => {
    try {
        const rawPath = req.params[0];
        const decoded = decodeURIComponent(rawPath || '');
        const key = extractS3KeyFromUrl(decoded) || decoded;

        if (!key || !/^(image|booth-logo|organization-logo|avatar)\//.test(key)) {
            return res.status(400).json({
                error: 'Invalid key',
                message: 'Only image, avatar, organization-logo, and booth-logo keys are allowed'
            });
        }

        await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();

        const url = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 3600
        });

        return res.redirect(302, url);
    } catch (error) {
        if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
            return res.status(404).json({ error: 'Image not found' });
        }
        logger.error('Public media proxy error:', error);
        return res.status(500).json({ error: 'Failed to serve image' });
    }
});

/**
 * GET /api/uploads/stream?key=...&token=...
 * Redirect to a short-lived presigned URL for media playback (video/audio).
 *
 * Why:
 * - <video>/<audio> tags can't send Authorization headers
 * - long-lived presigned URLs expire / can be invalid
 * - redirecting generates a fresh short-lived URL each time
 */
router.get('/stream', authenticateTokenFromHeaderOrQuery, async (req, res) => {
    try {
        const { key } = req.query;
        const { user } = req;

        if (!key || typeof key !== 'string') {
            return res.status(400).json({
                error: 'Missing key',
                message: 'Query param `key` is required'
            });
        }

        // Basic ownership check: <type>/<userId>/...
        const parts = key.split('/');
        if (parts.length < 3) {
            return res.status(400).json({
                error: 'Invalid key',
                message: 'Invalid S3 key format'
            });
        }
        const userIdInKey = parts[1];
        if (userIdInKey !== user._id.toString() && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to access this file'
            });
        }

        // Ensure it exists
        await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();

        // Generate a short-lived URL for streaming (10 minutes)
        const url = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 600
        });

        // Redirect to S3
        return res.redirect(302, url);
    } catch (error) {
        logger.error('Stream redirect error:', error);
        return res.status(500).json({
            error: 'Failed to stream file',
            message: 'An error occurred while preparing the stream'
        });
    }
});

/**
 * GET /api/uploads/admin/resume-url?url=<s3-url>
 * Admin endpoint to generate a fresh presigned download URL for any resume file.
 * Accepts the stored S3 URL and returns a short-lived signed URL.
 */
router.get('/admin/resume-url', authenticateToken, requireRole(['SuperAdmin', 'Admin', 'AdminEvent', 'BoothAdmin', 'Recruiter', 'Support', 'GlobalSupport']), async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: 'Missing url query param' });
        }
        let key = extractS3KeyFromUrl(url) || url;

        // Support internal stream URLs such as /api/uploads/stream?key=resume/...
        if (typeof key === 'string' && key.startsWith('/api/uploads/stream')) {
            try {
                const parsed = new URL(key, 'http://localhost');
                key = parsed.searchParams.get('key') || key;
            } catch (_e) {
                // keep original key fallback
            }
        }

        // Support internal public-style paths by stripping known prefixes.
        if (typeof key === 'string' && key.startsWith('/api/uploads/public/')) {
            key = decodeURIComponent(key.replace('/api/uploads/public/', ''));
        }

        // If key still looks like a path, trim leading slashes.
        if (typeof key === 'string') {
            key = key.replace(/^\/+/, '');
        }

        if (!key || (!key.startsWith('resume/') && !key.startsWith('resumes/'))) {
            return res.status(400).json({ error: 'Invalid resume key' });
        }
        const signedUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 900 // 15 minutes
        });
        return res.json({ url: signedUrl });
    } catch (error) {
        logger.error('Admin resume presign error:', error);
        return res.status(500).json({ error: 'Failed to generate resume URL' });
    }
});

/**
 * GET /api/uploads/rte-content/*
 * Public image proxy for RTE-embedded images.
 * No authentication required so images render for all viewers (e.g. job seekers on booth pages).
 * Only serves keys that start with 'image/' for security.
 * Generates a fresh short-lived presigned URL and redirects to it.
 */
router.get('/rte-content/*', async (req, res) => {
    try {
        const key = req.params[0];
        if (!key || !key.startsWith('image/')) {
            return res.status(400).json({ error: 'Invalid key', message: 'Only image keys are allowed' });
        }

        // Verify the object exists
        await s3.headObject({ Bucket: BUCKET_NAME, Key: key }).promise();

        // Generate a short-lived presigned URL and redirect
        const url = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: 3600 // 1 hour
        });

        return res.redirect(302, url);
    } catch (error) {
        if (error.code === 'NotFound' || error.code === 'NoSuchKey') {
            return res.status(404).json({ error: 'Image not found' });
        }
        logger.error('RTE content image proxy error:', error);
        return res.status(500).json({ error: 'Failed to serve image' });
    }
});

/**
 * POST /api/uploads/rte-image
 * Receive an image from Syncfusion RTE's built-in uploader, store it in S3,
 * and return a stable proxy URL that never expires.
 * Syncfusion sends the file in a field named "UploadFiles".
 */
router.post('/rte-image', authenticateTokenFromHeaderOrQuery, upload.single('UploadFiles'), async (req, res) => {
    try {
        const file = req.file;
        if (!file) {
            return res.status(400).json({ error: 'No image file provided' });
        }

        const userId = req.user?.id || req.user?._id || 'anonymous';
        const safeName = (file.originalname || 'image.jpg').replace(/[^a-zA-Z0-9._-]/g, '_');
        const key = `image/${userId}/${uuidv4()}_${safeName}`;

        await s3.putObject({
            Bucket: BUCKET_NAME,
            Key: key,
            Body: file.buffer,
            ContentType: file.mimetype || 'image/jpeg',
        }).promise();

        // Return the stable proxy URL (served by GET /rte-content/*)
        return res.status(200).json({ url: `/api/uploads/rte-content/${key}` });
    } catch (error) {
        logger.error('RTE image upload error:', error);
        return res.status(500).json({ error: 'Image upload failed' });
    }
});

/**
 * GET /api/uploads/:fileKey
 * Get file download URL
 */
router.get('/:fileKey', authenticateToken, async (req, res) => {
    try {
        const { fileKey } = req.params;
        const { user } = req;

        // Verify file exists in S3
        let fileMetadata;
        try {
            const headResult = await s3.headObject({
                Bucket: BUCKET_NAME,
                Key: fileKey
            }).promise();
            fileMetadata = headResult.Metadata;
        } catch (s3Error) {
            if (s3Error.statusCode === 404) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file was not found'
                });
            }
            throw s3Error;
        }

        // Check if user has access to this file
        const fileUserId = fileMetadata?.userId;
        if (fileUserId && fileUserId !== user._id.toString() && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to access this file'
            });
        }

        // Generate download URL
        const downloadUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Expires: 3600 // 1 hour
        });

        res.json({
            message: 'Download URL generated successfully',
            downloadUrl,
            expiresIn: 3600,
            fileInfo: {
                key: fileKey,
                fileName: fileMetadata?.originalname || fileKey.split('/').pop(),
                fileType: fileMetadata?.filetype,
                size: fileMetadata?.size,
                lastModified: fileMetadata?.lastmodified
            }
        });
    } catch (error) {
        logger.error('File download URL generation error:', error);
        res.status(500).json({
            error: 'Failed to generate download URL',
            message: 'An error occurred while generating the download URL'
        });
    }
});

/**
 * DELETE /api/uploads/:fileKey
 * Delete a file
 */
router.delete('/:fileKey', authenticateToken, async (req, res) => {
    try {
        const { fileKey } = req.params;
        const { user } = req;

        // Verify file exists in S3
        let fileMetadata;
        try {
            const headResult = await s3.headObject({
                Bucket: BUCKET_NAME,
                Key: fileKey
            }).promise();
            fileMetadata = headResult.Metadata;
        } catch (s3Error) {
            if (s3Error.statusCode === 404) {
                return res.status(404).json({
                    error: 'File not found',
                    message: 'The requested file was not found'
                });
            }
            throw s3Error;
        }

        // Check if user has permission to delete this file
        const fileUserId = fileMetadata?.userId;
        if (fileUserId && fileUserId !== user._id.toString() && !['Admin', 'GlobalSupport'].includes(user.role)) {
            return res.status(403).json({
                error: 'Access denied',
                message: 'You do not have permission to delete this file'
            });
        }

        // Delete file from S3
        await s3.deleteObject({
            Bucket: BUCKET_NAME,
            Key: fileKey
        }).promise();

        // Update user profile if it was an avatar
        if (fileMetadata?.filetype === 'avatar') {
            const User = require('../models/User');
            await User.findByIdAndUpdate(user._id, { avatarUrl: null });
        }

        // Update user resume if it was a resume
        if (fileMetadata?.filetype === 'resume') {
            const User = require('../models/User');
            await User.findByIdAndUpdate(user._id, { resumeUrl: null });
        }

        logger.info(`File deleted by user ${user.email}: ${fileKey}`);

        res.json({
            message: 'File deleted successfully'
        });
    } catch (error) {
        logger.error('File deletion error:', error);
        res.status(500).json({
            error: 'Failed to delete file',
            message: 'An error occurred while deleting the file'
        });
    }
});

/**
 * GET /api/uploads/user/files
 * Get list of user's uploaded files
 */
router.get('/user/files', authenticateToken, async (req, res) => {
    try {
        const { user } = req;
        const { fileType, limit = 50 } = req.query;

        // Build prefix for S3 list operation
        let prefix = `user-uploads/${user._id}/`;
        if (fileType) {
            prefix += `${fileType}/`;
        }

        // List files in S3
        const listParams = {
            Bucket: BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: parseInt(limit)
        };

        const result = await s3.listObjectsV2(listParams).promise();

        const files = result.Contents.map(file => {
            const fileKey = file.Key;
            const fileName = fileKey.split('/').pop();
            const fileType = fileKey.split('/')[1]; // Extract file type from path

            return {
                key: fileKey,
                fileName,
                fileType,
                size: file.Size,
                lastModified: file.LastModified,
                downloadUrl: s3.getSignedUrl('getObject', {
                    Bucket: BUCKET_NAME,
                    Key: fileKey,
                    Expires: 3600
                })
            };
        });

        res.json({
            message: 'Files retrieved successfully',
            files,
            totalCount: result.KeyCount,
            hasMore: result.IsTruncated
        });
    } catch (error) {
        logger.error('File list retrieval error:', error);
        res.status(500).json({
            error: 'Failed to retrieve files',
            message: 'An error occurred while retrieving your files'
        });
    }
});

/**
 * GET /api/uploads/proxy/download
 * Proxy endpoint to download files from S3 (bypasses CORS)
 * Query param: url - The S3 presigned URL or file URL to download
 */
router.get('/proxy/download', authenticateToken, async (req, res) => {
    try {
        const { url } = req.query;
        
        if (!url) {
            return res.status(400).json({
                error: 'Missing URL',
                message: 'URL parameter is required'
            });
        }

        // Validate that the URL is from S3 (security check)
        const s3DomainPattern = /^https?:\/\/([^\/]+\.)?s3[\.-][^\/]+\.amazonaws\.com/;
        const isS3Url = s3DomainPattern.test(url);
        
        if (!isS3Url) {
            // Try to extract S3 key from presigned URL or check if it's a valid file URL
            // For now, we'll allow any HTTPS URL but log it
            if (!url.startsWith('https://')) {
                return res.status(400).json({
                    error: 'Invalid URL',
                    message: 'Only HTTPS URLs are allowed'
                });
            }
        }

        // Use axios or native fetch to download the file
        const https = require('https');
        const http = require('http');
        const { URL } = require('url');
        
        const fileUrl = new URL(url);
        const protocol = fileUrl.protocol === 'https:' ? https : http;

        // Download file from S3/URL
        const fileRequest = protocol.get(url, (fileResponse) => {
            // Check if response is successful
            if (fileResponse.statusCode !== 200) {
                return res.status(fileResponse.statusCode).json({
                    error: 'Download failed',
                    message: `Failed to download file: ${fileResponse.statusMessage}`
                });
            }

            // Set appropriate headers
            const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
            const contentDisposition = fileResponse.headers['content-disposition'] || 'attachment';
            
            res.setHeader('Content-Type', contentType);
            res.setHeader('Content-Disposition', contentDisposition);
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Expose-Headers', 'Content-Type, Content-Disposition');

            // Stream the file to the client
            fileResponse.pipe(res);
        });

        fileRequest.on('error', (error) => {
            logger.error('Error downloading file:', error);
            if (!res.headersSent) {
                res.status(500).json({
                    error: 'Download failed',
                    message: 'An error occurred while downloading the file'
                });
            }
        });

        // Handle timeout
        fileRequest.setTimeout(30000, () => {
            fileRequest.destroy();
            if (!res.headersSent) {
                res.status(504).json({
                    error: 'Download timeout',
                    message: 'The download request timed out'
                });
            }
        });

    } catch (error) {
        logger.error('File proxy download error:', error);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to download file',
                message: 'An error occurred while downloading the file'
            });
        }
    }
});

/**
 * POST /api/uploads/rte-video
 * Dummy endpoint for Syncfusion RTE video upload (intercepted by fileUploading event)
 * This endpoint is required for the RTE dialog to work, but it's never actually called
 * because we intercept the upload in the fileUploading event handler
 */
router.post('/rte-video', authenticateToken, (req, res) => {
    // This should never be reached as uploads are intercepted on the client side
    logger.warn('RTE video upload endpoint called - this should be intercepted on client side');
    res.status(400).json({
        error: 'Direct upload not supported',
        message: 'Please use the client-side upload handler'
    });
});

/**
 * POST /api/uploads/rte-audio
 * Dummy endpoint for Syncfusion RTE audio upload (intercepted by fileUploading event)
 * This endpoint is required for the RTE dialog to work, but it's never actually called
 * because we intercept the upload in the fileUploading event handler
 */
router.post('/rte-audio', authenticateToken, (req, res) => {
    // This should never be reached as uploads are intercepted on the client side
    logger.warn('RTE audio upload endpoint called - this should be intercepted on client side');
    res.status(400).json({
        error: 'Direct upload not supported',
        message: 'Please use the client-side upload handler'
    });
});

module.exports = router;
