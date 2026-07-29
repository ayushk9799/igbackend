import express from 'express';
import mongoose from 'mongoose';
import User from '../models/User.js';
import Couple from '../models/Couple.js';
import { generateUniquePartnerCode } from '../utils/partnerCode.js';
import { isUserOnline, getSocketId, getCoupleRoomId, updateSocketPartnerStatus } from '../socket/auth.js';
import { getIO } from '../socket/index.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import { getDirectPremiumStatus } from '../utils/couplePremium.js';
import { requireAuth, requireSelf } from '../middleware/auth.js';
import { markOnboardingStep } from '../utils/onboarding.js';

const router = express.Router();

/**
 * GET /api/partner/code/:userId
 * Get the user's partner code (generated at signup)
 */
router.get('/code/:userId', requireAuth, requireSelf, async (req, res) => {
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
            user.partnerCode = await generateUniquePartnerCode(userId, User);
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
router.post('/pair', requireAuth, requireSelf, async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { userId, partnerCode } = req.body;

        if (!userId || !partnerCode) {
            return res.status(400).json({
                success: false,
                error: 'userId and partnerCode are required'
            });
        }

        const fail = (status, message) => Object.assign(new Error(message), { status });
        let user;
        let partner;
        let couple;
        const connectionDate = new Date();

        await session.withTransaction(async () => {
            user = await User.findById(userId).session(session);
            if (!user) throw fail(404, 'User not found');
            if (user.partnerId) {
                throw fail(409, 'You are already paired with someone. Unpair first to connect with someone new.');
            }

            partner = await User.findOne({ partnerCode: partnerCode.toUpperCase() }).session(session);
            if (!partner) throw fail(404, 'Invalid partner code');
            if (partner._id.toString() === userId) throw fail(400, 'You cannot pair with yourself');
            if (partner.partnerId) throw fail(409, 'This person is already paired with someone else');

            user.partnerId = partner._id;
            user.partnerUsername = partner.name || 'Partner';
            user.partnerNickname = partner.nickname || partner.name || 'Partner';
            user.connectionDate = connectionDate;
            markOnboardingStep(user, 'partner');

            partner.partnerId = user._id;
            partner.partnerUsername = user.name || 'Partner';
            partner.partnerNickname = user.nickname || user.name || 'Partner';
            partner.connectionDate = connectionDate;

            const partnerIdValue = partner._id.toString();
            const [p1, p2] = [user._id.toString(), partnerIdValue].sort();
            const existingCouple = await Couple.findOne({ partner1: p1, partner2: p2 }).session(session);
            const relationshipStartDate = existingCouple?.relationshipStartDate
                || partner.pendingRelationshipStartDate
                || user.pendingRelationshipStartDate
                || null;
            const coupleUpdate = {
                $set: { partner1: p1, partner2: p2, connectionDate, status: 'active' },
                $unset: { unpairedDate: 1 },
            };
            if (relationshipStartDate) {
                coupleUpdate.$set.relationshipStartDate = relationshipStartDate;
                coupleUpdate.$unset.relationshipStartDatePromptUserId = 1;
                user.pendingRelationshipStartDate = undefined;
                partner.pendingRelationshipStartDate = undefined;
            } else {
                coupleUpdate.$set.relationshipStartDatePromptUserId = user._id;
            }

            await user.save({ session });
            await partner.save({ session });
            couple = await Couple.findOneAndUpdate(
                { partner1: p1, partner2: p2 },
                coupleUpdate,
                { upsert: true, new: true, session },
            );
        });

        const partnerId = partner._id.toString();
        try {
            await updateSocketPartnerStatus(userId, partner._id);
            await updateSocketPartnerStatus(partnerId, user._id);
        } catch (error) {
            console.warn('Pairing socket state sync failed:', error.message);
        }

        // Notify the partner about the new connection
        const pairingPayload = {
            partnerId: user._id,
            partnerName: user.name || 'Your Partner',
            partnerNickname: user.nickname || user.name || 'Your Partner',
            partnerAvatar: user.avatar || null,
                connectionDate,
                relationshipStartDate: couple.relationshipStartDate || null,
                shouldAskRelationshipStartDate: false,
        };

        if (isUserOnline(partnerId)) {
            // Partner is online — send socket event
            const io = getIO();
            const partnerSocketId = getSocketId(partnerId);
            if (io && partnerSocketId) {
                // Force partner socket to join the new room
                const partnerSocket = io.sockets.sockets.get(partnerSocketId);
                const roomId = getCoupleRoomId(userId, partnerId);
                if (partnerSocket && roomId) {
                    partnerSocket.join(roomId);
                }
                io.to(partnerSocketId).emit('partner:paired', pairingPayload);
            }
        } else {
            // Partner is offline — send push notification
            try {
                await sendPushNotification(
                    partnerId,
                    '💕 You\'re now connected!',
                    `${user.name || 'Someone'} just paired with you`,
                    { type: 'partner_paired' }
                );
            } catch (error) {
                console.warn('Pairing push notification failed:', error.message);
            }
        }

        // Also force the CURRENT user's socket to join the room
        if (isUserOnline(userId)) {
            const io = getIO();
            const userSocketId = getSocketId(userId);
            if (io && userSocketId) {
                const userSocket = io.sockets.sockets.get(userSocketId);
                const roomId = getCoupleRoomId(userId, partnerId);
                if (userSocket && roomId) {
                    userSocket.join(roomId);
                }
            }
        }

        let partnerPremium = {};
        try {
            partnerPremium = await getDirectPremiumStatus(partner);
        } catch (error) {
            console.warn('Pairing premium lookup failed:', error.message);
        }

        res.json({
            success: true,
            message: 'Successfully paired!',
            partner: {
                id: partner._id,
                name: partner.name,
                nickname: partner.nickname || partner.name || null,
                avatar: partner.avatar || null,
                connectionDate,
                relationshipStartDate: couple.relationshipStartDate || null,
                shouldAskRelationshipStartDate: !couple.relationshipStartDate,
                ...partnerPremium,
            },
            coupleId: couple._id
        });

    } catch (error) {
        console.error('Pair error:', error);
        res.status(error.status || 500).json({
            success: false,
            error: error.status ? error.message : 'Failed to pair with partner'
        });
    } finally {
        await session.endSession();
    }
});

