import crypto from 'crypto';
import CallDiagnostic from '../../models/CallDiagnostic.js';
import User from '../../models/User.js';
import { getCoupleRoomId } from '../auth.js';
import {
    claimMediaSession,
    MEDIA_SESSION_TYPE,
    releaseMediaSession,
} from '../mediaSessionRegistry.js';

const RING_TIMEOUT_MS = 30_000;
const ACTIVE_STATUSES = new Set(['ringing', 'accepted', 'connecting', 'connected']);
const activeCalls = new Map();

const sanitizeMediaState = (data = {}) => ({
    microphoneEnabled: data.microphoneEnabled === true,
    cameraEnabled: data.cameraEnabled === true,
});

const publicCall = (call) => ({
    callId: call.callId,
    callerId: call.callerId,
    callerName: call.callerName,
    calleeId: call.calleeId,
    mediaType: call.mediaType,
    status: call.status,
    createdAt: call.createdAt,
    partnerMediaState: call.mediaStates?.[call.callerId] || sanitizeMediaState(),
});

const isParticipant = (call, userId) => (
    call && (call.callerId === userId || call.calleeId === userId)
);

const emitToCallPartner = (socket, call, event, payload = {}) => {
    const roomId = getCoupleRoomId(call.callerId, call.calleeId);
    if (roomId) {
        socket.to(roomId).emit(event, { callId: call.callId, ...payload });
    }
};

const clearRingTimer = (call) => {
    if (call?.ringTimer) {
        clearTimeout(call.ringTimer);
        call.ringTimer = null;
    }
};

const findActiveCoupleCall = (firstId, secondId) => {
    for (const call of activeCalls.values()) {
        const sameCouple = (
            (call.callerId === firstId && call.calleeId === secondId)
            || (call.callerId === secondId && call.calleeId === firstId)
        );
        if (sameCouple && ACTIVE_STATUSES.has(call.status)) return call;
    }
    return null;
};

const endCall = (socket, call, event, status, reason) => {
    clearRingTimer(call);
    call.status = status;
    call.endedAt = new Date().toISOString();
    activeCalls.delete(call.callId);
    releaseMediaSession({
        coupleId: call.coupleId,
        type: MEDIA_SESSION_TYPE.CALL,
        sessionId: call.callId,
    });
    emitToCallPartner(socket, call, event, { reason, endedBy: socket.userId });
    socket.emit(event, { callId: call.callId, reason, endedBy: socket.userId });
};

export const handleCallStart = async (socket, io, data = {}) => {
    let claimedMediaSession = null;
    try {
        const callerId = String(socket.userId);
        const caller = await User.findById(callerId).select('partnerId name nickname');
        const calleeId = caller?.partnerId?.toString();

        if (!calleeId || calleeId !== String(socket.partnerId || '')) {
            socket.emit('call:error', { code: 'NO_PARTNER', message: 'A paired partner is required.' });
            return;
        }

        const callee = await User.findById(calleeId).select('partnerId');
        if (callee?.partnerId?.toString() !== callerId) {
            socket.emit('call:error', { code: 'PAIRING_MISMATCH', message: 'Partner pairing is no longer valid.' });
            return;
        }

        const existing = findActiveCoupleCall(callerId, calleeId);
        if (existing) {
            socket.emit('call:busy', { callId: existing.callId, message: 'A call is already active.' });
            return;
        }

        const callId = crypto.randomUUID();
        const coupleId = getCoupleRoomId(callerId, calleeId);
        const claim = claimMediaSession({
            coupleId,
            type: MEDIA_SESSION_TYPE.CALL,
            sessionId: callId,
            participantIds: [callerId, calleeId],
        });
        if (!claim.success) {
            socket.emit('call:busy', {
                code: claim.session?.type === MEDIA_SESSION_TYPE.LIVE_CHAT ? 'LIVE_CHAT_ACTIVE' : 'CALL_ACTIVE',
                message: claim.session?.type === MEDIA_SESSION_TYPE.LIVE_CHAT
                    ? 'Leave Live Chat before starting a video call.'
                    : 'A call is already active.',
            });
            return;
        }
        claimedMediaSession = { coupleId, callId };

        const call = {
            callId,
            coupleId,
            callerId,
            callerName: caller.nickname || caller.name || 'Your partner',
            calleeId,
            mediaType: data.mediaType === 'audio' ? 'audio' : 'video',
            status: 'ringing',
            createdAt: new Date().toISOString(),
            ringTimer: null,
            mediaStates: {
                [callerId]: sanitizeMediaState(data),
            },
        };

        activeCalls.set(call.callId, call);
        claimedMediaSession = null;
        call.ringTimer = setTimeout(() => {
            if (!activeCalls.has(call.callId)) return;
            call.status = 'missed';
            activeCalls.delete(call.callId);
            releaseMediaSession({
                coupleId: call.coupleId,
                type: MEDIA_SESSION_TYPE.CALL,
                sessionId: call.callId,
            });
            const roomId = getCoupleRoomId(callerId, calleeId);
            io.to(roomId).emit('call:missed', { callId: call.callId, reason: 'ring_timeout' });
        }, RING_TIMEOUT_MS);

        socket.emit('call:outgoing', publicCall(call));
        emitToCallPartner(socket, call, 'call:incoming', publicCall(call));
    } catch (error) {
        if (claimedMediaSession) {
            releaseMediaSession({
                coupleId: claimedMediaSession.coupleId,
                type: MEDIA_SESSION_TYPE.CALL,
                sessionId: claimedMediaSession.callId,
            });
        }
        console.error('Call start error:', error);
        socket.emit('call:error', { code: 'START_FAILED', message: 'Unable to start the call.' });
    }
};

