import Couple from '../models/Couple.js';
import DailyChallenge from '../models/DailyChallenge.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotification.js';
import { ensureRitualSettings, getRitualWindow } from '../utils/dailyRitual.js';
import {
    buildDailyChallengeAvailableNotification,
    isWithinOpenNotificationWindow,
} from './dailyChallengeNotificationService.js';

export const DAILY_CHALLENGE_OPEN_SWEEP_INTERVAL_MS = 5 * 60 * 1000;
export const DAILY_CHALLENGE_OPEN_GRACE_MS = 3 * 60 * 60 * 1000;

let sweepTimer = null;
let sweepRunning = false;

/**
 * Find every active couple whose ritual day has just opened and push
 * "today's Daily Challenge is ready" to both partners.
 * The conditional update on ritualOpenNotifiedDate claims each couple/day
 * exactly once, so overlapping sweeps or several server instances can't
 * double-send.
 */
export const notifyOpenedDailyChallenges = async ({
    now = new Date(),
    graceMs = DAILY_CHALLENGE_OPEN_GRACE_MS,
    send = sendPushNotification,
} = {}) => {
    const challengeByDate = new Map();
    const getChallenge = async (ritualDate) => {
        if (!challengeByDate.has(ritualDate)) {
            challengeByDate.set(ritualDate, await DailyChallenge.findOne({
                date: ritualDate,
                isActive: true,
            }).select('_id').lean());
        }
        return challengeByDate.get(ritualDate);
    };

    const cursor = Couple.find({
        status: 'active',
        partner1: { $ne: null },
        partner2: { $ne: null },
    })
        .select('partner1 partner2 ritualTimezone ritualResetHour ritualOpenNotifiedDate')
        .cursor();

    let couplesNotified = 0;
    for await (const couple of cursor) {
        try {
            // Same defaults the app applies when a partner opens the challenge.
            if (!couple.ritualTimezone || couple.ritualResetHour == null) {
                const user = couple.ritualTimezone
                    ? null
                    : await User.findById(couple.partner1).select('timezone').lean();
                await ensureRitualSettings(couple, user);
            }

            const window = getRitualWindow({
                now,
                timeZone: couple.ritualTimezone,
                resetHour: couple.ritualResetHour,
            });

            if (couple.ritualOpenNotifiedDate === window.ritualDate) continue;
            if (!isWithinOpenNotificationWindow({ opensAt: window.opensAt, now, graceMs })) continue;

            const challenge = await getChallenge(window.ritualDate);
            if (!challenge) continue;

            const claim = await Couple.updateOne(
                {
                    _id: couple._id,
                    status: 'active',
                    ritualOpenNotifiedDate: { $ne: window.ritualDate },
                },
                { $set: { ritualOpenNotifiedDate: window.ritualDate } },
            );
            if (!claim.modifiedCount) continue;

            const partners = await User.find({
                _id: { $in: [couple.partner1, couple.partner2] },
            }).select('_id name nickname').lean();
            const byId = new Map(partners.map(user => [user._id.toString(), user]));

            const pairs = [
                [couple.partner1, couple.partner2],
                [couple.partner2, couple.partner1],
            ];
            for (const [recipientId, partnerId] of pairs) {
                const partner = byId.get(partnerId.toString());
                const notification = buildDailyChallengeAvailableNotification({
                    partnerName: partner?.nickname || partner?.name,
                    challengeId: String(challenge._id),
                    ritualDate: window.ritualDate,
                });
                await send(recipientId, notification.title, notification.body, notification.data);
            }
            couplesNotified += 1;
        } catch (error) {
            console.error(`🔔 [DAILY CHALLENGE] Open notification failed for couple ${couple._id}:`, error);
        }
    }

    return couplesNotified;
};

const runSweep = async () => {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
        const count = await notifyOpenedDailyChallenges();
        if (count) console.log(`🔔 [DAILY CHALLENGE] Sent "challenge ready" to ${count} couple(s)`);
    } catch (error) {
        console.error('🔔 [DAILY CHALLENGE] Open notification sweep failed:', error);
    } finally {
        sweepRunning = false;
    }
};

export const startDailyChallengeOpenLoop = (intervalMs = DAILY_CHALLENGE_OPEN_SWEEP_INTERVAL_MS) => {
    if (sweepTimer) return sweepTimer;
    runSweep();
    sweepTimer = setInterval(runSweep, intervalMs);
    sweepTimer.unref?.();
    return sweepTimer;
};

export const stopDailyChallengeOpenLoop = () => {
    if (sweepTimer) clearInterval(sweepTimer);
    sweepTimer = null;
};
