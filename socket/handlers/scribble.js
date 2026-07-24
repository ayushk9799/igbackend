import Couple from '../../models/Couple.js';
import { getCoupleRoomId } from '../auth.js';
import { sendScribbleNotification } from '../../utils/pushNotification.js';
import { createCurrentScribbleSignature } from '../../utils/scribbleWidgetAccess.js';

const liveScribbleSessions = new Map();
const liveScribbleRoom = coupleId => `scribble-live:${coupleId}`;

const getNotificationApiBaseUrl = (socket) => {
    const configuredBaseUrl = process.env.PUBLIC_API_BASE_URL?.trim();
    if (configuredBaseUrl) {
        return configuredBaseUrl.replace(/\/$/, '');
    }

    const forwardedHost = socket.handshake.headers['x-forwarded-host'];
    const host = String(forwardedHost || socket.handshake.headers.host || '').split(',')[0].trim();
    if (!host) return null;

    const forwardedProtocol = socket.handshake.headers['x-forwarded-proto'];
    const isEncrypted = Boolean(socket.conn?.request?.connection?.encrypted);
    const protocol = String(forwardedProtocol || (isEncrypted ? 'https' : 'http'))
        .split(',')[0]
        .trim();

    return `${protocol}://${host}`;
};

/**
 * Handle scribble send event
 * Saves the couple's current shared canvas and broadcasts via socket.
 */
export const handleScribbleSend = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { paths } = data;
        const dimensions = getScribbleDimensions(data);
        const now = new Date();

        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            socket.emit('scribble:error', { message: 'Invalid scribble data' });
            return;
        }

        // Replace the couple's one current shared canvas.
        if (partnerId) {
            const couple = await Couple.findOneAndUpdate(getCoupleFilter(userId, partnerId), {
                $set: {
                    'liveScribble.paths': paths,
                    'liveScribble.canvasWidth': dimensions.canvasWidth,
                    'liveScribble.canvasHeight': dimensions.canvasHeight,
                    'liveScribble.updatedByUserId': userId,
                    'liveScribble.updatedByUserName': userName,
                    'liveScribble.updatedAt': now,
                },
            }, { new: true });

            // Keep FCM small. The signed URL always reads the one current shared
            // canvas and creates no per-notification database copy.
            try {
                if (!couple) {
                    throw new Error('Active couple not found for scribble notification');
                }

                const canvasRevision = now.getTime();
                const coupleId = couple._id.toString();
                const recipientId = partnerId.toString();
                const signature = createCurrentScribbleSignature(coupleId, recipientId);

                void sendScribbleNotification(partnerId, userName, {
                    coupleId,
                    recipientId,
                    signature,
                    apiBaseUrl: getNotificationApiBaseUrl(socket),
                    canvasRevision,
                    timestamp: now,
                    legacyPaths: paths,
                    ...dimensions,
                });
            } catch (notificationError) {
                console.error('Failed to create current scribble notification URL:', notificationError);
                // The shared canvas is already saved, so notification failure
                // must not turn a successful drawing update into an error.
                void sendScribbleNotification(partnerId, userName, {
                    timestamp: now,
                    legacyPaths: paths,
                    ...dimensions,
                });
            }
        }

        // Broadcast to partner via couple room (if online)
        const roomId = getCoupleRoomId(userId, partnerId);
        if (roomId) {
            socket.to(roomId).emit('scribble:received', {
                fromUserId: userId,
                fromUserName: userName,
                paths,
                ...dimensions,
                timestamp: now.toISOString(),
            });

            // Confirm to sender
            socket.emit('scribble:sent', {
                success: true,
                message: 'Scribble sent to partner!',
                fromUserId: userId,
                fromUserName: userName,
                paths,
                ...dimensions,
                timestamp: now.toISOString(),
            });
        } else {
            // Partner offline, but scribble is saved - still success
            socket.emit('scribble:sent', {
                success: true,
                message: 'Scribble saved! Partner will see it when they come online.',
                fromUserId: userId,
                fromUserName: userName,
                paths,
                ...dimensions,
                timestamp: now.toISOString(),
            });
        }

    } catch (error) {
        console.error('Scribble send error:', error);
        socket.emit('scribble:error', { message: 'Failed to send scribble' });
    }
};

/**
 * Handle request for partner's latest scribble (on connection)
 */
export const handleScribbleRequest = async (socket, io) => {
    try {
        const { userId } = socket;

        const couple = await Couple.findByPartner(userId);
        const scribble = couple?.liveScribble;

        if (!scribble || !Array.isArray(scribble.paths) || scribble.paths.length === 0) {
            socket.emit('scribble:partnerScribble', {
                hasScribble: false,
                paths: null
            });
            return;
        }


        socket.emit('scribble:partnerScribble', {
            hasScribble: true,
            paths: scribble.paths,
            canvasWidth: scribble.canvasWidth,
            canvasHeight: scribble.canvasHeight,
            fromUserId: scribble.updatedByUserId,
            fromUserName: scribble.updatedByUserName,
            timestamp: scribble.updatedAt?.toISOString(),
        });

    } catch (error) {
        console.error('Scribble request error:', error);
        socket.emit('scribble:partnerScribble', {
            hasScribble: false,
            paths: null
        });
    }
};

