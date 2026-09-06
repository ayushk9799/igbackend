import { getCanonicalTicTacToeSymbols } from './ticTacToeState.js';

const COMPLETED_STATUSES = new Set(['won_creator', 'won_partner', 'draw']);

const normalizeId = value => value == null ? '' : String(value);

export const resolveTicTacToeRestartAssignment = ({
    game,
    requesterId,
    hybridRequested = false,
    activePlayerIds = new Set(),
}) => {
    const creatorId = normalizeId(game.creatorId);
    const partnerId = normalizeId(game.partnerId);
    const requester = normalizeId(requesterId);
    // Retained in the signature for compatibility with older callers. Round
    // ownership no longer depends on ephemeral process-local presence.
    void activePlayerIds;

    let { creatorSymbol, partnerSymbol } = getCanonicalTicTacToeSymbols(game);
    let assignmentReason = 'preserved';

    if (hybridRequested && COMPLETED_STATUSES.has(game.status)) {
        if (requester === creatorId || requester === partnerId) {
            creatorSymbol = requester === creatorId ? 'X' : 'O';
            partnerSymbol = requester === partnerId ? 'X' : 'O';
            assignmentReason = 'requester_started_round';
        }
    }

    return {
        creatorSymbol,
        partnerSymbol,
        currentTurn: creatorSymbol === 'X' ? 'creator' : 'partner',
        assignmentReason,
    };
};
