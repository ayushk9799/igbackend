import Subscription from '../models/Subscription.js';
import User from '../models/User.js';
import {
    getPremiumEntitlementId,
    normalizeEnvironment,
    normalizeRevenueCatId,
    subscriptionGivesAccess,
    syncLegacyUserSnapshot,
} from './subscriptionService.js';

const parseDate = (value) => {
    if (!value) return null;
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
};

const pickEntitlement = (entitlements = {}) => {
    const configuredId = getPremiumEntitlementId();
    if (configuredId) {
        return entitlements[configuredId]
            ? [configuredId, entitlements[configuredId]]
            : [configuredId, null];
    }

    // Compatibility during rollout. Configure the entitlement ID in production
    // to ensure unrelated future entitlements never unlock premium.
    return Object.entries(entitlements)[0] || [null, null];
};

export async function fetchRevenueCatSubscriber(appUserId) {
    const apiKey = process.env.REVENUECAT_V1_SECRET_API_KEY
        || process.env.REVENUECAT_SECRET_API_KEY;
    if (!apiKey) {
        const error = new Error('REVENUECAT_V1_SECRET_API_KEY is not configured');
        error.code = 'REVENUECAT_NOT_CONFIGURED';
        throw error;
    }

    const response = await fetch(
        `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(appUserId)}`,
        { headers: { Authorization: `Bearer ${apiKey}`, Accept: 'application/json' } },
    );

    if (!response.ok) {
        const error = new Error(`RevenueCat verification failed with HTTP ${response.status}`);
        error.status = response.status;
        throw error;
    }

    return response.json();
}

export async function refreshUserSubscriptionFromRevenueCat(user, { confirmMissing = false } = {}) {
    const appUserId = normalizeRevenueCatId(user.email);
    const customer = await fetchRevenueCatSubscriber(appUserId);
    const subscriber = customer?.subscriber || {};
    const [entitlementId, entitlement] = pickEntitlement(subscriber.entitlements || {});
    const now = new Date();

    if (!entitlementId || !entitlement) {
        const existing = await Subscription.find({ ownerUserId: user._id });
        for (const subscription of existing) {
            const expirationPassed = !!subscription.expiresAt && subscription.expiresAt <= now;
            const protectLegacyMigration = subscription.source === 'legacy' && !expirationPassed;
            const protectRenewalHandoff = expirationPassed
                && subscriptionGivesAccess(subscription, now);
            const firstMissingCheck = !confirmMissing
                && (subscription.consecutiveMissingCount || 0) < 1
                && !expirationPassed;

            subscription.consecutiveMissingCount = (subscription.consecutiveMissingCount || 0) + 1;
            subscription.lastMissingAt = now;
            subscription.lastVerifiedAt = now;
            subscription.lastApiVerifiedAt = now;
            subscription.verificationStatus = protectLegacyMigration || protectRenewalHandoff || firstMissingCheck
                ? 'failed'
                : 'verified';

            if (!protectLegacyMigration && !protectRenewalHandoff && !firstMissingCheck) {
                subscription.status = 'expired';
                subscription.givesAccess = false;
                subscription.willRenew = false;
                subscription.source = 'api';
            }

            await subscription.save();
            if (!protectLegacyMigration && !protectRenewalHandoff && !firstMissingCheck) {
                await syncLegacyUserSnapshot(user, subscription);
            }
        }
        return existing[0] || null;
    }

    const productId = entitlement.product_identifier || null;
    const product = productId ? subscriber.subscriptions?.[productId] : null;
    const expiresAt = parseDate(entitlement.expires_date || product?.expires_date);
    const cancelledAt = parseDate(product?.unsubscribe_detected_at);
    const billingIssueAt = parseDate(product?.billing_issues_detected_at);
    const isSandbox = product?.is_sandbox ?? entitlement?.is_sandbox;
    const environment = normalizeEnvironment(
        typeof isSandbox === 'boolean'
            ? (isSandbox ? 'sandbox' : 'production')
            : 'unknown',
    );

    if (
        process.env.NODE_ENV === 'production'
        && environment === 'sandbox'
        && process.env.REVENUECAT_ALLOW_SANDBOX !== 'true'
    ) {
        return null;
    }

    const existingSubscription = await Subscription.findOne({
        ownerUserId: user._id,
        entitlementId,
        environment,
    });
    const isRenewalHandoff = !!(
        expiresAt
        && expiresAt <= now
        && !cancelledAt
        && existingSubscription
        && subscriptionGivesAccess(existingSubscription, now)
    );
    const givesAccess = isRenewalHandoff || !expiresAt || expiresAt > now;
    const status = givesAccess
        ? (billingIssueAt ? 'billing_issue' : cancelledAt ? 'cancelled' : 'active')
        : 'expired';

    const subscription = await Subscription.findOneAndUpdate(
        { ownerUserId: user._id, entitlementId, environment },
        {
            $set: {
                revenueCatAppUserId: appUserId,
                productId,
                status,
                givesAccess,
                willRenew: givesAccess ? !cancelledAt : false,
                purchasedAt: parseDate(product?.purchase_date),
                expiresAt,
                cancelledAt,
                billingIssueAt,
                source: 'api',
                verificationStatus: 'verified',
                lastVerifiedAt: now,
                lastApiVerifiedAt: now,
                lastMissingAt: null,
                consecutiveMissingCount: 0,
            },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    await Subscription.updateMany(
        { ownerUserId: user._id, source: 'legacy', _id: { $ne: subscription._id } },
        {
            $set: {
                status: 'expired',
                givesAccess: false,
                verificationStatus: 'verified',
                lastVerifiedAt: now,
                lastApiVerifiedAt: now,
            },
        },
    );

    await syncLegacyUserSnapshot(user, subscription);
    return subscription;
}
