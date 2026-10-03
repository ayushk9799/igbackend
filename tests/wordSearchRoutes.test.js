import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import wordSearchRoutes, { legacyWordSearchRoutes } from '../routes/wordSearch.js';
import WordSearchGame from '../models/WordSearchGame.js';
import User from '../models/User.js';
import Subscription from '../models/Subscription.js';
import { scheduleWordSearchTurn } from '../services/wordSearch/turnTimer.js';
import { connectedUsers } from '../socket/auth.js';
import { createAutomaticWordSearchRematch } from '../services/wordSearch/gameService.js';

const originalSubscriptionFind = Subscription.find;
const originalSubscriptionExists = Subscription.exists;
const originalCountDocuments = WordSearchGame.countDocuments;
beforeEach(() => {
    Subscription.find = () => ({ lean: async () => [] });
    Subscription.exists = async () => null;
    WordSearchGame.countDocuments = async () => 0;
});
afterEach(() => {
    Subscription.find = originalSubscriptionFind;
    Subscription.exists = originalSubscriptionExists;
    WordSearchGame.countDocuments = originalCountDocuments;
});

const createHandler = wordSearchRoutes.stack.find(layer => layer.route?.path === '/create').route.stack[0].handle;
const legacyCreateHandler = legacyWordSearchRoutes.stack.find(layer => layer.route?.path === '/create').route.stack[0].handle;

const makeGame = ({ _id, creatorId, partnerId = null, mode = 'single', status, difficulty }) => ({
    _id,
    protocolVersion: 2,
    creatorId,
    partnerId,
    mode,
    difficulty,
    status,
    gridSize: 8,
    grid: Array(8).fill('ABCDEFGH'),
    words: [{ word: 'ABC', foundBy: null }],
    creatorScore: 0,
    partnerScore: 0,
    currentTurn: creatorId,
    turnExpiresAt: mode === 'duel' ? new Date(Date.now() + 45_000) : null,
    moveHistory: [],
    populate: async function populate() { return this; },
});

const makeResponse = () => ({
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(payload) { this.body = payload; return this; },
});

test('forceNew replaces the active solo board even when the partner is online', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const originalFindById = User.findById;
    const originalFindOne = WordSearchGame.findOne;
    const originalFindOneAndUpdate = WordSearchGame.findOneAndUpdate;
    const originalCreate = WordSearchGame.create;
    const originalPresence = connectedUsers.get(partnerId);
    const oldGame = makeGame({
        _id: '507f1f77bcf86cd799439012',
        creatorId,
        status: 'active',
        difficulty: 'easy',
    });
    const games = [oldGame];

    try {
        connectedUsers.set(partnerId, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
        User.findById = id => ({ _id: id, partnerId: id === creatorId ? partnerId : creatorId, select: async () => ({ _id: creatorId, partnerId }) });
        WordSearchGame.findOne = filter => ({
            sort: async () => games.find(game => game.status === filter.status && game.mode === filter.mode),
        });
        WordSearchGame.findOneAndUpdate = async (filter, update) => {
            const game = games.find(item => item.status === filter.status && item.mode === filter.mode);
            if (!game) return null;
            Object.assign(game, update.$set);
            return game;
        };
        WordSearchGame.create = async document => {
            const game = makeGame({
                _id: '507f1f77bcf86cd799439013',
                creatorId,
                status: 'active',
                difficulty: document.difficulty,
            });
            games.push(game);
            return game;
        };

        const response = makeResponse();
        await createHandler({ body: {
            creatorId,
            partnerId,
            mode: 'single',
            difficulty: 'hard',
            forceNew: true,
        } }, response);

        assert.equal(response.statusCode, 201);
        assert.equal(response.body.success, true);
        assert.equal(response.body.isExisting, false);
        assert.equal(response.body.data._id, '507f1f77bcf86cd799439013');
        assert.equal(response.body.data.difficulty, 'hard');
        assert.equal(oldGame.status, 'abandoned');
    } finally {
        User.findById = originalFindById;
        WordSearchGame.findOne = originalFindOne;
        WordSearchGame.findOneAndUpdate = originalFindOneAndUpdate;
        WordSearchGame.create = originalCreate;
        if (originalPresence) connectedUsers.set(partnerId, originalPresence);
        else connectedUsers.delete(partnerId);
    }
});

