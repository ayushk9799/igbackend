import test from 'node:test';
import assert from 'node:assert/strict';
import { eligibleCallClient, createCallUsageService } from '../services/callUsageService.js';

const config = () => ({ CALLS_USAGE_TRACKING_ENABLED: 'true', CALLS_FREE_SECONDS: '3', CALLS_FREE_ALLOWANCE_PERIOD: 'lifetime', CALLS_PAYWALL_ANDROID_ENABLED: 'true', CALLS_PAYWALL_ANDROID_MIN_BUILD: '13', CALLS_PAYWALL_IOS_ENABLED: 'true', CALLS_PAYWALL_IOS_MIN_BUILD: '10' });
const modern = { platform: 'android', buildNumber: '13', callUsageVersion: 1 };
const makeCall = () => ({ callId: 'call', coupleId: 'couple', callerId: 'a', calleeId: 'b', clients: { a: modern, b: modern } });
const fixture = (options = {}) => {
    let clock = 100000;
    const timers = [];
    const writes = [];
    const events = [];
    const model = { aggregate: async () => [{ usedMs: options.usedMs || 0 }], updateOne: async (...args) => { writes.push(args); } };
    const service = createCallUsageService({ model, access: async () => ({ hasPremiumAccess: options.premium || false }), env: config(), now: () => clock, schedule: (callback, delay) => { const timer = { callback, delay }; timers.push(timer); return timer; }, cancel: timer => { timer.cancelled = true; } });
    return { service, timers, writes, events, emit: (event, payload) => events.push({ event, payload }), advance: ms => { clock += ms; } };
};

test('platform flags, blank minimum, old build and missing capability preserve legacy calling', () => {
    const env = config();
    assert.equal(eligibleCallClient(modern, env), true);
    assert.equal(eligibleCallClient({ ...modern, buildNumber: '12' }, env), false);
    assert.equal(eligibleCallClient({ ...modern, callUsageVersion: undefined }, env), false);
    assert.equal(eligibleCallClient(modern, { ...env, CALLS_PAYWALL_ANDROID_MIN_BUILD: '' }), false);
    assert.equal(eligibleCallClient(modern, { ...env, CALLS_PAYWALL_ANDROID_ENABLED: 'false' }), false);
});

test('three-second policy triggers Premium at server deadline and writes one couple session', async () => {
    const f = fixture(); const call = makeCall(); let expired = false;
    await f.service.begin(call, f.emit, () => { expired = true; });
    assert.equal(f.timers[0].delay, 3000);
    assert.equal(Date.parse(f.events[0].payload.callLimit.expiresAt) - Date.parse(f.events[0].payload.callLimit.serverNow), 3000);
    assert.deepEqual(f.writes[0][1].$setOnInsert.participantIds, ['a', 'b']);
    f.advance(3000);
    await f.timers[0].callback();
    // The scheduled callback wraps the async expiry operation.
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(expired, true);
    assert.equal(f.events[1].event, 'call:limit-reached');
    assert.equal(f.events[1].payload.code, 'CALL_FREE_LIMIT_REACHED');
    assert.equal(f.writes[1][1].$set.endReason, 'free_limit_reached');
});

test('remaining lifetime allowance is shared across calls, not reset per call', async () => {
    const f = fixture({ usedMs: 2000 });
    await f.service.begin(makeCall(), f.emit, () => {});
    assert.equal(f.timers[0].delay, 1000);
});

test('Premium and mixed old/new pairs have no cutoff', async () => {
    const premium = fixture({ premium: true });
    await premium.service.begin(makeCall(), premium.emit, () => {});
    assert.equal(premium.timers.length, 0);
    assert.equal(premium.events[0].payload.callLimit.isPremium, true);
    const mixed = fixture(); const call = makeCall(); call.clients.b = {};
    await mixed.service.begin(call, mixed.emit, () => {});
    assert.equal(mixed.timers.length, 0);
    assert.equal(mixed.events.length, 0);
    assert.equal(mixed.writes[0][1].$setOnInsert.charged, false);
});

test('normal hangup cancels the deadline and persists actual end time', async () => {
    const f = fixture(); const call = makeCall();
    await f.service.begin(call, f.emit, () => {});
    f.advance(1000); await f.service.finish(call, 'hangup');
    assert.equal(f.timers[0].cancelled, true);
    assert.equal(f.writes[1][1].$set.endedAt.getTime(), 101000);
});
