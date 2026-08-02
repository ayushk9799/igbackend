import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import DailyChallenge from '../models/DailyChallenge.js';

const MONGODB_URI = process.env.MONGODB_URI;

const challengeData = {
    date: '2026-07-31',
    title: 'The Little Things We Love',
    isActive: true,
    tasks: [
        {
            taskstatement: "Who is more likely to turn an ordinary errand into a mini date?",
            category: 'likelyto',
            options: ['you', 'partner']
        },
        {
            taskstatement: "Never have I ever saved a tiny reminder of one of our dates, like a receipt, ticket, or photo.",
            category: 'neverhaveiever',
            options: ['I have', 'Never']
        },
        {
            taskstatement: "What's one small thing I did this month that made you feel especially loved or understood?",
            category: 'deep',
            options: []
        },
        {
            taskstatement: 'How excited are you about making a new memory together next month?',
            category: 'slider',
            options: [],
            minValue: 1,
            maxValue: 10,
            minLabel: 'Cozy and content',
            maxLabel: "Let's plan it now!"
        },
        {
            taskstatement: "Take a photo of one ordinary thing around you that somehow reminds you of us.",
            category: 'takephoto',
            options: []
        },
        {
            taskstatement: "Record a short voice note finishing this sentence: 'One thing I want us to carry into next month is...'",
            category: 'voicerecord',
            options: []
        }
    ]
};

async function seed() {
    try {
        await mongoose.connect(MONGODB_URI);

        const result = await DailyChallenge.findOneAndUpdate(
            { date: challengeData.date },
            challengeData,
            { upsert: true, new: true, runValidators: true }
        );

      
        process.exit(0);
    } catch (error) {
        console.error('Error seeding today\'s challenge:', error);
        process.exit(1);
    }
}

seed();
