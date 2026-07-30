import mongoose from 'mongoose';

const jigsawPuzzleSchema = new mongoose.Schema({
    // User who created the puzzle
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // User who should solve it (partner)
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // S3 URL of the original image
    imageUrl: {
        type: String,
        required: true
    },
    // Grid configuration
    gridSize: {
        rows: { type: Number, default: 9 },
        cols: { type: Number, default: 9 }
    },
    // Array of piece positions (shuffled order)
    // pieces[i] = original index at current position i
    pieces: [{
        type: Number
    }],
    // Puzzle status
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'solved', 'expired'],
        default: 'pending'
    },
    // Older clients do not support deadlines. Only clients that explicitly
    // opt in when creating a puzzle receive the five-minute mode.
    timerMode: {
        type: String,
        enum: ['untimed', 'five_minute'],
        default: 'untimed'
    },
    // Move count
    moveCount: {
        type: Number,
        default: 0
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    startedAt: {
        type: Date,
        default: null
    },
    expiresAt: {
        type: Date,
        default: null
    },
    solvedAt: {
        type: Date,
        default: null
    },
    expiredAt: {
        type: Date,
        default: null
    }
});

// Index for quick lookup of pending puzzles
jigsawPuzzleSchema.index({ partnerId: 1, status: 1 });
jigsawPuzzleSchema.index({ creatorId: 1, createdAt: -1 });

const JigsawPuzzle = mongoose.model('JigsawPuzzle', jigsawPuzzleSchema);

export default JigsawPuzzle;
