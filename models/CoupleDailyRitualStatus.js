import mongoose from 'mongoose';

const coupleDailyRitualStatusSchema = new mongoose.Schema({
    coupleId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Couple',
        required: true,
    },
    ritualDate: {
        type: String,
        required: true,
    },
    challengeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyChallenge',
        required: true,
    },
    opensAt: {
        type: Date,
        required: true,
    },
    closesAt: {
        type: Date,
        required: true,
    },
    userA: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userB: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userAComplete: {
        type: Boolean,
        default: false,
    },
    userBComplete: {
        type: Boolean,
        default: false,
    },
    userACompletedAt: {
        type: Date,
        default: null,
    },
    userBCompletedAt: {
        type: Date,
        default: null,
    },
    heartState: {
        type: String,
        enum: ['empty', 'half', 'full'],
        default: 'empty',
    },
    streakApplied: {
        type: Boolean,
        default: false,
    },
    streakBrokenApplied: {
        type: Boolean,
        default: false,
    },
    // Administrative continuity credit for a ritual that users could not
    // complete because the challenge was unavailable. This preserves the
    // streak without manufacturing DailyAnswers or completion timestamps.
    streakProtection: {
        applied: {
            type: Boolean,
            default: false,
        },
        reason: {
            type: String,
            trim: true,
            default: null,
        },
        appliedAt: {
            type: Date,
            default: null,
        },
        fulfilledAt: {
            type: Date,
            default: null,
        },
        notifiedUserIds: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User',
        }],
        notificationLastAttemptAt: {
            type: Date,
            default: null,
        },
    },
}, { timestamps: true });

coupleDailyRitualStatusSchema.index({ coupleId: 1, ritualDate: 1 }, { unique: true });
coupleDailyRitualStatusSchema.index({ closesAt: 1, streakBrokenApplied: 1 });

const CoupleDailyRitualStatus = mongoose.model('CoupleDailyRitualStatus', coupleDailyRitualStatusSchema);

export default CoupleDailyRitualStatus;
