import Chat from '../../models/Chat.js';

/**
 * Handle user joining a chat room
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId }
 */
export const handleChatJoin = async (socket, io, data) => {
    try {
        const { chatId } = data;
        const { userId } = socket;

        if (!chatId) {
            socket.emit('chat:error', { message: 'chatId is required' });
            return;
        }

        // Verify user has access to this chat
        const chat = await Chat.findById(chatId);
        if (!chat) {
            socket.emit('chat:error', { message: 'Chat not found' });
            return;
        }

        const isPartner1 = chat.partner1.toString() === userId.toString();
        const isPartner2 = chat.partner2.toString() === userId.toString();
        if (!isPartner1 && !isPartner2) {
            socket.emit('chat:error', { message: 'Access denied' });
            return;
        }

        // Join the chat room
        const roomId = `chat:${chatId}`;
        socket.join(roomId);

        // Notify partner that user joined
        socket.to(roomId).emit('chat:userJoined', {
            chatId,
            userId
        });

        // Send confirmation
        socket.emit('chat:joined', {
            chatId,
            success: true
        });

    } catch (error) {
        console.error('❌ [chat:join] Error:', error);
        socket.emit('chat:error', { message: 'Failed to join chat' });
    }
};

/**
 * Handle user leaving a chat room
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId }
 */
export const handleChatLeave = (socket, io, data) => {
    const { chatId } = data;
    const { userId } = socket;

    if (chatId) {
        const roomId = `chat:${chatId}`;
        socket.leave(roomId);

        // Notify partner
        socket.to(roomId).emit('chat:userLeft', {
            chatId,
            userId
        });
    }
};

/**
 * Handle sending a chat message
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId, content, messageType? }
 */
export const handleChatMessage = async (socket, io, data) => {
    try {
        const { chatId, content, messageType = 'text' } = data;
        const { userId, userName } = socket;

        if (!chatId || !content) {
            socket.emit('chat:error', { message: 'chatId and content are required' });
            return;
        }

        // Validate content
        const trimmedContent = content.trim();
        if (!trimmedContent) {
            socket.emit('chat:error', { message: 'Message cannot be empty' });
            return;
        }

        if (trimmedContent.length > 2000) {
            socket.emit('chat:error', { message: 'Message too long (max 2000 characters)' });
            return;
        }

        // Get chat to verify access and determine partner
        const chat = await Chat.findById(chatId);
        if (!chat) {
            socket.emit('chat:error', { message: 'Chat not found' });
            return;
        }

        const isPartner1 = chat.partner1.toString() === userId.toString();
        const isPartner2 = chat.partner2.toString() === userId.toString();
        if (!isPartner1 && !isPartner2) {
            socket.emit('chat:error', { message: 'Access denied' });
            return;
        }

        // Create message object
        const newMessage = {
            senderId: userId,
            content: trimmedContent,
            messageType: messageType,
            createdAt: new Date()
        };

        // Update chat and push message
        const unreadField = isPartner1 ? 'partner2Unread' : 'partner1Unread';

        chat.messages.push(newMessage);
        chat.lastMessageAt = new Date();
        chat.lastMessagePreview = trimmedContent.substring(0, 100);
        chat.messageCount += 1;
        chat[unreadField] += 1;

        await chat.save();

        // Get the actual message with its generated ID
        const savedMessage = chat.messages[chat.messages.length - 1];

        // Build message object for broadcast
        const messageData = {
            _id: savedMessage._id,
            chatId,
            senderId: userId,
            senderName: userName,
            content: trimmedContent,
            messageType,
            createdAt: savedMessage.createdAt
        };

        // Broadcast to chat room (including sender for confirmation)
        io.to(`chat:${chatId}`).emit('chat:newMessage', {
            message: messageData
        });

        // Also notify via couple room for push notifications / badge updates
        if (chat.coupleId) {
            socket.to(`couple:${chat.coupleId}`).emit('chat:notification', {
                chatId,
                senderName: userName,
                preview: trimmedContent.substring(0, 50),
                questionText: chat.questionText?.substring(0, 50)
            });
        }


        // ---------------------------------------------------------
        // SMART NOTIFICATION LOGIC
        // ---------------------------------------------------------

        // Identify the partner ID
        const partnerId = isPartner1 ? chat.partner2 : chat.partner1;

        // Check if partner is in the chat room
        // We use io.sockets.adapter.rooms.get(roomId) to see sockets in room
        const roomId = `chat:${chatId}`;
        const roomSockets = io.sockets.adapter.rooms.get(roomId);

        // We need to map userId to socketId to know if *that specific user* is in the room.
        // However, a simpler check is: if room only has 1 person (the sender), then partner is offline/away.
        // Or if we can find the partner's socket. 
        // For accurate checking, we'd need a way to know WHICH socket belongs to the partner.
        // Assuming we don't have a global userId->socketId map handy in this scope without fetching,
        // we can check if the number of clients in the room is < 2.
        // IF there are 2 people, assumption is both are there.
        // IF there is 1 person (sender), partner is away.

        const isPartnerInRoom = roomSockets && roomSockets.size >= 2;

        if (!isPartnerInRoom) {

            // Dynamic import to avoid circular dependency issues if any, or just standard import at top
            const { sendPushNotification } = await import('../../utils/pushNotification.js');

            await sendPushNotification(
                partnerId,
                userName, // Title: Sender Name
                trimmedContent, // Body: Message Content
                {
                    type: 'chat',
                    chatId: chatId,
                    senderId: userId
                }
            );
        } else {
        }

    } catch (error) {
        console.error('❌ [chat:message] Error:', error);
        socket.emit('chat:error', { message: 'Failed to send message' });
    }
};