/**
 * POST /api/partner/unpair
 * Unpair from current partner
 */
router.post('/unpair', requireAuth, requireSelf, async (req, res) => {
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
            partner.partnerNickname = null;
            partner.connectionDate = null;
            await partner.save();
        }

        user.partnerId = null;
        user.partnerUsername = null;
        user.partnerNickname = null;
        user.connectionDate = null;
        await user.save();

        // Sync socket partnerId (set to null) for both users if they are online
        await updateSocketPartnerStatus(userId, null);
        if (partner) {
            await updateSocketPartnerStatus(partner._id, null);
        }

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
router.get('/status/:userId', requireAuth, requireSelf, async (req, res) => {
    try {
        const { userId } = req.params;

        const user = await User.findById(userId).populate(
            'partnerId',
            'name nickname email avatar premiumExpiresAt premiumPlan premiumWillRenew premiumCancelledAt'
        );
        if (!user) {
            return res.status(404).json({
                success: false,
                error: 'User not found'
            });
        }

        if (user.partnerId) {
            const resolvedPartnerNickname = user.partnerId.nickname
                || user.partnerId.name
                || user.partnerUsername
                || null;
            if (user.partnerNickname !== resolvedPartnerNickname) {
                await User.updateOne(
                    { _id: user._id },
                    { $set: { partnerNickname: resolvedPartnerNickname } },
                );
            }
            const partnerPremium = await getDirectPremiumStatus(user.partnerId);
            const couple = await Couple.findByPartner(user._id);
            const relationshipStartDate = couple?.relationshipStartDate || user.pendingRelationshipStartDate || null;
            const pendingRelationshipStartDate = user.pendingRelationshipStartDate || null;
            const shouldAskRelationshipStartDate = !!(
                couple
                && !couple.relationshipStartDate
                && couple.relationshipStartDatePromptUserId?.toString() === user._id.toString()
            );
            const daysTogetherDate = relationshipStartDate || user.connectionDate;

            res.json({
                success: true,
                isPaired: true,
                partner: {
                    id: user.partnerId._id,
                    name: user.partnerId.name,
                    nickname: user.partnerId.nickname || null,
                    email: user.partnerId.email,
                    avatar: user.partnerId.avatar || null,
                    ...partnerPremium,
                },
                connectionDate: user.connectionDate,
                relationshipStartDate,
                pendingRelationshipStartDate,
                shouldAskRelationshipStartDate,
                daysTogether: Math.floor((new Date() - daysTogetherDate) / (1000 * 60 * 60 * 24))
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
