import express from 'express';
import mongoose from 'mongoose';
import Couple from '../models/Couple.js';
import { verifyCurrentScribbleSignature } from '../utils/scribbleWidgetAccess.js';

const router = express.Router();

/**
 * GET /api/scribbles/current/:coupleId/widget?recipient=...&signature=...
 * Returns the one current shared canvas to the iOS notification extension.
 */
router.get('/current/:coupleId/widget', async (req, res) => {
    try {
        const { coupleId } = req.params;
        const recipientId = typeof req.query.recipient === 'string' ? req.query.recipient : '';
        const signature = typeof req.query.signature === 'string' ? req.query.signature : '';

        if (
            !mongoose.isValidObjectId(coupleId)
            || !mongoose.isValidObjectId(recipientId)
            || !verifyCurrentScribbleSignature(coupleId, recipientId, signature)
        ) {
            return res.status(404).json({ success: false, error: 'Current scribble not found' });
        }

        const couple = await Couple.findOne({
            _id: coupleId,
            status: 'active',
            $or: [
                { partner1: recipientId },
                { partner2: recipientId },
            ],
        }).lean();

        const scribble = couple?.liveScribble;
        if (!scribble || !Array.isArray(scribble.paths) || !scribble.updatedAt) {
            return res.status(404).json({ success: false, error: 'Current scribble not found' });
        }

        res.set('Cache-Control', 'private, no-store');
        return res.json({
            success: true,
            data: {
                paths: scribble.paths,
                canvasWidth: scribble.canvasWidth,
                canvasHeight: scribble.canvasHeight,
                senderName: scribble.updatedByUserName || 'Your Love',
                timestamp: scribble.updatedAt.toISOString(),
                canvasRevision: scribble.updatedAt.getTime(),
            },
        });
    } catch (error) {
        console.error('Current scribble widget fetch error:', error);
        return res.status(500).json({ success: false, error: 'Failed to fetch current scribble' });
    }
});

export default router;
