import mongoose from 'mongoose';
import WordSearchGame from '../../models/WordSearchGame.js';
import { findEntryBySelection, generateWordSearch, getSelectionCoordinates } from './gameEngine.js';

export class WordSearchError extends Error {
    constructor(code, message, status = 400) {
        super(message);
        this.code = code;
        this.status = status;
    }
}

const idOf = value => String(value?._id || value || '');

export const WORD_SEARCH_TURN_DURATION_MS = 45_000;
export const WORD_SEARCH_REMATCH_COUNTDOWN_MS = 6_000;

const applyTurnClock = (game, now = new Date()) => {
    if (game?.mode !== 'duel' || game?.status !== 'active') {
        return { changed: false, advanced: false, turnsElapsed: 0 };
    }

    const nowMs = now.getTime();
    const expiresAtMs = game.turnExpiresAt ? new Date(game.turnExpiresAt).getTime() : Number.NaN;
    if (!Number.isFinite(expiresAtMs)) {
        game.turnStartedAt = now;
        game.turnExpiresAt = new Date(nowMs + WORD_SEARCH_TURN_DURATION_MS);
        return { changed: true, advanced: false, turnsElapsed: 0 };
    }
    if (expiresAtMs > nowMs) {
        return { changed: false, advanced: false, turnsElapsed: 0 };
    }

    const turnsElapsed = Math.floor((nowMs - expiresAtMs) / WORD_SEARCH_TURN_DURATION_MS) + 1;
    const previousTurn = idOf(game.currentTurn);
    if (turnsElapsed % 2 === 1) {
        game.currentTurn = previousTurn === idOf(game.creatorId) ? game.partnerId : game.creatorId;
    }
    game.turnStartedAt = new Date(expiresAtMs + ((turnsElapsed - 1) * WORD_SEARCH_TURN_DURATION_MS));
    game.turnExpiresAt = new Date(expiresAtMs + (turnsElapsed * WORD_SEARCH_TURN_DURATION_MS));

    return {
        changed: true,
        advanced: true,
        turnsElapsed,
        previousTurn,
    };
};

export const isWordSearchPlayer = (game, userId) => (
    idOf(game?.creatorId) === String(userId)
    || (game?.mode === 'duel' && idOf(game?.partnerId) === String(userId))
);

export const serializeWordSearchGame = (game) => {
    const source = game?.toObject ? game.toObject() : game;
    if (!source) return null;
    const revealAll = source.status === 'completed';

    return {
        _id: source._id,
        mode: source.mode,
        difficulty: source.difficulty,
        creatorId: source.creatorId,
        partnerId: source.partnerId,
        gridSize: source.gridSize,
        grid: source.grid,
        currentTurn: source.currentTurn,
        startsAt: source.startsAt,
        turnStartedAt: source.turnStartedAt,
        turnExpiresAt: source.turnExpiresAt,
        turnDurationSeconds: WORD_SEARCH_TURN_DURATION_MS / 1000,
        creatorScore: source.creatorScore,
        partnerScore: source.partnerScore,
        status: source.status,
        winner: source.winner,
        isDraw: source.isDraw,
        foundCount: source.words.filter(entry => entry.foundBy).length,
        totalWords: source.words.length,
        words: source.words.map(entry => ({
            word: entry.word,
            foundBy: entry.foundBy,
            foundAt: entry.foundAt,
            ...(entry.foundBy || revealAll ? { start: entry.start, end: entry.end } : {}),
        })),
        moveHistory: source.moveHistory,
        createdAt: source.createdAt,
        updatedAt: source.updatedAt,
        completedAt: source.completedAt,
        rematchOf: source.rematchOf,
        rematchGameId: source.rematchGameId,
    };
};

export const createWordSearchGame = async ({
    creatorId,
    partnerId = null,
    mode = 'single',
    difficulty = 'medium',
    firstPlayerId,
    startsAt,
    rematchOf = null,
}) => {
    const generated = generateWordSearch({ difficulty });
    const now = new Date();
    const roundStartsAt = startsAt ? new Date(startsAt) : now;
    return WordSearchGame.create({
        creatorId,
        partnerId: mode === 'duel' ? partnerId : null,
        mode,
        difficulty,
        gridSize: generated.gridSize,
        grid: generated.grid,
        words: generated.entries,
        currentTurn: firstPlayerId || creatorId,
        startsAt: mode === 'duel' ? roundStartsAt : null,
        turnStartedAt: mode === 'duel' ? roundStartsAt : null,
        turnExpiresAt: mode === 'duel'
            ? new Date(roundStartsAt.getTime() + WORD_SEARCH_TURN_DURATION_MS)
            : null,
        rematchOf,
    });
};

