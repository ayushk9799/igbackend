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

// Sent once per couple per ritual day, when that day's challenge opens.
export const buildDailyChallengeAvailableNotification = ({
    partnerName,
    challengeId,
    ritualDate,
}) => {
    const displayName = partnerName?.trim() || 'your partner';

    return {
        title: "💛 Today's Daily Challenge is ready",
        body: `Answer today's questions with ${displayName} and keep your streak going.`,
        data: {
            type: 'daily_challenge_available',
            route: 'dailyChallenge',
            tab: 'dailyChallenge',
            challengeId,
            ritualDate,
        },
    };
};

// Only notify close to when the day opened, so a server that was down for
// hours doesn't wake people up with a stale "it's ready" late at night.
export const isWithinOpenNotificationWindow = ({ opensAt, now, graceMs }) => {
    const elapsed = new Date(now).getTime() - new Date(opensAt).getTime();
    return elapsed >= 0 && elapsed < graceMs;
};
