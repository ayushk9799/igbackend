import { getIO } from '../socket/index.js';
import { getSocketId } from '../socket/auth.js';

export const notifyCoupleSubscriptionChanged = (user, reason = 'subscription_changed', metadata = {}) => {
    const io = getIO();
    if (!io || !user) return;

    const payload = {
        reason,
        ownerUserId: user._id.toString(),
        updatedAt: new Date().toISOString(),
        ...metadata,
    };
    const ownerSocketId = getSocketId(user._id.toString());
    if (ownerSocketId) io.to(ownerSocketId).emit('subscription:updated', payload);

    if (user.partnerId) {
        const partnerSocketId = getSocketId(user.partnerId.toString());
        if (partnerSocketId) io.to(partnerSocketId).emit('subscription:updated', payload);
    }
};
