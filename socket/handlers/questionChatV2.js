import QuestionChatV2 from '../../models/v2/QuestionChatV2.js';

const roomIdForChat = (chatId) => `question-chat-v2:${chatId}`;

const isParticipant = (chat, userId) => (
    String(chat?.partner1) === String(userId)
    || String(chat?.partner2) === String(userId)
);

export const handleQuestionChatV2Join = async (socket, io, data = {}) => {
    try {
        const { chatId } = data;
        if (!chatId) return;

        const chat = await QuestionChatV2.findById(chatId)
            .select('partner1 partner2')
            .lean();
        if (!chat || !isParticipant(chat, socket.userId)) return;

        socket.join(roomIdForChat(chatId));
    } catch (error) {
        console.error('[questionChatV2:join] Failed:', error);
    }
};

export const handleQuestionChatV2Leave = (socket, io, data = {}) => {
    const { chatId } = data;
    if (!chatId) return;

    const roomId = roomIdForChat(chatId);
    socket.to(roomId).emit('questionChatV2:typing', {
        chatId,
        userId: socket.userId,
        userName: socket.userName,
        isTyping: false,
    });
    socket.leave(roomId);
};

export const handleQuestionChatV2Typing = (socket, io, data = {}) => {
    const { chatId, isTyping } = data;
    if (!chatId) return;

    const roomId = roomIdForChat(chatId);
    if (!socket.rooms.has(roomId)) return;

    socket.to(roomId).emit('questionChatV2:typing', {
        chatId,
        userId: socket.userId,
        userName: socket.userName,
        isTyping: Boolean(isTyping),
    });
};

export default {
    handleQuestionChatV2Join,
    handleQuestionChatV2Leave,
    handleQuestionChatV2Typing,
};

