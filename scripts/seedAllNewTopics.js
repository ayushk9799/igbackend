import mongoose from 'mongoose';
import dotenv from 'dotenv';
import MoneyQuestion from '../models/MoneyQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';
import FamilyQuestion from '../models/FamilyQuestion.js';

dotenv.config();

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

// 💰 Money questions
const moneyQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to splurge on something expensive?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to forget to pay a bill?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to save for retirement first?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to haggle for a better price?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to make an impulse purchase?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever hidden a purchase from my partner", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever lied about how much something cost", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever regretted a big purchase", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever bought something I never used", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type
    { question: "What's one financial goal you want us to achieve together?", visualType: "deep", placeholder: "Share your money goal..." },
    { question: "How do you think we should split expenses?", visualType: "deep", placeholder: "Be honest about preferences..." },
    { question: "What would you do if we won the lottery?", visualType: "deep", placeholder: "Dream big..." },
    { question: "What's your biggest financial fear?", visualType: "deep", placeholder: "Open up..." },

    // TakePhoto visual type
    { question: "Show me your most prized purchase!", visualType: "takephoto", placeholder: "Take a photo of something valuable to you" },
];

// 🗳️ Political questions
const politicalQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to get into a political debate?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to vote in every election?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to change their political views?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to attend a protest or rally?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to run for office someday?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever changed my mind on a major issue", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever unfriended someone over politics", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever donated to a political cause", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever watched a political debate for fun", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type
    { question: "What political issue matters most to you and why?", visualType: "deep", placeholder: "Share what you care about..." },
    { question: "How do you feel when we disagree on political topics?", visualType: "deep", placeholder: "Be honest..." },
    { question: "What change would you make if you were president for a day?", visualType: "deep", placeholder: "Think big..." },
    { question: "How do you think politics affects our relationship?", visualType: "deep", placeholder: "Reflect honestly..." },
];

// 💪 Fitness questions
const fitnessQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to skip a workout?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to run a marathon someday?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to try a new sport?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to become a gym addict?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to eat healthy consistently?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever pretended to work out", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever eaten junk food after a workout", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever signed up for a gym and never went", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever lied about how much I exercise", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type
    { question: "What fitness goal do you want us to achieve together?", visualType: "deep", placeholder: "Share your fitness dream..." },
    { question: "What's your biggest health concern right now?", visualType: "deep", placeholder: "Open up..." },
    { question: "How can I better support your fitness journey?", visualType: "deep", placeholder: "Be specific..." },
    { question: "What activity would you love to do together regularly?", visualType: "deep", placeholder: "Suggest something fun..." },

    // TakePhoto visual type
    { question: "Show me your workout spot!", visualType: "takephoto", placeholder: "Take a photo of where you exercise" },
];

// ✈️ Travel questions
const travelQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to lose their passport?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to pick a spontaneous trip?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to overpack for a trip?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to try weird local food?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to get homesick while traveling?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever missed a flight", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever traveled solo", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever gotten lost in a foreign country", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever cried because of travel stress", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type
    { question: "What's your dream travel destination with me?", visualType: "deep", placeholder: "Describe your dream trip..." },
    { question: "What's the most memorable trip you've ever taken?", visualType: "deep", placeholder: "Share the story..." },
    { question: "If we could live abroad for a year, where would you choose?", visualType: "deep", placeholder: "Pick your place..." },
    { question: "What's on your travel bucket list?", visualType: "deep", placeholder: "List your dream destinations..." },

    // TakePhoto visual type
    { question: "Show me your favorite travel photo!", visualType: "takephoto", placeholder: "Share a memory from a trip" },
];

// 👨‍👩‍👧‍👦 Family questions
const familyQuestions = [
    // LikelyTo visual type
    { question: "Who is more likely to be the strict parent?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to spoil the kids?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to be the fun parent?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to handle homework help?", visualType: "likelyto", options: [] },
    { question: "Who is more likely to cry at the kids' milestones?", visualType: "likelyto", options: [] },

    // NeverHaveIEver visual type
    { question: "Never have I ever thought about baby names", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever dreamed about our future family", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever worried about being a good parent", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },
    { question: "Never have I ever disagreed with my partner's family", visualType: "neverhaveiever", options: ["I have", "Never"], spiceLevel: "mild" },

    // Deep visual type
    { question: "How many kids do you see in our future?", visualType: "deep", placeholder: "Share your vision..." },
    { question: "What parenting value is most important to you?", visualType: "deep", placeholder: "Be thoughtful..." },
    { question: "What family tradition would you want to start?", visualType: "deep", placeholder: "Share an idea..." },
    { question: "How do you want to handle holidays with both families?", visualType: "deep", placeholder: "Be honest..." },
    { question: "What's one thing your parents did that you want to do differently?", visualType: "deep", placeholder: "Reflect..." },
];

async function seedAllTopics() {
    try {
        await mongoose.connect(MONGODB_URI);

        // Clear existing questions
        await MoneyQuestion.deleteMany({});
        await PoliticalQuestion.deleteMany({});
        await FitnessQuestion.deleteMany({});
        await TravelQuestion.deleteMany({});
        await FamilyQuestion.deleteMany({});

        // Seed Money questions
        const createdMoney = await MoneyQuestion.insertMany(moneyQuestions);

        // Seed Political questions
        const createdPolitical = await PoliticalQuestion.insertMany(politicalQuestions);

        // Seed Fitness questions
        const createdFitness = await FitnessQuestion.insertMany(fitnessQuestions);

        // Seed Travel questions
        const createdTravel = await TravelQuestion.insertMany(travelQuestions);

        // Seed Family questions
        const createdFamily = await FamilyQuestion.insertMany(familyQuestions);

        const total = createdMoney.length + createdPolitical.length + createdFitness.length +
            createdTravel.length + createdFamily.length;

     

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('❌ Error seeding questions:', error);
        process.exit(1);
    }
}

seedAllTopics();
