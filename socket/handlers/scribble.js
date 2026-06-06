import User from '../../models/User.js';
import Couple from '../../models/Couple.js';
import { getCoupleRoomId, getSocketId } from '../auth.js';
import { sendScribbleNotification } from '../../utils/pushNotification.js';

/**
 * Handle scribble send event
 * Saves scribble to partner's DB record and broadcasts via socket
 */
export const handleScribbleSend = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { paths } = data;
        const now = new Date();

        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            socket.emit('scribble:error', { message: 'Invalid scribble data' });
            return;
        }

        // Save the shared scribble board for both users.
        if (partnerId) {
            await saveScribbleForUsers([userId, partnerId], userId, userName, paths, now);

            // Send push notification to partner (for widget update when app killed)
            sendScribbleNotification(partnerId, userName, paths);
        }

        // Broadcast to partner via couple room (if online)
        const roomId = getCoupleRoomId(userId, partnerId);
        if (roomId) {
            socket.to(roomId).emit('scribble:received', {
                fromUserId: userId,
                fromUserName: userName,
                paths,
                timestamp: now.toISOString(),
            });

            // Confirm to sender
            socket.emit('scribble:sent', {
                success: true,
                message: 'Scribble sent to partner!',
                fromUserId: userId,
                fromUserName: userName,
                paths,
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

        // Get the user's saved shared scribble board.
        const user = await User.findById(userId);

        if (!user || !user.lastScribble || !user.lastScribble.paths || user.lastScribble.paths.length === 0) {
            socket.emit('scribble:partnerScribble', {
                hasScribble: false,
                paths: null
            });
            return;
        }


        socket.emit('scribble:partnerScribble', {
            hasScribble: true,
            paths: user.lastScribble.paths,
            fromUserId: user.lastScribble.fromUserId,
            fromUserName: user.lastScribble.fromUserName,
            timestamp: user.lastScribble.receivedAt?.toISOString(),
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
    });
};

const getLivePartnerSocketId = (socket) => {
    if (!socket.partnerId) return null;
    return getSocketId(socket.partnerId);
};

const saveScribbleForUsers = async (userIds, fromUserId, fromUserName, paths, receivedAt) => {
    await User.updateMany({ _id: { $in: userIds } }, {
        lastScribble: {
            paths,
            fromUserId,
            fromUserName,
            receivedAt,
        },
    });
};

export const handleScribbleLiveStart = (socket) => {
    socket.emit('scribble:liveStatus', {
        isLive: true,
        partnerAvailable: Boolean(socket.partnerId && getSocketId(socket.partnerId)),
    });
};

export const handleScribbleLiveEnd = (socket) => {
    socket.emit('scribble:liveStatus', {
        isLive: false,
        partnerAvailable: Boolean(socket.partnerId && getSocketId(socket.partnerId)),
    });
};

export const handleScribbleLiveStrokeEnd = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { stroke, paths: livePaths } = data || {};

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
        await saveScribbleForUsers([userId, partnerId], userId, userName, paths, now);

        io.to(partnerSocketId).emit('scribble:liveStrokeReceived', {
            stroke: savedStroke,
            fromUserId: userId,
            fromUserName: userName,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            strokeId: savedStroke.id,
            fromUserId: userId,
            fromUserName: userName,
            paths,
            timestamp: now.toISOString(),
        });
    } catch (error) {
        console.error('Live scribble stroke error:', error);
        socket.emit('scribble:error', { message: 'Failed to save live scribble stroke' });
    }
};

export const handleScribbleLiveClear = async (socket, io) => {
    try {
        const { userId, partnerId, userName } = socket;

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
            },
        });

        await saveScribbleForUsers([userId, partnerId], userId, userName, [], now);

        io.to(partnerSocketId).emit('scribble:liveCleared', {
            fromUserId: userId,
            fromUserName: userName,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            fromUserId: userId,
            fromUserName: userName,
            paths: [],
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
        await saveScribbleForUsers([userId, partnerId], userId, userName, paths, now);

        io.to(partnerSocketId).emit('scribble:liveUndone', {
            strokeId,
            fromUserId: userId,
            fromUserName: userName,
            timestamp: now.toISOString(),
        });

        socket.emit('scribble:liveSaved', {
            success: true,
            strokeId,
            fromUserId: userId,
            fromUserName: userName,
            paths,
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
};
