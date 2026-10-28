import mongoose from 'mongoose';

// A game a user would like added, sent from the Games screen.
const gameRequestSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    text: {
        type: String,
        required: true,
        trim: true,
        maxlength: 300,
    },
    status: {
        type: String,
        enum: ['new', 'reviewed', 'planned', 'done'],
        default: 'new',
        index: true,
    },
}, {
    timestamps: true,
});

gameRequestSchema.index({ userId: 1, createdAt: -1 });

export default mongoose.model('GameRequest', gameRequestSchema);
