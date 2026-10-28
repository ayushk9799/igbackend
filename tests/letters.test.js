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

test('routes use exact points and fall back to a decorative path', () => {
    const delhi = { locationSharingEnabled: true, location: { latitude: 28.61394, longitude: 77.20902 } };
    const bengaluru = { locationSharingEnabled: true, location: { latitude: 12.97159, longitude: 77.59456 } };

    const route = buildLetterRoute(delhi, bengaluru);
    assert.deepEqual(route.from, { latitude: 28.61394, longitude: 77.20902 });
    assert.deepEqual(route.to, { latitude: 12.97159, longitude: 77.59456 });
    assert.equal(route.isDecorative, false);
    assert.ok(route.distanceKm > 1700 && route.distanceKm < 1800);

    const hidden = buildLetterRoute(delhi, { ...bengaluru, locationSharingEnabled: false });
    assert.deepEqual(hidden, { from: { latitude: 28.61394, longitude: 77.20902 }, to: null, distanceKm: null, isDecorative: true });

    // The spot the phone sent with the letter wins over the saved location.
    const sentFrom = { latitude: 28.5355, longitude: 77.391 };
    assert.deepEqual(buildLetterRoute(delhi, bengaluru, sentFrom).from, sentFrom);
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

test('POST / keeps the paper and text size the letter was written with', async () => {
    const handler = getHandler('POST', '/');
    const send = async (body) => {
        const res = makeResponse();
        let saved = null;
        await withStubs([
            [Couple, 'findByPartner', async () => couple],
            [User, 'findById', async (id) => ({ _id: id, locationSharingEnabled: false })],
            [Letter, 'countDocuments', async () => 0],
            [Letter, 'create', async (doc) => { saved = { _id: new mongoose.Types.ObjectId(), ...doc }; return saved; }],
            [letterDeps, 'now', () => NOW],
            [letterDeps, 'notifyLetterSent', async () => {}],
        ], async () => {
            await handler({ auth: { userId: senderId }, body: { body: 'Hi', bird: 'pigeon', ...body } }, res);
            await flush();
        });
        return { saved, letter: res.body.data.letter };
    };

    const styled = await send({ paper: 'blush', textSize: 'large' });
    assert.equal(styled.saved.paper, 'blush');
    assert.equal(styled.saved.textSize, 'large');
    assert.equal(styled.letter.paper, 'blush');
    assert.equal(styled.letter.textSize, 'large');

    // Unknown values fall back to the app's defaults instead of failing the send.
    const unknown = await send({ paper: 'neon', textSize: 'huge' });
    assert.equal(unknown.saved.paper, null);
    assert.equal(unknown.saved.textSize, null);
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
        assert.deepEqual(shared.body.data.you, { latitude: 28.61394, longitude: 77.20902 });
        assert.deepEqual(shared.body.data.partner, { latitude: 12.97159, longitude: 77.59456 });
        assert.equal(shared.body.data.reason, 'ok');

        users[recipientId].locationSharingEnabled = false;
        const hidden = makeResponse();
        await handler({ auth: { userId: senderId } }, hidden);
        assert.deepEqual(hidden.body.data, { you: { latitude: 28.61394, longitude: 77.20902 }, partner: null, distanceKm: null, reason: 'partner_not_sharing' });
    });
});

test('GET /map says when you are the one not sharing', async () => {
    const handler = getHandler('GET', '/map');
    const users = {
        [senderId]: { locationSharingEnabled: false },
        [recipientId]: { locationSharingEnabled: true, location: { latitude: 12.97, longitude: 77.59 } },
    };
    const findById = (id) => ({ select: () => ({ lean: async () => users[String(id)] }) });

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', findById],
    ], async () => {
        const res = makeResponse();
        await handler({ auth: { userId: senderId } }, res);
        assert.equal(res.body.data.reason, 'you_not_sharing');
        assert.equal(res.body.data.you, null);
    });
});

const pendingFind = (letters) => () => ({ select: () => ({ lean: async () => letters }) });

test('GET / completes routes for birds in the air, keeping the spot each was sent from', async () => {
    const handler = getHandler('GET', '/');
    const sentFrom = { latitude: 28.5355, longitude: 77.391 };
    const users = {
        [senderId]: { locationSharingEnabled: true, location: { latitude: 28.61, longitude: 77.21 } },
        [recipientId]: { locationSharingEnabled: true, location: { latitude: 12.97, longitude: 77.59 } },
    };
    const findById = (id) => ({ select: () => ({ lean: async () => users[String(id)] }) });
    const mine = { _id: 'a', senderId, route: { from: sentFrom, to: null, isDecorative: true } };
    const theirs = { _id: 'b', senderId: recipientId, route: { from: null, to: null, isDecorative: true } };
    let writes = null;
    let listCalls = 0;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', findById],
        [Letter, 'find', (...args) => {
            listCalls += 1;
            return listCalls === 1 ? pendingFind([mine, theirs])() : { sort: () => ({ limit: async () => [] }) };
        }],
        [Letter, 'bulkWrite', async (ops) => { writes = ops; }],
        [Letter, 'countDocuments', async () => 0],
        [letterDeps, 'deliverDueLetters', async () => {}],
        [letterDeps, 'now', () => NOW],
    ], async () => {
        await handler({ auth: { userId: senderId }, query: {} }, makeResponse());
    });

    assert.equal(writes.length, 2);
    const mineRoute = writes.find((op) => op.updateOne.filter._id === 'a').updateOne.update.$set.route;
    const theirRoute = writes.find((op) => op.updateOne.filter._id === 'b').updateOne.update.$set.route;
    assert.deepEqual(mineRoute.from, sentFrom);
    assert.deepEqual(mineRoute.to, { latitude: 12.97, longitude: 77.59 });
    assert.equal(mineRoute.isDecorative, false);
    assert.deepEqual(theirRoute.from, { latitude: 12.97, longitude: 77.59 });
    assert.deepEqual(theirRoute.to, { latitude: 28.61, longitude: 77.21 });
});

