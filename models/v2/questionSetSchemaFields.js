import mongoose from 'mongoose';

export const QUESTION_V2_FORMATS = [
    'deep',
    'neverhaveiever',
    'likelyto',
    'wouldyourather',
    'thisorthat',
    'slider',
    'voicerecord',
    'takephoto',
];

export const questionV2Schema = new mongoose.Schema({
    questionId: {
        type: String,
        required: true,
        trim: true,
    },
    prompt: {
        type: String,
        required: true,
        trim: true,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    options: {
        type: [String],
        default: [],
    },
    minValue: Number,
    maxValue: Number,
    minLabel: {
        type: String,
        trim: true,
    },
    maxLabel: {
        type: String,
        trim: true,
    },
}, { _id: false });

export const createQuestionSetSchema = () => {
    const schema = new mongoose.Schema({
        setId: {
            type: String,
            required: true,
            unique: true,
            trim: true,
        },
        title: {
            type: String,
            required: true,
            trim: true,
        },
        format: {
            type: String,
            required: true,
            enum: QUESTION_V2_FORMATS,
        },
        order: {
            type: Number,
            default: 0,
            index: true,
        },
        isActive: {
            type: Boolean,
            default: true,
            index: true,
        },
        premium: {
            type: Boolean,
            default: false,
        },
        icon: {
            type: String,
            trim: true,
        },
        iconType: {
            type: String,
            enum: ['emoji', 'auto', 'image', 'asset'],
            default: 'auto',
        },
        iconUrl: {
            type: String,
            trim: true,
        },
        iconKey: {
            type: String,
            trim: true,
        },
        questions: {
            type: [questionV2Schema],
            default: [],
        },
    }, { timestamps: true });

    schema.index({ isActive: 1, order: 1 });
    schema.index({ setId: 1, isActive: 1 });

    return schema;
};
