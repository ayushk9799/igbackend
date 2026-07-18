import express from 'express';
import mongoose from 'mongoose';
import Couple from '../models/Couple.js';
import Memory from '../models/Memory.js';
import User from '../models/User.js';
import { sendMemoryNotification } from '../utils/pushNotification.js';

const router = express.Router();

const MAX_LIMIT = 30;
const DEFAULT_LIMIT = 20;
const CAPTION_MAX_LENGTH = 500;
const TITLE_MAX_LENGTH = 80;
const ICON_KEY_MAX_LENGTH = 40;
const VALID_CAPTURED_AT_SOURCES = new Set(['exif', 'manual', 'upload_time']);
const VALID_ENTRY_TYPES = new Set(['memory', 'special_date', 'photo', 'moment', 'date']);

const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const trimCaption = (caption = '') => String(caption || '').trim().slice(0, CAPTION_MAX_LENGTH);
const trimTitle = (title = '') => String(title || '').trim().slice(0, TITLE_MAX_LENGTH);
const trimIconKey = (iconKey = 'ring') => String(iconKey || 'ring').trim().slice(0, ICON_KEY_MAX_LENGTH);

const normalizeEntryType = (entryType) => {
    if (entryType === 'date') return 'special_date';
    if (entryType === 'photo' || entryType === 'moment') return 'memory';
    return VALID_ENTRY_TYPES.has(entryType) ? entryType : 'memory';
};

const parseDate = (value) => {
    if (!value) return null;

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const encodeCursor = (memory) => Buffer.from(JSON.stringify({
    capturedAt: memory.capturedAt.toISOString(),
    id: memory._id.toString(),
})).toString('base64url');

const decodeCursor = (cursor) => {
    if (!cursor) return null;

    try {
        const decoded = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        const capturedAt = parseDate(decoded.capturedAt);

        if (!capturedAt || !isValidObjectId(decoded.id)) {
            return null;
        }

        return {
            capturedAt,
            id: new mongoose.Types.ObjectId(decoded.id),
        };
    } catch {
        return null;
    }
};

const getActiveCoupleForUser = async (userId) => {
    if (!isValidObjectId(userId)) {
        return null;
    }

    return Couple.findByPartner(userId);
};

const getPartnerIdFromCouple = (couple, userId) => {
    const currentUserId = userId.toString();
    const partner1 = couple.partner1?.toString();
    const partner2 = couple.partner2?.toString();

    if (partner1 === currentUserId) return partner2;
    if (partner2 === currentUserId) return partner1;
    return null;
};

const buildCursorQuery = (cursorData) => {
    if (!cursorData) return {};

    return {
        $or: [
            { capturedAt: { $gt: cursorData.capturedAt } },
            {
                capturedAt: cursorData.capturedAt,
                _id: { $gt: cursorData.id },
            },
        ],
    };
};

router.post('/', async (req, res) => {
    try {
        const {
            userId,
            entryType = 'memory',
            iconKey = 'ring',
            title = '',
            imageUrl,
            fileKey,
            width,
            height,
            capturedAt,
            capturedAtSource = 'upload_time',
            caption = '',
        } = req.body;

        const safeEntryType = normalizeEntryType(entryType);
        const safeIconKey = trimIconKey(iconKey);
        const safeTitle = trimTitle(title);
        const safeCaption = trimCaption(caption);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required',
            });
        }

        if (!safeTitle && !safeCaption) {
            return res.status(400).json({
                success: false,
                message: 'Add a title or note for this timeline entry',
            });
        }

        const couple = await getActiveCoupleForUser(userId);
        if (!couple) {
            return res.status(403).json({
                success: false,
                message: 'Active couple not found for this user',
            });
        }

        const parsedCapturedAt = parseDate(capturedAt) || new Date();
        const safeSource = VALID_CAPTURED_AT_SOURCES.has(capturedAtSource)
            ? capturedAtSource
            : 'upload_time';

        const memory = await Memory.create({
            coupleId: couple._id,
            createdBy: userId,
            entryType: safeEntryType,
            iconKey: safeIconKey,
            title: safeTitle,
            imageUrl,
            fileKey,
            width: Number(width) > 0 ? Number(width) : undefined,
            height: Number(height) > 0 ? Number(height) : undefined,
            capturedAt: parsedCapturedAt,
            capturedAtSource: safeSource,
            caption: safeCaption,
        });

        const partnerId = getPartnerIdFromCouple(couple, userId);
        if (partnerId) {
            const creator = await User.findById(userId).select('name nickname').lean();
            const senderName = creator?.nickname || creator?.name || 'Your partner';
            const notificationSent = await sendMemoryNotification(partnerId, senderName, memory);

            if (!notificationSent) {
                console.warn('📷 [MEMORIES] Timeline saved, but partner notification was not delivered');
            }
        }

        res.status(201).json({
            success: true,
            data: memory,
        });
    } catch (error) {
        console.error('📷 [MEMORIES] ❌ Create error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create memory',
            error: error.message,
        });
    }
});

