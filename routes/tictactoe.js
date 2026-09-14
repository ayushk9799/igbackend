import express from 'express';
import mongoose from 'mongoose';
import TicTacToe from '../models/TicTacToe.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import { getCoupleSubscriptionAccess } from '../services/subscriptionService.js';
import { resolveTicTacToeRestartAssignment } from '../services/ticTacToeRematch.js';
import { requireAuth } from '../middleware/auth.js';
import { getIO } from '../socket/index.js';
import { getCoupleRoomId } from '../socket/auth.js';
import {
    getCanonicalTicTacToeGameId,
    getTicTacToeCoupleKey,
    isTicTacToePlayer,
    serializeTicTacToeState,
} from '../services/ticTacToeState.js';
import { commitTicTacToeMove, TicTacToeMoveError } from '../services/ticTacToeMove.js';

const router = express.Router();
const FREE_TICTACTOE_GAME_LIMIT = 5;
const COMPLETED_STATUSES = ['won_creator', 'won_partner', 'draw'];

const getRequestUserId = (req) => {
    if (req.auth?.userId) {
        return String(req.auth.userId);
    }
    const legacyUserId = req.params?.userId
        || req.body?.userId
        || req.body?.creatorId
        || req.query?.userId;
    if (legacyUserId) {
        req.auth = { userId: String(legacyUserId), legacy: true };
        return req.auth.userId;
    }
    return null;
};

const authenticateTicTacToeRequest = (req, res, next) => {
    if (req.headers.authorization?.startsWith('Bearer ')) {
        requireAuth(req, res, next);
        return;
    }

    // Temporary mobile compatibility: older installed clients identify
    // themselves in the existing request fields. New endpoints and clients
    // always use the signed session token.
    const legacyUserId = req.body?.userId
        || req.body?.creatorId
        || req.query?.userId;
    req.auth = legacyUserId
        ? { userId: String(legacyUserId), legacy: true }
        : null;
    next();
};

router.use(authenticateTicTacToeRequest);

router.param('userId', (req, res, next, userId) => {
    if (!req.auth && userId) {
        req.auth = { userId: String(userId), legacy: true };
    }
    next();
});

const emitAuthoritativeState = (game, eventType = 'updated', extra = {}) => {
    const io = getIO();
    if (!io || !game) return;
    const creatorId = String(game.creatorId?._id || game.creatorId);
    const partnerId = String(game.partnerId?._id || game.partnerId);
    const coupleRoom = getCoupleRoomId(creatorId, partnerId);
    if (!coupleRoom) return;
    io.to(coupleRoom).emit(
        'tictactoe:stateChanged',
        serializeTicTacToeState(game, { eventType, ...extra })
    );
};

const serializeForViewer = (game, viewerPlayerId, extra = {}) => (
    serializeTicTacToeState(game, {
        ...extra,
        ...(viewerPlayerId ? { viewerPlayerId: String(viewerPlayerId) } : {}),
    })
);

const rejectWrongUser = (req, res, requestedUserId) => {
    const authUserId = getRequestUserId(req);
    if (requestedUserId && authUserId && String(requestedUserId) !== String(authUserId)) {
        res.status(403).json({ success: false, message: 'You cannot access another player’s game' });
        return true;
    }
    return false;
};

const findCoupleGames = (userId, partnerId, status) => TicTacToe.find({
    $or: [
        { creatorId: userId, partnerId },
        { creatorId: partnerId, partnerId: userId },
    ],
    ...(status ? { status } : {}),
}).sort({ createdAt: -1 });

const getCompletedTicTacToeGameCount = async (userId) => {
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
        return 0;
    }
    const userObjectId = new mongoose.Types.ObjectId(userId);
    const [result] = await TicTacToe.aggregate([
        {
            $match: {
                $or: [
                    { creatorId: userObjectId },
                    { partnerId: userObjectId }
                ]
            }
        },
        {
            $group: {
                _id: null,
                total: {
                    $sum: {
                        $cond: [
                            { $gt: [{ $ifNull: ['$completedRounds', 0] }, 0] },
                            { $ifNull: ['$completedRounds', 0] },
                            { $cond: [{ $in: ['$status', COMPLETED_STATUSES] }, 1, 0] }
                        ]
                    }
                }
            }
        }
    ]);

    return result?.total || 0;
};

