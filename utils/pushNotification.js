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
    console.log('✅ Firebase Admin initialized');
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
            console.log('⚠️ No FCM token for user:', userId);
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
        console.log('📤 Silent push sent:', response);
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
            console.log('⚠️ No FCM token for user:', userId);
            return false;
        }

        console.log('📱 Sending notification to user:', userId);
        console.log('📱 FCM Token:', user.fcmToken.slice(0, 40) + '...');
        console.log('📱 Token type:', user.fcmToken.includes(':') ? 'Android' : 'iOS (APNs)');

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
        console.log('📤 Scribble push sent:', response);
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
};