export const createAutomaticWordSearchRematch = async (completedGame) => {
    if (!completedGame || completedGame.mode !== 'duel' || completedGame.status !== 'completed') {
        return null;
    }

    const completedGameId = idOf(completedGame._id);
    const existing = await WordSearchGame.findOne({ rematchOf: completedGameId });
    if (existing) {
        await WordSearchGame.updateOne(
            { _id: completedGameId, rematchGameId: null },
            { $set: { rematchGameId: existing._id } },
        );
        return existing;
    }

    const previousCreatorId = idOf(completedGame.creatorId);
    const previousPartnerId = idOf(completedGame.partnerId);
    const startsAt = new Date(Date.now() + WORD_SEARCH_REMATCH_COUNTDOWN_MS);

    let rematch;
    try {
        // Swap creator order so the opening turn alternates each round.
        rematch = await createWordSearchGame({
            creatorId: previousPartnerId,
            partnerId: previousCreatorId,
            mode: 'duel',
            difficulty: completedGame.difficulty,
            firstPlayerId: previousPartnerId,
            startsAt,
            rematchOf: completedGameId,
        });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        rematch = await WordSearchGame.findOne({ rematchOf: completedGameId });
        if (!rematch) throw error;
    }

    await WordSearchGame.updateOne(
        { _id: completedGameId, rematchGameId: null },
        { $set: { rematchGameId: rematch._id } },
    );
    return rematch;
};

export const synchronizeWordSearchTurn = async ({ gameId, now = new Date() }) => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
        const game = await WordSearchGame.findById(gameId);
        if (!game) throw new WordSearchError('GAME_NOT_FOUND', 'Game not found', 404);

        const clockResult = applyTurnClock(game, now);
        if (!clockResult.changed) return { game, ...clockResult };

        try {
            await game.save();
            return { game, ...clockResult };
        } catch (error) {
            if (error?.name !== 'VersionError' || attempt === 2) throw error;
        }
    }

    throw new WordSearchError('STALE_GAME', 'The game changed; please try again', 409);
};

export const claimWordSearchSelection = async ({ gameId, userId, start, end }) => {
    if (!mongoose.isValidObjectId(gameId) || !mongoose.isValidObjectId(userId)) {
        throw new WordSearchError('INVALID_REQUEST', 'Invalid game or user ID');
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
        const game = await WordSearchGame.findById(gameId);
        if (!game) throw new WordSearchError('GAME_NOT_FOUND', 'Game not found', 404);
        if (!isWordSearchPlayer(game, userId)) {
            throw new WordSearchError('NOT_A_PLAYER', 'You are not a player in this game', 403);
        }
        if (game.status !== 'active') {
            throw new WordSearchError('GAME_COMPLETE', 'This game is already complete', 409);
        }
        if (game.startsAt && new Date(game.startsAt).getTime() > Date.now()) {
            throw new WordSearchError('GAME_NOT_STARTED', 'The rematch countdown is still running', 409);
        }

        const clockResult = applyTurnClock(game, new Date());
        if (clockResult.changed) {
            try {
                await game.save();
                continue;
            } catch (error) {
                if (error?.name !== 'VersionError' || attempt === 2) throw error;
                continue;
            }
        }
        if (game.mode === 'duel' && idOf(game.currentTurn) !== String(userId)) {
            throw new WordSearchError('NOT_YOUR_TURN', 'Wait for your partner’s turn to end', 409);
        }

        if (!getSelectionCoordinates(start, end, game.gridSize)) {
            throw new WordSearchError(
                'INVALID_SELECTION',
                'Choose a straight or diagonal line of at least 3 letters',
                422,
            );
        }
        const entry = findEntryBySelection(game.words, start, end, game.gridSize);
        if (!entry) {
            throw new WordSearchError(
                'WORD_NOT_FOUND',
                'That line is not one of the hidden words',
                422,
            );
        }
        if (entry.foundBy) {
            throw new WordSearchError(
                'WORD_ALREADY_FOUND',
                'That word was already found',
                409,
            );
        }

        const now = new Date();
        const isCreator = idOf(game.creatorId) === String(userId);

        entry.foundBy = userId;
        entry.foundAt = now;
        if (isCreator) game.creatorScore += 1;
        else game.partnerScore += 1;
        game.moveHistory.push({ word: entry.word, result: 'found', playerId: userId, start, end, createdAt: now });

        const completed = game.words.every(word => Boolean(word.foundBy));
        if (completed) {
            game.status = 'completed';
            game.completedAt = now;
            game.turnExpiresAt = null;
            game.isDraw = game.mode === 'duel' && game.creatorScore === game.partnerScore;
            if (!game.isDraw) {
                game.winner = game.mode === 'single'
                    ? game.creatorId
                    : (game.creatorScore > game.partnerScore ? game.creatorId : game.partnerId);
            }
        }

        try {
            await game.save();
            return { game, foundWord: entry.word };
        } catch (error) {
            if (error?.name !== 'VersionError' || attempt === 2) {
                if (error?.name === 'VersionError') {
                    throw new WordSearchError('STALE_GAME', 'The game changed; please try again', 409);
                }
                throw error;
            }
        }
    }

    throw new WordSearchError('STALE_GAME', 'The game changed; please try again', 409);
};
