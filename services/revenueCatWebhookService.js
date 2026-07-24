import Subscription from '../models/Subscription.js';
import SubscriptionEvent from '../models/SubscriptionEvent.js';
import User from '../models/User.js';
import {
    getPremiumEntitlementId,
    normalizeEnvironment,
    normalizeRevenueCatId,
    syncLegacyUserSnapshot,
} from './subscriptionService.js';
import { refreshUserSubscriptionFromRevenueCat } from './revenueCatService.js';
import { notifyCoupleSubscriptionChanged } from './subscriptionNotificationService.js';

const GRANT_EVENTS = new Set([
    'INITIAL_PURCHASE',
    'RENEWAL',
    'UNCANCELLATION',
    'NON_RENEWING_PURCHASE',
    'SUBSCRIPTION_EXTENDED',
    'PRODUCT_CHANGE',
    'TEMPORARY_ENTITLEMENT_GRANT',
]);
const STATE_EVENTS = new Set([
    ...GRANT_EVENTS,
    'CANCELLATION',
    'BILLING_ISSUE',
    'SUBSCRIPTION_PAUSED',
    'EXPIRATION',
]);

const parseDateFromMs = (value) => {
    if (value === null || value === undefined) return null;
    const date = new Date(Number(value));
    return Number.isNaN(date.getTime()) ? null : date;
};

const sanitizePayload = (event) => ({
    id: event.id,
    type: event.type,
    app_user_id: event.app_user_id,
    aliases: Array.isArray(event.aliases) ? event.aliases : [],
    product_id: event.product_id,
    entitlement_ids: Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [],
    original_transaction_id: event.original_transaction_id,
    transaction_id: event.transaction_id,
    event_timestamp_ms: event.event_timestamp_ms,
    purchased_at_ms: event.purchased_at_ms,
    expiration_at_ms: event.expiration_at_ms,
    grace_period_expiration_at_ms: event.grace_period_expiration_at_ms,
    cancellation_reason: event.cancel_reason || event.cancellation_reason,
    environment: event.environment,
    store: event.store,
    period_type: event.period_type,
    transferred_from: Array.isArray(event.transferred_from) ? event.transferred_from : [],
    transferred_to: Array.isArray(event.transferred_to) ? event.transferred_to : [],
});

const findUserForEvent = async (event) => {
    const candidates = [event.app_user_id, ...(event.aliases || [])]
        .map(normalizeRevenueCatId)
        .filter(Boolean);

    if (candidates.length === 0) return null;
    return User.findOne({ email: { $in: candidates } }).collation({ locale: 'en', strength: 2 });
};

const determineState = (event, existing, eventAt) => {
    const type = event.type;
    const normalExpiration = parseDateFromMs(event.expiration_at_ms);
    const graceExpiration = parseDateFromMs(event.grace_period_expiration_at_ms);
    const incomingExpiration = graceExpiration && (!normalExpiration || graceExpiration > normalExpiration)
        ? graceExpiration
        : normalExpiration;
    const existingExpiration = existing?.expiresAt ? new Date(existing.expiresAt) : null;
    const incomingIsOlder = incomingExpiration
        && existingExpiration
        && incomingExpiration < existingExpiration;

    // An API verification may already contain the next renewal period before
    // an older webhook arrives. Never let that older event shorten/revoke it.
    if (incomingIsOlder && !GRANT_EVENTS.has(type)) return null;

    const expiresAt = GRANT_EVENTS.has(type)
        && incomingExpiration
        && existingExpiration
        && existingExpiration > incomingExpiration
        ? existingExpiration
        : incomingExpiration || existingExpiration || null;
    const expiresInFuture = !expiresAt || expiresAt > eventAt;

    if (type === 'EXPIRATION') {
        return { status: 'expired', givesAccess: false, willRenew: false, expiresAt };
    }

    if (type === 'CANCELLATION') {
        return {
            status: expiresInFuture ? 'cancelled' : 'expired',
            givesAccess: expiresInFuture,
            willRenew: false,
            expiresAt,
            cancelledAt: eventAt,
        };
    }

    if (type === 'BILLING_ISSUE') {
        return {
            status: expiresInFuture ? 'billing_issue' : 'expired',
            givesAccess: expiresInFuture,
            willRenew: existing?.willRenew ?? true,
            expiresAt,
            billingIssueAt: eventAt,
        };
    }

    if (type === 'SUBSCRIPTION_PAUSED') {
        return {
            status: expiresInFuture ? 'paused' : 'expired',
            givesAccess: expiresInFuture,
            willRenew: false,
            expiresAt,
        };
    }

    if (GRANT_EVENTS.has(type)) {
        return {
            status: 'active',
            givesAccess: true,
            willRenew: type !== 'NON_RENEWING_PURCHASE',
            expiresAt,
            cancelledAt: null,
            billingIssueAt: null,
        };
    }

    return null;
};

const getOrCreateEventRecord = async (event, eventAt, environment) => {
    try {
        return await SubscriptionEvent.create({
            revenueCatEventId: event.id,
            revenueCatAppUserId: normalizeRevenueCatId(event.app_user_id),
            type: event.type,
            eventTimestamp: eventAt,
            productId: event.product_id || null,
            entitlementIds: Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [],
            expirationAt: parseDateFromMs(event.expiration_at_ms),
            cancellationReason: event.cancel_reason || event.cancellation_reason || null,
            environment,
            payload: sanitizePayload(event),
        });
    } catch (error) {
        if (error?.code !== 11000) throw error;
        return SubscriptionEvent.findOne({ revenueCatEventId: event.id });
    }
};

