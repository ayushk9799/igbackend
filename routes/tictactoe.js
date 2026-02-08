import express from 'express';
import TicTacToe from '../models/TicTacToe.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const router = express.Router();

// Winning combinations (indices)
const WIN_PATTERNS = [
    [0, 1, 2], // top row
    [3, 4, 5], // middle row
    [6, 7, 8], // bottom row
    [0, 3, 6], // left column
    [1, 4, 7], // middle column
    [2, 5, 8], // right column
    [0, 4, 8], // diagonal
    [2, 4, 6], // anti-diagonal
];

/**
 * Check if there's a winner
 * @returns {string|null} 'X', 'O', or null
 */
const checkWinner = (board) => {
    for (const pattern of WIN_PATTERNS) {
        const [a, b, c] = pattern;
        if (board[a] && board[a] === board[b] && board[a] === board[c]) {
            return board[a];
        }
    }
    return null;
};

/**
 * Check if the game is a draw
 */
const isDraw = (board) => {
    return board.every(cell => cell !== null) && !checkWinner(board);
};

/**
 * POST /api/tictactoe/create
 * Create a new Tic Tac Toe game
 */
router.post('/create', async (req, res) => {
    try {
        const { creatorId, partnerId, creatorSymbol = 'X', firstMove } = req.body;

        if (!creatorId || !partnerId) {
            return res.status(400).json({
                success: false,
                message: 'creatorId and partnerId are required'
            });
        }

        // Check for existing active game between these two users
        const existingGame = await TicTacToe.findOne({
            $or: [
                { creatorId, partnerId },
                { creatorId: partnerId, partnerId: creatorId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar');

        if (existingGame) {
            // Return existing game instead of creating new one
            return res.status(200).json({
                success: true,
                data: {
                    gameId: existingGame._id,
                    board: existingGame.board,
                    currentTurn: existingGame.currentTurn,
                    creatorSymbol: existingGame.creatorSymbol,
                    partnerSymbol: existingGame.partnerSymbol,
                    status: existingGame.status,
                    isCreator: existingGame.creatorId._id.toString() === creatorId || existingGame.creatorId.toString() === creatorId
                },
                message: 'Active game already exists',
                isExisting: true
            });
        }

        // Get creator's name for notification
        const creator = await User.findById(creatorId);
        const creatorName = creator?.name || 'Your partner';

        // Partner gets opposite symbol
        const partnerSymbol = creatorSymbol === 'X' ? 'O' : 'X';

        // Create new game
        const game = new TicTacToe({
            creatorId,
            partnerId,
            creatorSymbol,
            partnerSymbol,
            currentTurn: 'creator',
            status: 'pending'
        });

        // If firstMove is provided, make the move immediately
        if (typeof firstMove === 'number' && firstMove >= 0 && firstMove <= 8) {
            game.board[firstMove] = creatorSymbol;
            game.moveHistory.push({
                position: firstMove,
                symbol: creatorSymbol,
                playerId: creatorId,
                timestamp: new Date()
            });
            game.moveCount = 1;
            game.status = 'in_progress';
            game.currentTurn = 'partner'; // Switch turn after first move
        }

        await game.save();

        // Send push notification to partner
        try {
            await sendPushNotification(
                partnerId,
                '🎮 Game Challenge!',
                `${creatorName} challenged you to Tic Tac Toe!`
            );
        } catch (notifError) {
        }

        res.status(201).json({
            success: true,
            data: {
                gameId: game._id,
                board: game.board,
                currentTurn: game.currentTurn,
                creatorSymbol: game.creatorSymbol,
                partnerSymbol: game.partnerSymbol,
                status: game.status,
                isCreator: true
            },
            isExisting: false
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
            data: activeGame || null,
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

        res.status(200).json({
            success: true,
            data: game
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
            data: games
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
 * POST /api/tictactoe/:id/move
 * Make a move
 * Body: { userId, position (0-8) }
 */
router.post('/:id/move', async (req, res) => {
    try {
        const { userId, position } = req.body;
        const game = await TicTacToe.findById(req.params.id);

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Check if game is already complete
        if (['won_creator', 'won_partner', 'draw'].includes(game.status)) {
            return res.status(400).json({
                success: false,
                message: 'Game is already complete'
            });
        }

        // Validate position
        if (position < 0 || position > 8) {
            return res.status(400).json({
                success: false,
                message: 'Invalid position. Must be 0-8'
            });
        }

        // Check if cell is already taken
        if (game.board[position] !== null) {
            return res.status(400).json({
                success: false,
                message: 'Cell is already occupied'
            });
        }

        // Determine if it's this user's turn
        const isCreator = game.creatorId.toString() === userId;
        const isPartner = game.partnerId.toString() === userId;

        if (!isCreator && !isPartner) {
            return res.status(403).json({
                success: false,
                message: 'You are not a player in this game'
            });
        }

        const expectedTurn = game.currentTurn;
        const actualTurn = isCreator ? 'creator' : 'partner';

        if (expectedTurn !== actualTurn) {
            return res.status(400).json({
                success: false,
                message: "It's not your turn"
            });
        }

        // Make the move
        const symbol = isCreator ? game.creatorSymbol : game.partnerSymbol;
        const newBoard = [...game.board];
        newBoard[position] = symbol;

        // Add to move history
        game.moveHistory.push({
            position,
            symbol,
            playerId: userId,
            timestamp: new Date()
        });

        game.board = newBoard;
        game.moveCount += 1;

        // Update status
        if (game.status === 'pending') {
            game.status = 'in_progress';
        }

        // Check for winner
        const winningSymbol = checkWinner(newBoard);
        let gameComplete = false;

        if (winningSymbol) {
            gameComplete = true;
            if (winningSymbol === game.creatorSymbol) {
                game.status = 'won_creator';
                game.winner = game.creatorId;
            } else {
                game.status = 'won_partner';
                game.winner = game.partnerId;
            }
            game.completedAt = new Date();
        } else if (isDraw(newBoard)) {
            gameComplete = true;
            game.status = 'draw';
            game.completedAt = new Date();
        } else {
            // Switch turns
            game.currentTurn = game.currentTurn === 'creator' ? 'partner' : 'creator';
        }

        await game.save();

        res.status(200).json({
            success: true,
            data: {
                board: game.board,
                currentTurn: game.currentTurn,
                status: game.status,
                winner: game.winner,
                moveCount: game.moveCount,
                gameComplete
            }
        });

    } catch (error) {
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
        const { limit = 20 } = req.query;

        const games = await TicTacToe.find({
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
            .limit(parseInt(limit));

        res.status(200).json({
            success: true,
            data: games
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
        const { userId } = req.body;
        const game = await TicTacToe.findById(req.params.id)
            .populate('creatorId', 'name')
            .populate('partnerId', 'name');

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Determine who to notify (the other player)
        const isCreator = game.creatorId._id.toString() === userId;
        const targetId = isCreator ? game.partnerId._id : game.creatorId._id;
        const senderName = isCreator ? game.creatorId.name : game.partnerId.name;

        await sendPushNotification(
            targetId,
            '🎮 Your Turn!',
            `${senderName} is waiting for your move in Tic Tac Toe!`
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
