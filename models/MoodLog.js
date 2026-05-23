import mongoose from 'mongoose';

const moodLogSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        default: null,
        index: true,
    },
    mood: {
        id: { type: String, required: true },
        emoji: { type: String, required: true },
        label: { type: String, required: true },
    },
    timezone: {
        type: String,
        default: null,
    },
    timezoneOffsetMinutes: {
        type: Number,
        default: null,
    },
    updatedAt: {
        type: Date,
        required: true,
        default: Date.now,
        index: true,
    },
}, {
    timestamps: true,
});

moodLogSchema.index({ userId: 1, updatedAt: -1 });
moodLogSchema.index({ partnerId: 1, updatedAt: -1 });

const MoodLog = mongoose.model('MoodLog', moodLogSchema);

export default MoodLog;
