const mediaSessions = new Map();

export const MEDIA_SESSION_TYPE = {
    CALL: 'normal-call',
    LIVE_CHAT: 'live-chat',
};

export const claimMediaSession = ({ coupleId, type, sessionId, participantIds = [] }) => {
    if (!coupleId || !type || !sessionId) return { success: false, reason: 'invalid_session' };

    const current = mediaSessions.get(coupleId);
    if (current) {
        const isSameSession = current.type === type && current.sessionId === sessionId;
        return isSameSession
            ? { success: true, session: current }
            : { success: false, reason: 'media_busy', session: current };
    }

    const session = {
        coupleId,
        type,
        sessionId,
        participantIds: participantIds.map(String),
        createdAt: new Date().toISOString(),
    };
    mediaSessions.set(coupleId, session);
    return { success: true, session };
};

export const getMediaSession = (coupleId) => mediaSessions.get(coupleId) || null;

export const releaseMediaSession = ({ coupleId, type, sessionId }) => {
    const current = mediaSessions.get(coupleId);
    if (!current || current.type !== type || current.sessionId !== sessionId) return false;
    mediaSessions.delete(coupleId);
    return true;
};

export default {
    claimMediaSession,
    getMediaSession,
    releaseMediaSession,
    MEDIA_SESSION_TYPE,
};
