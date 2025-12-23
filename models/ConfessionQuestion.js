import mongoose from "mongoose";

const confessionQuestionSchema = new mongoose.Schema({
    statement: {
        type: String,
        required: true
    },
    // "Never have I ever..." prefix is implied
    // Options are typically "I have" / "Never" or similar
    options: {
        type: Array,
        required: true,
        default: ["I have", "Never"]
    },
    // Visual representation style
    visualAspect: {
        type: String,
        required: true,
        default: "never_have_i_ever" // Simple yes/no style
    },
    // Intensity/spiciness level
    spiceLevel: {
        type: String,
        enum: ['mild', 'medium', 'spicy', 'extra_spicy'],
        default: 'mild'
    },
    // Category tag
    tag: {
        type: String,
        default: 'general'
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true
    },
}, { timestamps: true });

confessionQuestionSchema.index({ isActive: 1, spiceLevel: 1 });

const ConfessionQuestion = mongoose.model("ConfessionQuestion", confessionQuestionSchema);
export default ConfessionQuestion;
