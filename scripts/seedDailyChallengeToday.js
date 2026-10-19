import mongoose from 'mongoose';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
dotenv.config();

import DailyChallenge from '../models/DailyChallenge.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI;

const defaultChallengeData = {
    date: '2026-10-16',
    title: "Inside Jokes & Secret Glances",
    isActive: true,
    tasks: [
        {
            taskstatement: "Who is more likely to laugh when they are supposed to be serious?",
            category: 'likelyto',
            options: ['you', 'partner']
        },
        {
            taskstatement: "Never have I ever had a conversation with you using only facial expressions.",
            category: 'neverhaveiever',
            options: ['I have', 'Never']
        },
        {
            taskstatement: "Take a quick selfie raising one eyebrow.",
            category: 'takephoto',
            options: []
        },
        {
            taskstatement: "When something awkward happens in a group, how fast do you look at me?",
            category: 'slider',
            options: [],
            minValue: 1,
            maxValue: 10,
            minLabel: "Look away",
            maxLabel: "Instant eye contact"
        },
        {
            taskstatement: "In a 5-second voice note, tell me one inside joke only we understand.",
            category: 'voicerecord',
            options: []
        }
    ]
};

const targetDate = process.argv[2];
let challengeData = defaultChallengeData;

if (targetDate) {
    const draftPath = path.resolve(__dirname, `../drafts/daily-challenges/${targetDate}.json`);
    if (fs.existsSync(draftPath)) {
        console.log(`Loading challenge data from ${draftPath}...`);
        challengeData = JSON.parse(fs.readFileSync(draftPath, 'utf8'));
    }
}

async function seed() {
    try {
        console.log('Connecting to MongoDB...');
        await mongoose.connect(MONGODB_URI, {
            serverSelectionTimeoutMS: 15000,
            socketTimeoutMS: 45000,
        });
        console.log('Connected to MongoDB.');

        const result = await DailyChallenge.findOneAndUpdate(
            { date: challengeData.date },
            challengeData,
            { upsert: true, new: true, runValidators: true }
        );

        console.log('Successfully posted/upserted challenge for:', result.date, 'Title:', result.title, 'ID:', result._id);
        process.exit(0);
    } catch (error) {
        console.error('Error seeding challenge:', error);
        process.exit(1);
    }
}

seed();