const getTicTacToeLimitStatus = async (userId) => {
    const access = await getCoupleSubscriptionAccess(userId);
    if (access?.hasPremiumAccess) {
        return { hasPremiumAccess: true, completedGames: 0, limitReached: false };
    }

    const completedGames = await getCompletedTicTacToeGameCount(userId);
    return {
        hasPremiumAccess: false,
        completedGames,
        limitReached: completedGames >= FREE_TICTACTOE_GAME_LIMIT
    };
};

/**
 * POST /api/tictactoe/open
 * Return the couple's one canonical match. The first authenticated player to
 * open a couple with no match becomes X and owns the first turn.
 */
router.post('/open', async (req, res) => {
    try {
        if (!req.auth?.userId || req.auth.legacy) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const userId = String(req.auth.userId);
        const user = await User.findById(userId).select('partnerId name');
        const partnerId = user?.partnerId?.toString();
        if (!partnerId) {
            return res.status(400).json({ success: false, code: 'PARTNER_REQUIRED', message: 'Link a partner to play' });
        }

        const coupleKey = getTicTacToeCoupleKey(userId, partnerId);
        let game = await TicTacToe.findOne({ coupleKey });
        let legacyActiveGames = [];

        if (!game) {
            legacyActiveGames = await findCoupleGames(userId, partnerId, {
                $in: ['pending', 'in_progress'],
            });
            const legacyGames = legacyActiveGames.length > 0
                ? legacyActiveGames
                : await findCoupleGames(userId, partnerId);
            game = legacyGames[0] || null;

            if (game) {
                try {
                    game = await TicTacToe.findByIdAndUpdate(
                        game._id,
                        { $set: { coupleKey } },
                        { new: true, runValidators: true }
                    );
                } catch (error) {
                    if (error?.code !== 11000) throw error;
                    game = await TicTacToe.findOne({ coupleKey });
                }
            }
        }

        if (game) {
            const duplicateActiveIds = legacyActiveGames
                .filter(candidate => String(candidate._id) !== String(game._id))
                .map(candidate => candidate._id);
            if (duplicateActiveIds.length > 0) {
                await TicTacToe.updateMany(
                    { _id: { $in: duplicateActiveIds } },
                    { $set: { status: 'superseded' } }
                );
            }
            return res.status(200).json({
                success: true,
                data: serializeForViewer(game, userId),
                isExisting: true,
            });
        }

        const [creatorLimit, partnerLimit] = await Promise.all([
            getTicTacToeLimitStatus(userId),
            getTicTacToeLimitStatus(partnerId),
        ]);
        if (creatorLimit.limitReached || partnerLimit.limitReached) {
            const requesterReachedLimit = creatorLimit.limitReached;
            return res.status(403).json({
                success: false,
                code: 'TICTACTOE_FREE_LIMIT_REACHED',
                message: requesterReachedLimit
                    ? 'You have used all 5 free Tic Tac Toe games. Unlock Premium to keep playing.'
                    : 'Your partner has used all 5 free Tic Tac Toe games. Premium is required to continue.',
            });
        }

        let created = false;
        const canonicalGameId = getCanonicalTicTacToeGameId(userId, partnerId);
        try {
            game = await TicTacToe.create({
                _id: canonicalGameId,
                coupleKey,
                creatorId: userId,
                partnerId,
                creatorSymbol: 'X',
                partnerSymbol: 'O',
                currentTurn: 'creator',
                status: 'pending',
                revision: 1,
            });
            created = true;
        } catch (error) {
            if (error?.code !== 11000) throw error;
            game = await TicTacToe.findOne({
                $or: [{ _id: canonicalGameId }, { coupleKey }],
            });
            if (!game) throw error;
        }

        if (created) {
            sendPushNotification(
                partnerId,
                '🎮 Game Challenge!',
                `${user.name || 'Your partner'} challenged you to Tic Tac Toe!`,
                { type: 'tictactoe', gameId: game._id }
            ).catch(() => {});
            emitAuthoritativeState(game, 'started');
        }
        return res.status(created ? 201 : 200).json({
            success: true,
            data: serializeForViewer(game, userId, { eventType: created ? 'started' : 'opened' }),
            isExisting: !created,
        });
    } catch (error) {
        console.error('❌ Error opening TicTacToe game:', error);
        return res.status(500).json({ success: false, message: 'Failed to open game' });
    }
});

/**
 * POST /api/tictactoe/create
 * Create a new Tic Tac Toe game
 */
