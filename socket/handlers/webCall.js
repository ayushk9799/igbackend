import crypto from 'crypto';
import User from '../../models/User.js';
import { connectedUsers } from '../auth.js';

const RING_TIMEOUT_MS = 30_000;
const activeWebCalls = new Map();

const isWebSocket = socket => socket?.handshake?.auth?.clientSurface === 'web';

const webSocketIdsForUser = (io, userId) => {
    const connection = connectedUsers.get(String(userId));
    if (!connection?.socketIds) return [];
    return [...connection.socketIds].filter(socketId => {
        const candidate = io.sockets.sockets.get(socketId);
        return candidate?.connected && isWebSocket(candidate);
    });
};

const emitToSocket = (io, socketId, event, payload) => {
    if (socketId) io.to(socketId).emit(event, payload);
};

const sanitizeMediaState = (data = {}) => ({
    microphoneEnabled: data.microphoneEnabled === true,
    cameraEnabled: data.cameraEnabled === true,
});

const publicCall = call => ({
    callId: call.callId,
    callerId: call.callerId,
    callerName: call.callerName,
    calleeId: call.calleeId,
    mediaType: call.mediaType,
    status: call.status,
    createdAt: call.createdAt,
    partnerMediaState: call.mediaStates?.[call.callerId] || sanitizeMediaState(),
});

const isCallSocket = (call, socket) => (
    call?.callerSocketId === socket.id || call?.calleeSocketId === socket.id
);

const findActiveWebCall = (firstId, secondId) => {
    for (const call of activeWebCalls.values()) {
        const sameCouple = (
            (call.callerId === firstId && call.calleeId === secondId)
            || (call.callerId === secondId && call.calleeId === firstId)
        );
        if (sameCouple) return call;
    }
    return null;
};

const clearRingTimer = call => {
    if (call?.ringTimer) clearTimeout(call.ringTimer);
    if (call) call.ringTimer = null;
};

const finishWebCall = (io, call, event, reason, endedBy) => {
    if (!call) return;
    clearRingTimer(call);
    activeWebCalls.delete(call.callId);
    const payload = { callId: call.callId, reason, endedBy };
    emitToSocket(io, call.callerSocketId, event, payload);
    if (call.calleeSocketId) {
        emitToSocket(io, call.calleeSocketId, event, payload);
    } else {
        for (const socketId of webSocketIdsForUser(io, call.calleeId)) {
            emitToSocket(io, socketId, event, payload);
        }
    }
};

export const handleWebCallStart = async (socket, io, data = {}) => {
    try {
        if (!isWebSocket(socket)) return;
        const callerId = String(socket.userId);
        const caller = await User.findById(callerId).select('partnerId name nickname');
        const calleeId = caller?.partnerId?.toString();
        if (!calleeId || calleeId !== String(socket.partnerId || '')) {
            socket.emit('web-call:error', { code: 'NO_PARTNER', message: 'A paired partner is required.' });
            return;
        }

        const callee = await User.findById(calleeId).select('partnerId');
        if (callee?.partnerId?.toString() !== callerId) {
            socket.emit('web-call:error', { code: 'PAIRING_MISMATCH', message: 'Partner pairing is no longer valid.' });
            return;
        }

        if (findActiveWebCall(callerId, calleeId)) {
            socket.emit('web-call:busy', { message: 'A web call is already active.' });
            return;
        }

        const calleeSocketIds = webSocketIdsForUser(io, calleeId);
        if (calleeSocketIds.length === 0) {
            socket.emit('web-call:error', { code: 'WEB_PARTNER_OFFLINE', message: 'Your partner is not on Penguin Web right now.' });
            return;
        }

        const call = {
            callId: crypto.randomUUID(),
            callerId,
            callerName: caller.nickname || caller.name || 'Your partner',
            callerSocketId: socket.id,
            calleeId,
            calleeSocketId: null,
            mediaType: data.mediaType === 'audio' ? 'audio' : 'video',
            status: 'ringing',
            createdAt: new Date().toISOString(),
            ringTimer: null,
            mediaStates: { [callerId]: sanitizeMediaState(data) },
        };

        activeWebCalls.set(call.callId, call);
        socket.emit('web-call:outgoing', publicCall(call));
        for (const socketId of calleeSocketIds) {
            emitToSocket(io, socketId, 'web-call:incoming', publicCall(call));
        }

        call.ringTimer = setTimeout(() => {
            if (!activeWebCalls.has(call.callId)) return;
            finishWebCall(io, call, 'web-call:missed', 'ring_timeout', null);
        }, RING_TIMEOUT_MS);
    } catch (error) {
        console.error('Web call start error:', error);
        socket.emit('web-call:error', { code: 'START_FAILED', message: 'Unable to start the web call.' });
    }
};

