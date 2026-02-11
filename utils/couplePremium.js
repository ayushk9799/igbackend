import User from '../models/User.js';

/**
 * Get the effective couple premium status for a user.
 * If either the user or their partner has an active premium subscription,
 * both are considered premium (couple premium).
 *
 * @param {Object} user - The user document (must have partnerId, isPremium, premiumExpiresAt, premiumPlan)
 * @returns {Object} { isPremium, premiumExpiresAt, premiumPlan, premiumSource }
 */
export async function getCouplePremiumStatus(user) {
    // Default: user's own premium status
    const result = {
        isPremium: !!user.isPremium,
        premiumExpiresAt: user.premiumExpiresAt || null,
        premiumPlan: user.premiumPlan || null,
        premiumSource: user.isPremium ? 'self' : null,
    };

    // If user is already premium, return self status
    if (result.isPremium) {
        return result;
    }

    // If user has a partner, check partner's premium
    if (user.partnerId) {
        try {
            const partner = await User.findById(user.partnerId).select('isPremium premiumExpiresAt premiumPlan').lean();
            if (partner && partner.isPremium) {
                return {
                    isPremium: true,
                    premiumExpiresAt: partner.premiumExpiresAt || null,
                    premiumPlan: partner.premiumPlan || null,
                    premiumSource: 'partner',
                };
            }
        } catch (err) {
            console.error('Error checking partner premium:', err.message);
        }
    }

    return result;
}
