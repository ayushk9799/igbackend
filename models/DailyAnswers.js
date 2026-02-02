import mongoose from 'mongoose';

/**
 * DailyAnswers - Stores a user's answers for a daily challenge
 * 
 * The `answers` array maps directly to the `tasks` array in DailyChallenge
 * answers[0] = answer for tasks[0], answers[1] = answer for tasks[1], etc.
 */
const dailyAnswersSchema = new mongoose.Schema({
    // Reference to the daily challenge
    challengeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DailyChallenge',
        required: true,
    },
    // The date of the challenge (for easy querying)
    date: {
        type: String,  // YYYY-MM-DD format
        required: true,
    },
    // The user who answered
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    // Partner reference (if user has a partner)
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    // Couple identifier for querying both partners together
    coupleId: {
        type: String,
    },

    // Answers array - each element corresponds to same index in DailyChallenge.tasks
    // answers[0] is for tasks[0], answers[1] is for tasks[1], etc.
    answers: [{
        // The question type/category
        type: {
            type: String,
            enum: ['likelyto', 'neverhaveiever', 'deep', 'takephoto', 'slider'],
        },
        // The type of the answer value (text, photo, video)
        answerType: {
            type: String,
            enum: ['text', 'photo', 'video'],
            default: 'text',
        },
        // The actual answer value
        // - For 'likelyto': 'you' or 'partner'
        // - For 'neverhaveiever': 'I have' or 'Never'
        // - For 'deep': free text response
        // - For 'takephoto': S3 URL of uploaded photo
        value: {
            type: String,
            default: null,
        },
        // When this specific answer was submitted
        answeredAt: {
            type: Date,
        },
    }],

    // Total number of tasks in the challenge
    totalTasks: {
        type: Number,
        required: true,
    },
    // How many tasks the user has answered
    completedCount: {
        type: Number,
        default: 0,
    },
    // Is the full challenge complete?
    isComplete: {
        type: Boolean,
        default: false,
    },
    // When the user finished all tasks
    completedAt: {
        type: Date,
    },
}, { timestamps: true });

// One entry per user per challenge
dailyAnswersSchema.index({ challengeId: 1, userId: 1 }, { unique: true });
// Query by date
dailyAnswersSchema.index({ date: 1, userId: 1 });
// Query by couple
dailyAnswersSchema.index({ coupleId: 1, date: 1 });
// Activity feed
dailyAnswersSchema.index({ date: 1, isComplete: 1, completedAt: -1 });

// Generate a consistent couple ID from two user IDs
dailyAnswersSchema.statics.generateCoupleId = function (userId1, userId2) {
    const ids = [userId1.toString(), userId2.toString()].sort();
    return `${ids[0]}_${ids[1]}`;
};

const DailyAnswers = mongoose.model('DailyAnswers', dailyAnswersSchema);

export default DailyAnswers;
