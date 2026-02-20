import User from '../models/User.js';

// Track connected users in memory
// Format: { userId: { socketId, partnerId, userId } }
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


    // Track this user's connection
    connectedUsers.set(userId, {
        socketId: socket.id,
        partnerId,
        userId,
    });

    // Update user's online status in database
    await User.findByIdAndUpdate(userId, {
        isOnline: true,
        lastSeen: new Date(),
    });

    // Join couple room if user has a partner
    const roomId = getCoupleRoomId(userId, partnerId);
    if (roomId) {
        socket.join(roomId);

        // Notify partner that this user is now online
        socket.to(roomId).emit('presence:online', {
            userId,
            userName,
            timestamp: new Date().toISOString(),
        });
    }

    // Handle disconnection
    socket.on('disconnect', async (reason) => {

        // Remove from connected users
        connectedUsers.delete(userId);

        // Update database
        await User.findByIdAndUpdate(userId, {
            isOnline: false,
            lastSeen: new Date(),
        });

        // Notify partner
        if (roomId) {
            socket.to(roomId).emit('presence:offline', {
                userId,
                lastSeen: new Date().toISOString(),
            });
        }
    });
};

/**
 * Check if a user is currently online
 */
export const isUserOnline = (userId) => {
    return connectedUsers.has(userId);
};

/**
 * Update the partner ID for an active socket connection
 * Called when users pair or unpair via REST API
 */
export const updateSocketPartnerStatus = async (userId, partnerId) => {
    const userData = connectedUsers.get(userId);
    if (userData) {
        // Update the tracked data in memory
        userData.partnerId = partnerId ? partnerId.toString() : null;
        connectedUsers.set(userId, userData);

        // Find the active socket and update its property directly
        const io = (await import('./index.js')).getIO();
        if (io) {
            const socketId = userData.socketId;
            const socket = io.sockets.sockets.get(socketId);
            if (socket) {
                socket.partnerId = userData.partnerId;
            }
        }
    }
};

/**
 * Get socket ID for a user (to send direct messages)
 */
export const getSocketId = (userId) => {
    const user = connectedUsers.get(userId);
    return user?.socketId || null;
};

export default {
    socketAuth,
    getCoupleRoomId,
    handleConnection,
    isUserOnline,
    getSocketId,
    connectedUsers,
};