test('a duplicate duel insert returns the shared active board', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const originalFindById = User.findById;
    const originalFindGameById = WordSearchGame.findById;
    const originalFindOne = WordSearchGame.findOne;
    const originalCreate = WordSearchGame.create;
    const originalInit = WordSearchGame.init;
    const originalPresence = connectedUsers.get(partnerId);
    const sharedGame = makeGame({
        _id: '507f1f77bcf86cd799439014',
        creatorId: partnerId,
        partnerId: creatorId,
        mode: 'duel',
        status: 'active',
        difficulty: 'medium',
    });
    let lookups = 0;

    try {
        connectedUsers.set(creatorId, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
        connectedUsers.set(partnerId, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
        User.findById = id => ({ _id: id, partnerId: id === creatorId ? partnerId : creatorId, select: async () => ({ _id: creatorId, partnerId }) });
        WordSearchGame.init = async () => WordSearchGame;
        WordSearchGame.findById = async () => sharedGame;
        WordSearchGame.findOne = filter => {
            assert.equal(filter.mode, 'duel');
            assert.deepEqual(filter.$or, [
                { creatorId, partnerId },
                { creatorId: partnerId, partnerId: creatorId },
            ]);
            return { sort: async () => (++lookups === 1 ? null : sharedGame) };
        };
        WordSearchGame.create = async () => {
            const duplicate = new Error('duplicate active duel');
            duplicate.code = 11000;
            throw duplicate;
        };

        const response = makeResponse();
        await createHandler({ body: { creatorId, partnerId, mode: 'duel', difficulty: 'medium' } }, response);

        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.isExisting, true);
        assert.equal(response.body.data._id, sharedGame._id);
        assert.equal(lookups, 2);
    } finally {
        User.findById = originalFindById;
        WordSearchGame.findById = originalFindGameById;
        WordSearchGame.findOne = originalFindOne;
        WordSearchGame.create = originalCreate;
        WordSearchGame.init = originalInit;
        connectedUsers.delete(creatorId);
        if (originalPresence) connectedUsers.set(partnerId, originalPresence);
        else connectedUsers.delete(partnerId);
    }
});


test('finding the last word saves the completed result without creating another game', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const game = makeGame({
        _id: '507f1f77bcf86cd799439012', creatorId, partnerId,
        mode: 'duel', status: 'active', difficulty: 'medium',
    });
    game.words[0].start = { row: 0, col: 0 };
    game.words[0].end = { row: 0, col: 2 };
    let saves = 0;
    game.save = async () => { saves += 1; return game; };
    const originals = {
        findById: WordSearchGame.findById, findOne: WordSearchGame.findOne,
        create: WordSearchGame.create, updateOne: WordSearchGame.updateOne,
    };
    const previousPresence = [creatorId, partnerId].map(id => connectedUsers.get(id));
    try {
        for (const id of [creatorId, partnerId]) connectedUsers.set(id, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
        WordSearchGame.findById = async () => game;
        WordSearchGame.findOne = async () => assert.fail('Completion must not look up a rematch');
        WordSearchGame.create = async () => assert.fail('Completion must not create a puzzle');
        WordSearchGame.updateOne = async () => assert.fail('Completion must not link a rematch');
        const findHandler = wordSearchRoutes.stack.find(layer => layer.route?.path === '/:id/find').route.stack[0].handle;
        const response = makeResponse();
        await findHandler({ params: { id: game._id }, body: {
            userId: creatorId, start: { row: 0, col: 0 }, end: { row: 0, col: 2 },
        } }, response);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.success, true);
        assert.equal(response.body.foundWord, 'ABC');
        assert.equal(response.body.data.status, 'completed');
        assert.equal(response.body.data.creatorScore, 1);
        assert.equal(String(response.body.data.winner), creatorId);
        assert.equal(response.body.data.turnExpiresAt, null);
        assert.equal(Object.hasOwn(response.body, 'rematch'), false);
        assert.equal(saves, 1);
    } finally {
        Object.assign(WordSearchGame, originals);
        [creatorId, partnerId].forEach((id, index) => {
            if (previousPresence[index]) connectedUsers.set(id, previousPresence[index]);
            else connectedUsers.delete(id);
        });
    }
});


const creatorId = '507f1f77bcf86cd799439011';
const partnerId = '507f191e810c19729de860ea';
const oldGameId = '507f1f77bcf86cd799439012';

