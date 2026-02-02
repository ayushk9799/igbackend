import User from '../../models/User.js';
import { getCoupleRoomId } from '../auth.js';

/**
 * Handle mood update event
 * Saves mood to database and broadcasts to partner
 */
export const handleMoodUpdate = async (socket, io, data) => {
    try {
        const { userId, partnerId } = socket;
        const { emoji, label } = data;

        if (!emoji || !label) {
            socket.emit('mood:error', { message: 'Emoji and label are required' });
            return;
        }


        // Save mood to database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                currentMood: {
                    emoji,
                    label,
                    updatedAt: new Date(),
                },
            },
            { new: true }
        );

        // Confirm to sender
        // socket.emit('mood:updated', {
        //     success: true,
        //     mood: updatedUser.currentMood,
        // });

        // Broadcast to partner via couple room
        const roomId = getCoupleRoomId(userId, partnerId);
        if (roomId) {
            socket.to(roomId).emit('mood:changed', {
                userId,
                userName: socket.userName,
                mood: {
                    emoji,
                    label,
                    updatedAt: new Date().toISOString(),
                },
            });
        }

    } catch (error) {
        console.error('Mood update error:', error);
        socket.emit('mood:error', { message: 'Failed to update mood' });
    }
};

/**
 * Handle request for partner's current mood
 */
export const handleMoodRequest = async (socket, io) => {
    try {
        const { partnerId } = socket;

        if (!partnerId) {
            socket.emit('mood:partnerMood', { mood: null, message: 'No partner' });
            return;
        }

        const partner = await User.findById(partnerId);
        if (!partner) {
            socket.emit('mood:partnerMood', { mood: null, message: 'Partner not found' });
            return;
        }


        socket.emit('mood:partnerMood', {
            mood: partner.currentMood,
            isOnline: partner.isOnline,
            lastSeen: partner.lastSeen,
        });

    } catch (error) {
        console.error('Get partner mood error:', error);
        socket.emit('mood:error', { message: 'Failed to get partner mood' });
    }
};

/**
 * Handle request for user's own current mood
 */
export const handleGetMyMood = async (socket, io) => {
    try {
        const { userId } = socket;

        const user = await User.findById(userId);
        if (!user) {
            socket.emit('mood:myMood', { mood: null, message: 'User not found' });
            return;
        }


        socket.emit('mood:myMood', {
            mood: user.currentMood,
        });

    } catch (error) {
        console.error('Get my mood error:', error);
        socket.emit('mood:error', { message: 'Failed to get mood' });
    }
};

export default {
    handleMoodUpdate,
    handleMoodRequest,
    handleGetMyMood,
};
