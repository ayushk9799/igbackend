import express from 'express';
import User from '../models/User.js';
import {
    buildLegacyPremiumFields,
    getCoupleSubscriptionAccess,
} from '../services/subscriptionService.js';
import { refreshUserSubscriptionFromRevenueCat } from '../services/revenueCatService.js';
import { notifyCoupleSubscriptionChanged } from '../services/subscriptionNotificationService.js';

const router = express.Router();

const loadUser = async (userId) => {
    if (!userId) return null;
    return User.findById(userId);
};

const statusResponse = async (user) => {
    const access = await getCoupleSubscriptionAccess(user);
    return {
        success: true,
        access,
        ...buildLegacyPremiumFields(access),
    };
};

router.get('/status/:userId', async (req, res) => {
    try {
        const user = await loadUser(req.params.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });
        return res.json(await statusResponse(user));
    } catch (error) {
        console.error('Subscription status error:', error);
        return res.status(500).json({ success: false, error: 'Failed to get subscription status' });
    }
});

router.post('/refresh', async (req, res) => {
    try {
        const user = await loadUser(req.body?.userId);
        if (!user) return res.status(404).json({ success: false, error: 'User not found' });

        await refreshUserSubscriptionFromRevenueCat(user);
        notifyCoupleSubscriptionChanged(user, 'server_refresh');
        return res.json(await statusResponse(user));
    } catch (error) {
        console.error('Subscription refresh error:', error);

        // A RevenueCat outage/configuration problem must not clear known access.
        // Return current canonical/legacy state so old users remain unaffected.
        const user = await loadUser(req.body?.userId).catch(() => null);
        if (user) {
            const fallback = await statusResponse(user);
            return res.status(503).json({
                ...fallback,
                success: false,
                stale: true,
                error: 'Subscription verification is temporarily unavailable',
            });
        }

        return res.status(500).json({ success: false, error: 'Failed to refresh subscription' });
    }
});

export default router;
