import User from '../../models/User.js';
import MoodLog from '../../models/MoodLog.js';
import { getCoupleRoomId } from '../auth.js';
import { sendMoodNotification } from '../../utils/pushNotification.js';

const MOOD_HISTORY_DAYS = 31;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const getClientLocalTimestamp = (date, timezoneOffsetMinutes) => {
    if (!Number.isFinite(timezoneOffsetMinutes)) {
        return null;
    }

    const localTime = new Date(date.getTime() - timezoneOffsetMinutes * 60 * 1000);
    return localTime.toISOString().replace('Z', '');
};

const normalizeMoodForClient = (moodLog) => ({
    id: moodLog.mood.id,
    emoji: moodLog.mood.emoji,
    label: moodLog.mood.label,
    updatedAt: moodLog.updatedAt,
    timezone: moodLog.timezone,
    timezoneOffsetMinutes: moodLog.timezoneOffsetMinutes,
    localUpdatedAt: getClientLocalTimestamp(moodLog.updatedAt, moodLog.timezoneOffsetMinutes),
});

/**
 * Handle mood update event
 * Saves mood to database and broadcasts to partner
 */
export const handleMoodUpdate = async (socket, io, data) => {
    try {
        const { userId, partnerId, userName } = socket;
        const { id, emoji, label, timezone, timezoneOffsetMinutes } = data;

        if (!emoji || !label) {
            socket.emit('mood:error', { message: 'Emoji and label are required' });
            return;
        }

        const updatedAt = new Date();
        const mood = {
            id: id || 'relaxed',
            emoji,
            label,
            updatedAt,
            timezone: timezone || null,
            timezoneOffsetMinutes: Number.isFinite(timezoneOffsetMinutes) ? timezoneOffsetMinutes : null,
        };

        // Save mood to database
        const updatedUser = await User.findByIdAndUpdate(
            userId,
            {
                currentMood: mood,
            },
            { new: true }
        );

        const moodLog = await MoodLog.create({
            userId,
            partnerId: partnerId || null,
            mood: {
                id: mood.id,
                emoji: mood.emoji,
                label: mood.label,
            },
            timezone: mood.timezone,
            timezoneOffsetMinutes: mood.timezoneOffsetMinutes,
            updatedAt,
        });

        // Confirm to sender
        socket.emit('mood:myMood', {
            success: true,
            mood: updatedUser.currentMood,
        });
        socket.emit('mood:historyItemAdded', {
            mood: normalizeMoodForClient(moodLog),
        });

        // Send push notification to partner
        if (partnerId) {
            sendMoodNotification(partnerId, userName, { emoji, label });
        }

        // Broadcast to partner via couple room
        const roomId = getCoupleRoomId(userId, partnerId);
        if (roomId) {
            socket.to(roomId).emit('mood:changed', {
                userId,
                userName: socket.userName,
                mood,
            });
            socket.to(roomId).emit('mood:partnerHistoryItemAdded', {
                mood: normalizeMoodForClient(moodLog),
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


        const hasUpdated = partner.currentMood && partner.currentMood.updatedAt;
        socket.emit('mood:partnerMood', {
            mood: hasUpdated ? partner.currentMood : null,
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

        const hasUpdated = user.currentMood && user.currentMood.updatedAt;
        socket.emit('mood:myMood', {
            mood: hasUpdated ? user.currentMood : null,
        });

    } catch (error) {
        console.error('Get my mood error:', error);
        socket.emit('mood:error', { message: 'Failed to get mood' });
    }
};

/**
 * Handle request for user's mood history for the last month
 */
export const handleGetMoodHistory = async (socket, io, data = {}) => {
    try {
        const { userId } = socket;
        const days = Math.min(Math.max(Number(data.days) || MOOD_HISTORY_DAYS, 1), 40);
        const since = new Date(Date.now() - days * MS_PER_DAY);

        const history = await MoodLog.find({
            userId,
            updatedAt: { $gte: since },
        })
            .sort({ updatedAt: -1 })
            .lean();

        socket.emit('mood:history', {
            days,
            history: history.map(normalizeMoodForClient),
        });

    } catch (error) {
        console.error('Get mood history error:', error);
        socket.emit('mood:error', { message: 'Failed to get mood history' });
    }
};

/**
 * Handle request for partner's mood history for the last month
 */
export const handleGetPartnerMoodHistory = async (socket, io, data = {}) => {
    try {
        const { partnerId } = socket;

        if (!partnerId) {
            socket.emit('mood:partnerHistory', { days: 0, history: [], message: 'No partner' });
            return;
        }

        const days = Math.min(Math.max(Number(data.days) || MOOD_HISTORY_DAYS, 1), 40);
        const since = new Date(Date.now() - days * MS_PER_DAY);

        const history = await MoodLog.find({
            userId: partnerId,
            updatedAt: { $gte: since },
        })
            .sort({ updatedAt: -1 })
            .lean();

        socket.emit('mood:partnerHistory', {
            days,
            history: history.map(normalizeMoodForClient),
        });

    } catch (error) {
        console.error('Get partner mood history error:', error);
        socket.emit('mood:error', { message: 'Failed to get partner mood history' });
    }
};

export default {
    handleMoodUpdate,
    handleMoodRequest,
    handleGetMyMood,
    handleGetMoodHistory,
    handleGetPartnerMoodHistory,
};
