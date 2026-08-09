import test from 'node:test';
import assert from 'node:assert/strict';
import {
    findEntryBySelection,
    generateWordSearch,
    getSelectionCoordinates,
    WORD_SEARCH_DIFFICULTIES,
} from '../services/wordSearch/gameEngine.js';
import {
    claimWordSearchSelection,
    createAutomaticWordSearchRematch,
    serializeWordSearchGame,
    synchronizeWordSearchTurn,
} from '../services/wordSearch/gameService.js';
import WordSearchGame from '../models/WordSearchGame.js';

const makeRandom = (seed = 123456789) => () => {
    seed = (1664525 * seed + 1013904223) % 4294967296;
    return seed / 4294967296;
};

test('word-search generator places every listed word inside the generated grid', () => {
    for (const difficulty of Object.keys(WORD_SEARCH_DIFFICULTIES)) {
        const puzzle = generateWordSearch({ difficulty, random: makeRandom(42) });
        const config = WORD_SEARCH_DIFFICULTIES[difficulty];

        assert.equal(puzzle.grid.length, config.gridSize);
        assert.equal(puzzle.entries.length, config.wordCount);
        assert.ok(puzzle.grid.every(row => row.length === config.gridSize));

        for (const entry of puzzle.entries) {
            const coordinates = getSelectionCoordinates(entry.start, entry.end, config.gridSize);
            const letters = coordinates.map(({ row, col }) => puzzle.grid[row][col]).join('');
            assert.equal(letters, entry.word);
        }
    }
});

test('selection accepts horizontal, vertical, and diagonal lines in either direction', () => {
    assert.deepEqual(getSelectionCoordinates({ row: 2, col: 1 }, { row: 2, col: 4 }, 8), [
        { row: 2, col: 1 }, { row: 2, col: 2 }, { row: 2, col: 3 }, { row: 2, col: 4 },
    ]);
    assert.equal(getSelectionCoordinates({ row: 1, col: 1 }, { row: 3, col: 2 }, 8), null);

    const entries = [{
        word: 'LOVE',
        start: { row: 1, col: 1 },
        end: { row: 4, col: 4 },
    }];
    assert.equal(findEntryBySelection(entries, { row: 1, col: 1 }, { row: 4, col: 4 }, 8)?.word, 'LOVE');
    assert.equal(findEntryBySelection(entries, { row: 4, col: 4 }, { row: 1, col: 1 }, 8)?.word, 'LOVE');
});

test('selection rejects short, bent, and out-of-grid lines', () => {
    assert.equal(getSelectionCoordinates({ row: 0, col: 0 }, { row: 0, col: 1 }, 8), null);
    assert.equal(getSelectionCoordinates({ row: 0, col: 0 }, { row: 2, col: 1 }, 8), null);
    assert.equal(getSelectionCoordinates({ row: -1, col: 0 }, { row: 2, col: 0 }, 8), null);
});

test('public game payload hides unfound coordinates until completion', () => {
    const game = {
        _id: 'game-1',
        mode: 'duel',
        difficulty: 'easy',
        creatorId: 'user-1',
        partnerId: 'user-2',
        gridSize: 8,
        grid: Array(8).fill('ABCDEFGH'),
        currentTurn: 'user-1',
        creatorScore: 1,
        partnerScore: 0,
        status: 'active',
        winner: null,
        isDraw: false,
        moveHistory: [],
        words: [
            { word: 'LOVE', start: { row: 0, col: 0 }, end: { row: 0, col: 3 }, foundBy: 'user-1' },
            { word: 'HEART', start: { row: 1, col: 0 }, end: { row: 1, col: 4 }, foundBy: null },
        ],
    };

    const payload = serializeWordSearchGame(game);
    assert.deepEqual(payload.words[0].start, { row: 0, col: 0 });
    assert.equal(payload.words[1].start, undefined);
    assert.equal(payload.foundCount, 1);

    game.status = 'completed';
    assert.deepEqual(serializeWordSearchGame(game).words[1].start, { row: 1, col: 0 });
});

