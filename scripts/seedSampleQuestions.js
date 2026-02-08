/**
 * Seed sample questions for all new question types
 * Run with: node scripts/seedSampleQuestions.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import PreferenceQuestion from '../models/PreferenceQuestion.js';
import ScaleQuestion from '../models/ScaleQuestion.js';
import LoveLanguageQuestion from '../models/LoveLanguageQuestion.js';
import WouldYouRatherQuestion from '../models/WouldYouRatherQuestion.js';
import BucketListQuestion from '../models/BucketListQuestion.js';
import FinishSentenceQuestion from '../models/FinishSentenceQuestion.js';
import GratitudeQuestion from '../models/GratitudeQuestion.js';
import MemoryQuestion from '../models/MemoryQuestion.js';
import ScenarioQuestion from '../models/ScenarioQuestion.js';
import OpinionQuestion from '../models/OpinionQuestion.js';
import VulnerabilityQuestion from '../models/VulnerabilityQuestion.js';
import RoleplayQuestion from '../models/RoleplayQuestion.js';

const preferenceQuestions = [
    { question: "What's your ideal vacation?", optionA: "Beach relaxation", optionB: "Mountain adventure", category: "lifestyle" },
    { question: "Preferred date night?", optionA: "Cozy night in", optionB: "Night out", category: "lifestyle" },
    { question: "Morning or night?", optionA: "Morning person", optionB: "Night owl", category: "personality" },
];

const scaleQuestions = [
    { question: "How adventurous would you say you are?", minLabel: "Not at all", maxLabel: "Extremely" },
    { question: "How romantic do you consider yourself?", minLabel: "Practical", maxLabel: "Very romantic" },
    { question: "How important is alone time to you?", minLabel: "Not important", maxLabel: "Very important" },
];

const wouldYouRatherQuestions = [
    { question: "Would you rather...", optionA: "Travel back in time", optionB: "Travel to the future", difficulty: "medium" },
    { question: "Would you rather...", optionA: "Always be early", optionB: "Risk being late", difficulty: "easy" },
    { question: "Would you rather...", optionA: "Give up vacations for 5 years", optionB: "Give up your phone for 1 year", difficulty: "hard" },
];

const bucketListQuestions = [
    { question: "One place we MUST visit together?", category: "travel" },
    { question: "A skill you want us to learn together?", category: "personal" },
    { question: "Something crazy we should do before 50?", category: "adventure" },
];

const finishSentenceQuestions = [
    { prompt: "I knew I loved you when...", category: "romantic" },
    { prompt: "The thing that surprised me most about us is...", category: "deep" },
    { prompt: "In 10 years, I hope we...", category: "future" },
];

const gratitudeQuestions = [
    { question: "Something you did this week that made me happy?", category: "partner" },
    { question: "A quality I admire in you?", category: "partner" },
    { question: "Something small that makes me smile?", category: "daily" },
];

const memoryQuestions = [
    { question: "What's your favorite memory from our first year?", category: "first" },
    { question: "The funniest moment we've shared?", category: "funny" },
    { question: "Our best trip together?", category: "travel" },
];

const scenarioQuestions = [
    { scenario: "If we could have dinner with any celebrity couple, who?", category: "fun" },
    { scenario: "If we won the lottery, what's the first thing we'd do?", category: "fantasy" },
    { scenario: "If we had to move to another country, where?", category: "practical" },
];

const opinionQuestions = [
    { statement: "Pineapple on pizza - acceptable?", options: ["Yes!", "Never!"], spiceLevel: "mild" },
    { statement: "It's okay to go to bed angry", options: ["Agree", "Disagree"], spiceLevel: "medium" },
    { statement: "Separate blankets are totally fine", options: ["Agree", "Disagree"], spiceLevel: "mild" },
];

const vulnerabilityQuestions = [
    { question: "What's something you've never told me but want to?", depth: "deep", category: "trust" },
    { question: "A fear you have about our future?", depth: "moderate", category: "fears" },
    { question: "What do you need more of from me?", depth: "moderate", category: "needs" },
];

const roleplayQuestions = [
    { prompt: "If your partner was a superhero, what would their power be?", category: "creative" },
    { prompt: "Describe your partner as a food item", category: "silly" },
    { prompt: "What animal best represents your relationship?", category: "imaginative" },
];

async function seedQuestions() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';
        await mongoose.connect(MONGODB_URI);

        await PreferenceQuestion.insertMany(preferenceQuestions);
        await ScaleQuestion.insertMany(scaleQuestions);
        await WouldYouRatherQuestion.insertMany(wouldYouRatherQuestions);
        await BucketListQuestion.insertMany(bucketListQuestions);
        await FinishSentenceQuestion.insertMany(finishSentenceQuestions);
        await GratitudeQuestion.insertMany(gratitudeQuestions);
        await MemoryQuestion.insertMany(memoryQuestions);
        await ScenarioQuestion.insertMany(scenarioQuestions);
        await OpinionQuestion.insertMany(opinionQuestions);
        await VulnerabilityQuestion.insertMany(vulnerabilityQuestions);
        await RoleplayQuestion.insertMany(roleplayQuestions);

        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

seedQuestions();