const getCoupleFilter = (userId, partnerId) => {
    const [partner1, partner2] = [userId.toString(), partnerId.toString()].sort();
    return { partner1, partner2, status: 'active' };
};

const emitLiveUnavailable = (socket) => {
    socket.emit('scribble:liveStatus', {
        isLive: true,
        partnerAvailable: false,
        participantCount: 1,
    });
};

const getLiveSessionForSocket = (socket) => {
    const coupleId = getCoupleRoomId(socket.userId, socket.partnerId);
    const session = coupleId ? liveScribbleSessions.get(coupleId) : null;
    const participant = session?.participants.get(String(socket.userId));
    if (!session || participant?.socketId !== socket.id) return null;
    return session;
};

const getLivePartnerSocketId = (socket) => {
    const session = getLiveSessionForSocket(socket);
    if (!session || session.freeLimitReached || session.participants.size < 2) return null;
    const partner = [...session.participants.values()].find(
        participant => participant.userId !== String(socket.userId),
    );
    return partner?.socketId || null;
};

const getScribbleDimensions = (data = {}) => {
    const canvasWidth = Number(data.canvasWidth);
    const canvasHeight = Number(data.canvasHeight);
    const safeCanvasWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 350;
    const safeCanvasHeight = Number.isFinite(canvasHeight) && canvasHeight > 0 ? canvasHeight : safeCanvasWidth;

    return {
        canvasWidth: safeCanvasWidth,
        canvasHeight: safeCanvasHeight,
    };
};

export const handleScribbleLiveStart = (socket, io) => {
    const userId = String(socket.userId);
    const partnerId = String(socket.partnerId || '');
    const coupleId = getCoupleRoomId(userId, partnerId);
    if (!partnerId || !coupleId) {
        emitLiveUnavailable(socket);
        return;
    }

    let session = liveScribbleSessions.get(coupleId);
    if (!session) {
        session = {
            coupleId,
            participants: new Map(),
            freeLimitReached: false,
            freeLimitReachedAt: null,
        };
        liveScribbleSessions.set(coupleId, session);
    }

    session.participants.set(userId, { userId, socketId: socket.id });
    socket.data.liveScribbleCoupleId = coupleId;
    socket.join(liveScribbleRoom(coupleId));

    io.to(liveScribbleRoom(coupleId)).emit('scribble:liveStatus', {
        isLive: true,
        partnerAvailable: session.participants.size >= 2,
        participantCount: session.participants.size,
        freeLimitReached: session.freeLimitReached,
    });

    if (session.freeLimitReached) {
        socket.emit('scribble:freeLimitReached', {
            reachedAt: session.freeLimitReachedAt,
        });
    }
};

export const handleScribbleLiveEnd = (socket, io) => {
    const coupleId = socket.data.liveScribbleCoupleId;
    const session = coupleId ? liveScribbleSessions.get(coupleId) : null;
    socket.data.liveScribbleCoupleId = null;

    if (!session) {
        return;
    }

    const participant = session.participants.get(String(socket.userId));
    if (participant?.socketId !== socket.id) return;

    session.participants.delete(String(socket.userId));
    socket.leave(liveScribbleRoom(coupleId));
    socket.emit('scribble:liveStatus', {
        isLive: false,
        partnerAvailable: false,
        participantCount: 0,
    });

    if (session.participants.size === 0) {
        liveScribbleSessions.delete(coupleId);
        return;
    }

    io.to(liveScribbleRoom(coupleId)).emit('scribble:liveStatus', {
        isLive: true,
        partnerAvailable: false,
        participantCount: session.participants.size,
        freeLimitReached: session.freeLimitReached,
    });
};

export const handleScribbleFreeLimitReached = (socket, io) => {
    const session = getLiveSessionForSocket(socket);
    if (!session || session.participants.size < 2) return;

    if (!session.freeLimitReached) {
        session.freeLimitReached = true;
        session.freeLimitReachedAt = new Date().toISOString();
    }

    io.to(liveScribbleRoom(session.coupleId)).emit('scribble:freeLimitReached', {
        reachedAt: session.freeLimitReachedAt,
    });
};

export const handleScribbleDisconnect = (socket, io) => {
    handleScribbleLiveEnd(socket, io);
};

