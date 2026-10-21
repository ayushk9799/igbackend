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
