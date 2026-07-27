import mongoose from 'mongoose';
import dotenv from 'dotenv';
dotenv.config();

import DailyChallenge from '../models/DailyChallenge.js';

const MONGODB_URI = process.env.MONGODB_URI;

const challengeData = {
    date: '2026-06-28',
    title: 'Daily Connection Sparks',
    isActive: true,
    tasks: [
        {
            taskstatement: "Who is more likely to steal glances at the other when they think they aren't looking?",
            category: 'likelyto',
            options: ['you', 'partner']
        },
        {
            taskstatement: "Never have I ever bragged about my partner to someone else when they weren't around.",
            category: 'neverhaveiever',
            options: ['I have', 'Never']
        },
        {
            taskstatement: "What's a small habit of mine that you hope I never change?",
            category: 'deep',
            options: []
        },
        {
            taskstatement: 'How excited are you for our next date night together?',
            category: 'slider',
            options: [],
            minValue: 1,
            maxValue: 10,
            minLabel: 'Chill / Low key',
            maxLabel: "Can't wait!"
        },
        {
            taskstatement: "Take a photo of a cozy spot where you'd love us to cuddle right now.",
            category: 'takephoto',
            options: []
        },
        {
            taskstatement: 'Record a 5-second happy sigh or whisper one word that describes your mood today.',
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