router.post('/create', async (req, res) => {
    try {
        const { firstMove } = req.body;
        const creatorId = getRequestUserId(req);
        if (!creatorId) {
            return res.status(401).json({
                success: false,
                message: 'Authentication required'
            });
        }
        const authenticatedCreator = await User.findById(creatorId).select('partnerId name');
        const partnerId = authenticatedCreator?.partnerId?.toString();

        if (!partnerId) {
            return res.status(400).json({
                success: false,
                message: 'partnerId is required'
            });
        }

        const [creatorLimit, partnerLimit] = await Promise.all([
            getTicTacToeLimitStatus(creatorId),
            getTicTacToeLimitStatus(partnerId)
        ]);

        if (creatorLimit.limitReached || partnerLimit.limitReached) {
            const requesterReachedLimit = creatorLimit.limitReached;
            return res.status(403).json({
                success: false,
                code: 'TICTACTOE_FREE_LIMIT_REACHED',
                message: requesterReachedLimit
                    ? 'You have used all 5 free Tic Tac Toe games. Unlock Premium to keep playing.'
                    : 'Your partner has used all 5 free Tic Tac Toe games. Premium is required to continue.',
                data: {
                    freeGameLimit: FREE_TICTACTOE_GAME_LIMIT,
                    completedGames: requesterReachedLimit
                        ? creatorLimit.completedGames
                        : partnerLimit.completedGames
                }
            });
        }

        const coupleKey = getTicTacToeCoupleKey(creatorId, partnerId);
        const canonicalGameId = getCanonicalTicTacToeGameId(creatorId, partnerId);

        // Compatibility endpoint for older clients. It now resolves to the
        // same canonical couple match used by /open.
        const existingGame = await TicTacToe.findOne({
            $or: [
                { coupleKey },
                {
                    creatorId,
                    partnerId,
                    status: { $in: ['pending', 'in_progress'] },
                },
                {
                    creatorId: partnerId,
                    partnerId: creatorId,
                    status: { $in: ['pending', 'in_progress'] },
                },
            ],
        });

        if (existingGame) {
            const requesterIsCreator = String(existingGame.creatorId?._id || existingGame.creatorId) === creatorId;
            return res.status(200).json({
                success: true,
                data: serializeForViewer(existingGame, creatorId, {
                    eventType: 'opened',
                    // Older clients use this field instead of xPlayerId.
                    isCreator: requesterIsCreator,
                }),
                message: 'Active game already exists',
                isExisting: true
            });
        }

        // Get creator's name for notification
        const creator = await User.findById(creatorId);
        const creatorName = creator?.name || 'Your partner';

        const gameFields = {
            _id: canonicalGameId,
            coupleKey,
            creatorId,
            partnerId,
            creatorSymbol: 'X',
            partnerSymbol: 'O',
            currentTurn: 'creator',
            status: 'pending',
            revision: 1,
        };

        // If firstMove is provided, make the move immediately
        if (typeof firstMove === 'number' && firstMove >= 0 && firstMove <= 8) {
            gameFields.board = Array(9).fill(null);
            gameFields.board[firstMove] = 'X';
            gameFields.moveHistory = [{
                position: firstMove,
                symbol: 'X',
                playerId: creatorId,
                timestamp: new Date()
            }];
            gameFields.moveCount = 1;
            gameFields.status = 'in_progress';
            gameFields.currentTurn = 'partner';
        }

        let game;
        let created = false;
        try {
            game = await TicTacToe.create(gameFields);
            created = true;
        } catch (error) {
            if (error?.code !== 11000) throw error;
            game = await TicTacToe.findOne({
                $or: [{ _id: canonicalGameId }, { coupleKey }],
            });
            if (!game) throw error;
        }

        if (created) {
            sendPushNotification(
                partnerId,
                '🎮 Game Challenge!',
                `${creatorName} challenged you to Tic Tac Toe!`,
                {
                    type: 'tictactoe',
                    gameId: game._id,
                }
            ).catch(() => {});
            emitAuthoritativeState(game, 'started');
        }

        res.status(created ? 201 : 200).json({
            success: true,
            data: serializeForViewer(game, creatorId, {
                eventType: created ? 'started' : 'opened',
                // The request that loses the simultaneous create race must be
                // told it is the partner; legacy clients otherwise default X.
                isCreator: String(game.creatorId?._id || game.creatorId) === creatorId,
            }),
            isExisting: !created
        });

    } catch (error) {
        console.error('❌ Error creating TicTacToe game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create game',
            error: error.message
        });
    }
});

