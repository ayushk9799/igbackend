export const shouldSendImmediateAnswerNotification = (questionSource) => (
    String(questionSource || '').trim().toLowerCase() !== 'dailychallenge'
);

export const buildDailyChallengeCompletionNotification = ({
    senderName,
    senderId,
    challengeId,
    ritualDate,
    isCoupleComplete = false,
}) => {
    const displayName = senderName?.trim() || 'Your partner';

    return {
        title: '❤ Daily Challenge update',
        body: isCoupleComplete
            ? `${displayName} completed their side. You finished today's challenge together!`
            : `${displayName} completed their side. Complete yours when you're ready.`,
        data: {
            type: 'daily_challenge_complete',
            route: 'dailyChallenge',
            tab: 'dailyChallenge',
            challengeId,
            ritualDate,
            senderId,
            senderName: displayName,
            coupleComplete: isCoupleComplete,
        },
    };
};
