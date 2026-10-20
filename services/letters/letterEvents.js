import User from '../../models/User.js';
import { sendPushNotification } from '../../utils/pushNotification.js';
import { getIO } from '../../socket/index.js';
import { getCoupleRoomId } from '../../socket/auth.js';
import { getBird } from './letterRules.js';

const idOf = (value) => String(value?._id || value || '');

export const formatTravelTime = (ms) => {
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return `${minutes} minutes`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return hours === 1 ? '1 hour' : `${hours} hours`;
    const days = Math.round(hours / 24);
    return days === 1 ? '1 day' : `${days} days`;
};

const letterData = (letter, event) => ({
    type: 'letter',
    event,
    route: 'letters',
    tab: 'letters',
    letterId: idOf(letter._id),
});

export const buildLetterSentNotification = ({ letter, senderName }) => {
    const bird = getBird(letter.bird);
    const travelMs = new Date(letter.deliverAt).getTime() - new Date(letter.sentAt).getTime();
    return {
        title: '💌 A letter is on its way',
        body: `${senderName} sent you a letter by ${bird?.name || 'bird'}. It lands in ${formatTravelTime(travelMs)}.`,
        data: letterData(letter, 'sent'),
    };
};

export const buildLetterDeliveredNotification = ({ letter, senderName }) => ({
    title: '💌 Your letter landed',
    body: `${senderName}'s letter is here. Open it now.`,
    data: letterData(letter, 'delivered'),
});

export const buildLetterReadNotification = ({ letter, readerName }) => {
    const bird = getBird(letter.bird);
    return {
        title: `💕 ${readerName} opened your letter`,
        body: `Your ${bird?.name || 'bird'} delivered it safely.`,
        data: letterData(letter, 'read'),
    };
};

export const getDisplayName = async (userId) => {
    const user = await User.findById(userId).select('name nickname').lean();
    return user?.nickname || user?.name || 'Your partner';
};

// The text is left out on purpose: each partner refetches and gets the
// version they are allowed to see.
export const emitLetterEvent = (letter, event) => {
    try {
        const roomId = getCoupleRoomId(idOf(letter.senderId), idOf(letter.recipientId));
        if (!roomId) return;
        getIO()?.to(roomId).emit(`letter:${event}`, {
            letterId: idOf(letter._id),
            status: letter.status,
            bird: letter.bird,
            senderId: idOf(letter.senderId),
            recipientId: idOf(letter.recipientId),
            deliverAt: letter.deliverAt,
        });
    } catch (error) {
        console.warn(`💌 [LETTERS] Failed to emit letter:${event}:`, error.message);
    }
};

const pushTo = async (userId, notification) => {
    const sent = await sendPushNotification(userId, notification.title, notification.body, notification.data);
    if (!sent) console.warn(`💌 [LETTERS] ${notification.data.event} notification was not delivered`);
    return sent;
};

export const notifyLetterSent = async (letter) => {
    const senderName = await getDisplayName(letter.senderId);
    emitLetterEvent(letter, 'sent');
    return pushTo(letter.recipientId, buildLetterSentNotification({ letter, senderName }));
};

export const notifyLetterDelivered = async (letter) => {
    const senderName = await getDisplayName(letter.senderId);
    emitLetterEvent(letter, 'delivered');
    return pushTo(letter.recipientId, buildLetterDeliveredNotification({ letter, senderName }));
};

export const notifyLetterRead = async (letter) => {
    const readerName = await getDisplayName(letter.recipientId);
    emitLetterEvent(letter, 'read');
    return pushTo(letter.senderId, buildLetterReadNotification({ letter, readerName }));
};

export const notifyLetterRecalled = (letter) => {
    emitLetterEvent(letter, 'recalled');
};
