import mongoose from "mongoose";

const agreementQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Options both partners will choose from
    options: [{
        type: String,
        required: true
    }],
    // Visual representation style
    visualAspect: {
        type: String,
        required: true,
        default: "matching" // Both answer separately, then reveal
    },
    // Category/topic for grouping
    topic: {
        type: String,
        default: 'general'
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true
    },
}, { timestamps: true });

agreementQuestionSchema.index({ isActive: 1, topic: 1 });

const AgreementQuestion = mongoose.model("AgreementQuestion", agreementQuestionSchema);
export default AgreementQuestion;
