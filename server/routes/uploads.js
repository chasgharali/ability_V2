const express = require('express');
const { body, validationResult } = require('express-validator');
const AWS = require('aws-sdk');
const { v4: uuidv4 } = require('uuid');
const { authenticateToken } = require('../middleware/auth');
const logger = require('../utils/logger');

const router = express.Router();

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
        .isIn(['resume', 'document', 'image', 'audio', 'video', 'avatar'])
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
            video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
            avatar: ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
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
            avatar: 2 * 1024 * 1024 // 2MB
        };

        const maxSize = maxSizes[fileType];
        if (!maxSize) {
            return res.status(400).json({
                error: 'Invalid file type',
                message: 'Unsupported file type'
            });
        }

        // Generate unique file key
        const fileExtension = fileName.split('.').pop();
        const uniqueFileName = `${fileType}/${user._id}/${uuidv4()}.${fileExtension}`;

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
        .isIn(['resume', 'document', 'image', 'audio', 'video', 'avatar'])
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

        // Generate permanent download URL
        const downloadUrl = s3.getSignedUrl('getObject', {
            Bucket: BUCKET_NAME,
            Key: fileKey,
            Expires: 31536000 // 1 year
        });

        // Update user profile if it's an avatar
        if (fileType === 'avatar') {
            const User = require('../models/User');
            await User.findByIdAndUpdate(user._id, { avatarUrl: downloadUrl });
        }

        // Update user resume if it's a resume
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

module.exports = router;
