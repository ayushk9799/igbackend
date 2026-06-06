import mongoose from 'mongoose';

const reactionSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    emoji: {
        type: String,
        required: true,
    },
    createdAt: {
        type: Date,
        default: Date.now,
    },
}, { _id: false });

const questionChatMessageV2Schema = new mongoose.Schema({
    chatId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'QuestionChatV2',
        required: true,
        index: true,
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true,
    },
    messageType: {
        type: String,
        enum: ['answer', 'text', 'system', 'reaction'],
        required: true,
    },
    content: {
        type: String,
        default: '',
        maxlength: 2000,
    },
    answerPayload: {
        type: mongoose.Schema.Types.Mixed,
        default: null,
    },
    isRead: {
        type: Boolean,
        default: false,
    },
    readAt: {
        type: Date,
        default: null,
    },
    reactions: {
        type: [reactionSchema],
        default: [],
    },
}, { timestamps: true });

questionChatMessageV2Schema.index({ chatId: 1, createdAt: 1 });

const QuestionChatMessageV2 = mongoose.model('QuestionChatMessageV2', questionChatMessageV2Schema);
export default QuestionChatMessageV2;
