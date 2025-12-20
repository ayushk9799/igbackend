import User from '../../models/User.js';
import { getCoupleRoomId } from '../auth.js';
import { sendScribbleNotification } from '../../utils/pushNotification.js';

/**
 * Handle scribble send event
 * Saves scribble to partner's DB record and broadcasts via socket
 */
export const handleScribbleSend = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { paths } = data;

        if (!paths || !Array.isArray(paths) || paths.length === 0) {
            socket.emit('scribble:error', { message: 'Invalid scribble data' });
            return;
        }

        console.log(`✏️ Scribble from ${userName}: ${paths.length} paths`);

        // Save scribble to partner's record (for offline delivery)
        if (partnerId) {
            await User.findByIdAndUpdate(partnerId, {
                lastScribble: {
                    paths,
                    fromUserId: userId,
                    fromUserName: userName,
                    receivedAt: new Date(),
                },
            });
            console.log(`💾 Scribble saved to partner's record`);

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
                timestamp: new Date().toISOString(),
            });
            console.log(`📤 Scribble sent to room: ${roomId}`);

            // Confirm to sender
            socket.emit('scribble:sent', {
                success: true,
                message: 'Scribble sent to partner!',
            });
        } else {
            // Partner offline, but scribble is saved - still success
            socket.emit('scribble:sent', {
                success: true,
                message: 'Scribble saved! Partner will see it when they come online.',
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

        // Get the user's own lastScribble (sent BY their partner TO them)
        const user = await User.findById(userId);

        if (!user || !user.lastScribble || !user.lastScribble.paths || user.lastScribble.paths.length === 0) {
            socket.emit('scribble:partnerScribble', {
                hasScribble: false,
                paths: null
            });
            return;
        }

        console.log(`📤 Sending partner scribble to ${socket.userName}:`, user.lastScribble.paths.length, 'paths');

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

export default {
    handleScribbleSend,
    handleScribbleRequest,
};
