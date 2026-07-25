import express from 'express';
import JigsawPuzzle from '../models/JigsawPuzzle.js';
import User from '../models/User.js';
import { sendPuzzleNotification } from '../utils/pushNotification.js';
import { getIO } from '../socket/index.js';
import { getCoupleRoomId } from '../socket/auth.js';

const router = express.Router();
const PUZZLE_DURATION_MS = 5 * 60 * 1000;

const notifyPuzzleUpdate = (puzzle, eventName = 'puzzle:updated') => {
    try {
        const io = getIO();
        if (!io || !puzzle) return;
        const creatorId = puzzle.creatorId?._id || puzzle.creatorId;
        const partnerId = puzzle.partnerId?._id || puzzle.partnerId;
        if (!creatorId || !partnerId) return;

        const roomId = getCoupleRoomId(creatorId.toString(), partnerId.toString());
        if (roomId) {
            io.to(roomId).emit('puzzle:updated', {
                puzzleId: puzzle._id || puzzle.id,
                puzzle,
                eventName,
                timestamp: new Date().toISOString()
            });
        }
    } catch (err) {
        console.error('❌ Failed to emit puzzle socket update:', err);
    }
};

const expirePuzzleIfNeeded = async (puzzle, now = new Date()) => {
    if (
        puzzle?.status === 'in_progress'
        && puzzle.expiresAt
        && puzzle.expiresAt.getTime() <= now.getTime()
    ) {
        puzzle.status = 'expired';
        puzzle.expiredAt = now;
        await puzzle.save();
        return true;
    }
    return puzzle?.status === 'expired';
};

const expiredResponse = (res, puzzle) => res.status(410).json({
    success: false,
    code: 'PUZZLE_EXPIRED',
    message: 'The 5-minute puzzle timer has expired',
    data: {
        status: 'expired',
        startedAt: puzzle.startedAt,
        expiresAt: puzzle.expiresAt,
        expiredAt: puzzle.expiredAt
    }
});

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
        const { creatorId, partnerId, imageUrl, gridSize = { rows: 5, cols: 5 } } = req.body;

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
            pieces: shuffledPieces.map(piece => -piece - 1),
            status: 'pending'
        });

        await puzzle.save();

        // Send push notification to partner
        await sendPuzzleNotification(partnerId, creatorName, puzzle._id);
        notifyPuzzleUpdate(puzzle, 'puzzle:created');

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
 * POST /api/puzzle/:id/start
 * Atomically starts the permanent 5-minute solving window.
 */
