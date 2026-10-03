import express from 'express';
import mongoose from 'mongoose';
import WordSearchGame from '../models/WordSearchGame.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import { getIO } from '../socket/index.js';
import { getCoupleRoomId, hasLegacyWordSearchClient, isUserOnline, supportsModernWordSearch } from '../socket/auth.js';
import {
    claimWordSearchSelection,
    createAutomaticWordSearchRematch,
    createWordSearchGame,
    isWordSearchPlayer,
    serializeWordSearchGame,
    WordSearchError,
} from '../services/wordSearch/gameService.js';
import { FREE_WORD_SEARCH_GAME_LIMIT, getWordSearchLimitStatus } from '../services/wordSearch/accessService.js';
import { WORD_SEARCH_DIFFICULTIES } from '../services/wordSearch/gameEngine.js';
import { refreshWordSearchTurn, scheduleWordSearchTurn } from '../services/wordSearch/turnTimer.js';

const idOf = value => String(value?._id || value || '');

const populateGame = game => game.populate([
    { path: 'creatorId', select: 'name nickname avatar' },
    { path: 'partnerId', select: 'name nickname avatar' },
    { path: 'winner', select: 'name nickname avatar' },
]);

const activeGameFilter = ({ creatorId, partnerId, mode }) => mode === 'single'
    ? { creatorId, mode: 'single', status: 'active' }
    : {
        mode: 'duel',
        status: 'active',
        $or: [
            { creatorId, partnerId },
            { creatorId: partnerId, partnerId: creatorId },
        ],
    };

const endActiveGamesForFreshPuzzle = async filter => {
    // The conditional update also invalidates a word claim loaded just before
    // the board was ended by advancing its optimistic-concurrency version.
    for (let attempt = 0; attempt < 10; attempt += 1) {
        const game = await WordSearchGame.findOneAndUpdate(
            filter,
            {
                $set: { status: 'abandoned', completedAt: new Date(), turnExpiresAt: null },
                $inc: { __v: 1 },
            },
            { new: true },
        );
        if (!game) return;
        scheduleWordSearchTurn(game);
        await populateGame(game);
        emitWordSearchUpdate(game);
    }
    throw new WordSearchError('STALE_GAME', 'Could not replace the active puzzle; please try again', 409);
};

export const emitWordSearchUpdate = (game, eventName = 'wordsearch:updated', metadata = {}) => {
    const io = getIO();
    if (!io || !game) return;
    const payload = {
        gameId: idOf(game._id),
        game: serializeWordSearchGame(game),
        eventName,
        timestamp: new Date().toISOString(),
        ...metadata,
    };

    let rooms = io.to(`wordsearch_${idOf(game._id)}`);
    const creatorId = idOf(game.creatorId);
    const partnerId = idOf(game.partnerId);
    const coupleRoom = getCoupleRoomId(creatorId, partnerId);
    if (coupleRoom) rooms = rooms.to(coupleRoom);
    rooms.emit(eventName, payload);
};

const sendError = (res, error, fallbackMessage) => {
    if (error instanceof WordSearchError) {
        return res.status(error.status).json({
            success: false,
            code: error.code,
            message: error.message,
        });
    }
    console.error(`❌ ${fallbackMessage}:`, error);
    return res.status(500).json({ success: false, message: fallbackMessage });
};

