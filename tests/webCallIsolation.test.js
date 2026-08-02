import assert from 'node:assert/strict';
import test from 'node:test';
import User from '../models/User.js';
import { connectedUsers } from '../socket/auth.js';
import {
    __webCallTestables,
    handleWebCallAccept,
    handleWebCallCancel,
    handleWebCallDisconnect,
    handleWebCallSignal,
    handleWebCallStart,
} from '../socket/handlers/webCall.js';

const createSocket = ({ id, userId, partnerId, surface }) => ({
    id,
    userId,
    partnerId,
    connected: true,
    handshake: { auth: { clientSurface: surface } },
    emitted: [],
    emit(event, payload) {
        this.emitted.push({ event, payload });
    },
});

const createIO = sockets => ({
    sockets: { sockets: new Map(sockets.map(socket => [socket.id, socket])) },
    to(socketId) {
        return {
            emit(event, payload) {
                const target = sockets.find(socket => socket.id === socketId);
                target?.emit(event, payload);
            },
        };
    },
});

test('web calls ring and signal only the selected web sockets', async t => {
    const originalFindById = User.findById;
    User.findById = userId => ({
        select: async () => (
            String(userId) === 'caller'
                ? { partnerId: 'callee', name: 'Caller' }
                : { partnerId: 'caller', name: 'Callee' }
        ),
    });

    const callerWeb = createSocket({ id: 'caller-web', userId: 'caller', partnerId: 'callee', surface: 'web' });
    const callerMobile = createSocket({ id: 'caller-mobile', userId: 'caller', partnerId: 'callee', surface: 'mobile' });
    const calleeWeb = createSocket({ id: 'callee-web', userId: 'callee', partnerId: 'caller', surface: 'web' });
    const calleeOtherWeb = createSocket({ id: 'callee-web-2', userId: 'callee', partnerId: 'caller', surface: 'web' });
    const calleeMobile = createSocket({ id: 'callee-mobile', userId: 'callee', partnerId: 'caller', surface: 'mobile' });
    const sockets = [callerWeb, callerMobile, calleeWeb, calleeOtherWeb, calleeMobile];
    const io = createIO(sockets);

    connectedUsers.set('caller', { userId: 'caller', partnerId: 'callee', socketIds: new Set(['caller-web', 'caller-mobile']) });
    connectedUsers.set('callee', { userId: 'callee', partnerId: 'caller', socketIds: new Set(['callee-web', 'callee-web-2', 'callee-mobile']) });

    t.after(() => {
        User.findById = originalFindById;
        connectedUsers.clear();
        for (const call of __webCallTestables.activeWebCalls.values()) clearTimeout(call.ringTimer);
        __webCallTestables.activeWebCalls.clear();
    });

    await handleWebCallStart(callerWeb, io, { mediaType: 'video' });
    const outgoing = callerWeb.emitted.find(item => item.event === 'web-call:outgoing');
    assert.ok(outgoing?.payload?.callId);
    assert.equal(calleeWeb.emitted.filter(item => item.event === 'web-call:incoming').length, 1);
    assert.equal(calleeOtherWeb.emitted.filter(item => item.event === 'web-call:incoming').length, 1);
    assert.equal(calleeMobile.emitted.filter(item => item.event.startsWith('web-call:')).length, 0);
    assert.equal(callerMobile.emitted.filter(item => item.event.startsWith('web-call:')).length, 0);

    const callId = outgoing.payload.callId;
    handleWebCallAccept(calleeWeb, io, { callId, microphoneEnabled: true, cameraEnabled: true });
    handleWebCallDisconnect(calleeOtherWeb, io);
    assert.ok(__webCallTestables.activeWebCalls.has(callId));

    handleWebCallSignal('web-webrtc:offer')(callerWeb, io, { callId, description: { type: 'offer', sdp: 'test' } });
    assert.equal(calleeWeb.emitted.filter(item => item.event === 'web-webrtc:offer').length, 1);
    assert.equal(calleeOtherWeb.emitted.filter(item => item.event === 'web-webrtc:offer').length, 0);
    assert.equal(calleeMobile.emitted.filter(item => item.event === 'web-webrtc:offer').length, 0);

    handleWebCallCancel(callerWeb, io, { callId });
    assert.equal(__webCallTestables.activeWebCalls.has(callId), true, 'accepted calls cannot be cancelled as ringing calls');
});

test('mobile sockets cannot start the web call channel', async t => {
    const mobile = createSocket({ id: 'mobile', userId: 'caller', partnerId: 'callee', surface: 'mobile' });
    const io = createIO([mobile]);
    t.after(() => __webCallTestables.activeWebCalls.clear());
    await handleWebCallStart(mobile, io, { mediaType: 'video' });
    assert.equal(__webCallTestables.activeWebCalls.size, 0);
    assert.equal(mobile.emitted.length, 0);
});
