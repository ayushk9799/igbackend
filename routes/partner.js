import express from 'express';
import User from '../models/User.js';
import Couple from '../models/Couple.js';
import { generatePartnerCode, generateUserId } from '../utils/partnerCode.js';

const router = express.Router();

/**
 * GET /api/partner/code/:userId
 * Get the user's partner code (generated at signup)
 */
router.get('/code/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // If user doesn't have a code (legacy user), generate one
        if (!user.partnerCode) {
            user.partnerCode = generatePartnerCode(userId);
            await user.save();
        }

        res.json({
            success: true,
            code: user.partnerCode
        });

    } catch (error) {
        console.error('Get code error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get partner code'
        });
    }
});

/**
 * POST /api/partner/pair
 * Pair with another user using their partner code
 */
router.post('/pair', async (req, res) => {
    try {
        const { userId, partnerCode } = req.body;

        if (!userId || !partnerCode) {
            return res.status(400).json({
                success: false,
                error: 'userId and partnerCode are required'
            });
        }

        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        // Check if user is already paired
        if (user.partnerId) {
            return res.status(400).json({
                success: false,
                error: 'You are already paired with someone. Unpair first to connect with someone new.'
            });
        }

        // Find partner by code (no expiry check)
        const partner = await User.findOne({
            partnerCode: partnerCode.toUpperCase()
        });

        if (!partner) {
            return res.status(404).json({
                success: false,
                error: 'Invalid partner code'
            });
        }

        // Can't pair with yourself
        if (partner._id.toString() === userId) {
            return res.status(400).json({
                success: false,
                error: 'You cannot pair with yourself'
            });
        }

        // Check if partner is already paired
        if (partner.partnerId) {
            return res.status(400).json({
                success: false,
                error: 'This person is already paired with someone else'
            });
        }

        // Pair both users
        const connectionDate = new Date();

        user.partnerId = partner._id;
        user.partnerUsername = partner.name || 'Partner';
        user.connectionDate = connectionDate;

        partner.partnerId = user._id;
        partner.partnerUsername = user.name || 'Partner';
        partner.connectionDate = connectionDate;

        // Clear the partner code after successful pairing (one-time use)
        partner.partnerCode = null;

        await user.save();
        await partner.save();

        // Create a Couple document (sort IDs for consistent storage)
        const [p1, p2] = [user._id.toString(), partner._id.toString()].sort();
        const couple = new Couple({
            partner1: p1,
            partner2: p2,
            connectionDate,
            status: 'active'
        });
        await couple.save();

        res.json({
            success: true,
            message: 'Successfully paired!',
            partner: {
                id: partner._id,
                name: partner.name,
                avatar: partner.avatar || null,
                connectionDate
            },
            coupleId: couple._id
        });

    } catch (error) {
        console.error('Pair error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to pair with partner'
        });
    }
});

/**
 * POST /api/partner/unpair
 * Unpair from current partner
 */
router.post('/unpair', async (req, res) => {
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

        if (!user.partnerId) {
            return res.status(400).json({
                success: false,
                error: 'You are not paired with anyone'
            });
        }

        // Get partner and unpair both
        const partner = await User.findById(user.partnerId);

        // Mark the Couple document as unpaired
        if (partner) {
            const [p1, p2] = [user._id.toString(), partner._id.toString()].sort();
            await Couple.findOneAndUpdate(
                { partner1: p1, partner2: p2, status: 'active' },
                { status: 'unpaired', unpairedDate: new Date() }
            );

            partner.partnerId = null;
            partner.partnerUsername = null;
            partner.connectionDate = null;
            await partner.save();
        }

        user.partnerId = null;
        user.partnerUsername = null;
        user.connectionDate = null;
        await user.save();

        res.json({
            success: true,
            message: 'Successfully unpaired'
        });

    } catch (error) {
        console.error('Unpair error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to unpair'
        });
    }
});

/**
 * GET /api/partner/status/:userId
 * Get partner status for a user
 */
router.get('/status/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId).populate('partnerId', 'name email avatar');
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.partnerId) {
            res.json({
                success: true,
                isPaired: true,
                partner: {
                    id: user.partnerId._id,
                    name: user.partnerId.name,
                    email: user.partnerId.email,
                    avatar: user.partnerId.avatar || null
                },
                connectionDate: user.connectionDate,
                daysTogether: Math.floor((new Date() - user.connectionDate) / (1000 * 60 * 60 * 24))
            });
        } else {
            res.json({
                success: true,
                isPaired: false,
                partnerCode: user.partnerCode
            });
        }

    } catch (error) {
        console.error('Status error:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to get partner status'
        });
    }
});

export default router;
