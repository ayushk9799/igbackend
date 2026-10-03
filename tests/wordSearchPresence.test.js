import test from 'node:test';
import assert from 'node:assert/strict';
import WordSearchGame from '../models/WordSearchGame.js';
import User from '../models/User.js';
import { connectedUsers, handleConnection, hasLegacyWordSearchClient, supportsModernWordSearch, socketAuth } from '../socket/auth.js';
import { claimWordSearchSelection, createWordSearchGame, serializeWordSearchGame, synchronizeWordSearchTurn } from '../services/wordSearch/gameService.js';
import { refreshWordSearchPresence, scheduleWordSearchTurn } from '../services/wordSearch/turnTimer.js';

const creatorId = '507f1f77bcf86cd799439011';
const partnerId = '507f191e810c19729de860ea';
const makeGame = (patch = {}) => ({
    _id: '507f1f77bcf86cd799439012', protocolVersion: 2, mode: 'duel', status: 'active',
    creatorId, partnerId, currentTurn: creatorId,
    startsAt: new Date('2026-10-02T10:00:00.000Z'),
    turnStartedAt: new Date('2026-10-02T10:00:00.000Z'),
    turnExpiresAt: new Date('2026-10-02T10:00:45.000Z'),
    words: [{ word: 'LOVE', start: { row: 0, col: 0 }, end: { row: 0, col: 3 }, foundBy: null }],
    gridSize: 8, creatorScore: 0, partnerScore: 0, moveHistory: [],
    save: async () => {}, ...patch,
});
const online = id => connectedUsers.set(id, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
const setup = (t, game) => {
    connectedUsers.clear();
    online(creatorId);
    online(partnerId);
    t.mock.method(WordSearchGame, 'findById', async () => game);
    t.after(() => {
        game.status = 'abandoned';
        scheduleWordSearchTurn(game);
        connectedUsers.clear();
    });
};
const synchronize = (game, time) => synchronizeWordSearchTurn({ gameId: game._id, now: new Date(time) });

test('legacy rounds advance while the partner is offline', async t => {
    const game = makeGame({ protocolVersion: 1 });
    setup(t, game);
    connectedUsers.delete(partnerId);
    const result = await synchronize(game, '2026-10-02T10:00:46.000Z');
    assert.equal(result.advanced, true);
    assert.equal(game.currentTurn, partnerId);
    assert.equal(game.turnExpiresAt.toISOString(), '2026-10-02T10:01:30.000Z');
    assert.equal(Boolean(game.turnPausedAt), false);
});

test('legacy clients can still score while their partner is offline', async t => {
    const game = makeGame({ protocolVersion: 1, startsAt: null, turnExpiresAt: new Date(Date.now() + 40000) });
    setup(t, game);
    connectedUsers.delete(partnerId);
    const result = await claimWordSearchSelection({
        gameId: game._id, userId: creatorId,
        start: { row: 0, col: 0 }, end: { row: 0, col: 3 },
    });
    assert.equal(result.game.creatorScore, 1);
    assert.equal(result.game.status, 'completed');
});

test('an old connected device makes the current round legacy and reconnecting modern devices does not upgrade it', async t => {
    const game = makeGame();
    setup(t, game);
    const partner = connectedUsers.get(partnerId);
    partner.socketIds.add('old-device');
    const result = await synchronize(game, '2026-10-02T10:00:10.000Z');
    assert.equal(result.reason, 'legacy_compatibility');
    assert.equal(game.protocolVersion, 1);
    partner.socketIds.delete('old-device');
    assert.equal(supportsModernWordSearch(partnerId), true);
    await synchronize(game, '2026-10-02T10:00:11.000Z');
    assert.equal(game.protocolVersion, 1);
});

test('saved boards without a protocol retain legacy rules, their grid, and scores', async () => {
    const saved = WordSearchGame.hydrate({
        _id: '507f1f77bcf86cd799439012', creatorId, partnerId,
        mode: 'duel', status: 'active', difficulty: 'medium', gridSize: 10,
        grid: Array(10).fill('ABCDEFGHIJ'), currentTurn: creatorId,
        words: [{ word: 'LOVE', direction: 'E', start: { row: 0, col: 0 }, end: { row: 0, col: 3 } }],
        creatorScore: 4, partnerScore: 2,
    });
    await saved.validate();
    const payload = serializeWordSearchGame(saved);
    assert.equal(payload.protocolVersion, 1);
    assert.equal(payload.gridSize, 10);
    assert.equal(payload.creatorScore, 4);
    assert.equal(payload.partnerScore, 2);
});

test('capability changes notify games without marking a user offline when another device remains', async t => {
    connectedUsers.clear();
    t.after(() => connectedUsers.clear());
    t.mock.method(User, 'findByIdAndUpdate', async () => null);
    const emissions = [];
    const io = { to: () => ({ emit: name => emissions.push(name) }) };
    const changes = [];
    const options = { onPresenceChange: async id => changes.push(id) };
    const makeSocket = (id, version) => ({
        id, userId: creatorId, partnerId, userName: 'Player',
        handshake: { auth: version ? { wordSearchVersion: version } : {} },
        handlers: new Map(), join() {}, to: () => ({ emit: name => emissions.push(name) }),
        on(name, callback) { this.handlers.set(name, callback); },
    });
    const modern = makeSocket('modern', 2);
    const anotherModern = makeSocket('modern-2', 2);
    const legacy = makeSocket('legacy');
    await handleConnection(modern, io, options);
    await handleConnection(anotherModern, io, options);
    assert.equal(changes.length, 1);
    assert.equal(supportsModernWordSearch(creatorId), true);
    await handleConnection(legacy, io, options);
    assert.equal(changes.length, 2);
    assert.equal(hasLegacyWordSearchClient(creatorId), true);
    await legacy.handlers.get('disconnect')('closed');
    assert.equal(changes.length, 3);
    assert.equal(supportsModernWordSearch(creatorId), true);
    assert.equal(emissions.includes('presence:offline'), false);
});

test('released sockets can authenticate with their existing userId handshake', async t => {
    t.mock.method(User, 'findById', async id => ({ _id: id, partnerId, name: 'Player' }));
    const socket = { handshake: { auth: { userId: creatorId } } };
    let error;
    await socketAuth(socket, result => { error = result; });
    assert.equal(error, undefined);
    assert.equal(socket.userId, creatorId);
    assert.equal(socket.partnerId, partnerId);
});

test('offline duels hold the same turn and resume the precise remaining time', async t => {
    const game = makeGame();
    setup(t, game);
    connectedUsers.delete(partnerId);
    const paused = await synchronize(game, '2026-10-02T10:00:12.250Z');
    assert.equal(paused.reason, 'player_offline');
    assert.equal(game.turnRemainingMs, 32_750);
    assert.equal(game.turnExpiresAt, null);
    assert.deepEqual(serializeWordSearchGame(game).offlinePlayerIds, [partnerId]);
    assert.equal(serializeWordSearchGame(game).turnRemainingMs, 32_750);

    const stillPaused = await synchronize(game, '2026-10-02T10:10:00.000Z');
    assert.equal(stillPaused.changed, false);
    assert.equal(game.currentTurn, creatorId);
    assert.equal(game.turnRemainingMs, 32_750);

    online(partnerId);
    const resumed = await synchronize(game, '2026-10-02T10:10:00.000Z');
    assert.equal(resumed.reason, 'players_reconnected');
    assert.equal(game.turnPausedAt, null);
    assert.equal(game.currentTurn, creatorId);
    assert.equal(game.turnExpiresAt.toISOString(), '2026-10-02T10:10:32.750Z');
    assert.equal((await synchronize(game, '2026-10-02T10:10:32.749Z')).advanced, false);
    assert.equal((await synchronize(game, '2026-10-02T10:10:32.750Z')).advanced, true);
    assert.equal(game.currentTurn, partnerId);
});

test('a duel resumes only when both players reconnect', async t => {
    const game = makeGame();
    setup(t, game);
    connectedUsers.clear();
    await synchronize(game, '2026-10-02T10:00:10.000Z');
    online(partnerId);
    await synchronize(game, '2026-10-02T10:01:00.000Z');
    assert.deepEqual(game.offlinePlayerIds, [creatorId]);
    assert.equal(game.turnRemainingMs, 35_000);
    assert.ok(game.turnPausedAt);
    online(creatorId);
    await synchronize(game, '2026-10-02T10:02:00.000Z');
    assert.equal(game.turnExpiresAt.toISOString(), '2026-10-02T10:02:35.000Z');
});

test('a paused rematch preserves its opening countdown and full first turn', async t => {
    const game = makeGame({
        startsAt: new Date('2026-10-02T10:00:06.000Z'),
        turnStartedAt: new Date('2026-10-02T10:00:06.000Z'),
        turnExpiresAt: new Date('2026-10-02T10:00:51.000Z'),
    });
    setup(t, game);
    connectedUsers.delete(partnerId);
    await synchronize(game, '2026-10-02T10:00:02.000Z');
    assert.equal(game.startRemainingMs, 4_000);
    assert.equal(game.turnRemainingMs, 45_000);
    online(partnerId);
    await synchronize(game, '2026-10-02T10:01:00.000Z');
    assert.equal(game.startsAt.toISOString(), '2026-10-02T10:01:04.000Z');
    assert.equal(game.turnExpiresAt.toISOString(), '2026-10-02T10:01:49.000Z');
});

test('an offline player prevents scoring even before the disconnect update finishes', async t => {
    const game = makeGame({ startsAt: null, turnExpiresAt: new Date(Date.now() + 40_000) });
    setup(t, game);
    connectedUsers.delete(partnerId);
    await assert.rejects(claimWordSearchSelection({
        gameId: game._id, userId: creatorId,
        start: { row: 0, col: 0 }, end: { row: 0, col: 3 },
    }), error => error.code === 'GAME_PAUSED');
    assert.equal(game.creatorScore, 0);
    assert.equal(game.words[0].foundBy, null);
    assert.ok(game.turnPausedAt);
});

test('solo and finished games are unaffected by offline presence', async t => {
    const game = makeGame({ mode: 'single' });
    setup(t, game);
    connectedUsers.clear();
    assert.equal((await synchronize(game, '2026-10-02T10:00:10.000Z')).changed, false);
    assert.equal(game.turnPausedAt, undefined);
    game.mode = 'duel';
    game.status = 'completed';
    assert.equal((await synchronize(game, '2026-10-02T10:00:10.000Z')).changed, false);
});

test('a new duel starts paused if a player disconnects during creation', async t => {
    const game = makeGame();
    setup(t, game);
    connectedUsers.delete(partnerId);
    t.mock.method(WordSearchGame, 'init', async () => {});
    t.mock.method(WordSearchGame, 'create', async document => document);
    const created = await createWordSearchGame({ creatorId, partnerId, mode: 'duel' });
    assert.ok(created.turnPausedAt);
    assert.equal(created.turnRemainingMs, 45_000);
    assert.equal(created.turnExpiresAt, null);
});

test('paused duels do not schedule automatic turn switches', t => {
    const game = makeGame({ turnPausedAt: new Date(), turnRemainingMs: 30_000 });
    setup(t, game);
    const timers = t.mock.method(globalThis, 'setTimeout', () => ({ unref() {} }));
    scheduleWordSearchTurn(game);
    assert.equal(timers.mock.callCount(), 0);
    game.turnPausedAt = null;
    scheduleWordSearchTurn(game);
    assert.equal(timers.mock.callCount(), 1);
});

test('socket presence pauses on the last disconnect and resumes on the first reconnect', async t => {
    const game = makeGame({ startsAt: null, turnExpiresAt: new Date(Date.now() + 40_000) });
    setup(t, game);
    connectedUsers.delete(partnerId);
    t.mock.method(User, 'findByIdAndUpdate', async () => null);
    t.mock.method(WordSearchGame, 'find', async () => [game]);
    const jobs = [];
    const onPresenceChange = id => {
        const job = refreshWordSearchPresence(id);
        jobs.push(job);
        return job;
    };
    const socket = id => ({
        id, handshake: { auth: { wordSearchVersion: 2 } }, userId: partnerId, partnerId: creatorId, handlers: new Map(),
        join() {}, to: () => ({ emit() {} }),
        on(event, handler) { this.handlers.set(event, handler); },
    });
    const io = { to: () => ({ emit() {} }) };
    const first = socket('first');
    const second = socket('second');
    await handleConnection(first, io, { onPresenceChange });
    await Promise.all(jobs);
    await handleConnection(second, io, { onPresenceChange });
    assert.equal(jobs.length, 1);
    await first.handlers.get('disconnect')();
    assert.equal(jobs.length, 1);
    assert.equal(game.turnPausedAt, undefined);
    await second.handlers.get('disconnect')();
    assert.ok(game.turnPausedAt);
    const remaining = game.turnRemainingMs;
    await handleConnection(socket('reconnected'), io, { onPresenceChange });
    await Promise.all(jobs);
    assert.equal(game.turnPausedAt, null);
    assert.equal(game.currentTurn, creatorId);
    assert.ok(game.turnExpiresAt.getTime() - Date.now() <= remaining);
});
