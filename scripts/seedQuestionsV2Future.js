import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import FutureQuestionSetV2 from '../models/v2/FutureQuestionSetV2.js';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

const futureSets = [
    {
        setId: 'future-never-have-i-ever',
        title: 'Home In Our Heads',
        format: 'neverhaveiever',
        order: 1,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-nhie-001',
                prompt: 'Never have I ever imagined what our home together would look like.',
                isActive: true,
            },
            {
                questionId: 'future-nhie-002',
                prompt: 'Never have I ever thought about what kind of parents we would be.',
                isActive: true,
            },
            {
                questionId: 'future-nhie-003',
                prompt: 'Never have I ever pictured us growing old together.',
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-would-you-rather',
        title: 'Roots Or Wings',
        format: 'wouldyourather',
        order: 2,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-wyr-001',
                prompt: 'Would you rather live in one dream city forever or move somewhere new every few years?',
                options: ['One dream city', 'Move every few years'],
                isActive: true,
            },
            {
                questionId: 'future-wyr-002',
                prompt: 'Would you rather build a calm simple life or chase a big ambitious dream together?',
                options: ['Calm simple life', 'Big ambitious dream'],
                isActive: true,
            },
            {
                questionId: 'future-wyr-003',
                prompt: 'Would you rather buy a home early or travel more before settling down?',
                options: ['Buy a home early', 'Travel more first'],
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-this-or-that',
        title: 'Quiet Or Wild',
        format: 'thisorthat',
        order: 3,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-tot-001',
                prompt: 'A quiet life together or an adventurous life together?',
                options: ['Quiet life', 'Adventurous life'],
                isActive: true,
            },
            {
                questionId: 'future-tot-002',
                prompt: 'City apartment or house with a yard?',
                options: ['City apartment', 'House with a yard'],
                isActive: true,
            },
            {
                questionId: 'future-tot-003',
                prompt: 'Plan everything or figure it out as we go?',
                options: ['Plan everything', 'Figure it out'],
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-in-5-years',
        title: 'Our Next Chapter',
        format: 'deep',
        order: 4,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-deep-001',
                prompt: 'What part of our life five years from now feels most exciting to you?',
                isActive: true,
            },
            {
                questionId: 'future-deep-002',
                prompt: 'What is one future decision you want us to be more aligned on?',
                isActive: true,
            },
            {
                questionId: 'future-deep-003',
                prompt: 'What would make you feel proud of us as a couple five years from now?',
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-goals',
        title: 'Big Move Readiness',
        format: 'slider',
        order: 5,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-slider-001',
                prompt: 'How important is financial stability before making big life moves together?',
                minValue: 1,
                maxValue: 10,
                minLabel: 'Not urgent',
                maxLabel: 'Very important',
                isActive: true,
            },
            {
                questionId: 'future-slider-002',
                prompt: 'How ready do you feel for bigger long-term commitments with us?',
                minValue: 1,
                maxValue: 10,
                minLabel: 'Not ready',
                maxLabel: 'Very ready',
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-voice-note',
        title: 'A Promise To Us',
        format: 'voicerecord',
        order: 6,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-voice-001',
                prompt: 'Record what you hope our future feels like.',
                isActive: true,
            },
            {
                questionId: 'future-voice-002',
                prompt: 'Record one promise you want to keep for our future.',
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-photo-memory',
        title: 'Future In A Photo',
        format: 'takephoto',
        order: 7,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-photo-001',
                prompt: 'Share a photo that represents a future you want with us.',
                isActive: true,
            },
            {
                questionId: 'future-photo-002',
                prompt: 'Share a place, object, or moment that feels like our future.',
                isActive: true,
            },
        ],
    },
    {
        setId: 'future-likely-to',
        title: 'Future Forecast',
        format: 'likelyto',
        order: 8,
        isActive: true,
        premium: false,
        questions: [
            {
                questionId: 'future-lt-001',
                prompt: 'Who is more likely to want to relocate to a new city or country first?',
                isActive: true,
            },
            {
                questionId: 'future-lt-002',
                prompt: 'Who is more likely to handle the household finances and budgeting?',
                isActive: true,
            },
            {
                questionId: 'future-lt-003',
                prompt: 'Who is more likely to suggest adopting a pet or expanding our family first?',
                isActive: true,
            },
        ],
    },
];

const run = async () => {
    await mongoose.connect(MONGODB_URI);

    for (const set of futureSets) {
        await FutureQuestionSetV2.findOneAndUpdate(
            { setId: set.setId },
            set,
            { upsert: true, new: true, runValidators: true }
        );
    }

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Failed to seed Future V2 question sets:', error);
    await mongoose.disconnect();
    process.exit(1);
});