/**
 * GET /api/tictactoe/active/:userId
 * Get the currently active game for this user's couple (if any)
 * Returns single active game or null
 */
router.get('/active/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (rejectWrongUser(req, res, userId)) return;

        // Find any active game where user is either creator or partner
        const activeGame = await TicTacToe.findOne({
            $or: [
                { creatorId: userId },
                { partnerId: userId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: activeGame ? serializeForViewer(activeGame, userId) : null,
            hasActiveGame: !!activeGame
        });

    } catch (error) {
        console.error('❌ Error fetching active TicTacToe game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active game',
            error: error.message
        });
    }
});

/**
 * GET /api/tictactoe/:id
 * Get game by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const game = await TicTacToe.findById(req.params.id)
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .populate('winner', 'name');

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        const viewerUserId = getRequestUserId(req);
        if (viewerUserId && !isTicTacToePlayer(game, viewerUserId)) {
            return res.status(403).json({ success: false, message: 'You are not a player in this game' });
        }

        res.status(200).json({
            success: true,
            data: serializeForViewer(game, viewerUserId)
        });

    } catch (error) {
        console.error('❌ Error fetching TicTacToe game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch game',
            error: error.message
        });
    }
});

/**
 * GET /api/tictactoe/pending/:userId
 * Get pending/active games for a user (to play)
 */
router.get('/pending/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (rejectWrongUser(req, res, userId)) return;

        const games = await TicTacToe.find({
            $or: [
                { creatorId: userId },
                { partnerId: userId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(10);

        res.status(200).json({
            success: true,
            data: games.map(game => serializeForViewer(game, userId))
        });

    } catch (error) {
        console.error('❌ Error fetching pending games:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending games',
            error: error.message
        });
    }
});

/**
 * POST /api/tictactoe/:id/restart
 * Reset the current game while preserving both players and their symbols.
 * Body: { userId, round?, rematchCapability? }
 */
router.post('/:id/restart', async (req, res) => {
    try {
        const { rematchCapability, round, revision } = req.body;
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const existingGame = await TicTacToe.findOne({
            _id: req.params.id,
            $or: [
                { creatorId: userId },
                { partnerId: userId },
            ],
        });

        if (!existingGame) {
            return res.status(404).json({
                success: false,
                message: 'Game not found or you are not a player'
            });
        }

        // New clients identify the round they are restarting. This makes Play
        // Again idempotent when both players press it at nearly the same time.
        if (
            rematchCapability === 'hybrid-rematch-v1'
            && (
                !Number.isInteger(round)
                || round !== existingGame.round
                || (Number.isInteger(revision) && revision !== (existingGame.revision || 0))
            )
        ) {
            return res.status(200).json({
                success: true,
                alreadyRestarted: true,
                data: serializeForViewer(existingGame, userId, { eventType: 'reconciled' }),
            });
        }

        const limit = await getTicTacToeLimitStatus(userId);
        if (limit.limitReached) {
            return res.status(403).json({
                success: false,
                code: 'TICTACTOE_FREE_LIMIT_REACHED',
                message: 'You have used all 5 free Tic Tac Toe games. Unlock Premium to keep playing.',
                data: {
                    freeGameLimit: FREE_TICTACTOE_GAME_LIMIT,
                    completedGames: limit.completedGames
                }
            });
        }

        const assignment = resolveTicTacToeRestartAssignment({
            game: existingGame,
            requesterId: userId,
            hybridRequested: rematchCapability === 'hybrid-rematch-v1',
        });

        const game = await TicTacToe.findOneAndUpdate(
            {
                _id: req.params.id,
                round: existingGame.round,
                $and: [
                    {
                        $or: [
                            { creatorId: userId },
                            { partnerId: userId },
                        ],
                    },
                    ...(Number.isInteger(revision)
                        ? [{
                            $or: revision === 0
                                ? [{ revision: 0 }, { revision: { $exists: false } }]
                                : [{ revision }],
                        }]
                        : []),
                ],
            },
            {
                $set: {
                    board: Array(9).fill(null),
                    currentTurn: assignment.currentTurn,
                    creatorSymbol: assignment.creatorSymbol,
                    partnerSymbol: assignment.partnerSymbol,
                    status: 'pending',
                    winner: null,
                    moveHistory: [],
                    moveCount: 0,
                    completedAt: null,
                    completedRounds: Math.max(
                        existingGame.completedRounds || 0,
                        COMPLETED_STATUSES.includes(existingGame.status) ? 1 : 0
                    ),
                },
                $inc: { round: 1, revision: 1, __v: 1 },
            },
            { new: true, runValidators: true }
        );

        if (!game) {
            const latestGame = await TicTacToe.findById(req.params.id);
            if (latestGame) {
                return res.status(200).json({
                    success: true,
                    alreadyRestarted: true,
                    data: serializeForViewer(latestGame, userId, { eventType: 'reconciled' }),
                });
            }
            return res.status(404).json({ success: false, message: 'Game not found' });
        }

        const snapshot = serializeForViewer(game, userId, { eventType: 'restarted' });
        emitAuthoritativeState(game, 'restarted');
        return res.status(200).json({
            success: true,
            data: { ...snapshot, assignmentReason: assignment.assignmentReason }
        });
    } catch (error) {
        console.error('❌ Error restarting TicTacToe game:', error);
        return res.status(500).json({
            success: false,
            message: 'Failed to restart game',
            error: error.message
        });
    }
});

/**
 * POST /api/tictactoe/:id/move
 * Make a move
 * Body: { userId, position (0-8), round }
 */
router.post('/:id/move', async (req, res) => {
    try {
        const { position, round, revision } = req.body;
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const { game, snapshot } = await commitTicTacToeMove({
            gameId: req.params.id,
            userId,
            position,
            round,
            revision,
        });
        emitAuthoritativeState(game, snapshot.eventType, {
            lastMove: snapshot.lastMove,
            gameComplete: snapshot.gameComplete,
        });

        res.status(200).json({
            success: true,
            data: { ...snapshot, viewerPlayerId: userId }
        });

    } catch (error) {
        if (error instanceof TicTacToeMoveError) {
            const fallbackViewerId = getRequestUserId(req);
            return res.status(error.status).json({
                success: false,
                message: error.message,
                data: error.data
                    ? { ...error.data, viewerPlayerId: fallbackViewerId ? String(fallbackViewerId) : null }
                    : null,
            });
        }
        console.error('❌ Error making move:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to make move',
            error: error.message
        });
    }
});

