import test from 'node:test';
import assert from 'node:assert/strict';
import wordSearchRoutes from '../routes/wordSearch.js';
import WordSearchGame from '../models/WordSearchGame.js';
import User from '../models/User.js';
import { connectedUsers } from '../socket/auth.js';

const createHandler = wordSearchRoutes.stack.find(layer => layer.route?.path === '/create').route.stack[0].handle;

const makeGame = ({ _id, creatorId, partnerId = null, mode = 'single', status, difficulty }) => ({
    _id,
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
        connectedUsers.set(partnerId, { socketIds: new Set(['online']) });
        User.findById = () => ({ select: async () => ({ _id: creatorId, partnerId }) });
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
        connectedUsers.set(partnerId, { socketIds: new Set(['online']) });
        User.findById = () => ({ select: async () => ({ _id: creatorId, partnerId }) });
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
        if (originalPresence) connectedUsers.set(partnerId, originalPresence);
        else connectedUsers.delete(partnerId);
    }
});
