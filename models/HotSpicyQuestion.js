import mongoose from "mongoose";
import { addActiveQuestionCountHooks } from "../utils/questionActiveCount.js";

/**
 * HotSpicyQuestion - Intimate and spicy questions for couples
 * Each question has a visualType to determine how it's displayed (likelyto, neverhaveiever, deep)
 */
const hotSpicyQuestionSchema = new mongoose.Schema({
    question: {
        type: String,
        required: true
    },
    // Visual type determines which card component is used
    visualType: {
        type: String,
        required: true,
        enum: ['likelyto', 'neverhaveiever', 'deep', 'takephoto', 'slider', 'voicerecord'],
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
    minValue: {
        type: Number
    },
    maxValue: {
        type: Number
    },
    minLabel: {
        type: String,
        trim: true
    },
    maxLabel: {
        type: String,
        trim: true
    },
    // Spice level - more granular for this category
    spiceLevel: {
        type: String,
        enum: ['mild', 'medium', 'spicy', 'extra_spicy'],
        default: 'spicy'
    },
    // Age restriction flag
    isAdult: {
        type: Boolean,
        default: true
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

hotSpicyQuestionSchema.index({ isActive: 1, visualType: 1, spiceLevel: 1 });
addActiveQuestionCountHooks(hotSpicyQuestionSchema, 'hotspicy');

const HotSpicyQuestion = mongoose.model("HotSpicyQuestion", hotSpicyQuestionSchema);
export default HotSpicyQuestion;
