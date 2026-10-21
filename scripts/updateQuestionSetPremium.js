import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

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

const topicModels = {
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

// Input uses the same ordering as the app's set-list endpoint.
export const buildPremiumPlan = (topicId, sets) => {
    const firstActiveSet = sets.find(set => set.isActive === true);
    return sets.map(set => ({
        ...set,
        nextPremium: topicId !== 'relationship' && set.setId !== firstActiveSet?.setId,
    }));
};

const readSets = Model => Model.find({})
    .select('setId title order isActive premium revision updatedAt createdAt')
    .sort({ order: 1, createdAt: 1 })
    .lean();

const run = async () => {
    const apply = process.argv.includes('--apply');
    if (process.argv.slice(2).some(arg => arg !== '--apply')) {
        throw new Error('Use no arguments to preview, or --apply to update.');
    }
    dotenv.config({
        path: fileURLToPath(new URL('../.env', import.meta.url)),
        quiet: true,
    });
    if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is required.');
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 10000 });

    const plans = [];
    for (const [topicId, Model] of Object.entries(topicModels)) {
        const sets = await readSets(Model);
        const plan = buildPremiumPlan(topicId, sets);
        plans.push({ topicId, Model, plan });
        console.log(JSON.stringify({
            topicId,
            freeSets: plan.filter(set => set.isActive && !set.nextPremium)
                .map(set => ({ setId: set.setId, title: set.title })),
            premiumActiveSets: plan.filter(set => set.isActive && set.nextPremium).length,
            changes: plan.filter(set => set.premium !== set.nextPremium).length,
        }));
    }
    if (!apply) {
        console.log('Preview only. No database changes made.');
        return;
    }

    const backupPath = path.join(tmpdir(), `questions-v2-premium-${Date.now()}.json`);
    await writeFile(backupPath, JSON.stringify({
        createdAt: new Date().toISOString(),
        topics: plans.map(({ topicId, plan }) => ({
            topicId,
            sets: plan.map(({ nextPremium, ...set }) => set),
        })),
    }, null, 2), { flag: 'wx', mode: 0o600 });
    console.log(`Previous settings saved to ${backupPath}`);

    let updated = 0;
    for (const { topicId, Model, plan } of plans) {
        for (const set of plan) {
            if (set.premium === set.nextPremium) continue;
            const result = await Model.updateOne({
                _id: set._id,
                premium: set.premium === undefined ? { $exists: false } : set.premium,
            }, { $set: { premium: set.nextPremium } }, { runValidators: true });
            if (result.matchedCount !== 1) {
                throw new Error(`Set changed during update: ${topicId}/${set.setId}`);
            }
            updated += result.modifiedCount;
        }
        const verified = await readSets(Model);
        const expected = buildPremiumPlan(topicId, verified);
        if (expected.some(set => set.premium !== set.nextPremium)) {
            throw new Error(`Premium verification failed for ${topicId}`);
        }
        console.log(`Verified ${topicId}: ${verified.length} sets.`);
    }
    console.log(`Updated ${updated} sets. All topics verified.`);
};

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    try {
        await run();
    } catch (error) {
        // Connection errors may contain database addresses; keep credentials private.
        console.error(error.name?.startsWith('Mongo')
            ? `Database connection or operation failed (${error.name}, ${error.code || 'no code'}).`
            : error.message);
        process.exitCode = 1;
    } finally {
        await mongoose.disconnect();
    }
}
