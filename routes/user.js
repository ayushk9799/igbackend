import express from 'express';
import User from '../models/User.js';

const router = express.Router();

/**
 * PUT /api/user/profile
 * Update user profile (name, age, gender)
 */
router.put('/profile', async (req, res) => {
    try {
        const { userId, name, age, gender, avatar } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Update fields if provided
        if (name !== undefined) user.name = name.trim();
        if (age !== undefined) user.age = parseInt(age, 10);
        if (gender !== undefined && ['male', 'female', 'other'].includes(gender)) {
            user.gender = gender;
        }
        if (avatar !== undefined) user.avatar = avatar;
        if (req.body.nickname !== undefined) user.nickname = req.body.nickname.trim();

        await user.save();

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                nickname: user.nickname,
                avatar: user.avatar,
                age: user.age,
                gender: user.gender,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
                isPremium: user.isPremium,
                premiumExpiresAt: user.premiumExpiresAt,
                premiumPlan: user.premiumPlan,
            }
        });

    } catch (error) {
        console.error('Profile update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update profile'
        });
    }
});

/**
 * PUT /api/user/premium
 * Update user premium status
 */
router.put('/premium', async (req, res) => {
    try {
        const { userId, isPremium, premiumExpiresAt, premiumPlan } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Update premium fields
        if (isPremium !== undefined) user.isPremium = isPremium;
        if (premiumExpiresAt !== undefined) user.premiumExpiresAt = premiumExpiresAt;
        if (premiumPlan !== undefined) user.premiumPlan = premiumPlan;

        await user.save();

        res.json({
            success: true,
            user: {
                id: user._id,
                isPremium: user.isPremium,
                premiumExpiresAt: user.premiumExpiresAt,
                premiumPlan: user.premiumPlan,
            }
        });

    } catch (error) {
        console.error('Premium update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update premium status'
        });
    }
});

/**
 * GET /api/user/:userId
 * Get user profile
 */
router.get('/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                nickname: user.nickname,
                avatar: user.avatar,
                age: user.age,
                gender: user.gender,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
                isPremium: user.isPremium,
                premiumExpiresAt: user.premiumExpiresAt,
                premiumPlan: user.premiumPlan,
            }
        });

    } catch (error) {
        console.error('Get user error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get user'
        });
    }
});

/**
 * POST /api/user/fcm-token
 * Register FCM token for push notifications
 */
router.post('/fcm-token', async (req, res) => {
    try {
        const { userId, fcmToken } = req.body;

        if (!userId || !fcmToken) {
            return res.status(400).json({
                success: false,
                error: 'userId and fcmToken are required'
            });
        }

        await User.findByIdAndUpdate(userId, { fcmToken });

        res.json({ success: true, message: 'FCM token registered' });

    } catch (error) {
        console.error('FCM token registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register FCM token'
        });
    }
});

/**
 * POST /api/user/test-notification
 * Send a test push notification to a user
 */
router.post('/test-notification', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const { sendPushNotification } = await import('../utils/pushNotification.js');

        const success = await sendPushNotification(
            userId,
            '🔔 Test Notification',
            'This is a test notification from the backend to verify the setup! 🚀',
            { type: 'test_verification' }
        );

        if (success) {
            res.json({ success: true, message: 'Test notification sent successfully' });
        } else {
            res.status(500).json({ success: false, error: 'Failed to send notification (check logs for details)' });
        }

    } catch (error) {
        console.error('Test notification error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to send test notification'
        });
    }
});

/**
 * DELETE /api/user/delete-account
 * Permanently delete a user account and unlink partner
 */
router.delete('/delete-account', async (req, res) => {
    try {
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // If user has a partner, unlink them
        if (user.partnerId) {
            await User.findByIdAndUpdate(user.partnerId, {
                $unset: {
                    partnerId: 1,
                    partnerUsername: 1,
                    connectionDate: 1
                }
            });
        }

        // Delete the user
        await User.findByIdAndDelete(userId);

        res.json({
            success: true,
            message: 'Account deleted successfully'
        });

    } catch (error) {
        console.error('Delete account error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete account'
        });
    }
});

export default router;