/**
 * GET /api/tictactoe/history/:userId
 * Get completed game history for a user
 */
router.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        if (rejectWrongUser(req, res, userId)) return;
        const { limit = 20 } = req.query;

        const [games, limitStatus] = await Promise.all([
            TicTacToe.find({
                $or: [
                    { creatorId: userId },
                    { partnerId: userId }
                ],
                status: { $in: ['won_creator', 'won_partner', 'draw'] }
            })
                .populate('creatorId', 'name avatar')
                .populate('partnerId', 'name avatar')
                .populate('winner', 'name')
                .sort({ completedAt: -1 })
                .limit(parseInt(limit)),
            getTicTacToeLimitStatus(userId),
        ]);

        res.status(200).json({
            success: true,
            data: games,
            completedGames: limitStatus.completedGames,
            hasPremiumAccess: limitStatus.hasPremiumAccess,
            limitReached: limitStatus.limitReached,
        });

    } catch (error) {
        console.error('❌ Error fetching game history:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch game history',
            error: error.message
        });
    }
});

/**
 * POST /api/tictactoe/:id/notify
 * Send a reminder notification to partner
 */
router.post('/:id/notify', async (req, res) => {
    try {
        const userId = getRequestUserId(req);
        if (!userId) {
            return res.status(401).json({ success: false, message: 'Authentication required' });
        }
        const game = await TicTacToe.findById(req.params.id)
            .populate('creatorId', 'name')
            .populate('partnerId', 'name');

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        if (!isTicTacToePlayer(game, userId)) {
            return res.status(403).json({ success: false, message: 'You are not a player in this game' });
        }

        // Determine who to notify (the other player)
        const isCreator = game.creatorId._id.toString() === userId;
        const targetId = isCreator ? game.partnerId._id : game.creatorId._id;
        const senderName = isCreator ? game.creatorId.name : game.partnerId.name;

        await sendPushNotification(
            targetId,
            '🎮 Your Turn!',
            `${senderName} is waiting for your move in Tic Tac Toe!`,
            {
                type: 'tictactoe',
                gameId: game._id,
            }
        );

        res.status(200).json({
            success: true,
            message: 'Notification sent'
        });

    } catch (error) {
        console.error('❌ Error sending notification:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send notification',
            error: error.message
        });
    }
});

export default router;
