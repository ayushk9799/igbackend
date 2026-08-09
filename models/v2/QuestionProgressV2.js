import mongoose from 'mongoose';

const questionProgressV2Schema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
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
    seenQuestionIds: {
        type: [String],
        default: [],
    },
    skippedQuestionIds: {
        type: [String],
        default: [],
    },
    answeredQuestionIds: {
        type: [String],
        default: [],
    },
    lastCursor: {
        type: String,
        default: null,
    },
    completedAt: {
        type: Date,
        default: null,
    },
    // New clients reuse one answerSessionId for every answer made during a
    // single opening of this set. Keeping the latest claimed session here lets
    // the existing progress write also decide whether the partner should be
    // notified, without introducing another collection.
    lastNotifiedAnswerSessionId: {
        type: String,
        default: null,
    },
    answerSessionNotificationClaimToken: {
        type: String,
        default: null,
    },
    answerSessionNotificationClaimedAt: {
        type: Date,
        default: null,
    },
}, { timestamps: true });

questionProgressV2Schema.index({ userId: 1, topicId: 1, setId: 1 }, { unique: true });

const QuestionProgressV2 = mongoose.model('QuestionProgressV2', questionProgressV2Schema);
export default QuestionProgressV2;
