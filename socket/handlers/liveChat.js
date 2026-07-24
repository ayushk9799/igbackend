import crypto from 'crypto';
import User from '../../models/User.js';
import { connectedUsers, getCoupleRoomId } from '../auth.js';
import { sendPushNotification } from '../../utils/pushNotification.js';
import {
    claimMediaSession,
    MEDIA_SESSION_TYPE,
    releaseMediaSession,
} from '../mediaSessionRegistry.js';

const MAX_MESSAGE_LENGTH = 500;
const liveChatSessions = new Map();

const sessionRoom = sessionId => `live-chat:${sessionId}`;

const publicMessage = participant => participant?.message || null;

const getSessionForSocket = (socket, sessionId) => {
    const coupleId = getCoupleRoomId(socket.userId, socket.partnerId);
    const session = coupleId ? liveChatSessions.get(coupleId) : null;
    if (!session || session.sessionId !== sessionId || !session.participants.has(String(socket.userId))) {
        return null;
    }
    return session;
};

const buildSnapshot = (session, userId) => {
    const participantIds = [...session.participants.keys()];
    const own = session.participants.get(String(userId));
    const partner = session.participants.get(
        participantIds.find(id => id !== String(userId)),
    );
    return {
        sessionId: session.sessionId,
        participantCount: session.participants.size,
        shouldOffer: participantIds[0] === String(userId),
        myMessage: publicMessage(own),
        partnerMessage: publicMessage(partner),
    };
};

const destroySessionIfEmpty = (session) => {
    if (session.participants.size > 0) return;
    liveChatSessions.delete(session.coupleId);
    if (session.mediaClaimed) {
        releaseMediaSession({
            coupleId: session.coupleId,
            type: MEDIA_SESSION_TYPE.LIVE_CHAT,
            sessionId: session.sessionId,
        });
    }
};

const releaseMediaWhenWaiting = (session) => {
    if (!session.mediaClaimed || session.participants.size >= 2) return;
    releaseMediaSession({
        coupleId: session.coupleId,
        type: MEDIA_SESSION_TYPE.LIVE_CHAT,
        sessionId: session.sessionId,
    });
    session.mediaClaimed = false;
};

export const handleLiveChatJoin = async (socket, io) => {
    try {
        const userId = String(socket.userId);
        const partnerId = String(socket.partnerId || '');
        if (!partnerId) {
            socket.emit('liveChat:error', { code: 'NO_PARTNER', message: 'A paired partner is required.' });
            return;
        }

        const partner = await User.findById(partnerId).select('partnerId');
        if (partner?.partnerId?.toString() !== userId) {
            socket.emit('liveChat:error', { code: 'PAIRING_MISMATCH', message: 'Partner pairing is no longer valid.' });
            return;
        }

        const coupleId = getCoupleRoomId(userId, partnerId);
        let session = liveChatSessions.get(coupleId);
        if (!session) {
            const sessionId = crypto.randomUUID();
            session = {
                sessionId,
                coupleId,
                participants: new Map(),
                mediaClaimed: false,
                createdAt: new Date().toISOString(),
            };
            liveChatSessions.set(coupleId, session);
        }

        if (!session.participants.has(userId)) {
            session.participants.set(userId, {
                userId,
                socketId: socket.id,
                message: null,
                messageRevision: 0,
                joinedAt: new Date().toISOString(),
            });
        } else {
            session.participants.get(userId).socketId = socket.id;
        }

        if (session.participants.size >= 2 && !session.mediaClaimed) {
            const claim = claimMediaSession({
                coupleId,
                type: MEDIA_SESSION_TYPE.LIVE_CHAT,
                sessionId: session.sessionId,
                participantIds: [...session.participants.keys()],
            });
            if (!claim.success) {
                session.participants.delete(userId);
                socket.emit('liveChat:error', {
                    code: 'NORMAL_CALL_ACTIVE',
                    message: 'End the video call before starting Live Chat.',
                });
                destroySessionIfEmpty(session);
                return;
            }
            session.mediaClaimed = true;
        }

        socket.join(sessionRoom(session.sessionId));
        socket.data.liveChatSessionId = session.sessionId;
        socket.emit('liveChat:joined', buildSnapshot(session, userId));
        socket.to(sessionRoom(session.sessionId)).emit('liveChat:partnerJoined', {
            sessionId: session.sessionId,
            userId,
            participantCount: session.participants.size,
            shouldOffer: true,
        });
    } catch (error) {
        console.error('Live Chat join error:', error);
        socket.emit('liveChat:error', { code: 'JOIN_FAILED', message: 'Unable to enter Live Chat.' });
    }
};

