/**
 * Seed script to add new question categories to the database
 * Run with: node scripts/seedNewCategories.js
 */

import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Categories from '../models/Categories.js';

dotenv.config();

const newCategories = [
    {
        title: 'This or That...',
        slug: 'preference',
        description: 'Compare preferences and discover your compatibility!',
        modelName: 'PreferenceQuestion',
        icon: '💜',
        isActive: true,
        order: 5,
    },
    {
        title: 'Rate Yourself...',
        slug: 'scale',
        description: 'Rate various aspects and compare perspectives!',
        modelName: 'ScaleQuestion',
        icon: '📊',
        isActive: true,
        order: 6,
    },
    {
        title: 'Love Language...',
        slug: 'lovelanguage',
        description: 'Discover your love languages together!',
        modelName: 'LoveLanguageQuestion',
        icon: '❤️',
        isActive: true,
        order: 7,
    },
    {
        title: 'Would You Rather...',
        slug: 'wouldyourather',
        description: 'Make tough choices and see if you agree!',
        modelName: 'WouldYouRatherQuestion',
        icon: '🤔',
        isActive: true,
        order: 8,
    },
    {
        title: 'Bucket List...',
        slug: 'bucketlist',
        description: 'Share your dreams and goals for the future!',
        modelName: 'BucketListQuestion',
        icon: '🌟',
        isActive: true,
        order: 9,
    },
    {
        title: 'Finish The Sentence...',
        slug: 'finishsentence',
        description: 'Express your feelings by completing prompts!',
        modelName: 'FinishSentenceQuestion',
        icon: '✏️',
        isActive: true,
        order: 10,
    },
    {
        title: 'Gratitude...',
        slug: 'gratitude',
        description: 'Share what you appreciate about each other!',
        modelName: 'GratitudeQuestion',
        icon: '🙏',
        isActive: true,
        order: 11,
    },
    {
        title: 'Memory Lane...',
        slug: 'memory',
        description: 'Share your favorite relationship memories!',
        modelName: 'MemoryQuestion',
        icon: '📸',
        isActive: true,
        order: 12,
    },
    {
        title: 'What If...',
        slug: 'scenario',
        description: 'Explore fun hypothetical scenarios!',
        modelName: 'ScenarioQuestion',
        icon: '🎭',
        isActive: true,
        order: 13,
    },
    {
        title: 'Hot Takes...',
        slug: 'opinion',
        description: 'Share your hot takes and opinions!',
        modelName: 'OpinionQuestion',
        icon: '🔥',
        isActive: true,
        order: 14,
    },
    {
        title: 'Deep Talk...',
        slug: 'vulnerability',
        description: 'Connect through deeper questions.',
        modelName: 'VulnerabilityQuestion',
        icon: '💙',
        isActive: true,
        order: 15,
    },
    {
        title: 'Creative Prompt...',
        slug: 'roleplay',
        description: 'Fun creative prompts to spark imagination!',
        modelName: 'RoleplayQuestion',
        icon: '🎨',
        isActive: true,
        order: 16,
    },
];

async function seedCategories() {
    try {
        const MONGODB_URI = process.env.MONGODB_URI;
        await mongoose.connect(MONGODB_URI);

        for (const category of newCategories) {
            const existing = await Categories.findOne({ slug: category.slug });
            if (existing) {
            } else {
                await Categories.create(category);
            }
        }

        process.exit(0);
    } catch (error) {
        console.error('Error seeding categories:', error);
        process.exit(1);
    }
}

seedCategories();
