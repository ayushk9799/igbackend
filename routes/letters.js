import express from 'express';
import mongoose from 'mongoose';
import Couple from '../models/Couple.js';
import Letter, { LETTER_PAPER_IDS, LETTER_TEXT_SIZE_IDS } from '../models/Letter.js';
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
    parseLetterLocation,
    serializeLetter,
    toCityPoint,
} from '../services/letters/letterRules.js';
import { deliverDueLetters } from '../services/letters/delivery.js';
import {
    notifyLetterRead,
    notifyLetterRecalled,
    notifyLetterSent,
    notifyLocationNudge,
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
    notifyLocationNudge,
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

const LOCATION_FIELDS = 'location locationSharingEnabled';

const loadCouplePoints = async (userId, partnerId) => {
    const [user, partner] = await Promise.all([
        User.findById(userId).select(LOCATION_FIELDS).lean(),
        User.findById(partnerId).select(LOCATION_FIELDS).lean(),
    ]);
    return { user, partner };
};

// A bird sent before both partners had a location flies a decorative path. Once the missing
// end is known, give the birds still in the air the real route. The spot a letter was sent
// from never changes.
const backfillDecorativeRoutes = async (couple, userId, partnerId) => {
    const pending = await Letter.find({ coupleId: couple._id, status: 'flying', 'route.isDecorative': true })
        .select('senderId route')
        .lean();
    if (!pending.length) return;
    const { user, partner } = await loadCouplePoints(userId, partnerId);
    const updates = pending
        .map((letter) => {
            const sentByMe = idOf(letter.senderId) === String(userId);
            const route = buildLetterRoute(
                sentByMe ? user : partner,
                sentByMe ? partner : user,
                letter.route?.from || null,
                letter.route?.to || null,
            );
            return route.isDecorative ? null : { updateOne: { filter: { _id: letter._id }, update: { $set: { route } } } };
        })
        .filter(Boolean);
    if (updates.length) await Letter.bulkWrite(updates);
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
    const { user, partner } = await loadCouplePoints(userId, partnerId);
    const you = toCityPoint(user);
    const partnerPoint = toCityPoint(partner);
    // Tells the app which location card to show.
    const reason = !you ? 'you_not_sharing' : !partnerPoint ? 'partner_not_sharing' : 'ok';
    res.json({
        success: true,
        data: {
            you,
            partner: partnerPoint,
            distanceKm: you && partnerPoint ? Math.round(haversineKm(you, partnerPoint)) : null,
            reason,
        },
    });
}));

// Ask the partner to share their city. Every request attempts a notification.
router.post('/nudge-location', handle(async (req, res) => {
    const userId = req.auth.userId;
    const { partnerId } = await loadCoupleContext(userId);
    const now = letterDeps.now();
    try {
        const accepted = await letterDeps.notifyLocationNudge({ senderId: userId, recipientId: partnerId });
        if (accepted !== true) throw new Error('Push provider did not accept the location reminder');
    } catch (error) {
        console.warn('💌 [LETTERS] Location reminder failed:', error.message);
        throw new LetterError(503, 'nudge_failed', 'Could not send the reminder. Please try again.');
    }
    res.json({ success: true, data: { nudgedAt: now.toISOString() } });
}));

router.get('/', handle(async (req, res) => {
    const userId = req.auth.userId;
    const { couple, partnerId } = await loadCoupleContext(userId);
    const now = letterDeps.now();

    // Deliver anything already due so the list never shows a late bird.
    await letterDeps.deliverDueLetters({ now, filter: { coupleId: couple._id } });
    await backfillDecorativeRoutes(couple, userId, partnerId);

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
    // Unknown or missing styles just fall back to the defaults instead of failing the send.
    const paper = LETTER_PAPER_IDS.includes(req.body?.paper) ? req.body.paper : null;
    const textSize = LETTER_TEXT_SIZE_IDS.includes(req.body?.textSize) ? req.body.textSize : null;

    const { couple, partnerId } = await loadCoupleContext(userId);
    const [sender, recipient] = await Promise.all([User.findById(userId), User.findById(partnerId)]);
    if (!sender || !recipient) throw new LetterError(404, 'user_not_found', 'User not found');
    // Where the sender's phone was when they pressed Send: the bird starts here.
    const sentFrom = parseLetterLocation(req.body?.location);

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
        paper,
        textSize,
        status: 'flying',
        sentAt,
        deliverAt: computeDeliverAt(bird.id, sentAt),
        route: buildLetterRoute(sender, recipient, sentFrom),
    });

    // Also keep it as the sender's location, so the map shows them where they really are.
    if (sentFrom) {
        runInBackground(() => User.updateOne(
            { _id: userId },
            { $set: { location: sentFrom, locationSharingEnabled: true, locationUpdatedAt: sentAt } },
        ), 'Save sender location');
    }

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
