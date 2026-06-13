import express from 'express';
import User from '../models/User.js';
import Couple from '../models/Couple.js';
import { getIO } from '../socket/index.js';
import { getCoupleRoomId } from '../socket/auth.js';

const router = express.Router();

const VALID_PLATFORMS = new Set(['ios', 'android', 'web']);
const TOGETHER_DISTANCE_KM = 0.1;

const normalizePlatform = (platform) => (
    typeof platform === 'string' && VALID_PLATFORMS.has(platform) ? platform : 'unknown'
);

const isValidCoordinate = (value, min, max) => (
    typeof value === 'number'
    && Number.isFinite(value)
    && value >= min
    && value <= max
);

const getInitial = (user) => {
    const source = user?.nickname || user?.name || user?.email || '?';
    return source.trim().charAt(0).toUpperCase() || '?';
};

const toRadians = (degrees) => degrees * (Math.PI / 180);

const calculateDistanceKm = (firstLocation, secondLocation) => {
    const earthRadiusKm = 6371;
    const deltaLatitude = toRadians(secondLocation.latitude - firstLocation.latitude);
    const deltaLongitude = toRadians(secondLocation.longitude - firstLocation.longitude);
    const firstLatitude = toRadians(firstLocation.latitude);
    const secondLatitude = toRadians(secondLocation.latitude);

    const a = Math.sin(deltaLatitude / 2) ** 2
        + Math.cos(firstLatitude) * Math.cos(secondLatitude) * Math.sin(deltaLongitude / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
};

const buildUserResponse = (user, relationshipStartDate = null, shouldAskRelationshipStartDate = false) => ({
    id: user._id,
    email: user.email,
    name: user.name,
    nickname: user.nickname,
    relationshipStartDate: relationshipStartDate || user.pendingRelationshipStartDate,
    pendingRelationshipStartDate: user.pendingRelationshipStartDate || null,
    shouldAskRelationshipStartDate,
    avatar: user.avatar,
    age: user.age,
    gender: user.gender,
    partnerId: user.partnerId,
    partnerUsername: user.partnerUsername,
    connectionDate: user.connectionDate,
    partnerCode: user.partnerCode,
    timezone: user.timezone,
    platform: user.platform,
    locationSharingEnabled: !!user.locationSharingEnabled,
    locationUpdatedAt: user.location?.updatedAt || null,
    isPremium: user.isPremium,
    premiumExpiresAt: user.premiumExpiresAt,
    premiumPlan: user.premiumPlan,
    locationSharingEnabled: user.locationSharingEnabled || false,
    locationUpdatedAt: user.locationUpdatedAt || null,
});

const getInitial = (...values) => {
    const value = values.find((item) => typeof item === 'string' && item.trim().length > 0);
    return value?.trim()?.charAt(0)?.toUpperCase() || '?';
};

const isValidCoordinate = (latitude, longitude) => (
    Number.isFinite(latitude)
    && Number.isFinite(longitude)
    && latitude >= -90
    && latitude <= 90
    && longitude >= -180
    && longitude <= 180
);

const calculateDistanceKm = (firstLocation, secondLocation) => {
    if (!firstLocation || !secondLocation) return null;

    const lat1 = Number(firstLocation.latitude);
    const lon1 = Number(firstLocation.longitude);
    const lat2 = Number(secondLocation.latitude);
    const lon2 = Number(secondLocation.longitude);

    if (!isValidCoordinate(lat1, lon1) || !isValidCoordinate(lat2, lon2)) {
        return null;
    }

    const toRadians = (degrees) => degrees * (Math.PI / 180);
    const earthRadiusKm = 6371;
    const dLat = toRadians(lat2 - lat1);
    const dLon = toRadians(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2
        + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return earthRadiusKm * c;
};

/**
 * PUT /api/user/profile
 * Update user profile (name, age, gender)
 */
router.put('/profile', async (req, res) => {
    try {
        const { userId, name, age, gender, avatar, relationshipStartDate } = req.body;

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
        let effectiveRelationshipStartDate = user.pendingRelationshipStartDate;
        let shouldAskRelationshipStartDate = false;

        if (relationshipStartDate !== undefined) {
            const parsedDate = new Date(relationshipStartDate);
            if (Number.isNaN(parsedDate.getTime())) {
                return res.status(400).json({
                    success: false,
                    error: 'relationshipStartDate must be a valid date'
                });
            }
            if (parsedDate > new Date()) {
                return res.status(400).json({
                    success: false,
                    error: 'relationshipStartDate cannot be in the future'
                });
            }
            const activeCouple = await Couple.findByPartner(user._id);
            if (activeCouple) {
                if (!activeCouple.relationshipStartDate) {
                    activeCouple.relationshipStartDate = parsedDate;
                    activeCouple.relationshipStartDatePromptUserId = undefined;
                    await activeCouple.save();
                }
                user.pendingRelationshipStartDate = undefined;
                effectiveRelationshipStartDate = activeCouple.relationshipStartDate;
                shouldAskRelationshipStartDate = false;

                const io = getIO();
                const roomId = user.partnerId ? getCoupleRoomId(user._id.toString(), user.partnerId.toString()) : null;
                if (io && roomId) {
                    io.to(roomId).emit('couple:relationshipStartDateUpdated', {
                        relationshipStartDate: activeCouple.relationshipStartDate,
                        shouldAskRelationshipStartDate: false,
                    });
                }
            } else {
                user.pendingRelationshipStartDate = parsedDate;
                effectiveRelationshipStartDate = user.pendingRelationshipStartDate;
            }
        }

        await user.save();

        res.json({
            success: true,
            user: buildUserResponse(user, effectiveRelationshipStartDate, shouldAskRelationshipStartDate),
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
 * PUT /api/user/device-info
 * Update user device metadata (timezone and platform)
 */
router.put('/device-info', async (req, res) => {
    try {
        const { userId, timezone, platform, appVersion, appBuildNumber } = req.body;

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

        user.platform = normalizePlatform(platform);
        if (typeof timezone === 'string' && timezone.trim()) {
            user.timezone = timezone.trim();
        }
        if (typeof appVersion === 'string' && appVersion.trim()) {
            user.appVersion = appVersion.trim();
        }
        if (appBuildNumber !== undefined) {
            const parsedBuildNumber = Number.parseInt(appBuildNumber, 10);
            if (Number.isFinite(parsedBuildNumber)) {
                user.appBuildNumber = parsedBuildNumber;
            }
        }
        user.deviceInfoUpdatedAt = new Date();

        await user.save();

        const activeCouple = await Couple.findByPartner(user._id);
        const shouldAskRelationshipStartDate = !!(
            activeCouple
            && !activeCouple.relationshipStartDate
            && activeCouple.relationshipStartDatePromptUserId?.toString() === user._id.toString()
        );

        res.json({
            success: true,
            user: buildUserResponse(user, activeCouple?.relationshipStartDate, shouldAskRelationshipStartDate),
        });

    } catch (error) {
        console.error('Device info update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update device info'
        });
    }
});

/**
 * PUT /api/user/location
 * Update the user's latest shared location for the distance widget.
 */
router.put('/location', async (req, res) => {
    try {
        const { userId, latitude, longitude, sharingEnabled = true } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        if (!isValidCoordinate(latitude, -90, 90) || !isValidCoordinate(longitude, -180, 180)) {
            return res.status(400).json({
                success: false,
                error: 'latitude and longitude must be valid coordinates'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        user.locationSharingEnabled = sharingEnabled !== false;
        user.location = {
            latitude,
            longitude,
            updatedAt: new Date(),
        };

        await user.save();

        res.json({
            success: true,
            user: buildUserResponse(user),
        });
    } catch (error) {
        console.error('Location update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update location'
        });
    }
});

/**
 * GET /api/user/distance/:userId
 * Return latest partner distance for the distance widget.
 */
router.get('/distance/:userId', async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (!user.partnerId) {
            return res.status(400).json({
                success: false,
                error: 'Partner not connected'
            });
        }

        const partner = await User.findById(user.partnerId);
        if (!partner) {
            return res.status(404).json({
                success: false,
                error: 'Partner not found'
            });
        }

        const userLocation = user.location;
        const partnerLocation = partner.location;
        const canCalculateDistance = !!(
            user.locationSharingEnabled
            && partner.locationSharingEnabled
            && userLocation?.updatedAt
            && partnerLocation?.updatedAt
            && isValidCoordinate(userLocation.latitude, -90, 90)
            && isValidCoordinate(userLocation.longitude, -180, 180)
            && isValidCoordinate(partnerLocation.latitude, -90, 90)
            && isValidCoordinate(partnerLocation.longitude, -180, 180)
        );

        if (!canCalculateDistance) {
            return res.json({
                success: true,
                data: {
                    distanceKm: null,
                    isTogether: false,
                    togetherThresholdKm: TOGETHER_DISTANCE_KM,
                    userInitial: getInitial(user),
                    partnerInitial: getInitial(partner),
                    userLocationUpdatedAt: userLocation?.updatedAt || null,
                    partnerLocationUpdatedAt: partnerLocation?.updatedAt || null,
                    sharingEnabled: !!user.locationSharingEnabled,
                    partnerSharingEnabled: !!partner.locationSharingEnabled,
                }
            });
        }

        const rawDistanceKm = calculateDistanceKm(userLocation, partnerLocation);
        const distanceKm = Math.round(rawDistanceKm * 10) / 10;
        const isTogether = rawDistanceKm <= TOGETHER_DISTANCE_KM;

        res.json({
            success: true,
            data: {
                distanceKm,
                isTogether,
                togetherThresholdKm: TOGETHER_DISTANCE_KM,
                userInitial: getInitial(user),
                partnerInitial: getInitial(partner),
                userLocationUpdatedAt: userLocation.updatedAt,
                partnerLocationUpdatedAt: partnerLocation.updatedAt,
                sharingEnabled: !!user.locationSharingEnabled,
                partnerSharingEnabled: !!partner.locationSharingEnabled,
            }
        });
    } catch (error) {
        console.error('Distance fetch error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch distance'
        });
    }
});

/**
 * POST /api/user/fcm-token
 * Register FCM token for push notifications
 */
router.post('/fcm-token', async (req, res) => {
    try {
        const { userId, fcmToken, timezone, platform, appVersion, appBuildNumber } = req.body;

        if (!userId || !fcmToken) {
            return res.status(400).json({
                success: false,
                error: 'userId and fcmToken are required'
            });
        }

        const update = { fcmToken };
        if (platform !== undefined) {
            update.platform = normalizePlatform(platform);
            update.deviceInfoUpdatedAt = new Date();
        }
        if (typeof timezone === 'string' && timezone.trim()) {
            update.timezone = timezone.trim();
            update.deviceInfoUpdatedAt = new Date();
        }
        if (typeof appVersion === 'string' && appVersion.trim()) {
            update.appVersion = appVersion.trim();
            update.deviceInfoUpdatedAt = new Date();
        }
        if (appBuildNumber !== undefined) {
            const parsedBuildNumber = Number.parseInt(appBuildNumber, 10);
            if (Number.isFinite(parsedBuildNumber)) {
                update.appBuildNumber = parsedBuildNumber;
                update.deviceInfoUpdatedAt = new Date();
            }
        }

        await User.findByIdAndUpdate(userId, update);

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
 * PUT /api/user/location
 * Update a user's location sharing data for the distance widget.
 */
router.put('/location', async (req, res) => {
    try {
        const { userId, latitude, longitude, sharingEnabled = true } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                error: 'userId is required'
            });
        }

        const parsedLatitude = Number(latitude);
        const parsedLongitude = Number(longitude);
        const shouldShare = sharingEnabled === true;

        if (shouldShare && !isValidCoordinate(parsedLatitude, parsedLongitude)) {
            return res.status(400).json({
                success: false,
                error: 'latitude and longitude must be valid coordinates'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        user.locationSharingEnabled = shouldShare;
        if (shouldShare) {
            user.location = {
                latitude: parsedLatitude,
                longitude: parsedLongitude,
            };
            user.locationUpdatedAt = new Date();
        }

        await user.save();

        const activeCouple = await Couple.findByPartner(user._id);
        const shouldAskRelationshipStartDate = !!(
            activeCouple
            && !activeCouple.relationshipStartDate
            && activeCouple.relationshipStartDatePromptUserId?.toString() === user._id.toString()
        );

        res.json({
            success: true,
            user: buildUserResponse(user, activeCouple?.relationshipStartDate, shouldAskRelationshipStartDate),
        });

    } catch (error) {
        console.error('Location update error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update location'
        });
    }
});

/**
 * GET /api/user/distance/:userId
 * Get distance between a user and their active partner for the distance widget.
 */
router.get('/distance/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        const activeCouple = await Couple.findByPartner(user._id);
        const partnerId = user.partnerId || (
            activeCouple?.partner1?.toString() === user._id.toString()
                ? activeCouple.partner2
                : activeCouple?.partner1
        );
        const partner = partnerId ? await User.findById(partnerId) : null;

        const userInitial = getInitial(user.nickname, user.name, user.email);
        const partnerInitial = getInitial(partner?.nickname, partner?.name, partner?.email, user.partnerUsername);
        const baseData = {
            distanceKm: null,
            isTogether: false,
            userInitial,
            partnerInitial,
            userName: user.nickname || user.name || '',
            partnerName: partner?.nickname || partner?.name || user.partnerUsername || '',
            userLocationUpdatedAt: user.locationUpdatedAt || null,
            partnerLocationUpdatedAt: partner?.locationUpdatedAt || null,
        };

        if (!partner) {
            return res.json({
                success: true,
                data: {
                    ...baseData,
                    reason: 'missing_partner',
                }
            });
        }

        if (user.locationSharingEnabled !== true || partner.locationSharingEnabled !== true) {
            return res.json({
                success: true,
                data: {
                    ...baseData,
                    reason: user.locationSharingEnabled === true ? 'partner_sharing_disabled' : 'sharing_disabled',
                }
            });
        }

        const distanceKm = calculateDistanceKm(user.location, partner.location);
        if (distanceKm === null) {
            return res.json({
                success: true,
                data: {
                    ...baseData,
                    reason: 'missing_location',
                }
            });
        }

        res.json({
            success: true,
            data: {
                ...baseData,
                distanceKm,
                isTogether: distanceKm <= 0.1,
            }
        });

    } catch (error) {
        console.error('Distance lookup error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get partner distance'
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

        const activeCouple = await Couple.findByPartner(user._id);
        const shouldAskRelationshipStartDate = !!(
            activeCouple
            && !activeCouple.relationshipStartDate
            && activeCouple.relationshipStartDatePromptUserId?.toString() === user._id.toString()
        );

        res.json({
            success: true,
            user: buildUserResponse(user, activeCouple?.relationshipStartDate, shouldAskRelationshipStartDate),
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

        // If user has a partner, unlink them and cleanup data
        if (user.partnerId) {
            // Unlink partner and clear their lastScribble (if it was from this user)
            await User.findByIdAndUpdate(user.partnerId, {
                $unset: {
                    partnerId: 1,
                    partnerUsername: 1,
                    connectionDate: 1,
                    lastScribble: 1
                }
            });

            // Mark the Couple record as unpaired
            const [p1, p2] = [userId, user.partnerId.toString()].sort();
            await Couple.findOneAndUpdate(
                { partner1: p1, partner2: p2, status: 'active' },
                { status: 'unpaired', unpairedDate: new Date() }
            );
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
