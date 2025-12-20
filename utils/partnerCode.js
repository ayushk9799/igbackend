import mongoose from 'mongoose';

// Characters to use for code generation (excluding confusing chars: 0, O, 1, I, L)
const SAFE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

/**
 * Generate a unique partner code using Strategy C (Hybrid)
 * Format: Last 2 chars of user ID (hex) + 4 random alphanumeric chars
 * Total: 6 characters, collision-resistant
 * 
 * @param {string|ObjectId} userId - The user's MongoDB ObjectId
 * @returns {string} 6-character partner code
 */
export const generatePartnerCode = (userId) => {
    // Get last 2 chars of user ID (converted to uppercase)
    const userIdStr = userId.toString();
    const prefix = userIdStr.slice(-2).toUpperCase();

    // Generate 4 random characters
    let suffix = '';
    for (let i = 0; i < 4; i++) {
        suffix += SAFE_CHARS.charAt(Math.floor(Math.random() * SAFE_CHARS.length));
    }

    return prefix + suffix;
};

/**
 * Generate a new MongoDB ObjectId
 * Use this before creating a user to pre-generate the ID for partner code
 * 
 * @returns {ObjectId} New MongoDB ObjectId
 */
export const generateUserId = () => {
    return new mongoose.Types.ObjectId();
};

export default { generatePartnerCode, generateUserId };
