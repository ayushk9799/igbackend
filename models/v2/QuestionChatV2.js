import mongoose from 'mongoose';

const answerSummarySchema = new mongoose.Schema({
    userAnswer: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    partnerAnswer: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    bothAnswered: {
        type: Boolean,
        default: false,
    },
    match: {
        type: Boolean,
        default: null,
    },
    similarityScore: {
        type: Number,
        default: null,
    },
}, { _id: false });

const questionChatV2Schema = new mongoose.Schema({
    coupleId: {
        type: String,
        required: true,
        index: true,
    },
    partner1: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    partner2: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    userIds: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    }],
    topicId: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    setId: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    questionId: {
        type: String,
        required: true,
        trim: true,
        index: true,
    },
    format: {
        type: String,
        required: true,
        trim: true,
    },
    prompt: {
        type: String,
        required: true,
        trim: true,
    },
    status: {
        type: String,
        enum: ['active', 'archived'],
        default: 'active',
    },
    answerSummary: {
        type: answerSummarySchema,
        default: () => ({}),
    },
    lastMessage: {
        type: String,
        default: '',
    },
    lastMessageAt: {
        type: Date,
        default: null,
    },
    messageCount: {
        type: Number,
        default: 0,
    },
    partner1Unread: {
        type: Number,
        default: 0,
    },
    partner2Unread: {
        type: Number,
        default: 0,
    },
}, { timestamps: true });

questionChatV2Schema.index(
    { coupleId: 1, topicId: 1, setId: 1, questionId: 1 },
    { unique: true }
);
questionChatV2Schema.index({ partner1: 1, status: 1, lastMessageAt: -1 });
questionChatV2Schema.index({ partner2: 1, status: 1, lastMessageAt: -1 });

questionChatV2Schema.statics.generateCoupleId = function (userId1, userId2) {
    const ids = [userId1.toString(), userId2.toString()].sort();
    return `${ids[0]}_${ids[1]}`;
};

questionChatV2Schema.statics.getPartnerFields = function (userId1, userId2) {
    const [partner1, partner2] = [userId1.toString(), userId2.toString()].sort();
    return { partner1, partner2 };
};

const QuestionChatV2 = mongoose.model('QuestionChatV2', questionChatV2Schema);
export default QuestionChatV2;
