import { Server } from 'socket.io';
import { socketAuth, handleConnection, connectedUsers } from './auth.js';
import {
    handleMoodUpdate,
    handleMoodRequest,
    handleGetMyMood,
    handleGetMoodHistory,
    handleGetPartnerMoodHistory
} from './handlers/mood.js';
import { handlePresenceRequest, handleNudge } from './handlers/presence.js';
import {
    handleScribbleSend,
    handleScribbleRequest,
    handleScribbleLiveStart,
    handleScribbleLiveEnd,
    handleScribbleLiveStrokeEnd,
    handleScribbleLiveClear,
    handleScribbleLiveUndo
} from './handlers/scribble.js';
import {
    handleTicTacToeJoin,
    handleTicTacToeLeave,
    handleTicTacToeMove,
    handleTicTacToeInvite,
    handleTicTacToeComplete,
    handleTicTacToeNewGame
} from './handlers/tictactoe.js';
import {
    handleWordleJoin,
    handleWordleLeave,
    handleWordleGuess,
    handleWordleInvite,
    handleWordleComplete,
    handleWordleNewGame
} from './handlers/wordle.js';
import {
    handleChatJoin,
    handleChatLeave,
    handleChatMessage,
    handleChatTyping,
    handleChatRead,
    handleChatReaction
} from './handlers/chat.js';

/**
 * Initialize Socket.io server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
// Module-level io reference so routes can emit events
let ioInstance = null;

export const getIO = () => ioInstance;

export const initializeSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*', // Configure for production
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    ioInstance = io;

    // Apply authentication middleware
    io.use(socketAuth);

    // Handle new connections
    io.on('connection', (socket) => {

        // ======== REGISTER ALL EVENT HANDLERS FIRST (synchronously) ========
        // This prevents race conditions where client emits before handlers exist

        // ======== MOOD EVENTS ========

        socket.on('mood:update', (data) => {
            handleMoodUpdate(socket, io, data);
        });

        socket.on('mood:getPartner', () => {
            handleMoodRequest(socket, io);
        });

        socket.on('mood:getMyMood', () => {
            handleGetMyMood(socket, io);
        });

        socket.on('mood:getHistory', (data) => {
            handleGetMoodHistory(socket, io, data);
        });

        socket.on('mood:getPartnerHistory', (data) => {
            handleGetPartnerMoodHistory(socket, io, data);
        });

        // ======== PRESENCE EVENTS ========
        socket.on('presence:getStatus', () => {
            handlePresenceRequest(socket, io);
        });

        socket.on('nudge:send', (data) => {
            handleNudge(socket, io, data);
        });

        // ======== SCRIBBLE EVENTS ========
        socket.on('scribble:send', (data) => {
            handleScribbleSend(socket, io, data);
        });

        socket.on('scribble:getPartner', () => {
            handleScribbleRequest(socket, io);
        });

        socket.on('scribble:liveStart', () => {
            handleScribbleLiveStart(socket, io);
        });

        socket.on('scribble:liveEnd', () => {
            handleScribbleLiveEnd(socket, io);
        });

        socket.on('scribble:liveStrokeEnd', (data) => {
            handleScribbleLiveStrokeEnd(socket, io, data);
        });

        socket.on('scribble:liveClear', (data) => {
            handleScribbleLiveClear(socket, io, data);
        });

        socket.on('scribble:liveUndo', (data) => {
            handleScribbleLiveUndo(socket, io, data);
        });

        // Question/Answer events
        socket.on('answer:submit', (data) => {
        });

        // ======== TICTACTOE EVENTS ========
        socket.on('tictactoe:join', (data) => {
            handleTicTacToeJoin(socket, io, data);
        });

        socket.on('tictactoe:leave', (data) => {
            handleTicTacToeLeave(socket, io, data);
        });

        socket.on('tictactoe:move', (data) => {
            handleTicTacToeMove(socket, io, data);
        });

        socket.on('tictactoe:invite', (data) => {
            handleTicTacToeInvite(socket, io, data);
        });

        socket.on('tictactoe:complete', (data) => {
            handleTicTacToeComplete(socket, io, data);
        });

        socket.on('tictactoe:newGame', (data) => {
            handleTicTacToeNewGame(socket, io, data);
        });

        // ======== WORDLE EVENTS ========
        socket.on('wordle:join', (data) => {
            handleWordleJoin(socket, io, data);
        });

        socket.on('wordle:leave', (data) => {
            handleWordleLeave(socket, io, data);
        });

        socket.on('wordle:guess', (data) => {
            handleWordleGuess(socket, io, data);
        });

        socket.on('wordle:invite', (data) => {
            handleWordleInvite(socket, io, data);
        });

        socket.on('wordle:complete', (data) => {
            handleWordleComplete(socket, io, data);
        });

        socket.on('wordle:newGame', (data) => {
            handleWordleNewGame(socket, io, data);
        });

        // ======== CHAT EVENTS ========
        socket.on('chat:join', (data) => {
            handleChatJoin(socket, io, data);
        });

        socket.on('chat:leave', (data) => {
            handleChatLeave(socket, io, data);
        });

        socket.on('chat:message', (data) => {
            handleChatMessage(socket, io, data);
        });

        socket.on('chat:typing', (data) => {
            handleChatTyping(socket, io, data);
        });

        socket.on('chat:read', (data) => {
            handleChatRead(socket, io, data);
        });

        socket.on('chat:reaction', (data) => {
            handleChatReaction(socket, io, data);
        });


        // ======== NOW DO ASYNC SETUP (after handlers are ready) ========
        handleConnection(socket, io)
            .then(() => {
            })
            .catch((error) => {
                console.error('❌ handleConnection error:', error);
            });
    });

    // Log connected users every 5 seconds
   

    return io;
};

export default initializeSocket;
