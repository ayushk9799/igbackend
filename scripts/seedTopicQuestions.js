import mongoose from 'mongoose';
import dotenv from 'dotenv';
import FutureQuestion from '../models/FutureQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

// Future questions with different visual types
const futureQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to retire early?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to want to move to another country?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to start their own business?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to buy a dream house first?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to change careers completely?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever dreamed about our wedding", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever made a 5-year plan for my life", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever thought about having kids with you", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever imagined growing old together", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type (text input)
    { question: "What's one dream you haven't shared with me yet?", visualType: "deep", placeholder: "Share your hidden dream..." },
    { question: "Where do you see us in 10 years?", visualType: "deep", placeholder: "Describe our future..." },
    { question: "What's your biggest goal for our relationship?", visualType: "deep", placeholder: "Be honest..." },
    { question: "If money wasn't an issue, where would we live?", visualType: "deep", placeholder: "Dream big..." },
];

// Hot & Spicy questions with different visual types
const hotSpicyQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to initiate intimacy?", visualType: "likelyto", options: [], spiceLevel: "medium" },
    { question: "Who is more likely to try something new in bed?", visualType: "likelyto", options: [], spiceLevel: "spicy" },
    { question: "Who is more likely to send a flirty text first?", visualType: "likelyto", options: [], spiceLevel: "mild" },
    { question: "Who is more likely to buy lingerie?", visualType: "likelyto", options: [], spiceLevel: "spicy" },
    { question: "Who is more likely to suggest a romantic getaway?", visualType: "likelyto", options: [], spiceLevel: "mild" },

    // NeverHaveIEver visual type
    { question: "Never have I ever had a dream about you", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "medium" },
    { question: "Never have I ever thought about you during work", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever sent a risky photo", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "spicy" },
    { question: "Never have I ever wanted to recreate a movie scene", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "medium" },

    // Deep visual type (text input)
    { question: "What's something you've always wanted to try together?", visualType: "deep", placeholder: "Be open...", spiceLevel: "spicy" },
    { question: "What's your favorite thing I do for you?", visualType: "deep", placeholder: "Be specific...", spiceLevel: "medium" },
    { question: "Describe your perfect romantic evening", visualType: "deep", placeholder: "Set the scene...", spiceLevel: "medium" },
    { question: "What makes you feel most desired?", visualType: "deep", placeholder: "Share your feelings...", spiceLevel: "spicy" },
];

async function seedQuestions() {
    try {
        await mongoose.connect(MONGODB_URI);

        // Clear existing questions
        await FutureQuestion.deleteMany({});
        await HotSpicyQuestion.deleteMany({});

        // Seed Future questions
        const createdFuture = await FutureQuestion.insertMany(futureQuestions);

        // Seed Hot & Spicy questions
        const createdHotSpicy = await HotSpicyQuestion.insertMany(hotSpicyQuestions);
     

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding questions:', error);
        process.exit(1);
    }
}

seedQuestions();