export const handleLiveChatMessageSet = (socket, io, data = {}) => {
    const session = getSessionForSocket(socket, data.sessionId);
    if (!session) return;
    const text = String(data.text || '').trim();
    if (!text || text.length > MAX_MESSAGE_LENGTH) {
        socket.emit('liveChat:error', { code: 'INVALID_MESSAGE', message: 'Message must be 1–500 characters.' });
        return;
    }

    const participant = session.participants.get(String(socket.userId));
    participant.messageRevision += 1;
    participant.message = {
        id: crypto.randomUUID(),
        senderId: String(socket.userId),
        text,
        revision: participant.messageRevision,
        sentAt: new Date().toISOString(),
    };

    io.to(sessionRoom(session.sessionId)).emit('liveChat:messageUpdated', {
        sessionId: session.sessionId,
        senderId: String(socket.userId),
        message: participant.message,
        clientMessageId: typeof data.clientMessageId === 'string' ? data.clientMessageId.slice(0, 80) : undefined,
    });

    const partnerId = String(socket.partnerId || '');
    if (partnerId) {
        const notificationData = {
            type: 'live_chat',
            sessionId: session.sessionId,
            messageId: participant.message.id,
            senderId: String(socket.userId),
            senderName: socket.userName || 'Your partner',
            preview: text,
        };

        const partnerConnection = connectedUsers.get(partnerId);
        for (const socketId of partnerConnection?.socketIds || []) {
            io.to(socketId).emit('liveChat:notification', notificationData);
        }

        void sendPushNotification(
            partnerId,
            'live chat message',
            text,
            notificationData,
        );
    }
};

export const handleLiveChatMediaState = (socket, io, data = {}) => {
    const session = getSessionForSocket(socket, data.sessionId);
    if (!session) return;
    socket.to(sessionRoom(session.sessionId)).emit('liveChat:partnerMediaState', {
        sessionId: session.sessionId,
        senderId: String(socket.userId),
        cameraEnabled: data.cameraEnabled === true,
    });
};

export const handleLiveChatTyping = (socket, io, data = {}) => {
    const session = getSessionForSocket(socket, data.sessionId);
    if (!session) return;
    socket.to(sessionRoom(session.sessionId)).emit('liveChat:partnerTyping', {
        sessionId: session.sessionId,
        senderId: String(socket.userId),
        isTyping: data.isTyping === true,
    });
};

export const handleLiveChatSignal = event => (socket, io, data = {}) => {
    const session = getSessionForSocket(socket, data.sessionId);
    if (!session || session.participants.size < 2) return;
    const payload = { sessionId: session.sessionId, fromUserId: String(socket.userId) };
    if (event === 'liveChat:webrtc:offer' || event === 'liveChat:webrtc:answer') payload.description = data.description;
    if (event === 'liveChat:webrtc:iceCandidate') payload.candidate = data.candidate;
    socket.to(sessionRoom(session.sessionId)).emit(event, payload);
};

export const handleLiveChatLeave = (socket, io, data = {}) => {
    const session = getSessionForSocket(socket, data.sessionId || socket.data.liveChatSessionId);
    if (!session) return;
    const userId = String(socket.userId);
    session.participants.delete(userId);
    releaseMediaWhenWaiting(session);
    socket.leave(sessionRoom(session.sessionId));
    socket.data.liveChatSessionId = null;
    socket.to(sessionRoom(session.sessionId)).emit('liveChat:partnerLeft', {
        sessionId: session.sessionId,
        userId,
        participantCount: session.participants.size,
        shouldOffer: session.participants.size === 1,
    });
    destroySessionIfEmpty(session);
};

export const handleLiveChatDisconnect = socket => {
    const sessionId = socket.data.liveChatSessionId;
    if (!sessionId) return;
    const coupleId = getCoupleRoomId(socket.userId, socket.partnerId);
    const session = coupleId ? liveChatSessions.get(coupleId) : null;
    if (!session || session.sessionId !== sessionId) return;
    session.participants.delete(String(socket.userId));
    releaseMediaWhenWaiting(session);
    socket.to(sessionRoom(sessionId)).emit('liveChat:partnerLeft', {
        sessionId,
        userId: String(socket.userId),
        participantCount: session.participants.size,
        shouldOffer: session.participants.size === 1,
    });
    destroySessionIfEmpty(session);
};

export default {
    handleLiveChatJoin,
    handleLiveChatMessageSet,
    handleLiveChatMediaState,
    handleLiveChatTyping,
    handleLiveChatSignal,
    handleLiveChatLeave,
    handleLiveChatDisconnect,
};
