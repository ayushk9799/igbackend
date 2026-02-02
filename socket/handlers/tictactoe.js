import TicTacToe from '../../models/TicTacToe.js';
import { getSocketId, getCoupleRoomId } from '../auth.js';

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

        socket.emit('tictactoe:joined', {
            gameId,
            board: game.board,
            currentTurn: game.currentTurn,
            status: game.status
        });

        console.log(`🎮 User ${userId} joined TicTacToe game ${gameId}`);

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
        socket.leave(gameRoom);

        socket.to(gameRoom).emit('tictactoe:playerLeft', {
            playerId: userId,
            timestamp: new Date().toISOString()
        });

        console.log(`🎮 User ${userId} left TicTacToe game ${gameId}`);
    }
};

/**
 * Handle real-time move broadcast
 * Called after a move is made via REST API
 */
export const handleTicTacToeMove = async (socket, io, data) => {
    try {
        const { gameId, position, board, currentTurn, status, winner, gameComplete } = data;
        const { userId, userName } = socket;

        if (!gameId) {
            socket.emit('tictactoe:error', { message: 'gameId is required' });
            return;
        }

        // Broadcast to game room (excluding sender)
        const gameRoom = `tictactoe_${gameId}`;
        socket.to(gameRoom).emit('tictactoe:moveReceived', {
            playerId: userId,
            playerName: userName,
            position,
            board,
            currentTurn,
            status,
            winner,
            gameComplete,
            timestamp: new Date().toISOString()
        });

        // Also broadcast to couple room for notifications
        const game = await TicTacToe.findById(gameId);
        if (game) {
            const partnerId = game.creatorId.toString() === userId
                ? game.partnerId.toString()
                : game.creatorId.toString();

            const coupleRoom = getCoupleRoomId(userId, partnerId);
            if (coupleRoom) {
                socket.to(coupleRoom).emit('tictactoe:update', {
                    gameId,
                    board,
                    status,
                    currentTurn
                });
            }
        }

    } catch (error) {
        console.error('TicTacToe move broadcast error:', error);
        socket.emit('tictactoe:error', { message: 'Failed to broadcast move' });
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
        const { gameId, status, winnerId, winnerName } = data;

        // Broadcast to game room
        const gameRoom = `tictactoe_${gameId}`;
        io.to(gameRoom).emit('tictactoe:gameComplete', {
            gameId,
            status,
            winnerId,
            winnerName,
            timestamp: new Date().toISOString()
        });

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
        const { gameId, board, currentTurn, status, creatorSymbol, partnerSymbol } = data;
        const { userId, userName, partnerId } = socket;

        console.log(`🎮 New game created by ${userId}, notifying partner ${partnerId}`);

        if (!partnerId) {
            socket.emit('tictactoe:error', { message: 'No partner to notify' });
            return;
        }

        // Send new game data to couple room
        const coupleRoom = getCoupleRoomId(userId, partnerId);
        if (coupleRoom) {
            socket.to(coupleRoom).emit('tictactoe:newGame', {
                gameId,
                board,
                currentTurn,
                status,
                creatorSymbol,
                partnerSymbol,
                creatorId: userId,
                creatorName: userName,
                timestamp: new Date().toISOString()
            });
            console.log(`🎮 Sent tictactoe:newGame to couple room ${coupleRoom}`);
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
