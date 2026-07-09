import dotenv from 'dotenv';
dotenv.config();

import mongoose from 'mongoose';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import all V2 models
import RelationshipQuestionSetV2 from '../models/v2/RelationshipQuestionSetV2.js';
import SexLoveQuestionSetV2 from '../models/v2/SexLoveQuestionSetV2.js';
import CoupleTherapyQuestionSetV2 from '../models/v2/CoupleTherapyQuestionSetV2.js';
import LongDistanceQuestionSetV2 from '../models/v2/LongDistanceQuestionSetV2.js';
import NaughtyQuestionSetV2 from '../models/v2/NaughtyQuestionSetV2.js';
import GossipQuestionSetV2 from '../models/v2/GossipQuestionSetV2.js';
import MoneyQuestionSetV2 from '../models/v2/MoneyQuestionSetV2.js';
import GetToKnowQuestionSetV2 from '../models/v2/GetToKnowQuestionSetV2.js';
import TravelQuestionSetV2 from '../models/v2/TravelQuestionSetV2.js';
import FamilyQuestionSetV2 from '../models/v2/FamilyQuestionSetV2.js';
import FutureQuestionSetV2 from '../models/v2/FutureQuestionSetV2.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://ayushkumarsanu00:ypGJ4XV0qhOYTk6E@cluster0.c6ey1bf.mongodb.net/?appName=Cluster0';

const TOPIC_MODELS = {
    relationship: RelationshipQuestionSetV2,
    sexlove: SexLoveQuestionSetV2,
    coupletherapy: CoupleTherapyQuestionSetV2,
    longdistance: LongDistanceQuestionSetV2,
    naughty: NaughtyQuestionSetV2,
    gossip: GossipQuestionSetV2,
    money: MoneyQuestionSetV2,
    gettoknow: GetToKnowQuestionSetV2,
    travel: TravelQuestionSetV2,
    family: FamilyQuestionSetV2,
    future: FutureQuestionSetV2,
};

// Recursive helper function to strip out database metadata
const cleanObject = (obj) => {
    if (!obj || typeof obj !== 'object') return obj;
    
    if (obj instanceof mongoose.Types.ObjectId) {
        return obj.toString();
    }
    
    if (Array.isArray(obj)) {
        return obj.map(cleanObject);
    }
    
    const cleaned = {};
    for (const [key, value] of Object.entries(obj)) {
        if (['_id', '__v', 'createdAt', 'updatedAt'].includes(key)) {
            continue;
        }
        cleaned[key] = cleanObject(value);
    }
    return cleaned;
};

const run = async () => {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGODB_URI);
    console.log('Connected successfully.');

    const allData = {};
    let totalSets = 0;
    let totalQuestions = 0;

    for (const [topicId, Model] of Object.entries(TOPIC_MODELS)) {
        console.log(`Fetching sets for topic: ${topicId}...`);
        const sets = await Model.find({}).sort({ order: 1 }).lean();
        console.log(`Found ${sets.length} sets for ${topicId}.`);
        
        const cleanedSets = cleanObject(sets);
        allData[topicId] = cleanedSets;
        
        totalSets += sets.length;
        for (const set of sets) {
            if (set.questions) {
                totalQuestions += set.questions.length;
            }
        }
    }

    const outputFileName = 'v2_questions_downloaded.json';
    const outputPath = path.join(__dirname, '..', outputFileName);
    fs.writeFileSync(outputPath, JSON.stringify(allData, null, 2), 'utf8');
    
    console.log('\n==================================================');
    console.log(`Successfully downloaded all V2 questions!`);
    console.log(`Total Topics: ${Object.keys(TOPIC_MODELS).length}`);
    console.log(`Total Sets: ${totalSets}`);
    console.log(`Total Questions: ${totalQuestions}`);
    console.log(`Saved output to: ${outputPath}`);
    console.log('==================================================\n');

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Failed to download V2 question sets:', error);
    await mongoose.disconnect();
    process.exit(1);
});
