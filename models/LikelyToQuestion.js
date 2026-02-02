import mongoose from "mongoose";

const likelyToQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Options will contain partner names/avatars for "who is more likely"
    options: {
        type: Array,
        required: true,
        default: [] // Will be populated with partner options dynamically
    },
    // Visual representation style
    visualAspect: {
        type: String,
        required: true,
        default: "likelyto" // LikelyTo typically uses drag/select UI
    },
    // Optional: predefined options like "Both", "Neither"
    additionalOptions: [{
        type: String
    }],
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
}, { timestamps: true });

likelyToQuestionSchema.index({ isActive: 1 });

const LikelyToQuestion = mongoose.model("LikelyToQuestion", likelyToQuestionSchema);
export default LikelyToQuestion;
