/**
 * Push Notification Utility
 * Send push notifications via Firebase Cloud Messaging
 */
import admin from 'firebase-admin';
import User from '../models/User.js';
import {
    getLegacyScribbleData,
    isFcmMessageTooLargeError,
} from './scribbleNotificationCompatibility.js';

// Import service account key using ESM JSON import
import serviceAccount from '../serviceAccountKey.json' with { type: 'json' };

// Initialize Firebase Admin SDK
try {
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error('❌ Firebase initialization error:', error.message);
}

/**
 * Send a silent push notification to trigger widget update
 * @param {string} userId - Target user's ID
 * @param {object} data - Data payload to include
 */
export const sendSilentPush = async (userId, data = {}) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        const message = {
            token: user.fcmToken,
            data: {
                type: 'scribble_update',
                ...Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ),
            },
            apns: {
                headers: {
                    'apns-push-type': 'background',
                    'apns-priority': '5',
                },
                payload: {
                    aps: {
                        'content-available': 1,
                        'mutable-content': 1,
                    },
                },
            },
            android: {
                priority: 'high',
            },
        };

        const response = await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

/**
 * Send a visible push notification with a signed current-canvas URL.
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who sent scribble
 * @param {Object} scribble - Current-canvas access metadata
 */
export const sendScribbleNotification = async (userId, senderName, scribble = {}) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        let scribbleUrl = null;
        if (
            scribble.apiBaseUrl
            && scribble.coupleId
            && scribble.recipientId
            && scribble.signature
        ) {
            const url = new URL(
                `/api/scribbles/current/${encodeURIComponent(scribble.coupleId)}/widget`,
                `${scribble.apiBaseUrl.replace(/\/$/, '')}/`
            );
            url.searchParams.set('recipient', scribble.recipientId);
            url.searchParams.set('signature', scribble.signature);
            scribbleUrl = url.toString();
        }

        const timestamp = scribble.timestamp instanceof Date
            ? scribble.timestamp
            : new Date(scribble.timestamp || Date.now());
        const legacyData = getLegacyScribbleData(user, scribble);
        const message = {
            token: user.fcmToken,
            notification: {
                title: '❤️ New Scribble!',
                body: `${senderName} sent you a doodle 💕`,
            },
            data: {
                type: 'scribble',
                senderName: senderName || 'Your Love',
                timestamp: timestamp.toISOString(),
                ...(scribbleUrl ? { scribbleUrl } : {}),
                ...(scribble.coupleId ? { coupleId: String(scribble.coupleId) } : {}),
                ...(scribble.canvasRevision ? { canvasRevision: String(scribble.canvasRevision) } : {}),
                ...(legacyData || {}),
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        'mutable-content': 1,
                        sound: 'default',
                    },
                },
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'partner-updates',
                },
            },
        };

        try {
            await admin.messaging().send(message);
        } catch (error) {
            if (!legacyData || !isFcmMessageTooLargeError(error)) {
                throw error;
            }

            // The conservative check should normally prevent this. If Firebase
            // still rejects the complete message, retry once without legacy
            // paths so the visible notification and new extension still work.
            delete message.data.paths;
            delete message.data.canvasWidth;
            delete message.data.canvasHeight;
            await admin.messaging().send(message);
        }
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

/**
 * Send a push notification for a new puzzle
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who sent the puzzle
 * @param {string|null} puzzleId - Puzzle ID for notification routing
 */
export const sendPuzzleNotification = async (userId, senderName, puzzleId = null) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        const message = {
            token: user.fcmToken,
            notification: {
                title: '🧩 New Puzzle!',
                body: `${senderName} sent you a puzzle to solve! 💕`,
            },
            data: {
                type: 'puzzle',
                ...(puzzleId ? { puzzleId: String(puzzleId) } : {}),
                senderName: senderName || 'Your Love',
                timestamp: new Date().toISOString(),
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        sound: 'default',
                    },
                },
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'partner-updates',
                },
            },
        };

        const response = await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

/**
 * Send a push notification for a mood update
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who updated their mood
 * @param {object} mood - Mood data {emoji, label}
 */
export const sendMoodNotification = async (userId, senderName, mood) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        const displayName = senderName || 'Your partner';
        const moodLabel = mood.label ? String(mood.label).trim().toLowerCase() : 'in a new mood';
        const message = {
            token: user.fcmToken,
            notification: {
                title: '✨ Partner Mood Update',
                body: `${displayName} is ${moodLabel}`,
            },
            data: {
                type: 'mood_update',
                senderName: displayName,
                emoji: mood.emoji,
                label: mood.label,
                timestamp: new Date().toISOString(),
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        sound: 'default',
                    },
                },
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                },
            },
        };

        await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

/**
 * Send a push notification for a new timeline memory or special date.
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who added the entry
 * @param {object} memory - Memory/timeline entry data
 */
export const sendMemoryNotification = async (userId, senderName, memory = {}) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        const displayName = senderName || 'Your partner';
        const capturedDate = memory?.capturedAt ? new Date(memory.capturedAt) : null;
        const displayDate = capturedDate && !Number.isNaN(capturedDate.getTime())
            ? capturedDate.toLocaleDateString('en-US', {
                month: 'short',
                day: 'numeric',
                year: 'numeric',
                timeZone: 'UTC',
            })
            : 'this date';
        const entryTitle = String(memory?.title || '').trim();
        const entryLabel = memory?.entryType === 'special_date' ? 'special date' : 'memory';
        const message = {
            token: user.fcmToken,
            notification: {
                title: `💕 ${displayName} added to your timeline`,
                body: entryTitle
                    ? `${entryTitle} • ${displayDate}`
                    : `A new ${entryLabel} was added for ${displayDate}`,
            },
            data: {
                type: 'memory',
                tab: 'memories',
                memoryId: memory?._id ? String(memory._id) : '',
                entryType: memory?.entryType ? String(memory.entryType) : 'memory',
                capturedAt: memory?.capturedAt ? new Date(memory.capturedAt).toISOString() : '',
                senderName: displayName,
                timestamp: new Date().toISOString(),
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        sound: 'default',
                    },
                },
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'partner-updates',
                },
            },
        };

        await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

/**
 * Send a generic push notification
 * @param {string} userId - Target user's ID
 * @param {string} title - Notification title
 * @param {string} body - Notification body
 * @param {object} data - Optional data payload
 */
export const sendPushNotification = async (userId, title, body, data = {}) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }

        const updatesNativeWidget = data.type === 'couple_photo';

        const message = {
            token: user.fcmToken,
            notification: {
                title,
                body,
            },
            data: {
                type: data.type || 'general',
                ...Object.fromEntries(
                    Object.entries(data).map(([k, v]) => [k, String(v)])
                ),
                timestamp: new Date().toISOString(),
            },
            apns: {
                headers: {
                    'apns-priority': '10',
                },
                payload: {
                    aps: {
                        ...(updatesNativeWidget ? {
                            'mutable-content': 1,
                            'content-available': 1,
                        } : {}),
                        sound: 'default',
                    },
                },
            },
            android: {
                priority: 'high',
                notification: {
                    sound: 'default',
                    channelId: 'partner-updates',
                },
            },
        };

        const response = await admin.messaging().send(message);
        return true;

    } catch (error) {
        console.error('❌ Push notification error:', error);
        return false;
    }
};

export { admin };

export default {
    sendSilentPush,
    sendScribbleNotification,
    sendPuzzleNotification,
    sendPushNotification,
    sendMoodNotification,
    sendMemoryNotification,
};
