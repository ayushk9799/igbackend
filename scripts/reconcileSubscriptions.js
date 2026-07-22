import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { refreshUserSubscriptionFromRevenueCat } from '../services/revenueCatService.js';

dotenv.config();

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required');
if (!process.env.REVENUECAT_V1_SECRET_API_KEY && !process.env.REVENUECAT_SECRET_API_KEY) {
    throw new Error('REVENUECAT_V1_SECRET_API_KEY is required');
}

const limitArg = process.argv.find((arg) => arg.startsWith('--limit='));
const limit = Math.max(1, Number.parseInt(limitArg?.split('=')[1] || '200', 10));

await mongoose.connect(mongoUri);

try {
    const ownerIds = await Subscription.distinct('ownerUserId', {
        status: { $in: ['active', 'cancelled', 'billing_issue', 'paused', 'unknown'] },
    });
    const users = await User.find({ _id: { $in: ownerIds } }).limit(limit);
    const result = { checked: 0, succeeded: 0, failed: 0, errors: [] };

    // Deliberately sequential to stay well below RevenueCat API rate limits.
    for (const user of users) {
        result.checked += 1;
        try {
            await refreshUserSubscriptionFromRevenueCat(user);
            result.succeeded += 1;
        } catch (error) {
            result.failed += 1;
            result.errors.push({ userId: user._id, message: error.message });
        }
    }

    console.log(JSON.stringify(result, null, 2));
    if (result.failed > 0) process.exitCode = 1;
} finally {
    await mongoose.disconnect();
}
