import User from '../../models/User.js';
import { isUserOnline, getCoupleRoomId } from '../auth.js';
import { sendPushNotification } from '../../utils/pushNotification.js';

/**
 * Handle request for partner's online status
 */
export const handlePresenceRequest = async (socket, io) => {
    try {
        const { partnerId } = socket;

        if (!partnerId) {
            socket.emit('presence:status', {
                isOnline: false,
                message: 'No partner'
            });
            return;
        }

        // Check if partner is connected
        const partnerOnline = isUserOnline(partnerId);

        // Get last seen from database
        const partner = await User.findById(partnerId).select('lastSeen name');

        socket.emit('presence:status', {
            partnerId,
            partnerName: partner?.name,
            isOnline: partnerOnline,
            lastSeen: partner?.lastSeen?.toISOString() || null,
        });

    } catch (error) {
        console.error('Presence request error:', error);
        socket.emit('presence:error', { message: 'Failed to get presence' });
    }
};

/**
 * Handle nudge/ping to partner
 */
export const handleNudge = async (socket, io, data) => {
    try {
        const { partnerId, userName } = socket;
        const { type = 'default' } = data;

        if (!partnerId) {
            socket.emit('nudge:error', { message: 'No partner to nudge' });
            return;
        }


        // Emit to couple room
        const roomId = getCoupleRoomId(socket.userId, partnerId);
        socket.to(roomId).emit('nudge:received', {
            from: socket.userId,
            fromName: userName,
            type,
            timestamp: new Date().toISOString(),
        });

        socket.emit('nudge:sent', { success: true });

        // Word Search nudges must also reach a partner whose socket is offline.
        if (type === 'wordsearch') {
            void sendPushNotification(
                partnerId,
                '🔎 Ready for Word Search?',
                `${userName || 'Your partner'} wants to play with you.`,
                { type: 'wordsearch' },
            ).catch(() => {});
        }

    } catch (error) {
        console.error('Nudge error:', error);
        socket.emit('nudge:error', { message: 'Failed to send nudge' });
    }
};

export default {
    handlePresenceRequest,
    handleNudge,
};
