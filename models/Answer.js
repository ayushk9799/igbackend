import mongoose from 'mongoose';

const answerSchema = new mongoose.Schema({
    questionId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Question',
        required: true,
    },
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    partnerId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
    },
    answer: {
        type: String,
        required: true,
    },
    // Type of the answer value: text, photo, or video
    answerType: {
        type: String,
        enum: ['text', 'photo', 'video'],
        default: 'text',
    },
    // For true/false or rating type questions
    answerValue: {
        type: mongoose.Schema.Types.Mixed,
    },
    // Track if partner has answered the same question
    partnerAnswer: {
        type: String,
    },
    partnerAnswerValue: {
        type: mongoose.Schema.Types.Mixed,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: {
        type: Date,
    },
}, {
    timestamps: true,
});

// Index for efficient queries
answerSchema.index({ userId: 1, questionId: 1 });
answerSchema.index({ partnerId: 1, questionId: 1 });
answerSchema.index({ userId: 1, createdAt: -1 });

const Answer = mongoose.model('Answer', answerSchema);

export default Answer;
