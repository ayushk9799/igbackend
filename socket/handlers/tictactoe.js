import TicTacToe from '../../models/TicTacToe.js';
import { getSocketId, getCoupleRoomId } from '../auth.js';
import {
    markTicTacToeScreenActive,
    markTicTacToeScreenInactive,
} from '../../services/ticTacToeScreenPresence.js';
import { serializeTicTacToeState } from '../../services/ticTacToeState.js';
import { commitTicTacToeMove, TicTacToeMoveError } from '../../services/ticTacToeMove.js';

export const TICTACTOE_HYBRID_REMATCH_CAPABILITY = 'hybrid-rematch-v1';

/**
 * Handle joining a TicTacToe game room
 * Allows real-time updates for a specific game
 */
export const handleTicTacToeJoin = async (socket, io, data) => {
    try {
        const { gameId } = data;
        const { userId, userName } = socket;

        if (!gameId) {
            socket.emit('tictactoe:error', { message: 'gameId is required' });
            return;
        }

        const game = await TicTacToe.findById(gameId);
        if (!game) {
            socket.emit('tictactoe:error', { message: 'Game not found' });
            return;
        }

        // Verify user is a player in this game
        const isPlayer =
            game.creatorId.toString() === userId ||
            game.partnerId.toString() === userId;

        if (!isPlayer) {
            socket.emit('tictactoe:error', { message: 'Not a player in this game' });
            return;
        }

        // Join game-specific room
        const gameRoom = `tictactoe_${gameId}`;
        socket.join(gameRoom);

        // Notify other player that someone joined
        socket.to(gameRoom).emit('tictactoe:playerJoined', {
            playerId: userId,
            playerName: userName,
            timestamp: new Date().toISOString()
        });

        socket.emit(
            'tictactoe:stateChanged',
            serializeTicTacToeState(game, {
                eventType: 'joined',
                viewerPlayerId: String(userId),
            })
        );


    } catch (error) {
        console.error('TicTacToe join error:', error);
        socket.emit('tictactoe:error', { message: 'Failed to join game' });
    }
};

/**
 * Handle leaving a TicTacToe game room
 */
export const handleTicTacToeLeave = (socket, io, data) => {
    const { gameId } = data;
    const { userId } = socket;

    if (gameId) {
        const gameRoom = `tictactoe_${gameId}`;
        markTicTacToeScreenInactive({ gameId, userId, socketId: socket.id });
        socket.leave(gameRoom);

        socket.to(gameRoom).emit('tictactoe:playerLeft', {
            playerId: userId,
            timestamp: new Date().toISOString()
        });

    }
};

/**
 * Track capability-aware, visible TicTacToe screens separately from ordinary
 * game-room membership. Navigation stacks may keep an invisible screen mounted.
 */
export const handleTicTacToeScreenActive = async (socket, io, data = {}) => {
    try {
        const { gameId, capability } = data;
        const { userId } = socket;
        if (!gameId || capability !== TICTACTOE_HYBRID_REMATCH_CAPABILITY) return;

        const game = await TicTacToe.findById(gameId).select('creatorId partnerId');
        if (!game) return;

        const isPlayer = game.creatorId.toString() === String(userId)
            || game.partnerId.toString() === String(userId);
        if (!isPlayer) return;

        markTicTacToeScreenActive({ gameId, userId, socketId: socket.id });
    } catch (error) {
        console.error('TicTacToe active-screen presence error:', error);
    }
};

export const handleTicTacToeScreenInactive = (socket, io, data = {}) => {
    markTicTacToeScreenInactive({
        gameId: data.gameId,
        userId: socket.userId,
        socketId: socket.id,
    });
};

/**
 * Handle real-time move broadcast
 * Called after a move is made via REST API
 */
