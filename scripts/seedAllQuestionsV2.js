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

const run = async () => {
    await mongoose.connect(MONGODB_URI);

    // Read the JSON data file
    const dataPath = path.join(__dirname, 'v2_questions_data.json');
    const rawData = fs.readFileSync(dataPath, 'utf8');
    const topicsData = JSON.parse(rawData);

    let totalSetsSeeded = 0;

    for (const [topicId, sets] of Object.entries(topicsData)) {
        const Model = TOPIC_MODELS[topicId];
        if (!Model) {
            console.warn(`No model found for topic: ${topicId}. Skipping.`);
            continue;
        }

        for (const set of sets) {
            await Model.findOneAndUpdate(
                { setId: set.setId },
                set,
                { upsert: true, new: true, runValidators: true }
            );
            totalSetsSeeded++;
        }
    }

    await mongoose.disconnect();
};

run().catch(async (error) => {
    console.error('Failed to seed V2 question sets:', error);
    await mongoose.disconnect();
    process.exit(1);
});
