import { Server } from 'socket.io';
import { socketAuth, handleConnection } from './auth.js';
import { handleMoodUpdate, handleMoodRequest, handleGetMyMood } from './handlers/mood.js';
import { handlePresenceRequest, handleNudge } from './handlers/presence.js';
import { handleScribbleSend, handleScribbleRequest } from './handlers/scribble.js';

/**
 * Initialize Socket.io server
 * @param {http.Server} httpServer - HTTP server instance
 * @returns {Server} Socket.io server instance
 */
export const initializeSocket = (httpServer) => {
    const io = new Server(httpServer, {
        cors: {
            origin: '*', // Configure for production
            methods: ['GET', 'POST'],
        },
        pingTimeout: 60000,
        pingInterval: 25000,
    });

    // Apply authentication middleware
    io.use(socketAuth);

    // Handle new connections
    io.on('connection', (socket) => {
        console.log('🔌 New socket connection attempt:', socket.id);

        // ======== REGISTER ALL EVENT HANDLERS FIRST (synchronously) ========
        // This prevents race conditions where client emits before handlers exist

        // ======== MOOD EVENTS ========
        console.log('📝 Registering mood events for socket:', socket.id);

        socket.on('mood:update', (data) => {
            console.log('📥 Received mood:update from', socket.id);
            handleMoodUpdate(socket, io, data);
        });

        socket.on('mood:getPartner', () => {
            console.log('📥 Received mood:getPartner from', socket.id);
            handleMoodRequest(socket, io);
        });

        socket.on('mood:getMyMood', () => {
            console.log('📥 Received mood:getMyMood from', socket.id);
            handleGetMyMood(socket, io);
        });

        // ======== PRESENCE EVENTS ========
        socket.on('presence:getStatus', () => {
            console.log('📥 Received presence:getStatus from', socket.id);
            handlePresenceRequest(socket, io);
        });

        socket.on('nudge:send', (data) => {
            handleNudge(socket, io, data);
        });

        // ======== SCRIBBLE EVENTS ========
        socket.on('scribble:send', (data) => {
            console.log('📥 Received scribble:send from', socket.id);
            handleScribbleSend(socket, io, data);
        });

        socket.on('scribble:getPartner', () => {
            console.log('📥 Received scribble:getPartner from', socket.id);
            handleScribbleRequest(socket, io);
        });

        // Question/Answer events
        socket.on('answer:submit', (data) => {
            console.log('Answer submitted:', data);
        });

        console.log('✅ All event handlers registered for socket:', socket.id);

        // ======== NOW DO ASYNC SETUP (after handlers are ready) ========
        handleConnection(socket, io)
            .then(() => {
                console.log('✅ handleConnection completed for:', socket.id);
            })
            .catch((error) => {
                console.error('❌ handleConnection error:', error);
            });
    });

    console.log('🔌 Socket.io server initialized');
    return io;
};

export default initializeSocket;