// Both URLs share storage and events; each saved round carries its rules.
export const createWordSearchRouter = ({ legacy = false } = {}) => {
    const router = express.Router();
    router.use((req, res, next) => {
        res.set('X-Word-Search-API-Version', legacy ? '1' : '2');
        next();
    });

    /** Create or resume a word-search game. */
    router.post('/create', async (req, res) => {
        try {
            const {
                creatorId,
                partnerId = null,
                mode = 'single',
                difficulty = legacy ? 'medium' : 'easy',
                forceNew = false,
                replaceGameId = null,
            } = req.body || {};

            if (!mongoose.isValidObjectId(creatorId)) {
                return res.status(400).json({ success: false, message: 'A valid creatorId is required' });
            }
            if (!['single', 'duel'].includes(mode)) {
                return res.status(400).json({ success: false, message: 'mode must be single or duel' });
            }
            if (!WORD_SEARCH_DIFFICULTIES[difficulty]) {
                return res.status(400).json({ success: false, message: 'difficulty must be easy, medium, or hard' });
            }

            const creator = await User.findById(creatorId).select('name nickname partnerId');
            if (!creator) return res.status(404).json({ success: false, message: 'Creator not found' });

            if (mode === 'duel') {
                if (!mongoose.isValidObjectId(partnerId) || String(partnerId) === String(creatorId)) {
                    return res.status(400).json({ success: false, message: 'A valid partnerId is required for duel mode' });
                }
                if (idOf(creator.partnerId) !== String(partnerId)) {
                    return res.status(403).json({ success: false, message: 'Duel games can only be created with your linked partner' });
                }
                if (!isUserOnline(partnerId)) {
                    return res.status(409).json({
                        success: false,
                        code: 'PARTNER_OFFLINE',
                        message: 'Your partner just went offline. Play solo or send a nudge.',
                    });
                }
            }

            // Resume remains available after the free allowance is exhausted.
            const activeFilter = activeGameFilter({ creatorId, partnerId, mode });
            let existing = await WordSearchGame.findOne(activeFilter).sort({ createdAt: -1 });
            if (existing && forceNew !== true) {
                existing = await refreshWordSearchTurn(existing, { legacyClient: legacy });
                await populateGame(existing);
                return res.json({
                    success: true,
                    data: serializeWordSearchGame(existing),
                    isExisting: true,
                    message: 'Active word-search game already exists',
                });
            }

            const protocolVersion = legacy || (mode === 'duel' && (hasLegacyWordSearchClient(creatorId) || !supportsModernWordSearch(partnerId))) ? 1 : 2;
            // Legacy and mixed-version rounds remain free for both participants.
            if (protocolVersion === 2) {
                // Check both participants before ending any board or creating a puzzle.
                const [creatorLimit, partnerLimit] = await Promise.all([
                    getWordSearchLimitStatus(creatorId),
                    mode === 'duel' ? getWordSearchLimitStatus(partnerId) : Promise.resolve(null),
                ]);
                if (creatorLimit.limitReached || partnerLimit?.limitReached) {
                    const limit = creatorLimit.limitReached ? creatorLimit : partnerLimit;
                    return res.status(403).json({
                        success: false,
                        code: 'WORD_SEARCH_FREE_LIMIT_REACHED',
                        message: creatorLimit.limitReached
                            ? 'You have used all 3 free Word Search games. Unlock Premium to keep playing.'
                            : 'Your partner has used all 3 free Word Search games. Premium is required to continue.',
                        data: { freeGameLimit: FREE_WORD_SEARCH_GAME_LIMIT, completedGames: limit.completedGames },
                    });
                }
            }

            if (forceNew === true) {
                if (replaceGameId) {
                    if (!mongoose.isValidObjectId(replaceGameId)) {
                        return res.status(400).json({ success: false, message: 'A valid replaceGameId is required' });
                    }
                    const previousGame = await WordSearchGame.findById(replaceGameId);
                    if (!previousGame || !isWordSearchPlayer(previousGame, creatorId)) {
                        return res.status(403).json({ success: false, message: 'You cannot replace this game' });
                    }
                    // The displayed board can be in another mode than the new one.
                    await endActiveGamesForFreshPuzzle({ _id: replaceGameId, status: 'active' });
                }
                await endActiveGamesForFreshPuzzle(activeFilter);
            }

            const game = await createWordSearchGame({ creatorId, partnerId, mode, difficulty, protocolVersion });
            scheduleWordSearchTurn(game);
            await populateGame(game);
            emitWordSearchUpdate(game, mode === 'duel' ? 'wordsearch:invited' : 'wordsearch:updated');

            res.status(201).json({
                success: true,
                data: serializeWordSearchGame(game),
                isExisting: false,
            });

            if (mode === 'duel') {
                const creatorName = creator.nickname || creator.name || 'Your partner';
                void sendPushNotification(
                    partnerId,
                    '🔎 Word Search Challenge!',
                    `${creatorName} challenged you to find the hidden words.`,
                    { type: 'wordsearch', gameId: idOf(game._id) },
                ).catch(() => {});
            }
            return undefined;
        } catch (error) {
            if (error?.code === 11000) {
                const { creatorId, partnerId = null, mode = 'single' } = req.body || {};
                let existing = await WordSearchGame.findOne(
                    activeGameFilter({ creatorId, partnerId, mode }),
                ).sort({ createdAt: -1 });
                if (existing) {
                    existing = await refreshWordSearchTurn(existing, { legacyClient: legacy });
                    await populateGame(existing);
                    return res.json({ success: true, data: serializeWordSearchGame(existing), isExisting: true });
                }
            }
            return sendError(res, error, 'Failed to create word-search game');
        }
    });

    /** Fetch the latest active game for a user. Optional ?mode=single|duel. */
    router.get('/active/:userId', async (req, res) => {
        try {
            const { userId } = req.params;
            if (!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({ success: false, message: 'Invalid user ID' });
            }
            const filter = {
                status: 'active',
                $or: [{ creatorId: userId }, { partnerId: userId }],
            };
            if (['single', 'duel'].includes(req.query.mode)) filter.mode = req.query.mode;

            let game = await WordSearchGame.findOne(filter).sort({ updatedAt: -1 });
            if (game) {
                game = await refreshWordSearchTurn(game, { legacyClient: legacy });
                await populateGame(game);
            }
            return res.json({
                success: true,
                data: serializeWordSearchGame(game),
                hasActiveGame: Boolean(game),
            });
        } catch (error) {
            return sendError(res, error, 'Failed to fetch active word-search game');
        }
    });

    /** Fetch a game without leaking coordinates for unfound words. */
    router.get('/:id', async (req, res) => {
        try {
            const { userId } = req.query;
            let game = await WordSearchGame.findById(req.params.id);
            if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
            if (!userId || !isWordSearchPlayer(game, userId)) {
                return res.status(403).json({ success: false, message: 'You are not a player in this game' });
            }
            game = await refreshWordSearchTurn(game, { legacyClient: legacy });
            await populateGame(game);
            return res.json({ success: true, data: serializeWordSearchGame(game) });
        } catch (error) {
            return sendError(res, error, 'Failed to fetch word-search game');
        }
    });

    /** Claim a word; duel players may keep finding words until their timer ends. */
    router.post('/:id/find', async (req, res) => {
        try {
            const { userId, start, end } = req.body || {};
            const { game, foundWord } = await claimWordSearchSelection({
                gameId: req.params.id,
                userId,
                start,
                end,
                legacyClient: legacy,
            });
            scheduleWordSearchTurn(game);
            let rematch = null;
            if (game.status === 'completed' && game.mode === 'duel' && game.protocolVersion !== 2) {
                try {
                    rematch = await createAutomaticWordSearchRematch(game);
                    scheduleWordSearchTurn(rematch);
                } catch (error) {
                    console.error('❌ Failed to create legacy word-search rematch:', error);
                }
            }
            await populateGame(game);
            emitWordSearchUpdate(game, 'wordsearch:updated', { foundWord, foundBy: userId, rematchStarting: Boolean(rematch) });
            if (rematch) {
                await populateGame(rematch);
                emitWordSearchUpdate(rematch, 'wordsearch:rematchStarted', { previousGameId: idOf(game._id) });
            }
            return res.json({
                success: true,
                foundWord,
                data: serializeWordSearchGame(game),
                ...(rematch ? { rematch: serializeWordSearchGame(rematch) } : {}),
            });
        } catch (error) {
            return sendError(res, error, 'Failed to submit word selection');
        }
    });

    /** Leave an active game so a fresh board can be created. */
    router.post('/:id/abandon', async (req, res) => {
        try {
            const { userId } = req.body || {};
            const game = await WordSearchGame.findById(req.params.id);
            if (!game) return res.status(404).json({ success: false, message: 'Game not found' });
            if (!isWordSearchPlayer(game, userId)) {
                return res.status(403).json({ success: false, message: 'You are not a player in this game' });
            }
            if (game.status === 'active') {
                game.status = 'abandoned';
                game.completedAt = new Date();
                await game.save();
                scheduleWordSearchTurn(game);
                await populateGame(game);
                emitWordSearchUpdate(game, 'wordsearch:updated');
            }
            return res.json({ success: true, data: serializeWordSearchGame(game) });
        } catch (error) {
            return sendError(res, error, 'Failed to leave word-search game');
        }
    });

    return router;
};

// The existing URL is intentionally unlimited and accepts the released app.
export const legacyWordSearchRoutes = createWordSearchRouter({ legacy: true });
export default createWordSearchRouter();
