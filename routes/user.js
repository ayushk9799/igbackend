import express from 'express';
import User from '../models/User.js';

const router = express.Router();

/**
 * PUT /api/user/profile
 * Update user profile (name, age, gender)
 */
router.put('/profile', async (req, res) => {
    try {
        const { userId, name, age, gender } = req.body;

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

        await user.save();

        res.json({
            success: true,
            user: {
                id: user._id,
                email: user.email,
                name: user.name,
                age: user.age,
                gender: user.gender,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
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
                age: user.age,
                gender: user.gender,
                partnerId: user.partnerId,
                partnerUsername: user.partnerUsername,
                connectionDate: user.connectionDate,
                partnerCode: user.partnerCode,
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
        console.log(`📱 FCM token registered for user: ${userId}`);

        res.json({ success: true, message: 'FCM token registered' });

    } catch (error) {
        console.error('FCM token registration error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to register FCM token'
        });
    }
});

export default router;