export const handleCallAccept = (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId) || call.calleeId !== socket.userId || call.status !== 'ringing') {
        socket.emit('call:error', { callId: data.callId, code: 'INVALID_ACCEPT', message: 'This call can no longer be accepted.' });
        return;
    }

    clearRingTimer(call);
    call.status = 'accepted';
    call.mediaStates[socket.userId] = sanitizeMediaState(data);
    emitToCallPartner(socket, call, 'call:accepted', {
        acceptedBy: socket.userId,
        partnerMediaState: call.mediaStates[socket.userId],
    });
    socket.emit('call:accepted', {
        callId: call.callId,
        acceptedBy: socket.userId,
        partnerMediaState: call.mediaStates[call.callerId] || sanitizeMediaState(),
    });
};

export const handleCallMediaState = (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId) || !ACTIVE_STATUSES.has(call.status)) return;

    const mediaState = sanitizeMediaState(data);
    call.mediaStates[socket.userId] = mediaState;
    emitToCallPartner(socket, call, 'call:partner-media-state', mediaState);
};

export const handleCallReject = (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId) || call.calleeId !== socket.userId || call.status !== 'ringing') return;
    endCall(socket, call, 'call:rejected', 'rejected', 'partner_rejected');
};

export const handleCallCancel = (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId) || call.callerId !== socket.userId || call.status !== 'ringing') return;
    endCall(socket, call, 'call:cancelled', 'cancelled', 'caller_cancelled');
};

export const handleCallEnd = (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId)) return;
    endCall(socket, call, 'call:ended', 'ended', data.reason || 'hangup');
};

export const handleWebRTCSignal = (event) => (socket, io, data = {}) => {
    const call = activeCalls.get(data.callId);
    if (!isParticipant(call, socket.userId) || !['accepted', 'connecting', 'connected'].includes(call.status)) {
        socket.emit('call:error', { callId: data.callId, code: 'INVALID_SIGNAL', message: 'Call signaling is not allowed.' });
        return;
    }

    call.status = 'connecting';
    const payload = { fromUserId: socket.userId };
    if (event === 'webrtc:offer') payload.description = data.description;
    if (event === 'webrtc:answer') payload.description = data.description;
    if (event === 'webrtc:ice-candidate') payload.candidate = data.candidate;
    emitToCallPartner(socket, call, event, payload);
};

const CANDIDATE_TYPES = new Set(['host', 'srflx', 'prflx', 'relay', 'unknown']);
const PROTOCOLS = new Set(['udp', 'tcp', 'unknown']);
const OUTCOMES = new Set(['connected', 'failed', 'rejected', 'cancelled', 'missed', 'ended']);
const FAILURE_CODES = new Set([
    'permission_denied', 'partner_rejected', 'ring_timeout', 'signaling_timeout',
    'offer_failed', 'answer_failed', 'ice_gathering_failed',
    'ice_connectivity_failed_no_relay', 'media_track_failed', 'socket_disconnected',
    'remote_ended', 'unknown',
]);

const finiteNonNegative = (value) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 ? number : undefined;
};

const sanitizeCandidateTypes = (values) => (
    [...new Set(Array.isArray(values) ? values : [])]
        .map(value => String(value).toLowerCase())
        .filter(value => CANDIDATE_TYPES.has(value))
        .slice(0, 5)
);

