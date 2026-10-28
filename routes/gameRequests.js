import express from 'express';
import GameRequest from '../models/GameRequest.js';
import { requireAuth } from '../middleware/auth.js';

const router = express.Router();
router.use(requireAuth);

export const MIN_REQUEST_LENGTH = 2;
export const MAX_REQUEST_LENGTH = 300;
export const MAX_REQUESTS_PER_DAY = 5;
const DAY_MS = 24 * 60 * 60 * 1000;

// Swappable in tests.
export const gameRequestDeps = {
    now: () => new Date(),
};

/**
 * POST /api/game-requests
 * Save a game the user wants added. Body: { text }
 */
router.post('/', async (req, res) => {
    try {
        const text = typeof req.body?.text === 'string' ? req.body.text.trim().replace(/\s+/g, ' ') : '';
        if (text.length < MIN_REQUEST_LENGTH) {
            return res.status(400).json({ success: false, code: 'text_required', error: 'Tell us which game you want' });
        }
        if (text.length > MAX_REQUEST_LENGTH) {
            return res.status(400).json({ success: false, code: 'text_too_long', error: `Keep it under ${MAX_REQUEST_LENGTH} characters` });
        }

        const userId = req.auth.userId;
        const now = gameRequestDeps.now();
        const recent = await GameRequest.countDocuments({
            userId,
            createdAt: { $gte: new Date(now.getTime() - DAY_MS) },
        });
        if (recent >= MAX_REQUESTS_PER_DAY) {
            return res.status(429).json({ success: false, code: 'request_limit', error: 'Thanks! You have sent enough ideas for today' });
        }

        const request = await GameRequest.create({ userId, text });
        return res.status(201).json({ success: true, data: { id: String(request._id) } });
    } catch (error) {
        console.error('🎮 [GAME REQUESTS] Save failed:', error);
        return res.status(500).json({ success: false, error: 'Could not send your request' });
    }
});

export default router;