export const handleScribbleLiveStrokeEnd = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { stroke, paths: livePaths } = data || {};
        const dimensions = getScribbleDimensions(data);

        if (!stroke || typeof stroke.d !== 'string' || !stroke.d.trim()) {
            socket.emit('scribble:error', { message: 'Invalid live scribble stroke' });
            return;
        }

        const partnerSocketId = getLivePartnerSocketId(socket);
        if (!partnerId || !partnerSocketId) {
            emitLiveUnavailable(socket);
            return;
        }

        const now = new Date();
        const savedStroke = {
            id: stroke.id,
            d: stroke.d,
            color: stroke.color,
            strokeWidth: stroke.strokeWidth,
            fromUserId: userId,
            fromUserName: userName,
            createdAt: now,
        };

        const nextPaths = Array.isArray(livePaths) && livePaths.length > 0
            ? livePaths
            : null;
        const coupleUpdate = {
            $set: {
                'liveScribble.updatedByUserId': userId,
                'liveScribble.updatedByUserName': userName,
                'liveScribble.updatedAt': now,
                'liveScribble.canvasWidth': dimensions.canvasWidth,
                'liveScribble.canvasHeight': dimensions.canvasHeight,
            },
        };

        if (nextPaths) {
            coupleUpdate.$set['liveScribble.paths'] = nextPaths;
        } else {
            coupleUpdate.$push = { 'liveScribble.paths': savedStroke };
        }

        const couple = await Couple.findOneAndUpdate(getCoupleFilter(userId, partnerId), coupleUpdate, {
            new: true,
        });

        const paths = nextPaths || couple?.liveScribble?.paths || [savedStroke];
        io.to(partnerSocketId).emit('scribble:liveStrokeReceived', {
            stroke: savedStroke,
            fromUserId: userId,
            fromUserName: userName,
            ...dimensions,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            strokeId: savedStroke.id,
            fromUserId: userId,
            fromUserName: userName,
            paths,
            ...dimensions,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('Live scribble stroke error:', error);
        socket.emit('scribble:error', { message: 'Failed to save live scribble stroke' });
    }
};

export const handleScribbleLiveClear = async (socket, io, data = {}) => {
    try {
        const { userId, partnerId, userName } = socket;
        const dimensions = getScribbleDimensions(data);

        const partnerSocketId = getLivePartnerSocketId(socket);
        if (!partnerId || !partnerSocketId) {
            emitLiveUnavailable(socket);
            return;
        }

        const now = new Date();
        await Couple.findOneAndUpdate(getCoupleFilter(userId, partnerId), {
            $set: {
                'liveScribble.paths': [],
                'liveScribble.updatedByUserId': userId,
                'liveScribble.updatedByUserName': userName,
                'liveScribble.updatedAt': now,
                'liveScribble.canvasWidth': dimensions.canvasWidth,
                'liveScribble.canvasHeight': dimensions.canvasHeight,
            },
        });

        io.to(partnerSocketId).emit('scribble:liveCleared', {
            fromUserId: userId,
            fromUserName: userName,
            ...dimensions,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            fromUserId: userId,
            fromUserName: userName,
            paths: [],
            ...dimensions,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('Live scribble clear error:', error);
        socket.emit('scribble:error', { message: 'Failed to clear live scribble' });
    }
};

export const handleScribbleLiveUndo = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { strokeId, paths: livePaths } = data || {};
        const dimensions = getScribbleDimensions(data);

        if (!strokeId) {
            socket.emit('scribble:error', { message: 'Invalid live scribble undo' });
            return;
        }

        const partnerSocketId = getLivePartnerSocketId(socket);
        if (!partnerId || !partnerSocketId) {
            emitLiveUnavailable(socket);
            return;
        }

        const now = new Date();
        const nextPaths = Array.isArray(livePaths) ? livePaths : null;
        const coupleUpdate = {
            $set: {
                'liveScribble.updatedByUserId': userId,
                'liveScribble.updatedByUserName': userName,
                'liveScribble.updatedAt': now,
                'liveScribble.canvasWidth': dimensions.canvasWidth,
                'liveScribble.canvasHeight': dimensions.canvasHeight,
            },
        };

        if (nextPaths) {
            coupleUpdate.$set['liveScribble.paths'] = nextPaths;
        } else {
            coupleUpdate.$pull = {
                'liveScribble.paths': {
                    id: strokeId,
                    fromUserId: userId,
                },
            };
        }

        const couple = await Couple.findOneAndUpdate(getCoupleFilter(userId, partnerId), coupleUpdate, {
            new: true,
        });

        const paths = nextPaths || couple?.liveScribble?.paths || [];
        io.to(partnerSocketId).emit('scribble:liveUndone', {
            strokeId,
            fromUserId: userId,
            fromUserName: userName,
            ...dimensions,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            strokeId,
            fromUserId: userId,
            fromUserName: userName,
            paths,
            ...dimensions,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('Live scribble undo error:', error);
        socket.emit('scribble:error', { message: 'Failed to undo live scribble stroke' });
    }
};

export default {
    handleScribbleSend,
    handleScribbleRequest,
    handleScribbleLiveStart,
    handleScribbleLiveEnd,
    handleScribbleLiveStrokeEnd,
    handleScribbleLiveClear,
    handleScribbleLiveUndo,
    handleScribbleFreeLimitReached,
    handleScribbleDisconnect,
};
