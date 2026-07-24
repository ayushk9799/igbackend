import assert from 'node:assert/strict';
import test from 'node:test';
import User from '../models/User.js';
import {
    handleCallCancel,
    handleCallGetPending,
    handleCallStart,
} from '../socket/handlers/call.js';

const createSocket = (userId, partnerId) => {
    const emitted = [];
    return {
        userId,
        partnerId,
        emitted,
        emit(event, payload) {
            emitted.push({ event, payload });
        },
        to() {
            return { emit() {} };
        },
    };
};

test('an offline receiver can recover a still-ringing incoming call after connecting', async (t) => {
    const originalFindById = User.findById;
    User.findById = userId => ({
        select: async () => (
            String(userId) === 'caller-1'
                ? { partnerId: 'callee-1', name: 'Account Name', nickname: 'Penguin' }
                : { partnerId: 'caller-1' }
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
    const callerSocket = createSocket('caller-1', 'callee-1');
    await handleCallStart(callerSocket, io, { mediaType: 'video' });

    const outgoing = callerSocket.emitted.find(({ event }) => event === 'call:outgoing');
    assert.ok(outgoing?.payload?.callId);

    const receiverSocket = createSocket('callee-1', 'caller-1');
    handleCallGetPending(receiverSocket);

    const incoming = receiverSocket.emitted.find(({ event }) => event === 'call:incoming');
    assert.equal(incoming?.payload?.callId, outgoing.payload.callId);
    assert.equal(incoming?.payload?.callerName, 'Penguin');

    handleCallCancel(callerSocket, io, { callId: outgoing.payload.callId });
});