// Exercise actual subscription access and route ordering without connecting to MongoDB.
const withLimitFixture = async (callback, { completed = 0, partnerCompleted = 0, existing = null, premiumOwner = null } = {}) => {
    const originals = {
        userFindById: User.findById, findById: WordSearchGame.findById,
        findOne: WordSearchGame.findOne, create: WordSearchGame.create,
        init: WordSearchGame.init, findOneAndUpdate: WordSearchGame.findOneAndUpdate,
    };
    const presence = [creatorId, partnerId].map(id => connectedUsers.get(id));
    const state = { creates: 0, replacements: [], counts: [], game: null };
    try {
        for (const id of [creatorId, partnerId]) connectedUsers.set(id, { socketIds: new Set(['online']), wordSearchVersions: new Map([['online', 2]]) });
        User.findById = id => {
            const user = { _id: id, partnerId: id === creatorId ? partnerId : creatorId };
            return { ...user, select: async () => user };
        };
        Subscription.find = filter => ({ lean: async () => String(filter.ownerUserId) === premiumOwner ? [{
            _id: 'subscription-1', ownerUserId: premiumOwner, givesAccess: true, status: 'active',
            expiresAt: new Date(Date.now() + 86_400_000), environment: 'production',
        }] : [] });
        WordSearchGame.countDocuments = async filter => {
            state.counts.push(filter);
            assert.equal(filter.status, 'completed');
            assert.equal(filter.protocolVersion, 2);
            return filter.$or[0].creatorId === creatorId ? completed : partnerCompleted;
        };
        WordSearchGame.findOne = () => ({ sort: async () => existing });
        WordSearchGame.findById = async () => existing;
        WordSearchGame.init = async () => WordSearchGame;
        WordSearchGame.findOneAndUpdate = async filter => { state.replacements.push(filter); return null; };
        WordSearchGame.create = async document => {
            state.creates += 1;
            state.game = { _id: '507f191e810c19729de860eb', ...document, populate: async function populate() { return this; } };
            return state.game;
        };
        await callback(state);
    } finally {
        if (state.game) {
            state.game.status = 'abandoned';
            scheduleWordSearchTurn(state.game);
        }
        User.findById = originals.userFindById;
        Object.assign(WordSearchGame, {
            findById: originals.findById, findOne: originals.findOne,
            create: originals.create, init: originals.init, findOneAndUpdate: originals.findOneAndUpdate,
        });
        [creatorId, partnerId].forEach((id, index) => {
            if (presence[index]) connectedUsers.set(id, presence[index]);
            else connectedUsers.delete(id);
        });
    }
};

for (const completed of [0, 1, 2]) {
    test(`free user with ${completed} completed games can start another`, async () => {
        await withLimitFixture(async state => {
            const response = makeResponse();
            await createHandler({ body: { creatorId, mode: 'single' } }, response);
            assert.equal(response.statusCode, 201);
            assert.equal(state.creates, 1);
            assert.equal(response.body.data.difficulty, 'easy');
            assert.equal(response.body.data.gridSize, 8);
            assert.equal(response.body.data.totalWords, 6);
            assert.deepEqual(state.counts[0].$or, [{ creatorId }, { partnerId: creatorId }]);
        }, { completed });
    });
}

for (const mode of ['single', 'duel']) {
    test(`fourth ${mode} game requires Premium before any board is ended`, async () => {
        const existing = makeGame({ _id: oldGameId, creatorId, partnerId, mode, status: 'active', difficulty: 'easy' });
        await withLimitFixture(async state => {
            const response = makeResponse();
            await createHandler({ body: { creatorId, partnerId, mode, forceNew: true, replaceGameId: oldGameId } }, response);
            assert.equal(response.statusCode, 403);
            assert.equal(response.body.code, 'WORD_SEARCH_FREE_LIMIT_REACHED');
            assert.deepEqual(response.body.data, { freeGameLimit: 3, completedGames: 3 });
            assert.equal(state.creates, 0);
            assert.deepEqual(state.replacements, []);
            assert.equal(existing.status, 'active');
        }, { completed: 3, existing });
    });
}

