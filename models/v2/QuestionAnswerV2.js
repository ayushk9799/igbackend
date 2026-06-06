import mongoose from 'mongoose';

const questionAnswerV2Schema = new mongoose.Schema({
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
    coupleId: {
        type: String,
        default: null,
        index: true,
    },
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
    answerType: {
        type: String,
        required: true,
        trim: true,
    },
    answer: {
        type: mongoose.Schema.Types.Mixed,
        required: true,
    },
}, { timestamps: true });

questionAnswerV2Schema.index({ userId: 1, topicId: 1, setId: 1, questionId: 1 });
questionAnswerV2Schema.index({ partnerId: 1, topicId: 1, setId: 1, questionId: 1 });
questionAnswerV2Schema.index({ coupleId: 1, topicId: 1, setId: 1, questionId: 1 });

const QuestionAnswerV2 = mongoose.model('QuestionAnswerV2', questionAnswerV2Schema);
export default QuestionAnswerV2;