export const handleTicTacToeMove = async (socket, io, data = {}, acknowledge) => {
    try {
        const { gameId, position, round, revision } = data;
        const { userId } = socket;

        if (!gameId) {
            acknowledge?.({ success: false, status: 400, message: 'gameId is required' });
            return;
        }

        // Older clients persist through REST and then use this event only as a
        // broadcast trigger. Do not apply their move twice during rollout.
        if (!Number.isInteger(revision)) {
            const legacyGame = await TicTacToe.findById(gameId);
            if (!legacyGame) return;
            const isPlayer = legacyGame.creatorId.toString() === String(userId)
                || legacyGame.partnerId.toString() === String(userId);
            if (!isPlayer) return;
            const legacySnapshot = serializeTicTacToeState(legacyGame, {
                eventType: 'move',
                lastMove: { position, playerId: String(userId) },
            });
            socket.to(`tictactoe_${gameId}`).emit('tictactoe:moveReceived', legacySnapshot);
            const legacyPartnerId = legacyGame.creatorId.toString() === String(userId)
                ? legacyGame.partnerId.toString()
                : legacyGame.creatorId.toString();
            const legacyCoupleRoom = getCoupleRoomId(String(userId), legacyPartnerId);
            if (legacyCoupleRoom) socket.to(legacyCoupleRoom).emit('tictactoe:update', legacySnapshot);
            acknowledge?.({
                success: true,
                data: { ...legacySnapshot, viewerPlayerId: String(userId) },
            });
            return;
        }

        const { game, snapshot } = await commitTicTacToeMove({
            gameId,
            userId,
            position,
            round,
            revision,
        });
        const partnerId = game.creatorId.toString() === String(userId)
            ? game.partnerId.toString()
            : game.creatorId.toString();
        const coupleRoom = getCoupleRoomId(String(userId), partnerId);
        if (coupleRoom) {
            io.to(coupleRoom).emit('tictactoe:stateChanged', snapshot);
        }
        acknowledge?.({
            success: true,
            data: { ...snapshot, viewerPlayerId: String(userId) },
        });

    } catch (error) {
        if (error instanceof TicTacToeMoveError) {
            acknowledge?.({
                success: false,
                status: error.status,
                message: error.message,
                data: error.data
                    ? { ...error.data, viewerPlayerId: String(socket.userId) }
                    : null,
            });
            return;
        }
        console.error('TicTacToe move broadcast error:', error);
        acknowledge?.({ success: false, status: 500, message: 'Failed to make move' });
    }
};

/**
 * Handle game invite notification via socket
 */
export const handleTicTacToeInvite = async (socket, io, data) => {
    try {
        const { gameId } = data;
        const { userId, userName, partnerId } = socket;

        if (!partnerId) {
            socket.emit('tictactoe:error', { message: 'No partner to invite' });
            return;
        }

        // Send to couple room
        const coupleRoom = getCoupleRoomId(userId, partnerId);
        if (coupleRoom) {
            socket.to(coupleRoom).emit('tictactoe:invited', {
                gameId,
                fromId: userId,
                fromName: userName,
                timestamp: new Date().toISOString()
            });
        }

        socket.emit('tictactoe:inviteSent', { success: true, gameId });

    } catch (error) {
        console.error('TicTacToe invite error:', error);
        socket.emit('tictactoe:error', { message: 'Failed to send invite' });
    }
};

/**
 * Handle game complete notification
 */
export const handleTicTacToeComplete = async (socket, io, data) => {
    try {
        const { gameId } = data;
        const game = await TicTacToe.findById(gameId);
        if (!game) return;
        const isPlayer = game.creatorId.toString() === String(socket.userId)
            || game.partnerId.toString() === String(socket.userId);
        if (!isPlayer) return;

        const gameRoom = `tictactoe_${gameId}`;
        socket.to(gameRoom).emit(
            'tictactoe:stateChanged',
            serializeTicTacToeState(game, { eventType: 'completed' })
        );

    } catch (error) {
        console.error('TicTacToe complete error:', error);
    }
};

/**
 * Handle new game notification (Play Again)
 * Notifies partner that a new game was created and resets their board
 */
export const handleTicTacToeNewGame = async (socket, io, data) => {
    try {
        const { gameId, previousGameId } = data;
        const { userId, userName, partnerId } = socket;

        if (!partnerId) {
            socket.emit('tictactoe:error', { message: 'No partner to notify' });
            return;
        }

        const game = await TicTacToe.findById(gameId);
        if (!game) {
            socket.emit('tictactoe:error', { message: 'Game not found' });
            return;
        }

        const isPlayer = game.creatorId.toString() === String(userId)
            || game.partnerId.toString() === String(userId);
        if (!isPlayer) {
            socket.emit('tictactoe:error', { message: 'Not a player in this game' });
            return;
        }

        // Send new game data to couple room
        const coupleRoom = getCoupleRoomId(userId, partnerId);
        if (coupleRoom) {
            socket.to(coupleRoom).emit('tictactoe:newGame', {
                gameId: game._id,
                board: game.board,
                currentTurn: game.currentTurn,
                status: game.status,
                round: game.round,
                creatorSymbol: game.creatorSymbol,
                partnerSymbol: game.partnerSymbol,
                creatorId: game.creatorId,
                partnerId: game.partnerId,
                previousGameId,
                creatorName: userName,
                timestamp: new Date().toISOString()
            });
        }

        socket.emit('tictactoe:newGameSent', { success: true, gameId });

    } catch (error) {
        console.error('TicTacToe new game error:', error);
        socket.emit('tictactoe:error', { message: 'Failed to notify partner of new game' });
    }
};

export default {
    handleTicTacToeJoin,
    handleTicTacToeLeave,
    handleTicTacToeMove,
    handleTicTacToeInvite,
    handleTicTacToeComplete,
    handleTicTacToeNewGame
};
