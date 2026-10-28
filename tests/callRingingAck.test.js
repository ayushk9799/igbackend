import assert from 'node:assert/strict';
import test from 'node:test';
import User from '../models/User.js';
import {
    handleCallCancel,
    handleCallRinging,
    handleCallStart,
} from '../socket/handlers/call.js';

const createSocket = (userId, partnerId, partnerSocket = null) => {
    const emitted = [];
    const socket = {
        userId,
        partnerId,
        emitted,
        emit(event, payload) {
            emitted.push({ event, payload });
        },
        to() {
            return {
                emit(event, payload) {
                    if (partnerSocket) {
                        partnerSocket.emit(event, payload);
                    }
                },
            };
        },
    };
    return socket;
};

test('callee emits call:ringing and caller receives it', async (t) => {
    const originalFindById = User.findById;
    User.findById = userId => ({
        select: async () => (
            String(userId) === 'caller-ring-1'
                ? { partnerId: 'callee-ring-1', name: 'Account Name', nickname: 'Penguin' }
                : { partnerId: 'caller-ring-1' }
        ),
    });
    t.after(() => {
        User.findById = originalFindById;
    });

    const io = {
        to() {
            return { emit() {} };
        },
    };

    let calleeSocket;
    const callerSocket = createSocket('caller-ring-1', 'callee-ring-1', null);
    calleeSocket = createSocket('callee-ring-1', 'caller-ring-1', callerSocket);

    await handleCallStart(callerSocket, io, { mediaType: 'video' });

    const outgoing = callerSocket.emitted.find(({ event }) => event === 'call:outgoing');
    assert.ok(outgoing?.payload?.callId, 'callId should be present in call:outgoing');
    const callId = outgoing.payload.callId;

    // Callee sends call:ringing acknowledgment
    handleCallRinging(calleeSocket, io, { callId });

    // Caller should receive call:ringing
    const ringingEvent = callerSocket.emitted.find(({ event }) => event === 'call:ringing');
    assert.ok(ringingEvent, 'caller should receive call:ringing event');
    assert.equal(ringingEvent.payload.callId, callId);

    // Clean up call
    handleCallCancel(callerSocket, io, { callId });
});

test('relay-only policy and Cloudflare credentials reach both call participants', async t => {
    const names = ['WEBRTC_ICE_TRANSPORT_POLICY', 'CLOUDFLARE_TURN_KEY_ID', 'CLOUDFLARE_TURN_API_TOKEN'];
    const saved = names.map(name => process.env[name]);
    const originalFetch = globalThis.fetch;
    const originalFindById = User.findById;
    process.env.WEBRTC_ICE_TRANSPORT_POLICY = 'relay';
    process.env.CLOUDFLARE_TURN_KEY_ID = 'test-key';
    process.env.CLOUDFLARE_TURN_API_TOKEN = 'test-token';
    const turn = { urls: 'turn:turn.cloudflare.com:3478?transport=udp', username: 'test-user', credential: 'test-credential' };
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ iceServers: [turn] }) });
    User.findById = id => ({ select: async () => ({ partnerId: String(id) === 'relay-caller' ? 'relay-callee' : 'relay-caller', name: 'Test' }) });
    t.after(() => {
        names.forEach((name, i) => { if (saved[i] === undefined) delete process.env[name]; else process.env[name] = saved[i]; });
        globalThis.fetch = originalFetch;
        User.findById = originalFindById;
    });
    const incoming = [];
    const socket = createSocket('relay-caller', 'relay-callee', { emit: (event, payload) => incoming.push({ event, payload }) });
    const io = { to: () => ({ emit() {} }) };
    await handleCallStart(socket, io, { mediaType: 'video' });
    const outgoing = socket.emitted.find(item => item.event === 'call:outgoing');
    assert.ok(outgoing);
    t.after(() => handleCallCancel(socket, io, { callId: outgoing.payload.callId }));
    const callee = incoming.find(item => item.event === 'call:incoming');
    for (const payload of [outgoing.payload, callee?.payload]) {
        assert.equal(payload?.iceTransportPolicy, 'relay');
        assert.deepEqual(payload?.iceServers, [turn]);
    }
});
