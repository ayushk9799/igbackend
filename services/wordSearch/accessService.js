import WordSearchGame from '../../models/WordSearchGame.js';
import { getCoupleSubscriptionAccess } from '../subscriptionService.js';

export const FREE_WORD_SEARCH_GAME_LIMIT = 3;

export const getWordSearchLimitStatus = async userId => {
    const access = await getCoupleSubscriptionAccess(userId);
    if (access?.hasPremiumAccess) {
        return { hasPremiumAccess: true, completedGames: 0, limitReached: false };
    }
    const completedGames = await WordSearchGame.countDocuments({
        status: 'completed',
        protocolVersion: 2,
        $or: [{ creatorId: userId }, { partnerId: userId }],
    });
    return { hasPremiumAccess: false, completedGames, limitReached: completedGames >= FREE_WORD_SEARCH_GAME_LIMIT };
};
