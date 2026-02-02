import mongoose from 'mongoose';

const wordleSchema = new mongoose.Schema({
    // User who set the word
    creatorId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // Partner who should guess
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    // The secret 5-letter word (lowercase)
    secretWord: {
        type: String,
        required: true,
        minlength: 5,
        maxlength: 5
    },
    // Game status
    status: {
        type: String,
        enum: ['pending', 'in_progress', 'won', 'lost'],
        default: 'pending'
    },
    // Array of guess attempts (max 6)
    guesses: [{
        word: String,
        result: [{
            letter: String,
            status: {
                type: String,
                enum: ['correct', 'present', 'absent']
            }
        }],
        timestamp: {
            type: Date,
            default: Date.now
        }
    }],
    // Max attempts allowed
    maxAttempts: {
        type: Number,
        default: 6
    },
    // Winner (guesser if won)
    winner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null
    },
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
wordleSchema.index({ partnerId: 1, status: 1 });
wordleSchema.index({ creatorId: 1, status: 1 });
wordleSchema.index({ creatorId: 1, createdAt: -1 });
wordleSchema.index({ partnerId: 1, createdAt: -1 });

const Wordle = mongoose.model('Wordle', wordleSchema);

export default Wordle;
