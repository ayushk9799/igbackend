/**
 * Push Notification Utility
 * Send push notifications via Firebase Cloud Messaging
 */
import admin from 'firebase-admin';
import User from '../models/User.js';

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
 * Send a visible push notification with scribble data
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who sent scribble
 * @param {Array} paths - Scribble path data
 */
export const sendScribbleNotification = async (userId, senderName, paths) => {
    try {
        const user = await User.findById(userId);
        if (!user?.fcmToken) {
            return false;
        }



        const message = {
            token: user.fcmToken,
            notification: {
                title: '❤️ New Scribble!',
                body: `${senderName} sent you a doodle 💕`,
            },
            data: {
                type: 'scribble',
                senderName: senderName || 'Your Love',
                paths: JSON.stringify(paths),
                timestamp: new Date().toISOString(),
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
 * Send a push notification for a new puzzle
 * @param {string} userId - Target user's ID
 * @param {string} senderName - Name of person who sent the puzzle
 */
export const sendPuzzleNotification = async (userId, senderName) => {
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

        const message = {
            token: user.fcmToken,
            notification: {
                title: '✨ Partner Mood Update',
                body: `${senderName} is feeling ${mood.emoji} ${mood.label}`,
            },
            data: {
                type: 'mood_update',
                senderName: senderName || 'Your Love',
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
};
