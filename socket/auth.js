import User from '../models/User.js';

// Track every active socket for each user.
// A user may temporarily have multiple sockets during reconnects or may be
// signed in on more than one device. Presence changes only when the first
// socket connects or the last socket disconnects.
// Format: { userId: { socketIds: Set<string>, partnerId, userId } }
export const connectedUsers = new Map();

/**
 * Socket authentication middleware
 * Validates userId exists in database
 */
export const socketAuth = async (socket, next) => {
    try {
        const { userId } = socket.handshake.auth;

        if (!userId) {
            return next(new Error('Authentication error: userId required'));
        }

        // Verify user exists in database
        const user = await User.findById(userId);
        if (!user) {
            return next(new Error('Authentication error: User not found'));
        }

        // Attach user data to socket for later use
        socket.userId = userId;
        socket.partnerId = user.partnerId?.toString() || null;
        socket.userName = user.name;
        // socket.avatar = user.avatar; // Optional: add if needed by components

        next();
    } catch (error) {
        console.error('❌ Socket auth error:', error);
        next(new Error('Authentication error'));
    }
};

/**
 * Get the couple room ID for a user and their partner
 * Room ID is sorted to ensure both users join the same room
 */
export const getCoupleRoomId = (userId, partnerId) => {
    if (!partnerId) return null;
    const sorted = [userId, partnerId].sort();
    return `couple_${sorted[0]}_${sorted[1]}`;
};

/**
 * Handle user connection - join couple room and track presence
 */
export const handleConnection = async (socket, io) => {
    const { userId, partnerId, userName } = socket;
    const normalizedUserId = String(userId);

    const existingUser = connectedUsers.get(normalizedUserId);
    const wasOffline = !existingUser || existingUser.socketIds.size === 0;
    const socketIds = existingUser?.socketIds || new Set();
    socketIds.add(socket.id);
    connectedUsers.set(normalizedUserId, {
        socketIds,
        partnerId,
        userId: normalizedUserId,
    });

    // Join couple room if user has a partner
    const roomId = getCoupleRoomId(normalizedUserId, partnerId);
    if (roomId) {
        socket.join(roomId);

        // Notify the partner only for a real offline -> online transition.
        if (wasOffline) {
            socket.to(roomId).emit('presence:online', {
                userId: normalizedUserId,
                userName,
                timestamp: new Date().toISOString(),
            });
        }
    }

    // Register disconnect handling before any database await so a connection
    // that drops immediately cannot remain stuck in the active socket set.
    socket.on('disconnect', async (reason) => {
        const currentUser = connectedUsers.get(normalizedUserId);

        // Ignore a stale disconnect that no longer belongs to a tracked
        // connection. Most importantly, never remove another active socket.
        if (!currentUser?.socketIds?.has(socket.id)) {
            return;
        }

        currentUser.socketIds.delete(socket.id);
        if (currentUser.socketIds.size > 0) {
            connectedUsers.set(normalizedUserId, currentUser);
            return;
        }

        connectedUsers.delete(normalizedUserId);
        const lastSeen = new Date();

        await User.findByIdAndUpdate(normalizedUserId, {
            isOnline: false,
            lastSeen,
        });

        if (roomId) {
            io.to(roomId).emit('presence:offline', {
                userId: normalizedUserId,
                lastSeen: lastSeen.toISOString(),
            });
        }
    });

    // Keep the persisted status for last-seen/fallback purposes. Live presence
    // is determined by connectedUsers, not by this asynchronously written flag.
    await User.findByIdAndUpdate(normalizedUserId, {
        isOnline: true,
        lastSeen: new Date(),
    });

    // The socket may have disconnected while the database write was pending.
    // Correct the persisted flag if no connection for this user remains.
    if (!isUserOnline(normalizedUserId)) {
        await User.findByIdAndUpdate(normalizedUserId, {
            isOnline: false,
            lastSeen: new Date(),
        });
    }
};

/**
 * Check if a user is currently online
 */
export const isUserOnline = (userId) => {
    if (!userId) return false;
    const user = connectedUsers.get(String(userId));
    return Boolean(user?.socketIds?.size);
};

/**
 * Update the partner ID for an active socket connection
 * Called when users pair or unpair via REST API
 */
export const updateSocketPartnerStatus = async (userId, partnerId) => {
    const normalizedUserId = String(userId);
    const userData = connectedUsers.get(normalizedUserId);
    if (userData) {
        const previousPartnerId = userData.partnerId;
        const nextPartnerId = partnerId ? partnerId.toString() : null;

        // Update the tracked data in memory
        userData.partnerId = nextPartnerId;
        connectedUsers.set(normalizedUserId, userData);

        // Update every active socket for this user.
        const io = (await import('./index.js')).getIO();
        if (io) {
            for (const socketId of userData.socketIds) {
                const socket = io.sockets.sockets.get(socketId);
                if (socket) {
                    const previousRoomId = getCoupleRoomId(normalizedUserId, previousPartnerId);
                    const nextRoomId = getCoupleRoomId(normalizedUserId, nextPartnerId);
                    if (previousRoomId && previousRoomId !== nextRoomId) {
                        socket.leave(previousRoomId);
                    }
                    socket.partnerId = nextPartnerId;
                    if (nextRoomId) {
                        socket.join(nextRoomId);
                    }
                }
            }
        }
    }
};

/**
 * Get socket ID for a user (to send direct messages)
 */
export const getSocketId = (userId) => {
    if (!userId) return null;
    const user = connectedUsers.get(String(userId));
    return user?.socketIds?.values().next().value || null;
};

export default {
    socketAuth,
    getCoupleRoomId,
    handleConnection,
    isUserOnline,
    getSocketId,
    connectedUsers,
};
