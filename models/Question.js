import mongoose from 'mongoose';

const questionSchema = new mongoose.Schema({
    text: {
        type: String,
        required: true,
        trim: true,
    },
    category: {
        type: String,
        enum: ['deep', 'fun', 'romantic', 'daily', 'goals', 'memories'],
        default: 'daily',
    },
    questionType: {
        type: String,
        enum: ['text', 'true_false', 'options', 'rating'],
        default: 'text',
    },
    options: {
        type: [String], // For multiple choice questions
    },
    isActive: {
        type: Boolean,
        default: true,
    },
    order: {
        type: Number,
        default: 0,
    },
}, {
    timestamps: true,
});

const Question = mongoose.model('Question', questionSchema);

export default Question;
