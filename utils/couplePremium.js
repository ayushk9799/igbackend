import {
    buildLegacyPremiumFields,
    getCoupleSubscriptionAccess,
    getOwnerPremiumStatus,
    serializeSubscription,
} from '../services/subscriptionService.js';

/**
 * Legacy-compatible date helper. New code should use getOwnerPremiumStatus.
 */
export function isActivePremium(user) {
    return !!(user?.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date());
}

/**
 * Resolve premium for the user or their currently linked partner. A verified
 * Subscription record wins; old User premium dates remain a migration fallback.
 */
export async function getCouplePremiumStatus(user) {
    const access = await getCoupleSubscriptionAccess(user);
    if (!access) {
        return {
            isPremium: false,
            premiumExpiresAt: null,
            premiumPlan: null,
            premiumWillRenew: null,
            premiumCancelledAt: null,
            premiumSource: null,
        };
    }

    return {
        ...buildLegacyPremiumFields(access),
        subscription: access.subscription,
        ownSubscription: access.ownSubscription,
        partnerSubscription: access.partnerSubscription,
        usedLegacyFallback: access.usedLegacyFallback,
    };
}

/** Resolve only subscriptions owned by this user, without partner sharing. */
export async function getDirectPremiumStatus(user) {
    const status = await getOwnerPremiumStatus(user);
    const subscription = serializeSubscription(status.subscription, 'self');
    return {
        isPremium: status.hasPremiumAccess,
        premiumExpiresAt: subscription?.expiresAt || null,
        premiumPlan: subscription?.productId || null,
        premiumWillRenew: subscription?.willRenew ?? null,
        premiumCancelledAt: subscription?.cancelledAt || null,
        subscriptionStatus: subscription?.status || null,
        subscriptionBillingIssueAt: subscription?.billingIssueAt || null,
        usedLegacyFallback: status.usedLegacyFallback,
    };
}
