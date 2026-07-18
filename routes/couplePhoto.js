import express from 'express';
import 'dotenv/config';
import { DeleteObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import mongoose from 'mongoose';
import Couple from '../models/Couple.js';
import User from '../models/User.js';
import { getIO } from '../socket/index.js';
import { getCoupleRoomId } from '../socket/auth.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const router = express.Router();
const BUCKET_NAME = process.env.AWS_S3_BUCKET;
const REGION = process.env.AWS_REGION || 'ap-south-1';
const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/heic', 'image/heif']);

const s3Client = new S3Client({
    region: REGION,
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    },
});

const findContext = async (userId) => {
    if (!mongoose.Types.ObjectId.isValid(userId)) return null;
    const couple = await Couple.findByPartner(userId);
    if (!couple) return null;

    const id = String(userId);
    const isPartner1 = String(couple.partner1) === id;
    const isPartner2 = String(couple.partner2) === id;
    if (!isPartner1 && !isPartner2) return null;

    return {
        couple,
        slot: isPartner1 ? 'partner1CurrentPhoto' : 'partner2CurrentPhoto',
        partnerSlot: isPartner1 ? 'partner2CurrentPhoto' : 'partner1CurrentPhoto',
        partnerId: String(isPartner1 ? couple.partner2 : couple.partner1),
    };
};

const normalizePhoto = (photo, ownerId) => {
    if (!photo?.fileKey || !photo?.imageUrl) return null;
    return {
        ownerId: String(ownerId),
        fileKey: photo.fileKey,
        imageUrl: photo.imageUrl,
        width: photo.width || null,
        height: photo.height || null,
        mimeType: photo.mimeType || 'image/jpeg',
        revision: Number(photo.revision) || 0,
        updatedAt: photo.updatedAt?.toISOString?.() || photo.updatedAt || null,
    };
};

const buildResponse = (context) => ({
    myPhoto: normalizePhoto(context.couple[context.slot], context.slot === 'partner1CurrentPhoto'
        ? context.couple.partner1
        : context.couple.partner2),
    partnerPhoto: normalizePhoto(context.couple[context.partnerSlot], context.partnerId),
});

router.get('/current', async (req, res) => {
    try {
        const context = await findContext(req.query.userId);
        if (!context) {
            return res.status(403).json({ success: false, message: 'Active couple not found' });
        }
        return res.json({ success: true, data: buildResponse(context) });
    } catch (error) {
        console.error('Couple photo fetch error:', error);
        return res.status(500).json({ success: false, message: 'Failed to fetch current photo' });
    }
});

router.post('/upload-url', async (req, res) => {
    try {
        const { userId, fileType = 'image/jpeg' } = req.body;
        const context = await findContext(userId);
        if (!context) {
            return res.status(403).json({ success: false, message: 'Active couple not found' });
        }
        if (!ALLOWED_TYPES.has(fileType)) {
            return res.status(400).json({ success: false, message: 'Unsupported image type' });
        }
        if (!BUCKET_NAME) {
            return res.status(500).json({ success: false, message: 'Photo storage is not configured' });
        }

        const revision = Date.now();
        const extension = fileType === 'image/png' ? 'png' : 'jpg';
        const fileKey = `couple-photos/${context.couple._id}/${userId}/${revision}.${extension}`;
        const command = new PutObjectCommand({
            Bucket: BUCKET_NAME,
            Key: fileKey,
            ContentType: fileType,
        });
        const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });
        const imageUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileKey}`;

        return res.json({
            success: true,
            data: { presignedUrl, imageUrl, fileKey, revision, expiresIn: 900 },
        });
    } catch (error) {
        console.error('Couple photo upload URL error:', error);
        return res.status(500).json({ success: false, message: 'Failed to prepare photo upload' });
    }
});

router.put('/current', async (req, res) => {
    try {
        const { userId, fileKey, width, height, mimeType = 'image/jpeg', revision } = req.body;
        const context = await findContext(userId);
        if (!context) {
            return res.status(403).json({ success: false, message: 'Active couple not found' });
        }

        const ownedPrefix = `couple-photos/${context.couple._id}/${userId}/`;
        if (!fileKey?.startsWith(ownedPrefix) || !ALLOWED_TYPES.has(mimeType)) {
            return res.status(400).json({ success: false, message: 'Invalid uploaded photo' });
        }

        const previousFileKey = context.couple[context.slot]?.fileKey;
        const now = new Date();
        const safeRevision = Number(revision) || now.getTime();
        const existingRevision = Number(context.couple[context.slot]?.revision) || 0;
        if (safeRevision <= existingRevision) {
            return res.status(409).json({ success: false, message: 'A newer photo is already active' });
        }
        const imageUrl = `https://${BUCKET_NAME}.s3.${REGION}.amazonaws.com/${fileKey}`;
        const photo = {
            fileKey,
            imageUrl,
            width: Number(width) > 0 ? Number(width) : undefined,
            height: Number(height) > 0 ? Number(height) : undefined,
            mimeType,
            revision: safeRevision,
            updatedAt: now,
        };

        context.couple.set(context.slot, photo);
        await context.couple.save();

        const sender = await User.findById(userId).select('name nickname').lean();
        const payload = {
            photo: normalizePhoto(context.couple[context.slot], userId),
            senderName: sender?.nickname || sender?.name || 'Your partner',
        };
        const roomId = getCoupleRoomId(String(userId), context.partnerId);
        if (roomId) getIO()?.to(roomId).emit('couple-photo:updated', payload);

        void sendPushNotification(
            context.partnerId,
            'New photo from your partner 💕',
            `${payload.senderName} sent you a photo`,
            {
                type: 'couple_photo',
                imageUrl,
                revision: safeRevision,
                senderName: payload.senderName,
            }
        );

        if (previousFileKey && previousFileKey !== fileKey) {
            void s3Client.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: previousFileKey }))
                .catch(error => console.error('Failed to remove replaced couple photo:', error));
        }

        return res.json({ success: true, data: buildResponse(context) });
    } catch (error) {
        console.error('Couple photo update error:', error);
        return res.status(500).json({ success: false, message: 'Failed to save current photo' });
    }
});

export default router;
