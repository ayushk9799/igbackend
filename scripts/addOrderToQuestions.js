import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all models
import FutureQuestion from '../models/FutureQuestion.js';
import MoneyQuestion from '../models/MoneyQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';
import FamilyQuestion from '../models/FamilyQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';

// Load env vars
dotenv.config({ path: path.join(path.dirname(fileURLToPath(import.meta.url)), '../.env') });

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

const models = {
    'FutureQuestion': FutureQuestion,
    'MoneyQuestion': MoneyQuestion,
    'HotSpicyQuestion': HotSpicyQuestion,
    'FamilyQuestion': FamilyQuestion,
    'FitnessQuestion': FitnessQuestion,
    'PoliticalQuestion': PoliticalQuestion,
    'TravelQuestion': TravelQuestion,
};

async function migrate() {
    try {
        await mongoose.connect(MONGODB_URI);

        for (const [name, Model] of Object.entries(models)) {
            const questions = await Model.find({}).sort({ createdAt: 1 });


            let updatedCount = 0;
            for (let i = 0; i < questions.length; i++) {
                const q = questions[i];
                // if (q.order !== i + 1) { // Force update to be safe, easier logic
                q.order = i + 1;
                await q.save();
                updatedCount++;
                // }
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('❌ Migration failed:', error);
        process.exit(1);
    }
}

migrate();