/**
 * Handle typing indicator
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId, isTyping }
 */
export const handleChatTyping = (socket, io, data) => {
    const { chatId, isTyping } = data;
    const { userId, userName } = socket;

    if (!chatId) return;

    // Broadcast to chat room (except sender)
    socket.to(`chat:${chatId}`).emit('chat:typing', {
        chatId,
        userId,
        userName,
        isTyping: !!isTyping
    });
};

/**
 * Handle marking messages as read
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId }
 */
export const handleChatRead = async (socket, io, data) => {
    try {
        const { chatId } = data;
        const { userId } = socket;

        if (!chatId) {
            socket.emit('chat:error', { message: 'chatId is required' });
            return;
        }

        // Update chat unread counts and mark messages as read
        const chat = await Chat.findById(chatId);
        if (chat) {
            const isPartner1 = chat.partner1.toString() === userId.toString();

            // Mark all messages from the OTHER partner as read
            let markedCount = 0;
            chat.messages.forEach(msg => {
                if (msg.senderId.toString() !== userId.toString() && !msg.isRead) {
                    msg.isRead = true;
                    msg.readAt = new Date();
                    markedCount++;
                }
            });

            // Reset unread count for the current user
            chat[isPartner1 ? 'partner1Unread' : 'partner2Unread'] = 0;

            await chat.save();

            // Notify partner of read receipt
            socket.to(`chat:${chatId}`).emit('chat:readReceipt', {
                chatId,
                readBy: userId,
                readAt: new Date()
            });

        }

    } catch (error) {
        console.error('❌ [chat:read] Error:', error);
        socket.emit('chat:error', { message: 'Failed to mark as read' });
    }
};

/**
 * Handle adding reaction to a message
 * @param {Socket} socket
 * @param {Server} io
 * @param {Object} data - { chatId, messageId, emoji }
 */
export const handleChatReaction = async (socket, io, data) => {
    try {
        const { chatId, messageId, emoji } = data;
        const { userId } = socket;

        if (!chatId || !messageId || !emoji) {
            socket.emit('chat:error', { message: 'chatId, messageId, and emoji are required' });
            return;
        }

        // Find the chat and the specific message
        const chat = await Chat.findById(chatId);
        if (!chat) {
            socket.emit('chat:error', { message: 'Chat not found' });
            return;
        }

        const message = chat.messages.id(messageId);
        if (!message) {
            socket.emit('chat:error', { message: 'Message not found' });
            return;
        }

        // Check if user already reacted with this emoji
        const existingIndex = message.reactions.findIndex(
            r => r.userId.toString() === userId && r.emoji === emoji
        );

        if (existingIndex >= 0) {
            // Remove reaction
            message.reactions.splice(existingIndex, 1);
        } else {
            // Add reaction
            message.reactions.push({
                userId,
                emoji,
                createdAt: new Date()
            });
        }

        await chat.save();

        // Broadcast reaction update
        io.to(`chat:${chatId}`).emit('chat:reactionUpdate', {
            chatId,
            messageId,
            reactions: message.reactions
        });

    } catch (error) {
        console.error('❌ [chat:reaction] Error:', error);
        socket.emit('chat:error', { message: 'Failed to add reaction' });
    }
};
