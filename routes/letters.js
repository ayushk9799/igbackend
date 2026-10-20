import express from 'express';
import mongoose from 'mongoose';
import Couple from '../models/Couple.js';
import Letter from '../models/Letter.js';
import User from '../models/User.js';
import { requireAuth } from '../middleware/auth.js';
import { getCouplePremiumStatus } from '../utils/couplePremium.js';
import {
    LETTER_BIRDS,
    LetterError,
    MAX_LETTERS_IN_FLIGHT_PER_SENDER,
    buildLetterRoute,
    computeDeliverAt,
    getBird,
    haversineKm,
    normalizeLetterBody,
    serializeLetter,
    toCityPoint,
} from '../services/letters/letterRules.js';
import { deliverDueLetters } from '../services/letters/delivery.js';
import {
    notifyLetterRead,
    notifyLetterRecalled,
    notifyLetterSent,
} from '../services/letters/letterEvents.js';

const router = express.Router();
router.use(requireAuth);

// Swappable in tests so handlers run without Firebase, sockets or billing.
export const letterDeps = {
    getCouplePremiumStatus,
    deliverDueLetters,
    notifyLetterSent,
    notifyLetterRead,
    notifyLetterRecalled,
    now: () => new Date(),
};

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 50;
const LIST_STATUSES = new Set(['flying', 'delivered']);

const idOf = (value) => String(value?._id || value || '');
const isValidObjectId = (value) => mongoose.Types.ObjectId.isValid(value);

const handle = (fn) => async (req, res) => {
    try {
        await fn(req, res);
    } catch (error) {
        if (error instanceof LetterError) {
            return res.status(error.status).json({ success: false, code: error.code, error: error.message });
        }
        console.error('💌 [LETTERS] Request failed:', error);
        return res.status(500).json({ success: false, error: 'Something went wrong with your letter' });
    }
};

const runInBackground = (task, label) => {
    Promise.resolve()
        .then(task)
        .catch((error) => console.error(`💌 [LETTERS] ${label} failed:`, error));
};

const loadCoupleContext = async (userId) => {
    const couple = await Couple.findByPartner(userId);
    if (!couple) throw new LetterError(409, 'no_partner', 'Connect with your partner to send letters');
    const partnerId = idOf(couple.partner1) === String(userId) ? idOf(couple.partner2) : idOf(couple.partner1);
    return { couple, partnerId };
};

const loadLetterForViewer = async (letterId, userId, couple) => {
    if (!isValidObjectId(letterId)) throw new LetterError(400, 'invalid_letter_id', 'Invalid letter id');
    const letter = await Letter.findOne({ _id: letterId, coupleId: couple._id });
    const isSender = letter && idOf(letter.senderId) === String(userId);
    // A recalled letter never reached the recipient, so it doesn't exist for them.
    if (!letter || (letter.status === 'recalled' && !isSender)) {
        throw new LetterError(404, 'letter_not_found', 'Letter not found');
    }
    return letter;
};

const parseLimit = (value) => {
    const limit = Number.parseInt(value, 10);
    if (!Number.isFinite(limit) || limit < 1) return DEFAULT_LIMIT;
    return Math.min(limit, MAX_LIMIT);
};

router.get('/birds', handle(async (req, res) => {
    const user = await User.findById(req.auth.userId);
    if (!user) throw new LetterError(404, 'user_not_found', 'User not found');
    const premium = await letterDeps.getCouplePremiumStatus(user);
    res.json({
        success: true,
        data: LETTER_BIRDS.map((bird) => ({
            id: bird.id,
            name: bird.name,
            travelMs: bird.travelMs,
            premium: bird.premium,
            unlocked: !bird.premium || premium.isPremium === true,
        })),
    });
}));

// City-level points for each partner, for drawing the map before any
// letter exists. A point is null when that partner isn't sharing a location.
router.get('/map', handle(async (req, res) => {
    const userId = req.auth.userId;
    const { partnerId } = await loadCoupleContext(userId);
    const [user, partner] = await Promise.all([
        User.findById(userId).select('location locationSharingEnabled').lean(),
        User.findById(partnerId).select('location locationSharingEnabled').lean(),
    ]);
    const you = toCityPoint(user);
    const partnerPoint = toCityPoint(partner);
    res.json({
        success: true,
        data: {
            you,
            partner: partnerPoint,
            distanceKm: you && partnerPoint ? Math.round(haversineKm(you, partnerPoint)) : null,
        },
    });
}));