test('a free partner at the limit also blocks a new duel', async () => {
    await withLimitFixture(async state => {
        const response = makeResponse();
        await createHandler({ body: { creatorId, partnerId, mode: 'duel' } }, response);
        assert.equal(response.statusCode, 403);
        assert.match(response.body.message, /Your partner/);
        assert.equal(state.creates, 0);
    }, { completed: 0, partnerCompleted: 3 });
});

for (const premiumOwner of [creatorId, partnerId]) {
    test(`Premium from ${premiumOwner === creatorId ? 'self' : 'partner'} unlocks unlimited games`, async () => {
        await withLimitFixture(async state => {
            const response = makeResponse();
            await createHandler({ body: { creatorId, partnerId, mode: 'duel' } }, response);
            assert.equal(response.statusCode, 201);
            assert.equal(state.creates, 1);
            assert.deepEqual(state.counts, []);
        }, { completed: 10, partnerCompleted: 10, premiumOwner });
    });
}

test('an unfinished game remains resumable after the free limit', async () => {
    const existing = makeGame({ _id: oldGameId, creatorId, mode: 'single', status: 'active', difficulty: 'easy' });
    await withLimitFixture(async state => {
        const response = makeResponse();
        await createHandler({ body: { creatorId, mode: 'single' } }, response);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.isExisting, true);
        assert.equal(response.body.data._id, oldGameId);
        assert.equal(state.creates, 0);
        assert.deepEqual(state.counts, []);
    }, { completed: 3, existing });
});

test('an allowed fresh puzzle replaces the displayed board across modes after the limit check', async () => {
    const existing = makeGame({ _id: oldGameId, creatorId, partnerId, mode: 'duel', status: 'active', difficulty: 'easy' });
    await withLimitFixture(async state => {
        const response = makeResponse();
        await createHandler({ body: { creatorId, mode: 'single', forceNew: true, replaceGameId: oldGameId } }, response);
        assert.equal(response.statusCode, 201);
        assert.deepEqual(state.replacements[0], { _id: oldGameId, status: 'active' });
        assert.equal(state.creates, 1);
    }, { completed: 2, existing });
});

test('a fresh puzzle cannot abandon someone else’s board', async () => {
    const existing = makeGame({ _id: oldGameId, creatorId: partnerId, mode: 'single', status: 'active', difficulty: 'easy' });
    await withLimitFixture(async state => {
        const response = makeResponse();
        await createHandler({ body: { creatorId, mode: 'single', forceNew: true, replaceGameId: oldGameId } }, response);
        assert.equal(response.statusCode, 403);
        assert.equal(state.creates, 0);
        assert.deepEqual(state.replacements, []);
    }, { completed: 0, existing });
});

test('released clients can start unlimited solo games and retain their Medium default', async () => {
    await withLimitFixture(async state => {
        const response = makeResponse();
        await legacyCreateHandler({ body: { creatorId, mode: 'single' } }, response);
        assert.equal(response.statusCode, 201);
        assert.equal(response.body.data.protocolVersion, 1);
        assert.equal(response.body.data.difficulty, 'medium');
        assert.equal(response.body.data.gridSize, 10);
        assert.equal(state.creates, 1);
        assert.deepEqual(state.counts, []);
    }, { completed: 30 });
});

for (const legacyPlayer of [creatorId, partnerId]) {
    test(`a mixed-version duel stays free when the ${legacyPlayer === creatorId ? 'creator' : 'partner'} has an old device`, async () => {
        await withLimitFixture(async state => {
            const entry = connectedUsers.get(legacyPlayer);
            entry.socketIds.add('old-device');
            entry.wordSearchVersions.set('old-device', 1);
            const response = makeResponse();
            await createHandler({ body: { creatorId, partnerId, mode: 'duel' } }, response);
            assert.equal(response.statusCode, 201);
            assert.equal(response.body.data.protocolVersion, 1);
            assert.equal(state.creates, 1);
            assert.deepEqual(state.counts, []);
        }, { completed: 10, partnerCompleted: 10 });
    });
}

