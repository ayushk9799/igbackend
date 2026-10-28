import test from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import gameRequestsRouter, { gameRequestDeps, MAX_REQUESTS_PER_DAY } from '../routes/gameRequests.js';
import GameRequest from '../models/GameRequest.js';

const userId = new mongoose.Types.ObjectId().toString();
const NOW = new Date('2026-10-25T05:00:00.000Z');

const handler = gameRequestsRouter.stack.find((l) => l.route?.path === '/' && l.route.methods.post).route.stack[0].handle;

const makeResponse = () => ({
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
});

const withStubs = async (stubs, fn) => {
    const originals = stubs.map(([target, key]) => [target, key, target[key]]);
    try {
        for (const [target, key, value] of stubs) target[key] = value;
        await fn();
    } finally {
        for (const [target, key, value] of originals) target[key] = value;
    }
};

test('POST /api/game-requests saves the trimmed idea for the signed-in user', async () => {
    let saved = null;
    await withStubs([
        [GameRequest, 'countDocuments', async () => 0],
        [GameRequest, 'create', async (doc) => { saved = doc; return { _id: 'r1', ...doc }; }],
        [gameRequestDeps, 'now', () => NOW],
    ], async () => {
        const res = makeResponse();
        await handler({ auth: { userId }, body: { text: '   Ludo   with  dice  ' } }, res);
        assert.equal(res.statusCode, 201);
        assert.deepEqual(saved, { userId, text: 'Ludo with dice' });
    });
});

test('POST /api/game-requests refuses empty and too-long ideas', async () => {
    const empty = makeResponse();
    await handler({ auth: { userId }, body: { text: '  ' } }, empty);
    assert.equal(empty.statusCode, 400);
    assert.equal(empty.body.code, 'text_required');

    const long = makeResponse();
    await handler({ auth: { userId }, body: { text: 'x'.repeat(301) } }, long);
    assert.equal(long.statusCode, 400);
    assert.equal(long.body.code, 'text_too_long');
});

test('POST /api/game-requests allows a few ideas a day per user', async () => {
    let created = false;
    await withStubs([
        [GameRequest, 'countDocuments', async () => MAX_REQUESTS_PER_DAY],
        [GameRequest, 'create', async () => { created = true; }],
        [gameRequestDeps, 'now', () => NOW],
    ], async () => {
        const res = makeResponse();
        await handler({ auth: { userId }, body: { text: 'Chess' } }, res);
        assert.equal(res.statusCode, 429);
        assert.equal(res.body.code, 'request_limit');
        assert.equal(created, false);
    });
});
