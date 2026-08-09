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
    const normalizedActiveIds = new Set([...activePlayerIds].map(normalizeId));

    let creatorSymbol = game.creatorSymbol;
    let partnerSymbol = game.partnerSymbol;
    let assignmentReason = 'preserved';

    if (hybridRequested && COMPLETED_STATUSES.has(game.status)) {
        const bothPlayersActive = normalizedActiveIds.has(creatorId)
            && normalizedActiveIds.has(partnerId);

        if (bothPlayersActive) {
            creatorSymbol = game.creatorSymbol === 'X' ? 'O' : 'X';
            partnerSymbol = creatorSymbol === 'X' ? 'O' : 'X';
            assignmentReason = 'alternated_both_active';
        } else if (requester === creatorId || requester === partnerId) {
            creatorSymbol = requester === creatorId ? 'X' : 'O';
            partnerSymbol = requester === partnerId ? 'X' : 'O';
            assignmentReason = 'requester_started_async';
        }
    }

    return {
        creatorSymbol,
        partnerSymbol,
        currentTurn: creatorSymbol === 'X' ? 'creator' : 'partner',
        assignmentReason,
    };
};
