import CallUsageSession from '../models/CallUsageSession.js';
import { getCoupleSubscriptionAccess } from './subscriptionService.js';

export const eligibleCallClient = (client, env = process.env) => {
    if (!['ios', 'android'].includes(client?.platform) || client.callUsageVersion !== 1) return false;
    const prefix = `CALLS_PAYWALL_${client.platform.toUpperCase()}`;
    const minimum = String(env[`${prefix}_MIN_BUILD`] || '').trim();
    return env[`${prefix}_ENABLED`] === 'true' && /^\d+$/.test(minimum)
        && Number(minimum) > 0 && /^\d+$/.test(String(client.buildNumber || ''))
        && Number(client.buildNumber) >= Number(minimum);
};

export const createCallUsageService = ({
    model = CallUsageSession, access = getCoupleSubscriptionAccess,
    env = process.env, now = Date.now, schedule = setTimeout, cancel = clearTimeout,
} = {}) => {
    const policy = (enabled, isPremium, deadline) => ({
        version: 1, enabled, isPremium, serverNow: new Date(now()).toISOString(),
        ...(deadline != null ? { expiresAt: new Date(deadline).toISOString() } : {}),
        warningSeconds: 30,
    });
    const finish = async (call, reason) => {
        if (call.usageTimer) cancel(call.usageTimer);
        call.usageTimer = null;
        call.usageFinished = true;
        if (call.usageStartPromise) await call.usageStartPromise;
        if (!call.usageRecorded) return;
        await model.updateOne({ callId: call.callId, endedAt: null }, {
            $set: { endedAt: new Date(Math.min(now(), call.usageDeadline ?? now())), endReason: reason },
        });
    };
    const check = async (call) => {
        const clients = [call.clients?.[call.callerId], call.clients?.[call.calleeId]];
        const enabled = clients.every(client => eligibleCallClient(client, env));
        const tracking = env.CALLS_USAGE_TRACKING_ENABLED === 'true';
        if (!enabled && !tracking) return { enabled: false, tracking: false };
        const seconds = Number(env.CALLS_FREE_SECONDS ?? 300);
        const period = env.CALLS_FREE_ALLOWANCE_PERIOD || 'lifetime';
        if (!['lifetime', 'daily', 'monthly'].includes(period) || !Number.isFinite(seconds) || seconds < 0) {
            throw new Error('Invalid call allowance configuration');
        }
        const periodKey = period === 'lifetime' ? period
            : `${period}:${new Date(now()).toISOString().slice(0, period === 'daily' ? 10 : 7)}`;
        const premium = enabled && Boolean((await access(call.callerId))?.hasPremiumAccess);
        const charged = enabled && !premium;
        let remainingMs = seconds * 1000;
        if (charged) {
            const rows = await model.aggregate([
                { $match: { coupleId: call.coupleId, periodKey, charged: true, callId: { $ne: call.callId } } },
                { $project: { duration: { $max: [0, { $subtract: [
                    { $min: [{ $ifNull: ['$endedAt', new Date(now())] }, { $ifNull: ['$deadlineAt', new Date(now())] }, new Date(now())] }, '$startedAt',
                ] }] } } },
                { $group: { _id: null, usedMs: { $sum: '$duration' } } },
            ]);
            remainingMs = Math.max(0, remainingMs - (rows[0]?.usedMs || 0));
        }
        return { enabled, tracking, premium, charged, remainingMs, periodKey,
            callLimit: policy(enabled, premium, charged ? now() + remainingMs : null) };
    };
    const begin = async (call, emit, expire) => {
        const { enabled, tracking, premium, charged, remainingMs, periodKey } = await check(call);
        if (!enabled && !tracking) return;
        const deadline = charged ? now() + remainingMs : null;
        await model.updateOne({ callId: call.callId }, { $setOnInsert: {
            callId: call.callId, coupleId: call.coupleId, participantIds: [call.callerId, call.calleeId],
            periodKey, charged, startedAt: new Date(now()), ...(charged ? { deadlineAt: new Date(deadline) } : {}),
        } }, { upsert: true });
        call.usageRecorded = true;
        call.usageDeadline = deadline;
        if (call.usageFinished) return;
        if (!enabled) return;
        emit('call:usage-policy', { callId: call.callId, callLimit: policy(enabled, premium, deadline) });
        if (!charged) return;
        const expireCall = async () => {
            if (call.usageFinished) return;
            // A verified purchase during this call removes the deadline.
            if ((await access(call.callerId))?.hasPremiumAccess) {
                await finish(call, 'premium_activated');
                emit('call:usage-policy', { callId: call.callId, callLimit: policy(false, true) });
                return;
            }
            await finish(call, 'free_limit_reached');
            emit('call:limit-reached', {
                callId: call.callId, code: 'CALL_FREE_LIMIT_REACHED', callLimit: policy(true, false, deadline),
            });
            expire();
        };
        call.usageTimer = schedule(() => {
            expireCall().catch(error => {
                console.error('Call allowance expiry failed:', error.message);
                // Retain enforcement if entitlement/database refresh temporarily fails.
                if (!call.usageFinished) call.usageTimer = schedule(() => expireCall().catch(console.error), 1000);
            });
        }, Math.min(remainingMs, 2_147_483_647));
        call.usageTimer?.unref?.();
    };
    return { begin, finish, check };
};

export default createCallUsageService();
