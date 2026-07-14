import mongoose from 'mongoose';

const coupleStreakSchema = new mongoose.Schema({
    coupleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Couple',
        required: true,
        unique: true,
    },
    currentStreak: {
        type: Number,
        default: 0,
    },
    longestStreak: {
        type: Number,
        default: 0,
    },
    lastFullHeartDate: {
        type: String,
        default: null,
    },
    lastEvaluatedRitualDate: {
        type: String,
        default: null,
    },
    streakBrokenAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

const CoupleStreak = mongoose.model('CoupleStreak', coupleStreakSchema);

export default CoupleStreak;
