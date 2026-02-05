import mongoose from "mongoose";

/**
 * DeepQuestion - Generic text-input question model for topic-based questions
 * Used for open-ended questions that don't fit likelyto or neverhaveiever patterns
 */
const deepQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Placeholder text for the input field
    placeholder: {
        type: String,
        default: "Share your thoughts..."
    },
    // Visual representation style
    visualAspect: {
        type: String,
        required: true,
        default: "deep"
    },
    // Topic for categorization
    topic: {
        type: String,
        enum: ['future', 'money', 'hotspicy', 'political', 'fitness', 'travel', 'family'],
        required: true,
        index: true
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true
    },
    order: {
        type: Number,
        default: 0,
        index: true
    },
}, { timestamps: true });

deepQuestionSchema.index({ isActive: 1, topic: 1 });

const DeepQuestion = mongoose.model("DeepQuestion", deepQuestionSchema);
export default DeepQuestion;
