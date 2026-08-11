import { createHash } from 'node:crypto';

const normalizeId = value => {
    if (value == null) return '';
    return String(value?._id || value);
};

export const getTicTacToeCoupleKey = (firstUserId, secondUserId) => (
    [normalizeId(firstUserId), normalizeId(secondUserId)]
        .filter(Boolean)
        .sort()
        .join(':')
);

// MongoDB's _id index always exists, even on deployments where a newly added
// secondary unique index has not been built yet. Deriving the canonical match
// id from the sorted couple key makes simultaneous first-open inserts contend
// on that built-in unique index and guarantees a single winner.
export const getCanonicalTicTacToeGameId = (firstUserId, secondUserId) => {
    const coupleKey = getTicTacToeCoupleKey(firstUserId, secondUserId);
    if (!coupleKey) return '';
    return createHash('sha256')
        .update(`tic-tac-toe:${coupleKey}`)
        .digest('hex')
        .slice(0, 24);
};

export const getCanonicalTicTacToeSymbols = (game = {}) => {
    const creatorSymbol = game.creatorSymbol === 'O' ? 'O' : 'X';
    return {
        creatorSymbol,
        partnerSymbol: creatorSymbol === 'X' ? 'O' : 'X',
    };
};

export const serializeTicTacToeState = (game, extra = {}) => {
    const creatorId = normalizeId(game.creatorId);
    const partnerId = normalizeId(game.partnerId);
    const { creatorSymbol, partnerSymbol } = getCanonicalTicTacToeSymbols(game);
    const creatorIsX = creatorSymbol === 'X';
    const isComplete = ['won_creator', 'won_partner', 'draw', 'superseded'].includes(game.status);

    return {
        gameId: normalizeId(game._id),
        _id: normalizeId(game._id),
        coupleKey: game.coupleKey || getTicTacToeCoupleKey(creatorId, partnerId),
        creatorId,
        partnerId,
        board: Array.isArray(game.board) ? [...game.board] : Array(9).fill(null),
        currentTurn: game.currentTurn,
        turnPlayerId: isComplete
            ? null
            : game.currentTurn === 'creator' ? creatorId : partnerId,
        creatorSymbol,
        partnerSymbol,
        xPlayerId: creatorIsX ? creatorId : partnerId,
        oPlayerId: creatorIsX ? partnerId : creatorId,
        status: game.status,
        winner: normalizeId(game.winner) || null,
        round: Number.isInteger(game.round) ? game.round : 0,
        revision: Number.isInteger(game.revision) ? game.revision : 0,
        moveCount: Number.isInteger(game.moveCount) ? game.moveCount : 0,
        ...extra,
    };
};

export const isTicTacToePlayer = (game, userId) => {
    const normalizedUserId = normalizeId(userId);
    return normalizeId(game.creatorId) === normalizedUserId
        || normalizeId(game.partnerId) === normalizedUserId;
};
