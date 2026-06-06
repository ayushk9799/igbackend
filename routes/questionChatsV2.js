import express from 'express';
import User from '../models/User.js';
import QuestionChatV2 from '../models/v2/QuestionChatV2.js';
import QuestionChatMessageV2 from '../models/v2/QuestionChatMessageV2.js';
import { getIO } from '../socket/index.js';
import { getSocketId } from '../socket/auth.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const router = express.Router();

const getChatPartner = (chat, userId) => {
    const isPartner1 = chat.partner1?._id?.toString() === userId.toString()
        || chat.partner1?.toString() === userId.toString();
    return isPartner1 ? chat.partner2 : chat.partner1;
};

const getUnreadCount = (chat, userId) => {
    const isPartner1 = chat.partner1?._id?.toString() === userId.toString()
        || chat.partner1?.toString() === userId.toString();
    return isPartner1 ? chat.partner1Unread : chat.partner2Unread;
};

router.get('/', async (req, res) => {
    try {
        const { userId } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const user = await User.findById(userId).select('partnerId').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        const query = user.partnerId
            ? { coupleId: QuestionChatV2.generateCoupleId(userId, user.partnerId), status: 'active' }
            : {
                status: 'active',
                $or: [{ partner1: userId }, { partner2: userId }],
            };

        const chats = await QuestionChatV2.find(query)
            .sort({ lastMessageAt: -1, createdAt: -1 })
            .populate('partner1', 'name nickname avatar')
            .populate('partner2', 'name nickname avatar')
            .lean();

        res.status(200).json({
            success: true,
            data: {
                chats: chats.map((chat) => ({
                    ...chat,
                    partner: getChatPartner(chat, userId),
                    unreadCount: getUnreadCount(chat, userId),
                })),
                count: chats.length,
                syncTime: new Date(),
            },
        });
    } catch (error) {
        console.error('Error fetching V2 question chats:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch V2 question chats',
            error: error.message,
        });
    }
});

router.get('/:chatId', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { userId, limit = 50 } = req.query;

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const chat = await QuestionChatV2.findById(chatId)
            .populate('partner1', 'name nickname avatar')
            .populate('partner2', 'name nickname avatar')
            .lean();

        if (!chat) {
            return res.status(404).json({ success: false, message: 'V2 question chat not found' });
        }

        const isParticipant = [chat.partner1?._id?.toString(), chat.partner2?._id?.toString()]
            .includes(userId.toString());

        if (!isParticipant) {
            return res.status(403).json({ success: false, message: 'Not allowed to view this chat' });
        }

        const numericLimit = Math.min(Math.max(Number.parseInt(limit, 10) || 50, 1), 100);
        const messages = await QuestionChatMessageV2.find({ chatId })
            .sort({ createdAt: -1 })
            .limit(numericLimit)
            .populate('senderId', 'name nickname avatar')
            .lean();

        const isPartner1 = chat.partner1?._id?.toString() === userId.toString();
        await QuestionChatV2.findByIdAndUpdate(chatId, {
            $set: {
                [isPartner1 ? 'partner1Unread' : 'partner2Unread']: 0,
            },
        });

        await QuestionChatMessageV2.updateMany(
            { chatId, senderId: { $ne: userId }, isRead: false },
            { $set: { isRead: true, readAt: new Date() } }
        );

        res.status(200).json({
            success: true,
            data: {
                chat: {
                    ...chat,
                    partner: getChatPartner(chat, userId),
                    unreadCount: 0,
                },
                messages: messages.reverse(),
            },
        });
    } catch (error) {
        console.error('Error fetching V2 question chat:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch V2 question chat',
            error: error.message,
        });
    }
});

router.post('/:chatId/messages', async (req, res) => {
    try {
        const { chatId } = req.params;
        const { senderId, content, messageType = 'text' } = req.body;

        if (!senderId || !content) {
            return res.status(400).json({
                success: false,
                message: 'senderId and content are required',
            });
        }

        const chat = await QuestionChatV2.findById(chatId);
        if (!chat) {
            return res.status(404).json({ success: false, message: 'V2 question chat not found' });
        }

        const senderIdString = senderId.toString();
        const isPartner1 = chat.partner1.toString() === senderIdString;
        const isPartner2 = chat.partner2.toString() === senderIdString;

        if (!isPartner1 && !isPartner2) {
            return res.status(403).json({ success: false, message: 'Not allowed to message this chat' });
        }

        const message = await QuestionChatMessageV2.create({
            chatId,
            senderId,
            messageType,
            content,
        });

        const unreadField = isPartner1 ? 'partner2Unread' : 'partner1Unread';
        chat.lastMessage = content.substring(0, 120);
        chat.lastMessageAt = new Date();
        chat.messageCount += 1;
        chat[unreadField] += 1;
        await chat.save();

        const sender = await User.findById(senderId).select('name partnerId').lean();
        const recipientId = isPartner1 ? chat.partner2 : chat.partner1;
        const io = getIO();
        const recipientSocketId = getSocketId(recipientId.toString());

        if (io && recipientSocketId) {
            io.to(recipientSocketId).emit('questionChatV2:message', {
                chatId,
                message,
                preview: chat.lastMessage,
            });
        }

        try {
            await sendPushNotification(
                recipientId,
                chat.prompt.substring(0, 120),
                `${sender?.name || 'Your partner'}: ${chat.lastMessage}`,
                {
                    type: 'questionChatV2',
                    chatId: chat._id.toString(),
                    senderId,
                }
            );
        } catch (notifError) {
            console.warn('[questionChatsV2/messages] Push notification failed:', notifError.message);
        }

        res.status(201).json({
            success: true,
            message: 'V2 question chat message sent',
            data: {
                chatId,
                message,
            },
        });
    } catch (error) {
        console.error('Error sending V2 question chat message:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to send V2 question chat message',
            error: error.message,
        });
    }
});

export default router;