router.get('/', handle(async (req, res) => {
    const userId = req.auth.userId;
    const { couple } = await loadCoupleContext(userId);
    const now = letterDeps.now();

    // Deliver anything already due so the list never shows a late bird.
    await letterDeps.deliverDueLetters({ now, filter: { coupleId: couple._id } });

    const status = LIST_STATUSES.has(req.query.status) ? req.query.status : null;
    const limit = parseLimit(req.query.limit);
    const before = req.query.before ? new Date(req.query.before) : null;

    const query = {
        coupleId: couple._id,
        status: status || { $in: ['flying', 'delivered'] },
        ...(before && !Number.isNaN(before.getTime()) ? { sentAt: { $lt: before } } : {}),
    };

    const [letters, flyingCount, deliveredCount] = await Promise.all([
        Letter.find(query).sort({ sentAt: -1 }).limit(limit + 1),
        Letter.countDocuments({ coupleId: couple._id, status: 'flying' }),
        Letter.countDocuments({ coupleId: couple._id, status: 'delivered' }),
    ]);

    const page = letters.slice(0, limit);
    res.json({
        success: true,
        data: {
            letters: page.map((letter) => serializeLetter(letter, userId, now)),
            counts: { flying: flyingCount, delivered: deliveredCount },
            nextCursor: letters.length > limit ? new Date(page[page.length - 1].sentAt).toISOString() : null,
            serverNow: now.toISOString(),
        },
    });
}));

router.get('/:id', handle(async (req, res) => {
    const userId = req.auth.userId;
    const { couple } = await loadCoupleContext(userId);
    const now = letterDeps.now();
    let letter = await loadLetterForViewer(req.params.id, userId, couple);

    if (letter.status === 'flying' && new Date(letter.deliverAt) <= now) {
        await letterDeps.deliverDueLetters({ now, filter: { _id: letter._id } });
        letter = await loadLetterForViewer(req.params.id, userId, couple);
    }

    res.json({ success: true, data: { letter: serializeLetter(letter, userId, now), serverNow: now.toISOString() } });
}));

router.post('/', handle(async (req, res) => {
    const userId = req.auth.userId;
    const body = normalizeLetterBody(req.body?.body);
    const bird = getBird(req.body?.bird);
    if (!bird) throw new LetterError(400, 'invalid_bird', 'Pick a bird to carry your letter');

    const { couple, partnerId } = await loadCoupleContext(userId);
    const [sender, recipient] = await Promise.all([User.findById(userId), User.findById(partnerId)]);
    if (!sender || !recipient) throw new LetterError(404, 'user_not_found', 'User not found');

    if (bird.premium) {
        const premium = await letterDeps.getCouplePremiumStatus(sender);
        if (premium.isPremium !== true) {
            throw new LetterError(403, 'premium_required', `${bird.name} is a Premium bird`);
        }
    }

    const inFlight = await Letter.countDocuments({ senderId: userId, status: 'flying' });
    if (inFlight >= MAX_LETTERS_IN_FLIGHT_PER_SENDER) {
        throw new LetterError(429, 'too_many_in_flight', 'Too many birds in the sky. Wait for one to land.');
    }

    const sentAt = letterDeps.now();
    const letter = await Letter.create({
        coupleId: couple._id,
        senderId: userId,
        recipientId: partnerId,
        body,
        bird: bird.id,
        status: 'flying',
        sentAt,
        deliverAt: computeDeliverAt(bird.id, sentAt),
        route: buildLetterRoute(sender, recipient),
    });

    runInBackground(() => letterDeps.notifyLetterSent(letter), 'Sent notification');

    res.status(201).json({
        success: true,
        data: { letter: serializeLetter(letter, userId, sentAt), serverNow: sentAt.toISOString() },
    });
}));

router.post('/:id/recall', handle(async (req, res) => {
    const userId = req.auth.userId;
    if (!isValidObjectId(req.params.id)) throw new LetterError(400, 'invalid_letter_id', 'Invalid letter id');
    const { couple } = await loadCoupleContext(userId);
    const now = letterDeps.now();

    const letter = await Letter.findOneAndUpdate(
        { _id: req.params.id, coupleId: couple._id, senderId: userId, status: 'flying', deliverAt: { $gt: now } },
        { $set: { status: 'recalled', recalledAt: now } },
        { new: true },
    );
    if (!letter) throw new LetterError(409, 'cannot_recall', 'This bird has already landed');

    letterDeps.notifyLetterRecalled(letter);
    res.json({ success: true, data: { letter: serializeLetter(letter, userId, now) } });
}));

router.post('/:id/read', handle(async (req, res) => {
    const userId = req.auth.userId;
    if (!isValidObjectId(req.params.id)) throw new LetterError(400, 'invalid_letter_id', 'Invalid letter id');
    const { couple } = await loadCoupleContext(userId);
    const now = letterDeps.now();

    const firstRead = await Letter.findOneAndUpdate(
        { _id: req.params.id, coupleId: couple._id, recipientId: userId, status: 'delivered', readAt: null },
        { $set: { readAt: now } },
        { new: true },
    );
    if (firstRead) {
        runInBackground(() => letterDeps.notifyLetterRead(firstRead), 'Read notification');
        return res.json({ success: true, data: { letter: serializeLetter(firstRead, userId, now) } });
    }

    // Opening a letter twice is fine; only the first open tells the sender.
    const letter = await loadLetterForViewer(req.params.id, userId, couple);
    if (idOf(letter.recipientId) !== String(userId) || letter.status !== 'delivered') {
        throw new LetterError(409, 'not_delivered', 'This letter hasn’t landed yet');
    }
    res.json({ success: true, data: { letter: serializeLetter(letter, userId, now) } });
}));

export default router;
