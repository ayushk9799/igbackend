import mongoose from 'mongoose';

const coordinateSchema = new mongoose.Schema({
    row: { type: Number, required: true, min: 0 },
    col: { type: Number, required: true, min: 0 },
}, { _id: false });

const wordEntrySchema = new mongoose.Schema({
    word: { type: String, required: true },
    direction: { type: String, required: true },
    start: { type: coordinateSchema, required: true },
    end: { type: coordinateSchema, required: true },
    foundBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    foundAt: { type: Date, default: null },
}, { _id: false });

const wordSearchGameSchema = new mongoose.Schema({
    mode: { type: String, enum: ['single', 'duel'], required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    creatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    gridSize: { type: Number, required: true },
    grid: { type: [String], required: true },
    words: { type: [wordEntrySchema], required: true },
    currentTurn: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    startsAt: { type: Date, default: null },
    turnStartedAt: { type: Date, default: null },
    turnExpiresAt: { type: Date, default: null },
    creatorScore: { type: Number, default: 0, min: 0 },
    partnerScore: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ['active', 'completed', 'abandoned'], default: 'active' },
    winner: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    isDraw: { type: Boolean, default: false },
    moveHistory: [{
        word: String,
        result: { type: String, enum: ['found', 'miss'], default: 'found' },
        playerId: mongoose.Schema.Types.ObjectId,
        start: coordinateSchema,
        end: coordinateSchema,
        createdAt: { type: Date, default: Date.now },
    }],
    completedAt: { type: Date, default: null },
    rematchOf: { type: mongoose.Schema.Types.ObjectId, ref: 'WordSearchGame', default: null },
    rematchGameId: { type: mongoose.Schema.Types.ObjectId, ref: 'WordSearchGame', default: null },
}, {
    timestamps: true,
    optimisticConcurrency: true,
});

wordSearchGameSchema.index({ creatorId: 1, status: 1, createdAt: -1 });
wordSearchGameSchema.index({ partnerId: 1, status: 1, createdAt: -1 });
wordSearchGameSchema.index(
    { creatorId: 1, mode: 1 },
    { unique: true, partialFilterExpression: { status: 'active', mode: 'single' } },
);
wordSearchGameSchema.index(
    { rematchOf: 1 },
    { unique: true, partialFilterExpression: { rematchOf: { $type: 'objectId' } } },
);

const WordSearchGame = mongoose.model('WordSearchGame', wordSearchGameSchema);

export default WordSearchGame;
