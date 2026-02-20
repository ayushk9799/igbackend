import express from 'express';
import Chat from '../models/Chat.js';
import User from '../models/User.js';

const router = express.Router();

/**
 * POST /api/chat/answer
 * Submit an answer to a question and auto-create/update chat thread
 * 
 * Body: { userId, questionSource, questionId?, challengeId?, taskIndex?, questionText, questionCategory, answer }
 */
router.post('/answer', async (req, res) => {
    try {
        const {
            userId,
            questionSource,
            questionId,
            challengeId,
            taskIndex,
            questionText,
            questionCategory,
            answer,
            answerType
        } = req.body;

        // Validation
        if (!userId || !questionSource || !questionText || !answer) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: userId, questionSource, questionText, answer'
            });
        }

        // Get user and partner
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        if (!user.partnerId) {
            return res.status(400).json({
                success: false,
                message: 'User has no partner linked'
            });
        }

        // Find or create chat
        const chat = await Chat.findOrCreateForQuestion({
            userId,
            partnerId: user.partnerId,
            questionSource,
            questionId,
            challengeId,
            taskIndex,
            questionText,
            questionCategory,
            answer,
            answerType
        });

        // Check if both partners have answered (at least one 'answer' type message from each)
        const answerers = new Set(chat.messages.filter(m => m.messageType === 'answer').map(m => m.senderId.toString()));
        const bothAnswered = answerers.has(userId.toString()) && answerers.has(user.partnerId.toString());

        res.status(200).json({
            success: true,
            message: 'Answer saved and chat created/updated',
            data: {
                chatId: chat._id,
                questionText: chat.questionText,
                bothAnswered
            }
        });

    } catch (error) {
        console.error('❌ [chat/answer] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save answer',
            error: error.message
        });
    }
});

/**
 * GET /api/chat/user/:userId
 * Get all chats for a user with unread counts
 */
router.get('/user/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        // Get user's current partnerId to filter chats to current pairing only
        const user = await User.findById(userId).select('partnerId').lean();
        const partnerId = user?.partnerId?.toString() || null;

        const chats = await Chat.getChatsForUser(userId, partnerId);

        res.status(200).json({
            success: true,
            data: {
                chats,
                count: chats.length
            }
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chats',
            error: error.message
        });
    }
});

/**
 * GET /api/chat/unread/:userId
 * Get total unread count for badge display
 */
router.get('/unread/:userId', async (req, res) => {
    try {
        const { userId } = req.params;

        const unreadCount = await Chat.getTotalUnreadCount(userId);

        res.status(200).json({
            success: true,
            data: { unreadCount }
        });

    } catch (error) {
        console.error('❌ [chat/unread] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch unread count',
            error: error.message
        });
    }
});

/**
 * GET /api/chat/:chatId
 * Get chat details with recent messages
 */
router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;

        const chat = await Chat.findById(chatId)
            .populate('partner1', 'name nickname avatar')
            .populate('partner2', 'name nickname avatar')
            .populate('messages.senderId', 'name nickname avatar')
            .lean();

        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Return the embedded messages
        res.status(200).json({
            success: true,
            data: {
                chat,
                messages: chat.messages
            }
        });

    } catch (error) {
        console.error('❌ [chat/:chatId] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch chat',
            error: error.message
        });
    }
});

/**
 * GET /api/chat/:chatId/messages
 * Get paginated messages for a chat
 */
router.get('/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { limit = 50, before } = req.query;

        const messages = await ChatMessage.getMessagesForChat(chatId, parseInt(limit), before);

        res.status(200).json({
            success: true,
            data: {
                messages,
                hasMore: messages.length >= parseInt(limit)
            }
        });

    } catch (error) {
        console.error('❌ [chat/:chatId/messages] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch messages',
            error: error.message
        });
    }
});

/**
 * POST /api/chat/:chatId/message
 * Send a message (HTTP fallback, prefer socket for real-time)
 */
router.post('/:chatId/message', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userId, content, messageType = 'text' } = req.body;

        if (!userId || !content) {
            return res.status(400).json({
                success: false,
                message: 'userId and content are required'
            });
        }

        // Get chat to verify access and update
        const chat = await Chat.findById(chatId);
        if (!chat) {
            return res.status(404).json({
                success: false,
                message: 'Chat not found'
            });
        }

        // Verify user is part of chat
        const isPartner1 = chat.partner1.toString() === userId.toString();
        const isPartner2 = chat.partner2.toString() === userId.toString();
        if (!isPartner1 && !isPartner2) {
            return res.status(403).json({
                success: false,
                message: 'User is not part of this chat'
            });
        }

        // Create message object
        const newMessage = {
            senderId: userId,
            content: content.trim(),
            messageType,
            createdAt: new Date()
        };

        // Update chat document
        const unreadField = isPartner1 ? 'partner2Unread' : 'partner1Unread';

        chat.messages.push(newMessage);
        chat.lastMessageAt = new Date();
        chat.lastMessagePreview = content.substring(0, 100);
        chat.messageCount += 1;
        chat[unreadField] += 1;

        await chat.save();

        // Get the saved message with populated sender
        const populatedChat = await Chat.findById(chatId).populate('messages.senderId', 'name nickname avatar').lean();
        const savedMessage = populatedChat.messages[populatedChat.messages.length - 1];

        res.status(201).json({
            success: true,
            message: 'Message sent',
            data: savedMessage
        });

    } catch (error) {
        console.error('❌ [chat/:chatId/message] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send message',
            error: error.message
        });
    }
});

/**
 * POST /api/chat/:chatId/read
 * Mark chat as read for a user
 */
router.post('/:chatId/read', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({
                success: false,
                message: 'userId is required'
            });
        }

        // Mark messages as read
        const markedCount = await ChatMessage.markAsRead(chatId, userId);

        // Update unread count in chat
        const chat = await Chat.findById(chatId);
        if (chat) {
            const isPartner1 = chat.partner1.toString() === userId.toString();
            await Chat.findByIdAndUpdate(chatId, {
                [isPartner1 ? 'partner1Unread' : 'partner2Unread']: 0
            });
        }

        res.status(200).json({
            success: true,
            message: `Marked ${markedCount} messages as read`
        });

    } catch (error) {
        console.error('❌ [chat/:chatId/read] Error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to mark as read',
            error: error.message
        });
    }
});

export default router;
