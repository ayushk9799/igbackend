import express from 'express';
import { processRevenueCatWebhook } from '../services/revenueCatWebhookService.js';

const router = express.Router();

router.post('/revenuecat', async (req, res) => {
    const expectedSecret = process.env.REVENUECAT_WEBHOOK_SECRET;
    const allowInsecureLocal = process.env.NODE_ENV !== 'production'
        && process.env.REVENUECAT_ALLOW_INSECURE_WEBHOOKS === 'true';

    if (!expectedSecret && !allowInsecureLocal) {
        console.error('RevenueCat webhook rejected: REVENUECAT_WEBHOOK_SECRET is not configured');
        return res.status(503).json({ success: false, error: 'Webhook is not configured' });
    }

    if (expectedSecret && req.headers.authorization !== expectedSecret) {
        return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    if (!req.body?.event) {
        return res.status(400).json({ success: false, error: 'Missing event' });
    }

    try {
        const result = await processRevenueCatWebhook(req.body.event);
        return res.status(200).json({ success: true, ...result });
    } catch (error) {
        console.error('RevenueCat webhook processing failed:', error);
        const status = error?.status === 400 ? 400 : 500;
        return res.status(status).json({ success: false, error: 'Webhook processing failed' });
    }
});

export default router;
