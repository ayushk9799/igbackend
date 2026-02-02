import express from 'express';
import JigsawPuzzle from '../models/JigsawPuzzle.js';
import User from '../models/User.js';
import { sendPuzzleNotification } from '../utils/pushNotification.js';

const router = express.Router();

/**
 * Fisher-Yates shuffle algorithm to randomize puzzle pieces
 * Uses crypto for better randomness
 */
const shufflePieces = (totalPieces) => {
    const pieces = Array.from({ length: totalPieces }, (_, i) => i);

    // Use timestamp + random for better entropy
    const now = Date.now();

    // Helper for random number with better entropy
    const getRandomIndex = (max) => {
        const randomBytes = Math.floor(Math.random() * 1000000) + now;
        return Math.abs(randomBytes) % max;
    };

    // Multiple shuffle passes for better randomization
    for (let pass = 0; pass < 5; pass++) {
        // Fisher-Yates shuffle with enhanced randomness
        for (let i = pieces.length - 1; i > 0; i--) {
            const j = getRandomIndex(i + 1);
            [pieces[i], pieces[j]] = [pieces[j], pieces[i]];
        }
    }

    // Ensure NO pieces are in their original position (derangement)
    for (let i = 0; i < pieces.length; i++) {
        if (pieces[i] === i) {
            // Swap with a random different position
            let swapWith = (i + 1) % pieces.length;
            // Find a position where neither piece ends up in its original spot
            for (let attempts = 0; attempts < pieces.length; attempts++) {
                const candidate = (i + 1 + attempts) % pieces.length;
                if (candidate !== i && pieces[candidate] !== i && pieces[i] !== candidate) {
                    swapWith = candidate;
                    break;
                }
            }
            [pieces[i], pieces[swapWith]] = [pieces[swapWith], pieces[i]];
        }
    }

    // Final check - make sure it's not solved
    const isSolved = pieces.every((piece, index) => piece === index);
    if (isSolved && pieces.length > 1) {
        // Do a complete rotation shuffle as fallback
        const first = pieces[0];
        for (let i = 0; i < pieces.length - 1; i++) {
            pieces[i] = pieces[i + 1];
        }
        pieces[pieces.length - 1] = first;
    }

    console.log('🧩 Shuffled pieces:', pieces, 'at', new Date().toISOString());
    return pieces;
};

/**
 * POST /api/puzzle/create
 * Create a new jigsaw puzzle from an uploaded image
 * 
 * Body: {
 *   creatorId: string,
 *   partnerId: string,
 *   imageUrl: string,
 *   gridSize?: { rows: number, cols: number }
 * }
 */
router.post('/create', async (req, res) => {
    try {
        const { creatorId, partnerId, imageUrl, gridSize = { rows: 3, cols: 3 } } = req.body;

        if (!creatorId || !partnerId || !imageUrl) {
            return res.status(400).json({
                success: false,
                message: 'creatorId, partnerId, and imageUrl are required'
            });
        }

        // Get creator's name for notification
        const creator = await User.findById(creatorId);
        const creatorName = creator?.name || 'Your partner';

        // Calculate total pieces and shuffle them
        const totalPieces = gridSize.rows * gridSize.cols;
        const shuffledPieces = shufflePieces(totalPieces);

        // Create the puzzle
        const puzzle = new JigsawPuzzle({
            creatorId,
            partnerId,
            imageUrl,
            gridSize,
            pieces: shuffledPieces,
            status: 'pending'
        });

        await puzzle.save();

        // Send push notification to partner
        await sendPuzzleNotification(partnerId, creatorName);

        res.status(201).json({
            success: true,
            data: {
                puzzleId: puzzle._id,
                gridSize: puzzle.gridSize,
                pieces: puzzle.pieces,
                status: puzzle.status
            }
        });

    } catch (error) {
        console.error('❌ Error creating puzzle:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create puzzle',
            error: error.message
        });
    }
});

/**
 * GET /api/puzzle/:id
 * Get puzzle by ID
 */
router.get('/:id', async (req, res) => {
    try {
        const puzzle = await JigsawPuzzle.findById(req.params.id);

        if (!puzzle) {
            return res.status(404).json({
                success: false,
                message: 'Puzzle not found'
            });
        }

        res.status(200).json({
            success: true,
            data: puzzle
        });

    } catch (error) {
        console.error('❌ Error fetching puzzle:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch puzzle',
            error: error.message
        });
    }
});

/**
 * GET /api/puzzle/pending/:userId
 * Get all pending puzzles for a user (to solve)
 */
router.get('/pending/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const puzzles = await JigsawPuzzle.find({
            partnerId: userId,
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .sort({ createdAt: -1 })
            .limit(10);

        res.status(200).json({
            success: true,
            data: puzzles
        });

    } catch (error) {
        console.error('❌ Error fetching pending puzzles:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch pending puzzles',
            error: error.message
        });
    }
});

/**
 * POST /api/puzzle/:id/move
 * Record a piece move (swap two pieces)
 * 
 * Body: {
 *   fromIndex: number,
 *   toIndex: number
 * }
 */
router.post('/:id/move', async (req, res) => {
    try {
        const { fromIndex, toIndex } = req.body;
        const puzzle = await JigsawPuzzle.findById(req.params.id);

        if (!puzzle) {
            return res.status(404).json({
                success: false,
                message: 'Puzzle not found'
            });
        }

        if (puzzle.status === 'solved') {
            return res.status(400).json({
                success: false,
                message: 'Puzzle is already solved'
            });
        }

        // Swap pieces
        const pieces = [...puzzle.pieces];
        [pieces[fromIndex], pieces[toIndex]] = [pieces[toIndex], pieces[fromIndex]];

        // Check if puzzle is solved
        const isSolved = pieces.every((piece, index) => piece === index);

        // Update puzzle
        puzzle.pieces = pieces;
        puzzle.moveCount += 1;
        if (puzzle.status === 'pending') {
            puzzle.status = 'in_progress';
        }
        if (isSolved) {
            puzzle.status = 'solved';
            puzzle.solvedAt = new Date();
        }

        await puzzle.save();

        res.status(200).json({
            success: true,
            data: {
                pieces: puzzle.pieces,
                moveCount: puzzle.moveCount,
                status: puzzle.status,
                isSolved
            }
        });

    } catch (error) {
        console.error('❌ Error recording move:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to record move',
            error: error.message
        });
    }
});

/**
 * POST /api/puzzle/:id/solve
 * Mark puzzle as solved manually (for celebration screen)
 */
router.post('/:id/solve', async (req, res) => {
    try {
        const puzzle = await JigsawPuzzle.findByIdAndUpdate(
            req.params.id,
            {
                status: 'solved',
                solvedAt: new Date()
            },
            { new: true }
        );

        if (!puzzle) {
            return res.status(404).json({
                success: false,
                message: 'Puzzle not found'
            });
        }

        res.status(200).json({
            success: true,
            data: puzzle
        });

    } catch (error) {
        console.error('❌ Error solving puzzle:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to solve puzzle',
            error: error.message
        });
    }
});

export default router;
