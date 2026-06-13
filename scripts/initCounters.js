import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Load env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Models
import Counter from '../models/Counter.js';
import FutureQuestion from '../models/FutureQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';
import MoneyQuestion from '../models/MoneyQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';
import FamilyQuestion from '../models/FamilyQuestion.js';

const TOPIC_MODELS = {
    'future': FutureQuestion,
    'hotspicy': HotSpicyQuestion,
    'money': MoneyQuestion,
    'political': PoliticalQuestion,
    'fitness': FitnessQuestion,
    'travel': TravelQuestion,
    'family': FamilyQuestion,
};

async function initCounters() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';
        await mongoose.connect(MONGODB_URI);

        
        for (const [topicId, Model] of Object.entries(TOPIC_MODELS)) {
            // Find max order
            const maxDoc = await Model.findOne().sort({ order: -1 }).select('order').lean();
            const maxOrder = maxDoc?.order || 0;
            const totalActiveQuestions = await Model.countDocuments({ isActive: true });
            
            // Upsert counter
            await Counter.findByIdAndUpdate(
                topicId,
                {
                    sequence_value: maxOrder,
                    totalActiveQuestions
                },
                { upsert: true, new: true }
            );

        }

        process.exit(0);
    } catch (error) {
        console.error('Error initializing counters:', error);
        process.exit(1);
    }
}

initCounters();
