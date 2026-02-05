import mongoose from "mongoose";

const neverHaveIEverQuestionSchema = new mongoose.Schema({
    question: {
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

neverHaveIEverQuestionSchema.index({ isActive: 1, spiceLevel: 1 });

const NeverHaveIEverQuestion = mongoose.model("NeverHaveIEverQuestion", neverHaveIEverQuestionSchema);
export default NeverHaveIEverQuestion;