test('duel keeps the turn after correct and incorrect selections', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const originalFindById = WordSearchGame.findById;
    const makeGame = () => ({
        _id: '507f1f77bcf86cd799439012',
        mode: 'duel',
        status: 'active',
        creatorId,
        partnerId,
        currentTurn: creatorId,
        gridSize: 8,
        creatorScore: 0,
        partnerScore: 0,
        moveHistory: [],
        words: [{
            word: 'LOVE',
            start: { row: 0, col: 0 },
            end: { row: 0, col: 3 },
            foundBy: null,
        }, {
            word: 'HEART',
            start: { row: 1, col: 0 },
            end: { row: 1, col: 4 },
            foundBy: null,
        }],
        save: async () => {},
    });

    try {
        const foundGame = makeGame();
        WordSearchGame.findById = async () => foundGame;
        const found = await claimWordSearchSelection({
            gameId: foundGame._id,
            userId: creatorId,
            start: { row: 0, col: 0 },
            end: { row: 0, col: 3 },
        });
        assert.equal(found.foundWord, 'LOVE');
        assert.equal(foundGame.creatorScore, 1);
        assert.equal(String(foundGame.currentTurn), creatorId);

        const secondFound = await claimWordSearchSelection({
            gameId: foundGame._id,
            userId: creatorId,
            start: { row: 1, col: 0 },
            end: { row: 1, col: 4 },
        });
        assert.equal(secondFound.foundWord, 'HEART');
        assert.equal(foundGame.creatorScore, 2);
        assert.equal(String(foundGame.currentTurn), creatorId);

        const missedGame = makeGame();
        WordSearchGame.findById = async () => missedGame;
        await assert.rejects(
            claimWordSearchSelection({
                gameId: missedGame._id,
                userId: creatorId,
                start: { row: 2, col: 0 },
                end: { row: 2, col: 3 },
            }),
            error => error.code === 'WORD_NOT_FOUND' && error.status === 422,
        );
        assert.equal(missedGame.creatorScore, 0);
        assert.equal(String(missedGame.currentTurn), creatorId);
        assert.equal(missedGame.moveHistory.length, 0);
    } finally {
        WordSearchGame.findById = originalFindById;
    }
});

test('duel advances only when the 45-second turn expires', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const originalFindById = WordSearchGame.findById;
    const game = {
        _id: '507f1f77bcf86cd799439012',
        mode: 'duel',
        status: 'active',
        creatorId,
        partnerId,
        currentTurn: creatorId,
        turnStartedAt: new Date('2026-08-09T10:00:00.000Z'),
        turnExpiresAt: new Date('2026-08-09T10:00:45.000Z'),
        save: async () => {},
    };

    try {
        WordSearchGame.findById = async () => game;
        const result = await synchronizeWordSearchTurn({
            gameId: game._id,
            now: new Date('2026-08-09T10:00:46.000Z'),
        });

        assert.equal(result.advanced, true);
        assert.equal(result.turnsElapsed, 1);
        assert.equal(String(game.currentTurn), partnerId);
        assert.equal(game.turnStartedAt.toISOString(), '2026-08-09T10:00:45.000Z');
        assert.equal(game.turnExpiresAt.toISOString(), '2026-08-09T10:01:30.000Z');
    } finally {
        WordSearchGame.findById = originalFindById;
    }
});

test('duel rejects selections while the rematch countdown is running', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const originalFindById = WordSearchGame.findById;
    const game = {
        _id: '507f1f77bcf86cd799439012',
        mode: 'duel',
        status: 'active',
        creatorId,
        partnerId: '507f191e810c19729de860ea',
        currentTurn: creatorId,
        startsAt: new Date(Date.now() + 2_000),
        turnExpiresAt: new Date(Date.now() + 47_000),
    };

    try {
        WordSearchGame.findById = async () => game;
        await assert.rejects(
            claimWordSearchSelection({
                gameId: game._id,
                userId: creatorId,
                start: { row: 0, col: 0 },
                end: { row: 0, col: 3 },
            }),
            error => error.code === 'GAME_NOT_STARTED' && error.status === 409,
        );
    } finally {
        WordSearchGame.findById = originalFindById;
    }
});

test('automatic rematch swaps the opener and links back to the completed game', async () => {
    const creatorId = '507f1f77bcf86cd799439011';
    const partnerId = '507f191e810c19729de860ea';
    const completedGameId = '507f1f77bcf86cd799439012';
    const rematchId = '507f191e810c19729de860eb';
    const originalFindOne = WordSearchGame.findOne;
    const originalCreate = WordSearchGame.create;
    const originalUpdateOne = WordSearchGame.updateOne;
    let createdDocument;

    try {
        WordSearchGame.findOne = async () => null;
        WordSearchGame.create = async document => {
            createdDocument = document;
            return { _id: rematchId, ...document };
        };
        WordSearchGame.updateOne = async () => ({ modifiedCount: 1 });

        const rematch = await createAutomaticWordSearchRematch({
            _id: completedGameId,
            mode: 'duel',
            status: 'completed',
            difficulty: 'easy',
            creatorId,
            partnerId,
        });

        assert.equal(String(rematch._id), rematchId);
        assert.equal(String(createdDocument.creatorId), partnerId);
        assert.equal(String(createdDocument.partnerId), creatorId);
        assert.equal(String(createdDocument.currentTurn), partnerId);
        assert.equal(String(createdDocument.rematchOf), completedGameId);
        assert.equal(
            createdDocument.turnExpiresAt.getTime() - createdDocument.startsAt.getTime(),
            45_000,
        );
    } finally {
        WordSearchGame.findOne = originalFindOne;
        WordSearchGame.create = originalCreate;
        WordSearchGame.updateOne = originalUpdateOne;
    }
});
