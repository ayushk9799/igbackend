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
        rows: { type: Number, default: 3 },
        cols: { type: Number, default: 3 }
    },
    // Array of piece positions (shuffled order)
    // pieces[i] = original index at current position i
    pieces: [{
        type: Number
    }],
    // Puzzle status
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'solved'],
        default: 'pending'
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
    solvedAt: {
        type: Date,
        default: null
    }
});

// Index for quick lookup of pending puzzles
jigsawPuzzleSchema.index({ partnerId: 1, status: 1 });
jigsawPuzzleSchema.index({ creatorId: 1, createdAt: -1 });

const JigsawPuzzle = mongoose.model('JigsawPuzzle', jigsawPuzzleSchema);

export default JigsawPuzzle;
