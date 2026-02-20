import User from '../models/User.js';

/**
 * Check if a user has an active premium subscription based on premiumExpiresAt date.
 * This is more robust than checking the isPremium boolean, as it auto-expires
 * even if a RevenueCat webhook is missed.
 *
 * @param {Object} user - The user document (must have premiumExpiresAt)
 * @returns {boolean}
 */
export function isActivePremium(user) {
    return !!(user.premiumExpiresAt && new Date(user.premiumExpiresAt) > new Date());
}

/**
 * Get the effective couple premium status for a user.
 * If either the user or their partner has an active premium subscription,
 * both are considered premium (couple premium).
 *
 * @param {Object} user - The user document (must have partnerId, premiumExpiresAt, premiumPlan)
 * @returns {Object} { isPremium, premiumExpiresAt, premiumPlan, premiumSource }
 */
export async function getCouplePremiumStatus(user) {
    const userIsActive = isActivePremium(user);

    // Default: user's own premium status
    const result = {
        isPremium: userIsActive,
        premiumExpiresAt: user.premiumExpiresAt || null,
        premiumPlan: user.premiumPlan || null,
        premiumSource: userIsActive ? 'self' : null,
    };

    // If user is already premium, return self status
    if (result.isPremium) {
        return result;
    }

    // If user has a partner, check partner's premium
    if (user.partnerId) {
        try {
            const partner = await User.findById(user.partnerId).select('premiumExpiresAt premiumPlan').lean();
            if (partner && isActivePremium(partner)) {
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
