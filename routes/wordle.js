import express from 'express';
import Wordle from '../models/Wordle.js';
import User from '../models/User.js';
import { isValidWord } from '../utils/wordValidator.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const router = express.Router();

/**
 * Evaluate a guess against the secret word
 * Returns array of { letter, status } where status is 'correct', 'present', or 'absent'
 */
const evaluateGuess = (guess, secretWord) => {
    const guessLower = guess.toLowerCase();
    const secretLower = secretWord.toLowerCase();
    const result = [];
    const secretLetterCounts = {};

    // Count letters in secret word
    for (const letter of secretLower) {
        secretLetterCounts[letter] = (secretLetterCounts[letter] || 0) + 1;
    }

    // First pass: mark correct letters (green)
    for (let i = 0; i < 5; i++) {
        if (guessLower[i] === secretLower[i]) {
            result[i] = { letter: guessLower[i], status: 'correct' };
            secretLetterCounts[guessLower[i]]--;
        } else {
            result[i] = { letter: guessLower[i], status: null };
        }
    }

    // Second pass: mark present letters (yellow) or absent (gray)
    for (let i = 0; i < 5; i++) {
        if (result[i].status === null) {
            if (secretLetterCounts[guessLower[i]] > 0) {
                result[i].status = 'present';
                secretLetterCounts[guessLower[i]]--;
            } else {
                result[i].status = 'absent';
            }
        }
    }

    return result;
};

/**
 * POST /api/wordle/create
 * Create a new Wordle game with a secret word
 */
