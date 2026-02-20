import Wordle from '../../models/Wordle.js';
import { getSocketId, getCoupleRoomId } from '../auth.js';

/**
 * Handle joining a Wordle game room
 */
export const handleWordleJoin = async (socket, io, data) => {
    try {
        const { gameId } = data;
        const { userId, userName } = socket;

        if (!gameId) {
            socket.emit('wordle:error', { message: 'gameId is required' });
            return;
        }

        const game = await Wordle.findById(gameId);
        if (!game) {
            socket.emit('wordle:error', { message: 'Game not found' });
            return;
        }

        // Verify user is a player in this game
        const isPlayer =
            game.creatorId.toString() === userId ||
            game.partnerId.toString() === userId;

        if (!isPlayer) {
            socket.emit('wordle:error', { message: 'Not a player in this game' });
            return;
        }

        // Join game-specific room
        const gameRoom = `wordle_${gameId}`;
        socket.join(gameRoom);

        socket.emit('wordle:joined', {
            gameId,
            status: game.status,
            guessCount: game.guesses.length
        });


    } catch (error) {
        console.error('Wordle join error:', error);
        socket.emit('wordle:error', { message: 'Failed to join game' });
    }
};

/**
 * Handle leaving a Wordle game room
 */
export const handleWordleLeave = (socket, io, data) => {
    const { gameId } = data;
    const { userId } = socket;

    if (gameId) {
        const gameRoom = `wordle_${gameId}`;
        socket.leave(gameRoom);
    }
};

/**
 * Handle a guess being made - broadcast to partner
 */
export const handleWordleGuess = async (socket, io, data) => {
    try {
        const { gameId, guessResult, status, gameComplete } = data;
        const { userId } = socket;

        const gameRoom = `wordle_${gameId}`;

        // Broadcast to partner in the game room
        socket.to(gameRoom).emit('wordle:guessReceived', {
            gameId,
            guessResult,
            status,
            gameComplete,
            timestamp: new Date().toISOString()
        });

        // Also notify via couple room for HomeScreen updates
        const { partnerId } = socket;
        const coupleRoomId = getCoupleRoomId(userId, partnerId);
        if (coupleRoomId) {
            socket.to(coupleRoomId).emit('wordle:update', {
                gameId,
                status,
                gameComplete,
                action: 'guess'
            });
        }


    } catch (error) {
        console.error('Wordle guess broadcast error:', error);
    }
};

/**
 * Handle new game created - notify partner
 */
export const handleWordleInvite = async (socket, io, data) => {
    try {
        const { gameId } = data;
        const { userId } = socket;

        // Notify partner via couple room
        const { partnerId } = socket;
        const coupleRoomId = getCoupleRoomId(userId, partnerId);
        if (coupleRoomId) {
            socket.to(coupleRoomId).emit('wordle:invite', {
                gameId,
                creatorId: userId,
                timestamp: new Date().toISOString()
            });
        }


    } catch (error) {
        console.error('Wordle invite error:', error);
    }
};

/**
 * Handle game complete - notify partner
 */
export const handleWordleComplete = async (socket, io, data) => {
    try {
        const { gameId, status, winnerId } = data;
        const { userId } = socket;

        const gameRoom = `wordle_${gameId}`;

        // Broadcast to game room
        socket.to(gameRoom).emit('wordle:gameComplete', {
            gameId,
            status,
            winnerId,
            timestamp: new Date().toISOString()
        });

        // Also notify via couple room for HomeScreen updates
        const { partnerId } = socket;
        const coupleRoomId = getCoupleRoomId(userId, partnerId);
        if (coupleRoomId) {
            socket.to(coupleRoomId).emit('wordle:update', {
                gameId,
                status,
                gameComplete: true,
                action: 'complete'
            });
        }


    } catch (error) {
        console.error('Wordle complete error:', error);
    }
};

/**
 * Handle new game notification - notify partner with full game data
 */
export const handleWordleNewGame = async (socket, io, data) => {
    try {
        const { gameId, status } = data;
        const { userId, userName, partnerId } = socket;


        if (!partnerId) {
            socket.emit('wordle:error', { message: 'No partner to notify' });
            return;
        }

        // Send new game data to couple room
        const coupleRoom = getCoupleRoomId(userId, partnerId);
        if (coupleRoom) {
            socket.to(coupleRoom).emit('wordle:newGame', {
                gameId,
                status: status || 'pending',
                creatorId: userId,
                creatorName: userName,
                timestamp: new Date().toISOString()
            });
        }

        socket.emit('wordle:newGameSent', { success: true, gameId });

    } catch (error) {
        console.error('Wordle new game error:', error);
        socket.emit('wordle:error', { message: 'Failed to notify partner of new game' });
    }
};
