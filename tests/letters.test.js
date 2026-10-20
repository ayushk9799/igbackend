import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import lettersRouter, { letterDeps } from '../routes/letters.js';
import Couple from '../models/Couple.js';
import Letter from '../models/Letter.js';
import User from '../models/User.js';
import {
    buildLetterRoute,
    computeDeliverAt,
    getFlightProgress,
    normalizeLetterBody,
    serializeLetter,
} from '../services/letters/letterRules.js';
import { deliverDueLetters } from '../services/letters/delivery.js';
import {
    buildLetterSentNotification,
    formatTravelTime,
} from '../services/letters/letterEvents.js';

const HOUR_MS = 60 * 60 * 1000;
const NOW = new Date('2026-10-20T12:40:00.000Z');

const senderId = new mongoose.Types.ObjectId().toString();
const recipientId = new mongoose.Types.ObjectId().toString();
const coupleId = new mongoose.Types.ObjectId();
const couple = { _id: coupleId, partner1: senderId, partner2: recipientId };

const getHandler = (method, path) => {
    const layer = lettersRouter.stack.find(
        (l) => l.route && l.route.path === path && l.route.methods[method.toLowerCase()]
    );
    return layer?.route?.stack[0]?.handle;
};

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) {
        this.statusCode = code;
        return this;
    },
    json(payload) {
        this.body = payload;
        return this;
    },
});

const flush = () => new Promise((resolve) => setImmediate(resolve));

// Replace model statics and route deps for one test, then restore them.
const withStubs = async (stubs, fn) => {
    const originals = stubs.map(([target, key]) => [target, key, target[key]]);
    try {
        for (const [target, key, value] of stubs) target[key] = value;
        await fn();
    } finally {
        for (const [target, key, value] of originals) target[key] = value;
    }
};

const makeLetter = (overrides = {}) => ({
    _id: new mongoose.Types.ObjectId(),
    coupleId,
    senderId,
    recipientId,
    body: 'Open this before the fridge.',
    bird: 'pigeon',
    status: 'flying',
    sentAt: NOW,
    deliverAt: new Date(NOW.getTime() + 12 * HOUR_MS),
    deliveredAt: null,
    readAt: null,
    route: { from: null, to: null, distanceKm: null, isDecorative: true },
    ...overrides,
});

test('each bird has a fixed travel time', () => {
    assert.equal(computeDeliverAt('penguin', NOW).getTime() - NOW.getTime(), 48 * HOUR_MS);
    assert.equal(computeDeliverAt('pigeon', NOW).getTime() - NOW.getTime(), 12 * HOUR_MS);
    assert.equal(computeDeliverAt('swallow', NOW).getTime() - NOW.getTime(), 3 * HOUR_MS);
    assert.equal(computeDeliverAt('falcon', NOW).getTime() - NOW.getTime(), 45 * 60 * 1000);
    assert.throws(() => computeDeliverAt('eagle', NOW), { code: 'invalid_bird' });
});

test('letter text must be non-empty and at most 1000 characters', () => {
    assert.equal(normalizeLetterBody('  hello  '), 'hello');
    assert.throws(() => normalizeLetterBody('   '), { code: 'empty_letter' });
    assert.throws(() => normalizeLetterBody('x'.repeat(1001)), { code: 'letter_too_long' });
    assert.equal(normalizeLetterBody('x'.repeat(1000)).length, 1000);
});

test('routes use city-level points and fall back to a decorative path', () => {
    const delhi = { locationSharingEnabled: true, location: { latitude: 28.61394, longitude: 77.20902 } };
    const bengaluru = { locationSharingEnabled: true, location: { latitude: 12.97159, longitude: 77.59456 } };

    const route = buildLetterRoute(delhi, bengaluru);
    assert.deepEqual(route.from, { latitude: 28.6, longitude: 77.2 });
    assert.deepEqual(route.to, { latitude: 13, longitude: 77.6 });
    assert.equal(route.isDecorative, false);
    assert.ok(route.distanceKm > 1700 && route.distanceKm < 1800);

    const hidden = buildLetterRoute(delhi, { ...bengaluru, locationSharingEnabled: false });
    assert.deepEqual(hidden, { from: null, to: null, distanceKm: null, isDecorative: true });
});

