import mongoose from "mongoose";

// Individual question schema within a set
const questionItemSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['likelyto', 'confession','deep',]
    },
    options: {
        type: [String],
        default: []
    },
    // Visual styles: drag_select, multiple_choice, slider, text_input, etc.
    visualAspect: {
        type: String,
        required: true,
        default: "none",
        enum: ['none', 'drag_select', 'multiple_choice', 'slider', 'text_input', 'yes_no', 'scale']
    },
    // Additional styling options
   
}, { _id: true });

// Main Daily Question Set schema
const dailyQuestionSetSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        default: "Daily Questions"
    },
    questions: {
        type: [questionItemSchema],
        required: true,
        validate: {
            validator: function (v) {
                return v.length > 0;
            },
            message: 'Question set must have at least one question'
        }
    },
    isActive: {
        type: Boolean,
        required: true,
        default: true
    }
}, { timestamps: true });

dailyQuestionSetSchema.index({ date: 1 });
dailyQuestionSetSchema.index({ isActive: 1 });

const DailyQuestion = mongoose.model("DailyQuestion", dailyQuestionSetSchema);
export default DailyQuestion;
