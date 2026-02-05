import mongoose from "mongoose";

/**
 * FamilyQuestion - Questions about family, kids, and future family plans
 * Each question has a visualType to determine how it's displayed (likelyto, neverhaveiever, deep, takephoto)
 */
const familyQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Visual type determines which card component is used
    visualType: {
        type: String,
        required: true,
        enum: ['likelyto', 'neverhaveiever', 'deep', 'takephoto'],
        default: 'deep'
    },
    // Options for multiple choice questions (likelyto, neverhaveiever)
    options: {
        type: [String],
        default: []
    },
    // Placeholder text for text-input questions
    placeholder: {
        type: String,
        default: "Share your thoughts..."
    },
    // Spice level for more intimate questions
    spiceLevel: {
        type: String,
        enum: ['mild', 'medium', 'spicy', 'extra_spicy'],
        default: 'mild'
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

familyQuestionSchema.index({ isActive: 1, visualType: 1 });

const FamilyQuestion = mongoose.model("FamilyQuestion", familyQuestionSchema);
export default FamilyQuestion;