test('the recipient cannot read a letter before it lands', () => {
    const flying = makeLetter();
    assert.equal(serializeLetter(flying, recipientId, NOW).body, null);
    assert.equal(serializeLetter(flying, recipientId, NOW).direction, 'incoming');
    assert.equal(serializeLetter(flying, senderId, NOW).body, flying.body);

    const delivered = makeLetter({ status: 'delivered', deliveredAt: NOW });
    assert.equal(serializeLetter(delivered, recipientId, NOW).body, delivered.body);
});

test('flight progress follows the clock between sentAt and deliverAt', () => {
    const letter = makeLetter();
    assert.equal(getFlightProgress(letter, NOW), 0);
    assert.equal(getFlightProgress(letter, new Date(NOW.getTime() + 6 * HOUR_MS)), 0.5);
    assert.equal(getFlightProgress(letter, new Date(NOW.getTime() + 20 * HOUR_MS)), 1);
    assert.equal(getFlightProgress({ ...letter, status: 'delivered' }, NOW), 1);
});

test('notification copy names the sender, bird and travel time', () => {
    assert.equal(formatTravelTime(45 * 60 * 1000), '45 minutes');
    assert.equal(formatTravelTime(HOUR_MS), '1 hour');
    assert.equal(formatTravelTime(48 * HOUR_MS), '2 days');

    const notification = buildLetterSentNotification({ letter: makeLetter(), senderName: 'Maya' });
    assert.equal(notification.body, 'Maya sent you a letter by Pigeon. It lands in 12 hours.');
    assert.equal(notification.data.type, 'letter');
    assert.equal(notification.data.event, 'sent');
});

test('POST / refuses a premium bird without couple premium', async () => {
    const handler = getHandler('POST', '/');
    const res = makeResponse();
    let created = false;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', async (id) => ({ _id: id })],
        [Letter, 'create', async () => { created = true; }],
        [letterDeps, 'getCouplePremiumStatus', async () => ({ isPremium: false })],
    ], async () => {
        await handler({ auth: { userId: senderId }, body: { body: 'Quick one', bird: 'falcon' } }, res);
    });

    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'premium_required');
    assert.equal(created, false);
});

test('POST / sends a pigeon letter that lands in 12 hours and notifies the partner', async () => {
    const handler = getHandler('POST', '/');
    const res = makeResponse();
    let saved = null;
    let notified = null;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', async (id) => ({ _id: id, locationSharingEnabled: false })],
        [Letter, 'countDocuments', async () => 0],
        [Letter, 'create', async (doc) => { saved = { _id: new mongoose.Types.ObjectId(), ...doc }; return saved; }],
        [letterDeps, 'now', () => NOW],
        [letterDeps, 'notifyLetterSent', async (letter) => { notified = letter; }],
    ], async () => {
        await handler({ auth: { userId: senderId }, body: { body: '  Miss you  ', bird: 'pigeon' } }, res);
        await flush();
    });

    assert.equal(res.statusCode, 201);
    assert.equal(saved.body, 'Miss you');
    assert.equal(String(saved.recipientId), recipientId);
    assert.equal(saved.deliverAt.getTime(), NOW.getTime() + 12 * HOUR_MS);
    assert.equal(res.body.data.letter.status, 'flying');
    assert.equal(notified, saved);
});

test('POST / limits how many birds one sender can have in the sky', async () => {
    const handler = getHandler('POST', '/');
    const res = makeResponse();

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', async (id) => ({ _id: id })],
        [Letter, 'countDocuments', async () => 10],
    ], async () => {
        await handler({ auth: { userId: senderId }, body: { body: 'One more', bird: 'pigeon' } }, res);
    });

    assert.equal(res.statusCode, 429);
    assert.equal(res.body.code, 'too_many_in_flight');
});