router.get('/', async (req, res) => {
    try {
        const { userId, cursor } = req.query;
        const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required',
            });
        }

        const couple = await getActiveCoupleForUser(userId);
        if (!couple) {
            return res.status(403).json({
                success: false,
                message: 'Active couple not found for this user',
            });
        }

        const cursorData = decodeCursor(cursor);
        if (cursor && !cursorData) {
            return res.status(400).json({
                success: false,
                message: 'Invalid cursor',
            });
        }

        const query = {
            coupleId: couple._id,
            deletedAt: null,
            ...buildCursorQuery(cursorData),
        };

        const memories = await Memory.find(query)
            .sort({ capturedAt: 1, _id: 1 })
            .limit(limit + 1)
            .lean();

        const hasMore = memories.length > limit;
        const page = hasMore ? memories.slice(0, limit) : memories;
        const nextCursor = hasMore && page.length > 0 ? encodeCursor(page[page.length - 1]) : null;

        res.status(200).json({
            success: true,
            data: {
                memories: page,
                nextCursor,
                hasMore,
            },
        });
    } catch (error) {
        console.error('📷 [MEMORIES] ❌ List error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch memories',
            error: error.message,
        });
    }
});

router.patch('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId, title, caption, capturedAt, iconKey } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid memory id',
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required',
            });
        }

        const couple = await getActiveCoupleForUser(userId);
        if (!couple) {
            return res.status(403).json({
                success: false,
                message: 'Active couple not found for this user',
            });
        }

        const updates = {};
        if (title !== undefined) {
            updates.title = trimTitle(title);
        }

        if (iconKey !== undefined) {
            updates.iconKey = trimIconKey(iconKey);
        }

        if (caption !== undefined) {
            updates.caption = trimCaption(caption);
        }

        if (capturedAt !== undefined) {
            const parsedCapturedAt = parseDate(capturedAt);
            if (!parsedCapturedAt) {
                return res.status(400).json({
                    success: false,
                    message: 'capturedAt must be a valid date',
                });
            }

            updates.capturedAt = parsedCapturedAt;
            updates.capturedAtSource = 'manual';
        }

        const memory = await Memory.findOneAndUpdate(
            { _id: id, coupleId: couple._id, deletedAt: null },
            { $set: updates },
            { new: true }
        );

        if (!memory) {
            return res.status(404).json({
                success: false,
                message: 'Memory not found',
            });
        }

        res.status(200).json({
            success: true,
            data: memory,
        });
    } catch (error) {
        console.error('📷 [MEMORIES] ❌ Update error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update memory',
            error: error.message,
        });
    }
});

router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;

        if (!isValidObjectId(id)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid memory id',
            });
        }

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required',
            });
        }

        const couple = await getActiveCoupleForUser(userId);
        if (!couple) {
            return res.status(403).json({
                success: false,
                message: 'Active couple not found for this user',
            });
        }

        const memory = await Memory.findOneAndUpdate(
            { _id: id, coupleId: couple._id, deletedAt: null },
            { $set: { deletedAt: new Date() } },
            { new: true }
        );

        if (!memory) {
            return res.status(404).json({
                success: false,
                message: 'Memory not found',
            });
        }

        res.status(200).json({
            success: true,
            data: { id: memory._id },
        });
    } catch (error) {
        console.error('📷 [MEMORIES] ❌ Delete error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to delete memory',
            error: error.message,
        });
    }
});

export default router;
