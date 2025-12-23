import mongoose from "mongoose";

const knowledgeQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Multiple choice options for "How well do you know me"
    options: [{
        type: String,
        required: true
    }],
    // The correct answer index (0-based)
    correctOptionIndex: {
        type: Number,
        required: true
    },
    // Who answers this question (the one being asked about)
    targetPartner: {
        type: String,
        enum: ['self', 'partner', 'both'],
        default: 'partner'
    },
    // Visual representation style
    visualAspect: {
        type: String,
        required: true,
        default: "multiple_choice"
    },
    // Difficulty level
    difficulty: {
        type: String,
        enum: ['easy', 'medium', 'hard'],
        default: 'medium'
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true
    },
}, { timestamps: true });

knowledgeQuestionSchema.index({ isActive: 1, difficulty: 1 });

const KnowledgeQuestion = mongoose.model("KnowledgeQuestion", knowledgeQuestionSchema);
export default KnowledgeQuestion;
