import Subscription from '../models/Subscription.js';
import User from '../models/User.js';

const ACTIVE_STATUSES = new Set(['active', 'cancelled', 'billing_issue', 'paused']);
const DEFAULT_RENEWAL_HANDOFF_MS = 10 * 60 * 1000;

const getRenewalHandoffMs = () => {
    const configured = Number(process.env.SUBSCRIPTION_RENEWAL_HANDOFF_MS);
    return Number.isFinite(configured) && configured >= 0
        ? configured
        : DEFAULT_RENEWAL_HANDOFF_MS;
};

export const normalizeRevenueCatId = (value) => String(value || '').trim().toLowerCase();

export const getPremiumEntitlementId = () => (
    String(process.env.REVENUECAT_PREMIUM_ENTITLEMENT_ID || '').trim()
);

export const normalizeEnvironment = (value) => {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === 'production' || normalized === 'sandbox') return normalized;
    return 'unknown';
};

export const subscriptionGivesAccess = (subscription, now = new Date()) => {
    if (!subscription?.givesAccess || !ACTIVE_STATUSES.has(subscription.status)) return false;
    if (!subscription.expiresAt) return true;

    const expiresAt = new Date(subscription.expiresAt);
    if (expiresAt > now) return true;

    // Auto-renewing subscriptions can briefly pass their old expiry while the
    // store and RevenueCat deliver the renewal. Keep access during this small
    // handoff window; an EXPIRATION webhook still revokes it immediately.
    return subscription.status === 'active'
        && subscription.willRenew === true
        && now.getTime() - expiresAt.getTime() <= getRenewalHandoffMs();
};

const environmentQuery = () => {
    if (process.env.NODE_ENV === 'production' && process.env.REVENUECAT_ALLOW_SANDBOX !== 'true') {
        return { environment: { $ne: 'sandbox' } };
    }
    return {};
};

const newestAccessFirst = (items) => [...items].sort((a, b) => {
    const aActive = subscriptionGivesAccess(a) ? 1 : 0;
    const bActive = subscriptionGivesAccess(b) ? 1 : 0;
    if (aActive !== bActive) return bActive - aActive;
    return new Date(b.expiresAt || 8640000000000000) - new Date(a.expiresAt || 8640000000000000);
});

export const serializeSubscription = (subscription, source = 'self') => {
    if (!subscription) return null;
    return {
        id: subscription._id,
        ownerUserId: subscription.ownerUserId,
        entitlementId: subscription.entitlementId,
        productId: subscription.productId || null,
        status: subscription.status,
        givesAccess: subscriptionGivesAccess(subscription),
        willRenew: subscription.willRenew ?? null,
        expiresAt: subscription.expiresAt || null,
        cancelledAt: subscription.cancelledAt || null,
        billingIssueAt: subscription.billingIssueAt || null,
        environment: subscription.environment,
        verificationStatus: subscription.verificationStatus,
        source,
    };
};

export async function getOwnerPremiumStatus(user) {
    if (!user) return { hasPremiumAccess: false, subscription: null, usedLegacyFallback: false };

    const subscriptions = await Subscription.find({
        ownerUserId: user._id,
        ...environmentQuery(),
    }).lean();

    if (subscriptions.length > 0) {
        const subscription = newestAccessFirst(subscriptions)[0];
        return {
            hasPremiumAccess: subscriptionGivesAccess(subscription),
            subscription,
            usedLegacyFallback: false,
        };
    }

    const hasCanonicalRecordInAnotherEnvironment = await Subscription.exists({ ownerUserId: user._id });
    if (hasCanonicalRecordInAnotherEnvironment) {
        return { hasPremiumAccess: false, subscription: null, usedLegacyFallback: false };
    }

    // Backward compatibility: old subscribers retain access until their stored
    // date. Once a Subscription record exists, verified state takes precedence.
    const legacyActive = !!(
        user.premiumExpiresAt
        && new Date(user.premiumExpiresAt) > new Date()
    );

    if (!legacyActive) {
        return { hasPremiumAccess: false, subscription: null, usedLegacyFallback: false };
    }

    return {
        hasPremiumAccess: true,
        subscription: {
            _id: null,
            ownerUserId: user._id,
            entitlementId: getPremiumEntitlementId() || 'legacy-premium',
            productId: user.premiumPlan || null,
            status: user.premiumWillRenew === false ? 'cancelled' : 'active',
            givesAccess: true,
            willRenew: user.premiumWillRenew ?? null,
            expiresAt: user.premiumExpiresAt,
            cancelledAt: user.premiumCancelledAt || null,
            billingIssueAt: null,
            environment: 'unknown',
            verificationStatus: 'pending',
        },
        usedLegacyFallback: true,
    };
}

export async function getCoupleSubscriptionAccess(userOrId) {
    const user = typeof userOrId === 'object' && userOrId?._id
        ? userOrId
        : await User.findById(userOrId);

    if (!user) return null;

    const own = await getOwnerPremiumStatus(user);
    let partner = null;
    let partnerUser = null;

    if (user.partnerId) {
        partnerUser = await User.findById(user.partnerId?._id || user.partnerId);
        if (partnerUser) partner = await getOwnerPremiumStatus(partnerUser);
    }

    const effective = own.hasPremiumAccess
        ? { ...own, source: 'self', ownerUser: user }
        : partner?.hasPremiumAccess
            ? { ...partner, source: 'partner', ownerUser: partnerUser }
            : null;

    return {
        hasPremiumAccess: !!effective,
        premiumSource: effective?.source || null,
        premiumOwnerUserId: effective?.ownerUser?._id || null,
        subscription: effective ? serializeSubscription(effective.subscription, effective.source) : null,
        ownSubscription: serializeSubscription(own.subscription, 'self'),
        partnerSubscription: partner ? serializeSubscription(partner.subscription, 'partner') : null,
        usedLegacyFallback: !!effective?.usedLegacyFallback,
    };
}

export async function syncLegacyUserSnapshot(user, subscription) {
    if (!user || !subscription) return;

    const active = subscriptionGivesAccess(subscription);
    user.isPremium = active;
    user.premiumExpiresAt = active ? (subscription.expiresAt || null) : null;
    user.premiumPlan = active ? (subscription.productId || null) : null;
    user.premiumWillRenew = active ? (subscription.willRenew ?? null) : false;
    user.premiumCancelledAt = subscription.cancelledAt || null;
    await user.save();
}

export const buildLegacyPremiumFields = (access) => ({
    isPremium: access?.hasPremiumAccess === true,
    premiumExpiresAt: access?.subscription?.expiresAt || null,
    premiumPlan: access?.subscription?.productId || null,
    premiumWillRenew: access?.subscription?.willRenew ?? null,
    premiumCancelledAt: access?.subscription?.cancelledAt || null,
    premiumSource: access?.premiumSource || null,
    premiumOwnerUserId: access?.premiumOwnerUserId || null,
    subscriptionStatus: access?.subscription?.status || null,
    subscriptionBillingIssueAt: access?.subscription?.billingIssueAt || null,
});