test('GET / leaves decorative routes alone while a partner still has no location', async () => {
    const handler = getHandler('GET', '/');
    const users = {
        [senderId]: { locationSharingEnabled: true, location: { latitude: 28.61, longitude: 77.21 } },
        [recipientId]: { locationSharingEnabled: false },
    };
    const findById = (id) => ({ select: () => ({ lean: async () => users[String(id)] }) });
    let wrote = false;
    let listCalls = 0;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', findById],
        [Letter, 'find', () => {
            listCalls += 1;
            return listCalls === 1
                ? pendingFind([{ _id: 'a', senderId, route: { from: null, to: null, isDecorative: true } }])()
                : { sort: () => ({ limit: async () => [] }) };
        }],
        [Letter, 'bulkWrite', async () => { wrote = true; }],
        [Letter, 'countDocuments', async () => 0],
        [letterDeps, 'deliverDueLetters', async () => {}],
        [letterDeps, 'now', () => NOW],
    ], async () => {
        await handler({ auth: { userId: senderId }, query: {} }, makeResponse());
    });

    assert.equal(wrote, false);
});

test('POST / starts the bird where the phone was and saves that as the sender location', async () => {
    const handler = getHandler('POST', '/');
    const sentFrom = { latitude: 28.5355, longitude: 77.391 };
    let saved = null;
    let userUpdate = null;

    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', async (id) => (String(id) === recipientId
            ? { _id: id, locationSharingEnabled: true, location: { latitude: 12.97, longitude: 77.59 } }
            : { _id: id, locationSharingEnabled: false })],
        [User, 'updateOne', async (filter, update) => { userUpdate = { filter, update }; }],
        [Letter, 'countDocuments', async () => 0],
        [Letter, 'create', async (doc) => { saved = { _id: new mongoose.Types.ObjectId(), ...doc }; return saved; }],
        [letterDeps, 'now', () => NOW],
        [letterDeps, 'notifyLetterSent', async () => {}],
    ], async () => {
        await handler({ auth: { userId: senderId }, body: { body: 'Hi', bird: 'pigeon', location: sentFrom } }, makeResponse());
        await flush();
    });

    assert.deepEqual(saved.route.from, sentFrom);
    assert.deepEqual(saved.route.to, { latitude: 12.97, longitude: 77.59 });
    assert.equal(saved.route.isDecorative, false);
    assert.deepEqual(userUpdate.update.$set.location, sentFrom);
    assert.equal(userUpdate.update.$set.locationSharingEnabled, true);
});

test('POST /nudge-location sends on every request with no daily cooldown', async () => {
    const handler = getHandler('POST', '/nudge-location');
    const nudges = [];
    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', () => ({ select: () => ({ lean: async () => ({ locationSharingEnabled: false }) }) })],
        [User, 'findOneAndUpdate', async () => { throw new Error('Must not reserve a cooldown'); }],
        [letterDeps, 'now', () => NOW],
        [letterDeps, 'notifyLocationNudge', async (args) => { nudges.push(args); return true; }],
    ], async () => {
        for (let attempt = 0; attempt < 3; attempt += 1) {
            const res = makeResponse();
            await handler({ auth: { userId: senderId } }, res);
            assert.equal(res.statusCode, 200);
        }
        assert.equal(nudges.length, 3);
        nudges.forEach(nudge => assert.equal(String(nudge.recipientId), recipientId));
    });
});

test('POST /nudge-location sends even when the saved partner location already exists', async () => {
    const handler = getHandler('POST', '/nudge-location');
    let sent = false;
    await withStubs([
        [Couple, 'findByPartner', async () => couple],
        [User, 'findById', () => ({ select: () => ({ lean: async () => ({ locationSharingEnabled: true, location: { latitude: 12.97, longitude: 77.59 } }) }) })],
        [letterDeps, 'notifyLocationNudge', async () => { sent = true; return true; }],
    ], async () => {
        const res = makeResponse();
        await handler({ auth: { userId: senderId } }, res);
        assert.equal(res.statusCode, 200);
        assert.equal(sent, true);
    });
});

for (const failure of ['not accepted', 'throws']) {
    test(`a location reminder that ${failure} reports failure and allows retry`, async () => {
        const handler = getHandler('POST', '/nudge-location');
        let attempts = 0;
        await withStubs([
            [Couple, 'findByPartner', async () => couple],
            [User, 'findById', () => ({ select: () => ({ lean: async () => ({ locationSharingEnabled: false }) }) })],
            [letterDeps, 'now', () => NOW],
            [letterDeps, 'notifyLocationNudge', async () => {
                attempts += 1;
                if (attempts > 1) return true;
                if (failure === 'throws') throw new Error('Push unavailable');
                return false;
            }],
        ], async () => {
            const first = makeResponse();
            await handler({ auth: { userId: senderId } }, first);
            assert.equal(first.statusCode, 503);
            assert.equal(first.body.code, 'nudge_failed');
            const retry = makeResponse();
            await handler({ auth: { userId: senderId } }, retry);
            assert.equal(retry.statusCode, 200);
            assert.equal(attempts, 2);
        });
    });
}
