import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import DailyChallenge from '../models/DailyChallenge.js';

const MONGODB_URI = process.env.MONGODB_URI;

const challengeData = {
    date: '2026-08-05',
    title: 'The Tiny Clue Challenge',
    isActive: true,
    tasks: [
        {
            taskstatement: "Who is more likely to notice when one tiny thing in the room has moved?",
            category: 'likelyto',
            options: ['you', 'partner']
        },
        {
            taskstatement: "Never have I ever pretended to understand what my partner was talking about and waited for context to rescue me.",
            category: 'neverhaveiever',
            options: ['I have', 'Never']
        },
        {
            taskstatement: 'How quickly could you recognize your partner from only their footsteps?',
            category: 'slider',
            options: [],
            minValue: 1,
            maxValue: 10,
            minLabel: 'Not a clue',
            maxLabel: 'First two steps'
        },
        {
            taskstatement: "Record a 5-second mystery sound using one thing near you. Do not reveal what made it—your partner has to guess.",
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