for (const router of [legacyWordSearchRoutes, wordSearchRoutes]) {
    test(`${router === legacyWordSearchRoutes ? 'legacy' : 'updated'} route preserves automatic rematches for legacy rounds`, async t => {
        const game = makeGame({ _id: oldGameId, creatorId, partnerId, mode: 'duel', status: 'active', difficulty: 'medium' });
        game.protocolVersion = 1;
        game.words[0].start = { row: 0, col: 0 };
        game.words[0].end = { row: 0, col: 2 };
        game.save = async () => game;
        let rematch;
        const links = [];
        t.mock.method(WordSearchGame, 'findById', async () => game);
        t.mock.method(WordSearchGame, 'findOne', async () => null);
        t.mock.method(WordSearchGame, 'init', async () => WordSearchGame);
        t.mock.method(WordSearchGame, 'create', async document => {
            rematch = { ...makeGame({ _id: '507f191e810c19729de860eb', ...document }), ...document };
            return rematch;
        });
        t.mock.method(WordSearchGame, 'updateOne', async (filter, update) => links.push({ filter, update }));
        t.after(() => { if (rematch) { rematch.status = 'abandoned'; scheduleWordSearchTurn(rematch); } });
        const findHandler = router.stack.find(layer => layer.route?.path === '/:id/find').route.stack[0].handle;
        const response = makeResponse();
        await findHandler({ params: { id: game._id }, body: {
            userId: creatorId, start: { row: 0, col: 0 }, end: { row: 0, col: 2 },
        } }, response);
        assert.equal(response.statusCode, 200);
        assert.equal(response.body.data.status, 'completed');
        assert.equal(response.body.data.creatorScore, 1);
        assert.equal(response.body.rematch.protocolVersion, 1);
        assert.equal(response.body.rematch.creatorId, partnerId);
        assert.equal(response.body.rematch.partnerId, creatorId);
        assert.equal(response.body.rematch.currentTurn, partnerId);
        assert.equal(response.body.rematch.rematchOf, oldGameId);
        assert.ok(new Date(response.body.rematch.startsAt).getTime() > Date.now() + 5000);
        assert.equal(links[0].update.$set.rematchGameId, rematch._id);
    });
}

test('the legacy read route resumes a paused modern board with the same score and remaining turn', async t => {
    const game = makeGame({ _id: oldGameId, creatorId, partnerId, mode: 'duel', status: 'active', difficulty: 'easy' });
    Object.assign(game, { creatorScore: 2, partnerScore: 1, turnPausedAt: new Date(), turnExpiresAt: null, turnRemainingMs: 17000, save: async () => game });
    t.mock.method(WordSearchGame, 'findById', async () => game);
    t.after(() => { game.status = 'abandoned'; scheduleWordSearchTurn(game); });
    const handler = legacyWordSearchRoutes.stack.find(layer => layer.route?.path === '/:id').route.stack[0].handle;
    const response = makeResponse();
    const before = Date.now();
    await handler({ params: { id: oldGameId }, query: { userId: creatorId } }, response);
    assert.equal(response.statusCode, 200);
    assert.equal(response.body.data.protocolVersion, 1);
    assert.equal(response.body.data.turnPausedAt, null);
    assert.equal(response.body.data.creatorScore, 2);
    assert.equal(response.body.data.partnerScore, 1);
    assert.equal(response.body.data.currentTurn, creatorId);
    assert.ok(game.turnExpiresAt.getTime() >= before + 17000);
    assert.ok(game.turnExpiresAt.getTime() <= Date.now() + 17000);
});

test('a concurrent explicit start is reused by the legacy automatic rematch', async t => {
    const completed = makeGame({ _id: oldGameId, creatorId, partnerId, mode: 'duel', status: 'completed', difficulty: 'easy' });
    completed.protocolVersion = 1;
    const active = makeGame({ _id: '507f191e810c19729de860eb', creatorId, partnerId, mode: 'duel', status: 'active', difficulty: 'easy' });
    active.save = async () => active;
    t.mock.method(WordSearchGame, 'init', async () => WordSearchGame);
    t.mock.method(WordSearchGame, 'create', async () => { throw Object.assign(new Error('active pair already exists'), { code: 11000 }); });
    t.mock.method(WordSearchGame, 'findOne', async filter => filter.status === 'active' ? active : null);
    t.mock.method(WordSearchGame, 'findById', async () => active);
    const links = [];
    t.mock.method(WordSearchGame, 'updateOne', async (filter, update) => links.push(update));
    const result = await createAutomaticWordSearchRematch(completed);
    assert.equal(result._id, active._id);
    assert.equal(result.protocolVersion, 1);
    assert.equal(links[0].$set.rematchGameId, active._id);
});
