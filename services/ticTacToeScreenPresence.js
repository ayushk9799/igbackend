const activeScreensByGame = new Map();
const activeGamesBySocket = new Map();

const normalizeId = value => value == null ? '' : String(value);

export const markTicTacToeScreenActive = ({ gameId, userId, socketId }) => {
    const normalizedGameId = normalizeId(gameId);
    const normalizedUserId = normalizeId(userId);
    const normalizedSocketId = normalizeId(socketId);
    if (!normalizedGameId || !normalizedUserId || !normalizedSocketId) return;

    let users = activeScreensByGame.get(normalizedGameId);
    if (!users) {
        users = new Map();
        activeScreensByGame.set(normalizedGameId, users);
    }

    let sockets = users.get(normalizedUserId);
    if (!sockets) {
        sockets = new Set();
        users.set(normalizedUserId, sockets);
    }
    sockets.add(normalizedSocketId);

    let socketGames = activeGamesBySocket.get(normalizedSocketId);
    if (!socketGames) {
        socketGames = new Set();
        activeGamesBySocket.set(normalizedSocketId, socketGames);
    }
    socketGames.add(`${normalizedGameId}:${normalizedUserId}`);
};

export const markTicTacToeScreenInactive = ({ gameId, userId, socketId }) => {
    const normalizedGameId = normalizeId(gameId);
    const normalizedUserId = normalizeId(userId);
    const normalizedSocketId = normalizeId(socketId);
    if (!normalizedGameId || !normalizedUserId || !normalizedSocketId) return;

    const users = activeScreensByGame.get(normalizedGameId);
    const sockets = users?.get(normalizedUserId);
    sockets?.delete(normalizedSocketId);
    if (sockets?.size === 0) users.delete(normalizedUserId);
    if (users?.size === 0) activeScreensByGame.delete(normalizedGameId);

    const socketGames = activeGamesBySocket.get(normalizedSocketId);
    socketGames?.delete(`${normalizedGameId}:${normalizedUserId}`);
    if (socketGames?.size === 0) activeGamesBySocket.delete(normalizedSocketId);
};

export const clearTicTacToeScreenPresenceForSocket = socketId => {
    const normalizedSocketId = normalizeId(socketId);
    const entries = [...(activeGamesBySocket.get(normalizedSocketId) || [])];

    for (const entry of entries) {
        const separatorIndex = entry.lastIndexOf(':');
        if (separatorIndex === -1) continue;
        markTicTacToeScreenInactive({
            gameId: entry.slice(0, separatorIndex),
            userId: entry.slice(separatorIndex + 1),
            socketId: normalizedSocketId,
        });
    }
};

export const getActiveTicTacToePlayerIds = gameId => (
    new Set(activeScreensByGame.get(normalizeId(gameId))?.keys() || [])
);

// Test-only reset for this process-local, ephemeral presence state.
export const resetTicTacToeScreenPresence = () => {
    activeScreensByGame.clear();
    activeGamesBySocket.clear();
};
