import mongoose from "mongoose";

// Individual question schema within a set
const taskItemSchema = new mongoose.Schema({
    taskstatement: {
        type: String,
        required: true
    },
    category: {
        type: String,
        required: true,
        enum: ['likelyto', 'neverhaveiever', 'deep',"takephoto"]
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
const dailyChallengeSchema = new mongoose.Schema({
    date: {
        type: String,
        required: true,
        unique: true
    },
    title: {
        type: String,
        default: "Daily Questions"
    },
    tasks: {
        type: [taskItemSchema],
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

dailyChallengeSchema.index({ date: 1 });
dailyChallengeSchema.index({ isActive: 1 });

const DailyChallenge = mongoose.model("DailyChallenge", dailyChallengeSchema);
export default DailyChallenge;
