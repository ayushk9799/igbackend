import express from 'express';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import dotenv from 'dotenv';
import { requireAuth } from '../middleware/auth.js';
dotenv.config();

const router = express.Router();
router.use(requireAuth);

// Initialize S3 Client
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const ALLOWED_FOLDERS = new Set([
    'uploads',
    'avatars',
    'puzzles',
    'memories',
    'daily-photos',
    'voice-recordings',
]);
const ALLOWED_FILE_TYPES = new Set([
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'audio/m4a',
    'audio/mp4',
]);

const validateUploadInput = (fileName, fileType, folder) => (
    typeof fileName === 'string'
    && fileName.length > 0
    && fileName.length <= 160
    && ALLOWED_FILE_TYPES.has(fileType)
    && ALLOWED_FOLDERS.has(folder)
);

/**
 * POST /api/upload/presigned-url
 * Generate a presigned URL for uploading a file to S3
 * 
 * Body: {
 *   fileName: string,      // Original file name
 *   fileType: string,      // MIME type (e.g., 'image/jpeg', 'image/png')
 *   folder?: string        // Optional folder path (e.g., 'daily-photos', 'profile-pics')
 * }
 */
router.post('/presigned-url', async (req, res) => {
 
    try {
        const { fileName, fileType, folder = 'uploads' } = req.body;

        if (!validateUploadInput(fileName, fileType, folder)) {
            return res.status(400).json({
                success: false,
                message: 'Unsupported file name, type, or upload folder'
            });
        }

        // Generate unique file key
        const timestamp = Date.now();
        const randomString = Math.random().toString(36).substring(2, 8);
        const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
        const fileKey = `${folder}/${timestamp}-${randomString}-${sanitizedFileName}`;


        // Create the presigned URL for upload
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType
        });

        const presignedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600 // URL expires in 1 hour
        });

        // The public URL to access the file after upload
        const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${fileKey}`;

       

        res.status(200).json({
            success: true,
            data: {
                presignedUrl,
                publicUrl,
                fileKey,
                expiresIn: 3600
            }
        });
    } catch (error) {
        console.error('📤 [UPLOAD] ❌ Error generating presigned URL:', error);
        console.error('📤 [UPLOAD] Error stack:', error.stack);
        res.status(500).json({
            success: false,
            message: 'Failed to generate presigned URL',
            error: error.message
        });
    }
});

/**
 * POST /api/upload/presigned-url/batch
 * Generate multiple presigned URLs at once
 * 
 * Body: {
 *   files: [{ fileName: string, fileType: string }],
 *   folder?: string
 * }
 */
router.post('/presigned-url/batch', async (req, res) => {
    try {
        const { files, folder = 'uploads' } = req.body;

        if (!Array.isArray(files) || files.length === 0) {
            return res.status(400).json({
                success: false,
                message: 'files array is required and must not be empty'
            });
        }

        if (files.length > 10) {
            return res.status(400).json({
                success: false,
                message: 'Maximum 10 files allowed per batch'
            });
        }
        if (!ALLOWED_FOLDERS.has(folder) || files.some(({ fileName, fileType }) => (
            !validateUploadInput(fileName, fileType, folder)
        ))) {
            return res.status(400).json({
                success: false,
                message: 'One or more files have an unsupported name, type, or folder'
            });
        }

        const results = await Promise.all(
            files.map(async ({ fileName, fileType }) => {
                const timestamp = Date.now();
                const randomString = Math.random().toString(36).substring(2, 8);
                const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
                const fileKey = `${folder}/${timestamp}-${randomString}-${sanitizedFileName}`;

                const command = new PutObjectCommand({
                    Bucket: BUCKET_NAME,
                    Key: fileKey,
                    ContentType: fileType
                });

                const presignedUrl = await getSignedUrl(s3Client, command, {
                    expiresIn: 3600
                });

                const publicUrl = `https://${BUCKET_NAME}.s3.${process.env.AWS_REGION || 'ap-south-1'}.amazonaws.com/${fileKey}`;

                return {
                    fileName,
                    presignedUrl,
                    publicUrl,
                    fileKey
                };
            })
        );

        res.status(200).json({
            success: true,
            data: {
                files: results,
                expiresIn: 3600
            }
        });
    } catch (error) {
        console.error('Error generating batch presigned URLs:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate presigned URLs',
            error: error.message
        });
    }
});

/**
 * POST /api/upload/presigned-url/download
 * Generate a presigned URL for downloading/viewing a file from S3
 * 
 * Body: {
 *   fileKey: string  // The S3 key of the file
 * }
 */
router.post('/presigned-url/download', async (req, res) => {
    try {
        const { fileKey } = req.body;

        if (!fileKey) {
            return res.status(400).json({
                success: false,
                message: 'fileKey is required'
            });
        }

        const command = new GetObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey
        });

        const presignedUrl = await getSignedUrl(s3Client, command, {
            expiresIn: 3600
        });

        res.status(200).json({
            success: true,
            data: {
                presignedUrl,
                fileKey,
                expiresIn: 3600
            }
        });
    } catch (error) {
        console.error('Error generating download presigned URL:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to generate download URL',
            error: error.message
        });
    }
});

export default router;