export async function processRevenueCatWebhook(event) {
    if (!event?.id || !event?.type || !event?.event_timestamp_ms) {
        const error = new Error('Webhook event requires id, type, and event_timestamp_ms');
        error.status = 400;
        throw error;
    }

    const eventAt = parseDateFromMs(event.event_timestamp_ms);
    if (!eventAt) {
        const error = new Error('Invalid event_timestamp_ms');
        error.status = 400;
        throw error;
    }

    const environment = normalizeEnvironment(event.environment);
    const eventRecord = await getOrCreateEventRecord(event, eventAt, environment);
    if (eventRecord.processed) return { duplicate: true, ignored: !!eventRecord.ignoredReason };

    try {
        if (
            process.env.NODE_ENV === 'production'
            && environment === 'sandbox'
            && process.env.REVENUECAT_ALLOW_SANDBOX !== 'true'
        ) {
            eventRecord.processed = true;
            eventRecord.ignoredReason = 'sandbox_event_disabled';
            eventRecord.processedAt = new Date();
            await eventRecord.save();
            return { ignored: true };
        }

        const configuredEntitlement = getPremiumEntitlementId();
        const eventEntitlements = Array.isArray(event.entitlement_ids) ? event.entitlement_ids : [];
        if (configuredEntitlement && eventEntitlements.length > 0 && !eventEntitlements.includes(configuredEntitlement)) {
            eventRecord.processed = true;
            eventRecord.ignoredReason = 'unrelated_entitlement';
            eventRecord.processedAt = new Date();
            await eventRecord.save();
            return { ignored: true };
        }

        if (event.type === 'TRANSFER') {
            const transferredIds = [...(event.transferred_from || []), ...(event.transferred_to || [])]
                .map(normalizeRevenueCatId)
                .filter(Boolean);
            const refreshedUsers = [];

            for (const appUserId of new Set(transferredIds)) {
                const transferUser = await User.findOne({ email: appUserId })
                    .collation({ locale: 'en', strength: 2 });
                if (!transferUser) continue;
                await refreshUserSubscriptionFromRevenueCat(transferUser, { confirmMissing: true });
                notifyCoupleSubscriptionChanged(transferUser, 'revenuecat_transfer');
                refreshedUsers.push(transferUser._id);
            }

            eventRecord.processed = true;
            eventRecord.ignoredReason = refreshedUsers.length === 0 ? 'transfer_users_not_found' : null;
            eventRecord.processedAt = new Date();
            await eventRecord.save();
            return { processed: refreshedUsers.length > 0, ignored: refreshedUsers.length === 0 };
        }

        if (!STATE_EVENTS.has(event.type)) {
            eventRecord.processed = true;
            eventRecord.ignoredReason = 'event_does_not_change_access';
            eventRecord.processedAt = new Date();
            await eventRecord.save();
            return { ignored: true };
        }

        const user = await findUserForEvent(event);
        if (!user) {
            throw new Error('RevenueCat customer does not match an application user');
        }

        eventRecord.ownerUserId = user._id;
        const entitlementId = configuredEntitlement || eventEntitlements[0] || 'premium';
        let subscription = await Subscription.findOne({
            ownerUserId: user._id,
            entitlementId,
            environment,
        });

        if (!subscription) {
            try {
                subscription = await Subscription.create({
                    ownerUserId: user._id,
                    revenueCatAppUserId: normalizeRevenueCatId(user.email),
                    entitlementId,
                    environment,
                    source: 'webhook',
                });
            } catch (error) {
                if (error?.code !== 11000) throw error;
                subscription = await Subscription.findOne({ ownerUserId: user._id, entitlementId, environment });
            }
        }

        const state = determineState(event, subscription, eventAt);
        if (!state) {
            eventRecord.processed = true;
            eventRecord.ignoredReason = 'event_does_not_change_access';
            eventRecord.processedAt = new Date();
            await eventRecord.save();
            return { ignored: true };
        }

        const update = await Subscription.updateOne(
            {
                _id: subscription._id,
                $or: [
                    { lastEventAt: null },
                    { lastEventAt: { $lte: eventAt } },
                ],
            },
            {
                $set: {
                    ...state,
                    revenueCatAppUserId: normalizeRevenueCatId(user.email),
                    productId: event.product_id || subscription.productId || null,
                    originalTransactionId: event.original_transaction_id || subscription.originalTransactionId || null,
                    purchasedAt: parseDateFromMs(event.purchased_at_ms) || subscription.purchasedAt || null,
                    source: 'webhook',
                    verificationStatus: 'verified',
                    lastEventId: event.id,
                    lastEventAt: eventAt,
                    lastVerifiedAt: new Date(),
                },
            },
        );

        if (update.modifiedCount > 0) {
            subscription = await Subscription.findById(subscription._id);
            await Subscription.updateMany(
                { ownerUserId: user._id, source: 'legacy', _id: { $ne: subscription._id } },
                {
                    $set: {
                        status: 'expired',
                        givesAccess: false,
                        verificationStatus: 'verified',
                        lastVerifiedAt: new Date(),
                    },
                },
            );
            await syncLegacyUserSnapshot(user, subscription);
            notifyCoupleSubscriptionChanged(user, 'revenuecat_webhook', {
                eventType: event.type,
            });
        } else {
            eventRecord.ignoredReason = 'older_than_current_state';
        }

        eventRecord.subscriptionId = subscription._id;
        eventRecord.processed = true;
        eventRecord.processedAt = new Date();
        eventRecord.processingError = null;
        await eventRecord.save();

        return { processed: update.modifiedCount > 0, ignored: update.modifiedCount === 0 };
    } catch (error) {
        eventRecord.processingError = String(error?.message || error).slice(0, 1000);
        await eventRecord.save().catch(() => {});
        throw error;
    }
}

export const __testables = { determineState, sanitizePayload };