test('POST /:id/recall fails once the bird has landed', async () => {
    const handler = getHandler('POST', '/:id/recall');
    const res = makeResponse();

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [Letter, 'findOneAndUpdate', async () => null],
        [letterDeps, 'now', () => NOW],
    ], async () => {
        await handler({ auth: { userId: senderId }, params: { id: new mongoose.Types.ObjectId().toString() } }, res);
    });

    assert.equal(res.statusCode, 409);
    assert.equal(res.body.code, 'cannot_recall');
});

test('POST /:id/read tells the sender only on the first open', async () => {
    const handler = getHandler('POST', '/:id/read');
    const delivered = makeLetter({ status: 'delivered', deliveredAt: NOW });
    let readNotifications = 0;
    let alreadyRead = false;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [Letter, 'findOneAndUpdate', async () => {
            if (alreadyRead) return null;
            alreadyRead = true;
            return { ...delivered, readAt: NOW };
        }],
        [Letter, 'findOne', async () => ({ ...delivered, readAt: NOW })],
        [letterDeps, 'now', () => NOW],
        [letterDeps, 'notifyLetterRead', async () => { readNotifications += 1; }],
    ], async () => {
        const req = { auth: { userId: recipientId }, params: { id: String(delivered._id) } };
        const first = makeResponse();
        const second = makeResponse();
        await handler(req, first);
        await handler(req, second);
        await flush();

        assert.equal(first.statusCode, 200);
        assert.equal(first.body.data.letter.body, delivered.body);
        assert.equal(second.statusCode, 200);
    });

    assert.equal(readNotifications, 1);
});

test('GET /:id hides a recalled letter from the recipient', async () => {
    const handler = getHandler('GET', '/:id');
    const res = makeResponse();
    const recalled = makeLetter({ status: 'recalled', recalledAt: NOW });

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [Letter, 'findOne', async () => recalled],
        [letterDeps, 'now', () => NOW],
    ], async () => {
        await handler({ auth: { userId: recipientId }, params: { id: String(recalled._id) } }, res);
    });

    assert.equal(res.statusCode, 404);
});

test('deliverDueLetters flips each due letter once and notifies once', async () => {
    const due = makeLetter({ deliverAt: new Date(NOW.getTime() - 1000) });
    const delivered = new Set();
    const notified = [];
    const findChain = { sort: () => findChain, limit: () => findChain, select: () => findChain, lean: async () => [{ _id: due._id }] };

    await withStubs([
        [Letter, 'find', () => findChain],
        [Letter, 'findOneAndUpdate', async (filter, update) => {
            if (delivered.has(String(filter._id))) return null;
            delivered.add(String(filter._id));
            return { ...due, ...update.$set };
        }],
    ], async () => {
        const notify = async (letter) => { notified.push(letter); };
        const firstRun = await deliverDueLetters({ now: NOW, notify });
        const secondRun = await deliverDueLetters({ now: NOW, notify });

        assert.equal(firstRun.length, 1);
        assert.equal(firstRun[0].status, 'delivered');
        assert.equal(secondRun.length, 0);
    });

    assert.equal(notified.length, 1);
});

test('GET /map returns each rounded city, and null for a partner who hides location', async () => {
    const handler = getHandler('GET', '/map');
    const users = {
        [senderId]: { locationSharingEnabled: true, location: { latitude: 28.61394, longitude: 77.20902 } },
        [recipientId]: { locationSharingEnabled: true, location: { latitude: 12.97159, longitude: 77.59456 } },
    };
    const findById = (id) => ({ select: () => ({ lean: async () => users[String(id)] }) });

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', findById],
    ], async () => {
        const shared = makeResponse();
        await handler({ auth: { userId: senderId } }, shared);
        assert.deepEqual(shared.body.data.you, { latitude: 28.6, longitude: 77.2 });
        assert.deepEqual(shared.body.data.partner, { latitude: 13, longitude: 77.6 });

        users[recipientId].locationSharingEnabled = false;
        const hidden = makeResponse();
        await handler({ auth: { userId: senderId } }, hidden);
        assert.deepEqual(hidden.body.data, { you: { latitude: 28.6, longitude: 77.2 }, partner: null, distanceKm: null });
    });
});
