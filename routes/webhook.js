import express from 'express';
import User from '../models/User.js';

const router = express.Router();

/**
 * POST /api/webhooks/revenuecat
 * Handle RevenueCat webhook events for subscription lifecycle.
 *
 * RevenueCat sends events like EXPIRATION, CANCELLATION, RENEWAL, etc.
 * We look up the user by email (since Purchases.logIn(email) is used on the frontend)
 * and update their premium status accordingly.
 *
 * Docs: https://www.revenuecat.com/docs/webhooks
 */
router.post('/revenuecat', async (req, res) => {
    try {
        // 1. Verify webhook authenticity via Authorization header
        const authHeader = req.headers['authorization'];
        const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;

        if (expectedSecret && authHeader !== expectedSecret) {
            console.warn('⚠️ [Webhook] Unauthorized request - invalid secret');
            return res.status(401).json({ error: 'Unauthorized' });
        }

        const { event } = req.body;
        if (!event) {
            return res.status(400).json({ error: 'Missing event in request body' });
        }

        const eventType = event.type;
        const appUserId = event.app_user_id;       // This is the email we passed to Purchases.logIn()
        const expirationAt = event.expiration_at_ms;
        const productId = event.product_id;


        if (!appUserId) {
            console.warn('⚠️ [Webhook] No app_user_id in event');
            return res.status(400).json({ error: 'Missing app_user_id' });
        }

        // 2. Look up user by email (app_user_id = email in our system)
        const user = await User.findOne({ email: appUserId.toLowerCase() });
        if (!user) {
            console.warn(`⚠️ [Webhook] User not found for email: ${appUserId}`);
            // Return 200 anyway so RevenueCat doesn't keep retrying
            return res.status(200).json({ success: true, message: 'User not found, event acknowledged' });
        }

        // 3. Handle events that revoke premium
        //    NOTE: BILLING_ISSUE_DETECTED is intentionally NOT here.
        //    Apple/Google give a grace period (6-16 days) during billing issues.
        //    RevenueCat will send EXPIRATION later if billing isn't resolved.
        const revokeEvents = [
            'EXPIRATION',
            'SUBSCRIPTION_PAUSED',
        ];

        // 4. Handle events that grant/restore premium
        const grantEvents = [
            'INITIAL_PURCHASE',
            'RENEWAL',
            'UNCANCELLATION',
            'NON_RENEWING_PURCHASE',
            'SUBSCRIPTION_EXTENDED',
            'PRODUCT_CHANGE',
        ];

        if (revokeEvents.includes(eventType)) {
            // Premium expired or paused — revoke access
            user.isPremium = false;
            user.premiumExpiresAt = null;
            user.premiumPlan = null;
            await user.save();

        } else if (grantEvents.includes(eventType)) {
            // Subscription purchased/renewed — grant access
            user.isPremium = true;
            user.premiumExpiresAt = expirationAt ? new Date(expirationAt) : null;
            user.premiumPlan = productId || null;
            await user.save();

        } else {
            // CANCELLATION, BILLING_ISSUE_DETECTED, TRANSFER, etc.
            // These don't change access — just log and acknowledge
        }

        // Always return 200 to acknowledge receipt
        res.status(200).json({ success: true });

    } catch (error) {
        console.error('❌ [Webhook] Error processing RevenueCat webhook:', error);
        // Return 200 even on errors to prevent RevenueCat from retrying indefinitely
        res.status(200).json({ success: true, error: 'Internal error, event acknowledged' });
    }
});

export default router;
