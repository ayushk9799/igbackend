import dotenv from 'dotenv';
import mongoose from 'mongoose';
import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import { getPremiumEntitlementId, normalizeRevenueCatId } from '../services/subscriptionService.js';

dotenv.config();

const apply = process.argv.includes('--apply');
const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) throw new Error('MONGODB_URI is required');

await mongoose.connect(mongoUri);

try {
    const now = new Date();
    const users = await User.find({ premiumExpiresAt: { $gt: now } });
    let created = 0;
    let alreadyPresent = 0;

    for (const user of users) {
        const existing = await Subscription.exists({ ownerUserId: user._id });
        if (existing) {
            alreadyPresent += 1;
            continue;
        }

        if (apply) {
            await Subscription.create({
                ownerUserId: user._id,
                revenueCatAppUserId: normalizeRevenueCatId(user.email),
                entitlementId: getPremiumEntitlementId() || 'legacy-premium',
                productId: user.premiumPlan || null,
                status: user.premiumWillRenew === false ? 'cancelled' : 'active',
                givesAccess: true,
                willRenew: user.premiumWillRenew ?? null,
                expiresAt: user.premiumExpiresAt,
                cancelledAt: user.premiumCancelledAt || null,
                environment: 'unknown',
                source: 'legacy',
                verificationStatus: 'pending',
            });
        }
        created += 1;
    }

    console.log(JSON.stringify({
        mode: apply ? 'apply' : 'dry-run',
        eligibleLegacyUsers: users.length,
        wouldCreateOrCreated: created,
        alreadyPresent,
    }, null, 2));
} finally {
    await mongoose.disconnect();
}