export const handleCallDiagnostic = async (socket, io, data = {}) => {
    try {
        const partnerId = String(data.partnerId || socket.partnerId || '');
        if (!data.callId || !partnerId || partnerId !== String(socket.partnerId || '')) return;

        const selectedPair = data.selectedCandidatePair || {};
        const diagnostic = {
            callId: String(data.callId).slice(0, 80),
            reporterId: socket.userId,
            partnerId,
            platform: ['ios', 'android'].includes(data.platform) ? data.platform : 'unknown',
            appVersion: typeof data.appVersion === 'string' ? data.appVersion.slice(0, 40) : undefined,
            outcome: OUTCOMES.has(data.outcome) ? data.outcome : 'failed',
            failureCode: FAILURE_CODES.has(data.failureCode) ? data.failureCode : undefined,
            signalingCompleted: data.signalingCompleted === true,
            offerCreated: data.offerCreated === true,
            answerReceived: data.answerReceived === true,
            localCandidateTypes: sanitizeCandidateTypes(data.localCandidateTypes),
            remoteCandidateTypes: sanitizeCandidateTypes(data.remoteCandidateTypes),
            iceGatheringState: typeof data.iceGatheringState === 'string' ? data.iceGatheringState.slice(0, 40) : undefined,
            iceConnectionState: typeof data.iceConnectionState === 'string' ? data.iceConnectionState.slice(0, 40) : undefined,
            peerConnectionState: typeof data.peerConnectionState === 'string' ? data.peerConnectionState.slice(0, 40) : undefined,
            selectedCandidatePair: Object.keys(selectedPair).length > 0 ? {
                localType: CANDIDATE_TYPES.has(selectedPair.localType) ? selectedPair.localType : 'unknown',
                remoteType: CANDIDATE_TYPES.has(selectedPair.remoteType) ? selectedPair.remoteType : 'unknown',
                protocol: PROTOCOLS.has(selectedPair.protocol) ? selectedPair.protocol : 'unknown',
            } : undefined,
            timeToFirstCandidateMs: finiteNonNegative(data.timeToFirstCandidateMs),
            timeToConnectedMs: finiteNonNegative(data.timeToConnectedMs),
            roundTripTimeMs: finiteNonNegative(data.roundTripTimeMs),
            packetsLost: finiteNonNegative(data.packetsLost),
            outboundAudioBytes: finiteNonNegative(data.outboundAudioBytes),
            outboundVideoBytes: finiteNonNegative(data.outboundVideoBytes),
            inboundAudioBytes: finiteNonNegative(data.inboundAudioBytes),
            inboundVideoBytes: finiteNonNegative(data.inboundVideoBytes),
            videoFramesEncoded: finiteNonNegative(data.videoFramesEncoded),
            videoFramesDecoded: finiteNonNegative(data.videoFramesDecoded),
            localAudioTrackPresent: data.localAudioTrackPresent === true,
            localVideoTrackPresent: data.localVideoTrackPresent === true,
            localAudioTrackEnabled: data.localAudioTrackEnabled === true,
            localVideoTrackEnabled: data.localVideoTrackEnabled === true,
            remoteAudioTrackPresent: data.remoteAudioTrackPresent === true,
            remoteVideoTrackPresent: data.remoteVideoTrackPresent === true,
            startedAt: data.startedAt ? new Date(data.startedAt) : undefined,
            endedAt: new Date(),
        };

        await CallDiagnostic.findOneAndUpdate(
            { callId: diagnostic.callId, reporterId: socket.userId },
            { $set: diagnostic },
            { upsert: true, setDefaultsOnInsert: true },
        );
        socket.emit('call:diagnosticSaved', { callId: diagnostic.callId });
    } catch (error) {
        console.error('Call diagnostic error:', error);
    }
};

export const handleCallDisconnect = (socket, io) => {
    for (const call of activeCalls.values()) {
        if (!isParticipant(call, socket.userId)) continue;
        clearRingTimer(call);
        activeCalls.delete(call.callId);
        releaseMediaSession({
            coupleId: call.coupleId,
            type: MEDIA_SESSION_TYPE.CALL,
            sessionId: call.callId,
        });
        emitToCallPartner(socket, call, 'call:ended', {
            reason: 'socket_disconnected',
            endedBy: socket.userId,
        });
    }
};

export default {
    handleCallStart,
    handleCallAccept,
    handleCallReject,
    handleCallCancel,
    handleCallEnd,
    handleCallMediaState,
    handleWebRTCSignal,
    handleCallDiagnostic,
    handleCallDisconnect,
};