router.post('/create', async (req, res) => {
    try {
        const { creatorId, partnerId, secretWord } = req.body;

        if (!creatorId || !partnerId) {
            return res.status(400).json({
                success: false,
                message: 'creatorId and partnerId are required'
            });
        }

        if (!secretWord) {
            return res.status(400).json({
                success: false,
                message: 'secretWord is required'
            });
        }

        const normalizedWord = secretWord.toLowerCase().trim();

        // Validate word length
        if (normalizedWord.length !== 5) {
            return res.status(400).json({
                success: false,
                message: 'Word must be exactly 5 letters'
            });
        }

        // Validate word exists in dictionary
        if (!isValidWord(normalizedWord)) {
            return res.status(400).json({
                success: false,
                message: 'This word is not in our dictionary. Please choose another word.'
            });
        }

        // Check for existing active game between these two users
        const existingGame = await Wordle.findOne({
            $or: [
                { creatorId, partnerId },
                { creatorId: partnerId, partnerId: creatorId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar');

        if (existingGame) {
            return res.status(400).json({
                success: false,
                message: 'An active Wordle game already exists. Complete it first!',
                data: existingGame
            });
        }

        // Get creator's name for notification
        const creator = await User.findById(creatorId);
        const creatorName = creator?.name || 'Your partner';

        // Create new game
        const game = new Wordle({
            creatorId,
            partnerId,
            secretWord: normalizedWord,
            status: 'pending',
            guesses: [],
            maxAttempts: 6
        });

        await game.save();

        // Send push notification to partner
        try {
            await sendPushNotification(
                partnerId,
                '🎯 Wordle Challenge!',
                `${creatorName} set a word for you to guess!`
            );
        } catch (notifError) {
        }

        res.status(201).json({
            success: true,
            data: {
                gameId: game._id,
                status: game.status,
                maxAttempts: game.maxAttempts
            },
            message: 'Wordle game created! Your partner will be notified.'
        });

    } catch (error) {
        console.error('❌ Error creating Wordle game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create game',
            error: error.message
        });
    }
});

/**
 * GET /api/wordle/active/:userId
 * Get the currently active game for this user (if any)
 */
router.get('/active/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Find any active game where user is either creator or partner
        const activeGame = await Wordle.findOne({
            $or: [
                { creatorId: userId },
                { partnerId: userId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .sort({ createdAt: -1 });

        // Don't expose the secret word to the guesser
        if (activeGame) {
            const isGuesser = activeGame.partnerId._id.toString() === userId ||
                activeGame.partnerId.toString() === userId;
            const gameData = activeGame.toObject();
            if (isGuesser) {
                delete gameData.secretWord;
            }
            return res.status(200).json({
                success: true,
                data: gameData,
                hasActiveGame: true,
                isCreator: !isGuesser
            });
        }

        res.status(200).json({
            success: true,
            data: null,
            hasActiveGame: false
        });

    } catch (error) {
        console.error('❌ Error fetching active Wordle game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch active game',
            error: error.message
        });
    }
});

/**
 * GET /api/wordle/pending/:userId
 * Get pending games where user needs to guess
 */
router.get('/pending/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Find games where user is the guesser (partner) and game is active
        const games = await Wordle.find({
            partnerId: userId,
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(10);

        // Remove secret word from results
        const sanitizedGames = games.map(game => {
            const g = game.toObject();
            delete g.secretWord;
            return g;
        });

        res.status(200).json({
            success: true,
            data: sanitizedGames
        });

    } catch (error) {
        console.error('❌ Error fetching pending Wordle games:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending games',
            error: error.message
        });
    }
});

/**
 * GET /api/wordle/:id
 * Get game by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const { userId } = req.query;
        const game = await Wordle.findById(req.params.id)
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
            .populate('winner', 'name');

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        const gameData = game.toObject();

        // Only hide secret word if game is active and user is the guesser
        const isGuesser = game.partnerId._id.toString() === userId ||
            game.partnerId.toString() === userId;
        const isActive = ['pending', 'in_progress'].includes(game.status);

        if (isGuesser && isActive) {
            delete gameData.secretWord;
        }

        res.status(200).json({
            success: true,
            data: gameData,
            isCreator: !isGuesser
        });

    } catch (error) {
        console.error('❌ Error fetching Wordle game:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch game',
            error: error.message
        });
    }
});

/**
 * POST /api/wordle/:id/guess
 * Submit a guess
 * Body: { userId, guess }
 */
router.post('/:id/guess', async (req, res) => {
    try {
        const { userId, guess } = req.body;
        const game = await Wordle.findById(req.params.id);

        if (!game) {
            return res.status(404).json({
                success: false,
                message: 'Game not found'
            });
        }

        // Check if game is already complete
        if (['won', 'lost'].includes(game.status)) {
            return res.status(400).json({
                success: false,
                message: 'Game is already complete'
            });
        }

        // Verify user is the guesser (partner)
        if (game.partnerId.toString() !== userId) {
            return res.status(403).json({
                success: false,
                message: 'Only the challenged partner can guess'
            });
        }

        // Validate guess
        const normalizedGuess = guess?.toLowerCase()?.trim();
        if (!normalizedGuess || normalizedGuess.length !== 5) {
            return res.status(400).json({
                success: false,
                message: 'Guess must be exactly 5 letters'
            });
        }

        // Validate guess is a real word
        if (!isValidWord(normalizedGuess)) {
            return res.status(400).json({
                success: false,
                message: 'Not a valid word. Try another!'
            });
        }

        // Check if max attempts reached
        if (game.guesses.length >= game.maxAttempts) {
            return res.status(400).json({
                success: false,
                message: 'Maximum attempts reached'
            });
        }

        // Evaluate the guess
        const result = evaluateGuess(normalizedGuess, game.secretWord);

        // Add guess to history
        game.guesses.push({
            word: normalizedGuess,
            result,
            timestamp: new Date()
        });

        // Update status
        if (game.status === 'pending') {
            game.status = 'in_progress';
        }

        // Check for win
        const isCorrect = normalizedGuess === game.secretWord.toLowerCase();
        let gameComplete = false;

        if (isCorrect) {
            game.status = 'won';
            game.winner = userId;
            game.completedAt = new Date();
            gameComplete = true;
        } else if (game.guesses.length >= game.maxAttempts) {
            // Lost - no more attempts
            game.status = 'lost';
            game.completedAt = new Date();
            gameComplete = true;
        }

        await game.save();

        // Build response
        const response = {
            success: true,
            data: {
                guessResult: result,
                guessNumber: game.guesses.length,
                attemptsRemaining: game.maxAttempts - game.guesses.length,
                status: game.status,
                gameComplete,
                isCorrect
            }
        };

        // Include secret word if game is complete
        if (gameComplete) {
            response.data.secretWord = game.secretWord;
            response.data.winner = game.winner;
        }

        res.status(200).json(response);

    } catch (error) {
        console.error('❌ Error submitting guess:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to submit guess',
            error: error.message
        });
    }
});

/**
 * POST /api/wordle/:id/notify
 * Send a reminder notification to partner
 */
router.post('/:id/notify', async (req, res) => {
    try {
        const { userId } = req.body;
        const game = await Wordle.findById(req.params.id)
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
            '🎯 Wordle Reminder!',
            `${senderName} is waiting for you to guess the word!`
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

/**
 * GET /api/wordle/history/:userId
 * Get completed game history for a user
 */
router.get('/history/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const { limit = 20 } = req.query;

        const games = await Wordle.find({
            $or: [
                { creatorId: userId },
                { partnerId: userId }
            ],
            status: { $in: ['won', 'lost'] }
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

export default router;
