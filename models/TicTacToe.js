import mongoose from 'mongoose';

const ticTacToeSchema = new mongoose.Schema({
    // User who created/initiated the game
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Partner who was challenged
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // 3x3 board state (9 cells)
    // null = empty, 'X' or 'O' = marked
    board: {
        type: [String],
        default: [null, null, null, null, null, null, null, null, null]
    },
    // Whose turn is it
    currentTurn: {
        type: String,
        enum: ['creator', 'partner'],
        default: 'creator'
    },
    // Symbol assignments
    creatorSymbol: {
        type: String,
        enum: ['X', 'O'],
        default: 'X'
    },
    partnerSymbol: {
        type: String,
        enum: ['X', 'O'],
        default: 'O'
    },
    // Game status
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'won_creator', 'won_partner', 'draw'],
        default: 'pending'
    },
    // Winner (null if draw or game in progress)
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
    // Move history for replay/analytics
    moveHistory: [{
        position: Number,
        symbol: String,
        playerId: mongoose.Schema.Types.ObjectId,
        timestamp: { type: Date, default: Date.now }
    }],
    // Total moves made
    moveCount: {
        type: Number,
        default: 0
    },
    // Timestamps
    createdAt: {
        type: Date,
        default: Date.now
    },
    completedAt: {
        type: Date,
        default: null
    }
});

// Indexes for efficient queries
ticTacToeSchema.index({ partnerId: 1, status: 1 });
ticTacToeSchema.index({ creatorId: 1, status: 1 });
ticTacToeSchema.index({ creatorId: 1, createdAt: -1 });
ticTacToeSchema.index({ partnerId: 1, createdAt: -1 });

const TicTacToe = mongoose.model('TicTacToe', ticTacToeSchema);

export default TicTacToe;