router.post('/:id/start', async (req, res) => {
    try {
        const now = new Date();
        const expiresAt = new Date(now.getTime() + PUZZLE_DURATION_MS);
        let puzzle = await JigsawPuzzle.findOneAndUpdate(
            {
                _id: req.params.id,
                $or: [
                    { status: 'pending' },
                    {
                        status: 'in_progress',
                        $or: [
                            { expiresAt: null },
                            { expiresAt: { $exists: false } }
                        ]
                    }
                ]
            },
            {
                $set: {
                    status: 'in_progress',
                    startedAt: now,
                    expiresAt
                }
            },
            { new: true }
        );

        if (!puzzle) {
            puzzle = await JigsawPuzzle.findById(req.params.id);
        }
        if (!puzzle) {
            return res.status(404).json({ success: false, message: 'Puzzle not found' });
        }

        if (await expirePuzzleIfNeeded(puzzle, now)) {
            return expiredResponse(res, puzzle);
        }
        if (puzzle.status === 'solved') {
            return res.status(409).json({
                success: false,
                code: 'PUZZLE_SOLVED',
                message: 'Puzzle is already solved'
            });
        }

        notifyPuzzleUpdate(puzzle, 'puzzle:started');

        res.status(200).json({
            success: true,
            data: puzzle,
            serverTime: now.toISOString()
        });
    } catch (error) {
        console.error('❌ Error starting puzzle:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to start puzzle',
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

        await expirePuzzleIfNeeded(puzzle);

        res.status(200).json({
            success: true,
            data: puzzle,
            serverTime: new Date().toISOString()
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
        const now = new Date();

        await JigsawPuzzle.updateMany(
            {
                partnerId: userId,
                status: 'in_progress',
                expiresAt: { $lte: now }
            },
            {
                $set: {
                    status: 'expired',
                    expiredAt: now
                }
            }
        );

        const puzzles = await JigsawPuzzle.find({
            $or: [
                { partnerId: userId },
                { creatorId: userId }
            ],
            status: { $in: ['pending', 'in_progress'] }
        })
            .populate('creatorId', 'name avatar')
            .populate('partnerId', 'name avatar')
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
        const { fromIndex, toIndex, pieces: clientPieces } = req.body;
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
        if (await expirePuzzleIfNeeded(puzzle)) {
            return expiredResponse(res, puzzle);
        }
        if (puzzle.status !== 'in_progress' || !puzzle.expiresAt) {
            return res.status(409).json({
                success: false,
                code: 'PUZZLE_NOT_STARTED',
                message: 'Puzzle must be started before moving pieces'
            });
        }

        // Use client-provided pieces or perform the swap
        let pieces;
        if (clientPieces && Array.isArray(clientPieces)) {
            pieces = clientPieces;
        } else {
            pieces = [...puzzle.pieces];
            if (fromIndex !== undefined && toIndex !== undefined && fromIndex >= 0 && toIndex >= 0) {
                [pieces[fromIndex], pieces[toIndex]] = [pieces[toIndex], pieces[fromIndex]];
            }
        }

        const expectedPieceCount = puzzle.gridSize.rows * puzzle.gridSize.cols;
        const normalizedPieceIds = pieces.map((piece) => (
            Number.isInteger(piece) ? (piece < 0 ? -piece - 1 : piece) : NaN
        ));
        const hasValidPieceSet = (
            pieces.length === expectedPieceCount
            && normalizedPieceIds.every((piece) => piece >= 0 && piece < expectedPieceCount)
            && new Set(normalizedPieceIds).size === expectedPieceCount
        );
        if (!hasValidPieceSet) {
            return res.status(400).json({
                success: false,
                code: 'INVALID_PUZZLE_STATE',
                message: 'Puzzle pieces are invalid'
            });
        }

        // Check if puzzle is solved
        const isSolved = pieces.every((piece, index) => piece === index);

        // Update puzzle
        if (puzzle.expiresAt.getTime() <= Date.now()) {
            puzzle.status = 'expired';
            puzzle.expiredAt = new Date();
            await puzzle.save();
            return expiredResponse(res, puzzle);
        }
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
        notifyPuzzleUpdate(puzzle, 'puzzle:move');

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
        const now = new Date();
        const existingPuzzle = await JigsawPuzzle.findById(req.params.id);
        if (!existingPuzzle) {
            return res.status(404).json({ success: false, message: 'Puzzle not found' });
        }
        if (!existingPuzzle.pieces.every((piece, index) => piece === index)) {
            return res.status(400).json({
                success: false,
                code: 'PUZZLE_NOT_COMPLETE',
                message: 'Puzzle pieces are not in the solved order'
            });
        }
        let puzzle = await JigsawPuzzle.findOneAndUpdate(
            {
                _id: req.params.id,
                status: 'in_progress',
                expiresAt: { $gt: now }
            },
            { $set: { status: 'solved', solvedAt: now } },
            { new: true }
        );

        if (!puzzle) {
            puzzle = await JigsawPuzzle.findById(req.params.id);
            if (!puzzle) {
                return res.status(404).json({ success: false, message: 'Puzzle not found' });
            }
            if (await expirePuzzleIfNeeded(puzzle, now)) {
                return expiredResponse(res, puzzle);
            }
            return res.status(409).json({
                success: false,
                message: `Puzzle cannot be solved while ${puzzle.status}`
            });
        }

        notifyPuzzleUpdate(puzzle, 'puzzle:solved');

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