export const handleWebCallGetPending = (socket, io) => {
    if (!isWebSocket(socket)) return;
    for (const call of activeWebCalls.values()) {
        if (call.calleeId === String(socket.userId) && call.status === 'ringing') {
            socket.emit('web-call:incoming', publicCall(call));
            return;
        }
    }
};

export const handleWebCallAccept = (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!isWebSocket(socket) || !call || call.calleeId !== String(socket.userId) || call.status !== 'ringing') {
        socket.emit('web-call:error', { callId: data.callId, code: 'INVALID_ACCEPT', message: 'This web call can no longer be accepted.' });
        return;
    }

    clearRingTimer(call);
    call.calleeSocketId = socket.id;
    call.status = 'accepted';
    call.mediaStates[call.calleeId] = sanitizeMediaState(data);
    emitToSocket(io, call.callerSocketId, 'web-call:accepted', {
        callId: call.callId,
        acceptedBy: call.calleeId,
        partnerMediaState: call.mediaStates[call.calleeId],
    });
    socket.emit('web-call:accepted', {
        callId: call.callId,
        acceptedBy: call.calleeId,
        partnerMediaState: call.mediaStates[call.callerId],
    });
    for (const socketId of webSocketIdsForUser(io, call.calleeId)) {
        if (socketId !== socket.id) emitToSocket(io, socketId, 'web-call:taken', { callId: call.callId });
    }
};

export const handleWebCallReject = (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!isWebSocket(socket) || !call || call.calleeId !== String(socket.userId) || call.status !== 'ringing') return;
    finishWebCall(io, call, 'web-call:rejected', 'partner_rejected', socket.userId);
};

export const handleWebCallCancel = (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!call || call.callerSocketId !== socket.id || call.status !== 'ringing') return;
    finishWebCall(io, call, 'web-call:cancelled', 'caller_cancelled', socket.userId);
};

export const handleWebCallEnd = (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!isCallSocket(call, socket)) return;
    finishWebCall(io, call, 'web-call:ended', data.reason || 'hangup', socket.userId);
};

export const handleWebCallMediaState = (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!isCallSocket(call, socket)) return;
    const targetSocketId = socket.id === call.callerSocketId ? call.calleeSocketId : call.callerSocketId;
    const mediaState = sanitizeMediaState(data);
    call.mediaStates[String(socket.userId)] = mediaState;
    emitToSocket(io, targetSocketId, 'web-call:partner-media-state', { callId: call.callId, ...mediaState });
};

export const handleWebCallSignal = event => (socket, io, data = {}) => {
    const call = activeWebCalls.get(data.callId);
    if (!isCallSocket(call, socket) || call.status === 'ringing') {
        socket.emit('web-call:error', { callId: data.callId, code: 'INVALID_SIGNAL', message: 'Web call signaling is not allowed.' });
        return;
    }
    const targetSocketId = socket.id === call.callerSocketId ? call.calleeSocketId : call.callerSocketId;
    if (!targetSocketId) return;
    call.status = 'connecting';
    const payload = { callId: call.callId, fromUserId: socket.userId };
    if (event === 'web-webrtc:offer') payload.description = data.description;
    if (event === 'web-webrtc:answer') payload.description = data.description;
    if (event === 'web-webrtc:ice-candidate') payload.candidate = data.candidate;
    emitToSocket(io, targetSocketId, event, payload);
};

export const handleWebCallDisconnect = (socket, io) => {
    for (const call of activeWebCalls.values()) {
        if (!isCallSocket(call, socket)) continue;
        finishWebCall(io, call, 'web-call:ended', 'socket_disconnected', socket.userId);
    }
};

export const __webCallTestables = { activeWebCalls, webSocketIdsForUser };
