import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import service, { createCallUsageService } from '../services/callUsageService.js';
import { handleCallStart, handleCallAccept, handleCallConnected } from '../socket/handlers/call.js';

// Exercise the actual signaling handlers and a real three-second deadline without
// sending partner notifications, touching real accounts or creating DB test rows.
test('both connected handlers emit policy then limit and ended at three seconds', async t => {
    const originalFind = User.findById;
    const originalBegin = service.begin;
    const originalFinish = service.finish;
    const originalCheck = service.check;
    const env = { CALLS_USAGE_TRACKING_ENABLED: 'true', CALLS_FREE_SECONDS: '3', CALLS_FREE_ALLOWANCE_PERIOD: 'lifetime', CALLS_PAYWALL_ANDROID_ENABLED: 'true', CALLS_PAYWALL_ANDROID_MIN_BUILD: '13' };
    let usedMs = 0;
    const savedEnv = Object.fromEntries(Object.keys(env).map(key => [key, process.env[key]]));
    Object.assign(process.env, env);
    t.after(() => { for (const [key, value] of Object.entries(savedEnv)) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } });
    const testService = createCallUsageService({ env, model: { aggregate: async () => [{ usedMs }], updateOne: async (filter, update) => { if (update.$set?.endReason === 'free_limit_reached') usedMs = 3000; } }, access: async () => ({ hasPremiumAccess: false }) });
    service.begin = testService.begin; service.finish = testService.finish; service.check = testService.check;
    User.findById = id => ({ select: async () => ({ partnerId: id === 'usage-a' ? 'usage-b' : 'usage-a', name: 'Test' }) });
    t.after(() => { User.findById = originalFind; service.begin = originalBegin; service.finish = originalFinish; service.check = originalCheck; });
    const events = [];
    const emit = (event, payload) => events.push({ event, payload, at: Date.now() });
    const socket = (userId, partnerId) => ({ userId, partnerId, emit, to: () => ({ emit }) });
    const caller = socket('usage-a', 'usage-b'); const callee = socket('usage-b', 'usage-a');
    const io = { to: () => ({ emit }), sockets: { sockets: new Map() } };
    const client = { platform: 'android', buildNumber: '13', callUsageVersion: 1 };
    callee.handshake = { auth: client };
    io.sockets.sockets.set('callee', callee);
    await handleCallStart(caller, io, client);
    const callId = events.find(e => e.event === 'call:outgoing').payload.callId;
    await handleCallAccept(callee, io, { callId, ...client });
    await handleCallConnected(caller, io, { callId });
    assert.equal(events.some(e => e.event === 'call:usage-policy'), false);
    await handleCallConnected(callee, io, { callId });
    await handleCallConnected(caller, io, { callId });
    const policies = events.filter(e => e.event === 'call:usage-policy');
    assert.equal(policies.length, 1, 'duplicate connected event must not reset deadline');
    const policy = policies[0];
    assert.equal(Date.parse(policy.payload.callLimit.expiresAt) - Date.parse(policy.payload.callLimit.serverNow), 3000);
    await new Promise(resolve => setTimeout(resolve, 3150));
    const limit = events.find(e => e.event === 'call:limit-reached');
    assert.equal(limit?.payload.code, 'CALL_FREE_LIMIT_REACHED');
    assert.ok(limit.at - policy.at >= 2900);
    assert.equal(events.find(e => e.event === 'call:ended')?.payload.reason, 'free_limit_reached');
    events.length = 0;
    await handleCallStart(caller, io, client);
    assert.equal(events.some(e => e.event === 'call:outgoing'), false, 'exhausted call never rings');
    assert.equal(events.some(e => e.event === 'call:incoming'), false);
    assert.equal(events.find(e => e.event === 'call:error')?.payload.code, 'CALL_FREE_LIMIT_REACHED');

});

test('unknown partner version is checked on acceptance before media can connect', async t => {
    const originalFind = User.findById;
    const originalCheck = service.check;
    User.findById = id => ({ select: async () => ({ partnerId: id === 'accept-a' ? 'accept-b' : 'accept-a', name: 'Test' }) });
    service.check = async call => ({ enabled: Boolean(call.clients?.['accept-b']?.callUsageVersion), premium: false, remainingMs: 0, callLimit: { version: 1, enabled: true, isPremium: false, serverNow: new Date().toISOString(), expiresAt: new Date().toISOString() } });
    t.after(() => { User.findById = originalFind; service.check = originalCheck; });
    const events = []; const emit = (event, payload) => events.push({event,payload});
    const socket = (userId,partnerId) => ({userId,partnerId,emit,to:()=>({emit})});
    const io = {to:()=>({emit})}; const caller=socket('accept-a','accept-b'); const callee=socket('accept-b','accept-a');
    const client={platform:'android',buildNumber:'13',callUsageVersion:1};
    await handleCallStart(caller,io,client);
    const callId=events.find(e=>e.event==='call:outgoing').payload.callId;
    await handleCallAccept(callee,io,{callId,...client});
    assert.equal(events.some(e=>e.event==='call:accepted'),false);
    assert.equal(events.find(e=>e.event==='call:error')?.payload.code,'CALL_FREE_LIMIT_REACHED');
});
