import Couple from '../models/Couple.js';
import CoupleDailyRitualStatus from '../models/CoupleDailyRitualStatus.js';
import CoupleStreak from '../models/CoupleStreak.js';
import DailyAnswers from '../models/DailyAnswers.js';
import DailyChallenge from '../models/DailyChallenge.js';
import User from '../models/User.js';

const DEFAULT_RITUAL_TIMEZONE = 'UTC';
const DEFAULT_RITUAL_RESET_HOUR = 5;

const dateFormatterCache = new Map();

const isValidTimeZone = (timeZone) => {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone }).format(new Date());
        return true;
    } catch {
        return false;
    }
};

const getFormatter = (timeZone) => {
    if (!dateFormatterCache.has(timeZone)) {
        dateFormatterCache.set(timeZone, new Intl.DateTimeFormat('en-US', {
            timeZone,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false,
            hourCycle: 'h23',
        }));
    }

    return dateFormatterCache.get(timeZone);
};

const getZonedParts = (date, timeZone) => {
    const parts = getFormatter(timeZone).formatToParts(date);
    const byType = Object.fromEntries(parts.map(part => [part.type, part.value]));
    const hour = Number(byType.hour) === 24 ? 0 : Number(byType.hour);

    return {
        year: Number(byType.year),
        month: Number(byType.month),
        day: Number(byType.day),
        hour,
        minute: Number(byType.minute),
        second: Number(byType.second),
    };
};

const formatDateKey = ({ year, month, day }) => (
    `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
);

const addDaysToDateKey = (dateKey, days) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day + days));

    return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
};

const getTimezoneOffsetMs = (date, timeZone) => {
    const parts = getZonedParts(date, timeZone);
    const asUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);

    return asUtc - date.getTime();
};

const zonedDateTimeToUtc = (dateKey, hour, timeZone) => {
    const [year, month, day] = dateKey.split('-').map(Number);
    const localAsUtc = Date.UTC(year, month - 1, day, hour, 0, 0);
    const firstGuess = new Date(localAsUtc);
    const firstOffset = getTimezoneOffsetMs(firstGuess, timeZone);
    const secondGuess = new Date(localAsUtc - firstOffset);
    const secondOffset = getTimezoneOffsetMs(secondGuess, timeZone);

    return new Date(localAsUtc - secondOffset);
};

export const getRitualWindow = ({
    now = new Date(),
    timeZone = DEFAULT_RITUAL_TIMEZONE,
    resetHour = DEFAULT_RITUAL_RESET_HOUR,
} = {}) => {
    const localNow = getZonedParts(now, timeZone);
    const todayKey = formatDateKey(localNow);
    const ritualDate = localNow.hour < resetHour ? addDaysToDateKey(todayKey, -1) : todayKey;
    const nextRitualDate = addDaysToDateKey(ritualDate, 1);

    return {
        ritualDate,
        opensAt: zonedDateTimeToUtc(ritualDate, resetHour, timeZone),
        closesAt: zonedDateTimeToUtc(nextRitualDate, resetHour, timeZone),
        nextRitualDate,
    };
};

export const getPreviousDateKey = (dateKey) => addDaysToDateKey(dateKey, -1);

export const getActiveCoupleForUser = async (userId) => {
    const user = await User.findById(userId).select('name partnerId timezone').lean();

    if (!user) {
        return { user: null, couple: null, partnerId: null };
    }

    const couple = await Couple.findByPartner(userId);
    const partnerId = couple
        ? (couple.partner1.toString() === userId.toString() ? couple.partner2 : couple.partner1)
        : user.partnerId;

    return { user, couple, partnerId };
};

export const ensureRitualSettings = async (couple, user) => {
    if (!couple) return null;

    let changed = false;

    if (!couple.ritualTimezone) {
        couple.ritualTimezone = isValidTimeZone(user?.timezone)
            ? user.timezone
            : DEFAULT_RITUAL_TIMEZONE;
        changed = true;
    } else if (!isValidTimeZone(couple.ritualTimezone)) {
        couple.ritualTimezone = DEFAULT_RITUAL_TIMEZONE;
        changed = true;
    }

    if (couple.ritualResetHour === undefined || couple.ritualResetHour === null) {
        couple.ritualResetHour = DEFAULT_RITUAL_RESET_HOUR;
        changed = true;
    }

    if (changed) {
        await couple.save();
    }

    return couple;
};

const getPartnerFields = (couple) => ({
    userA: couple.partner1,
    userB: couple.partner2,
});

export const findOrCreateRitualStatus = async ({ couple, challenge, window }) => {
    const { userA, userB } = getPartnerFields(couple);
    let status = await CoupleDailyRitualStatus.findOne({
        coupleId: couple._id,
        ritualDate: window.ritualDate,
    });

    if (!status) {
        const completeAnswers = await DailyAnswers.find({
            coupleId: Couple.generateCoupleId(userA, userB),
            date: window.ritualDate,
            isComplete: true,
        }).select('userId completedAt').lean();

        const userAAnswer = completeAnswers.find(answer => answer.userId.toString() === userA.toString());
        const userBAnswer = completeAnswers.find(answer => answer.userId.toString() === userB.toString());
        const userAComplete = !!userAAnswer;
        const userBComplete = !!userBAnswer;

        status = await CoupleDailyRitualStatus.findOneAndUpdate(
            { coupleId: couple._id, ritualDate: window.ritualDate },
            {
                $setOnInsert: {
                    coupleId: couple._id,
                    ritualDate: window.ritualDate,
                    challengeId: challenge._id,
                    opensAt: window.opensAt,
                    closesAt: window.closesAt,
                    userA,
                    userB,
                    userAComplete,
                    userBComplete,
                    userACompletedAt: userAAnswer?.completedAt || null,
                    userBCompletedAt: userBAnswer?.completedAt || null,
                    heartState: userAComplete && userBComplete ? 'full' : (userAComplete || userBComplete ? 'half' : 'empty'),
                },
            },
            { upsert: true, new: true, runValidators: true }
        );
    }

    return status;
};

export const getOrCreateCoupleStreak = async (coupleId) => (
    CoupleStreak.findOneAndUpdate(
        { coupleId },
        { $setOnInsert: { coupleId } },
        { upsert: true, new: true, runValidators: true }
    )
);

const applyFullHeartStreak = async ({ coupleId, ritualDate, status }) => {
    if (status.streakApplied) {
        return getOrCreateCoupleStreak(coupleId);
    }

    const streak = await getOrCreateCoupleStreak(coupleId);
    const previousDate = getPreviousDateKey(ritualDate);
    const nextCurrentStreak = streak.lastFullHeartDate === previousDate
        ? streak.currentStreak + 1
        : 1;

    streak.currentStreak = nextCurrentStreak;
    streak.longestStreak = Math.max(streak.longestStreak || 0, nextCurrentStreak);
    streak.lastFullHeartDate = ritualDate;
    streak.lastEvaluatedRitualDate = ritualDate;
    streak.streakBrokenAt = null;
    await streak.save();

    status.streakApplied = true;
    status.streakBrokenApplied = false;
    await status.save();

    return streak;
};

export const reconcileExpiredRituals = async ({ coupleId, now = new Date() }) => {
    const expiredStatuses = await CoupleDailyRitualStatus.find({
        coupleId,
        closesAt: { $lte: now },
        heartState: { $ne: 'full' },
        streakBrokenApplied: false,
    }).sort({ closesAt: 1 });

    if (expiredStatuses.length === 0) {
        return getOrCreateCoupleStreak(coupleId);
    }

    const streak = await getOrCreateCoupleStreak(coupleId);
    const latestExpired = expiredStatuses[expiredStatuses.length - 1];

    streak.currentStreak = 0;
    streak.lastEvaluatedRitualDate = latestExpired.ritualDate;
    streak.streakBrokenAt = latestExpired.closesAt;
    await streak.save();

    await CoupleDailyRitualStatus.updateMany(
        { _id: { $in: expiredStatuses.map(status => status._id) } },
        { $set: { streakBrokenApplied: true } }
    );

    return streak;
};

export const reconcileStreakGap = async ({ streak, currentRitualDate }) => {
    if (!streak?.currentStreak || !streak.lastFullHeartDate) {
        return streak;
    }

    const previousRitualDate = getPreviousDateKey(currentRitualDate);
    const streakIsCurrent = streak.lastFullHeartDate === currentRitualDate
        || streak.lastFullHeartDate === previousRitualDate;

    if (streakIsCurrent) {
        return streak;
    }

    streak.currentStreak = 0;
    streak.lastEvaluatedRitualDate = previousRitualDate;
    streak.streakBrokenAt = new Date();
    await streak.save();

    return streak;
};

export const updateRitualStatusForCompletion = async ({ userId, challenge }) => {
    const { user, couple } = await getActiveCoupleForUser(userId);

    if (!user || !couple) {
        return null;
    }

    await ensureRitualSettings(couple, user);

    const window = getRitualWindow({
        timeZone: couple.ritualTimezone,
        resetHour: couple.ritualResetHour,
    });

    if (challenge.date !== window.ritualDate) {
        return null;
    }

    let status = await findOrCreateRitualStatus({ couple, challenge, window });
    const isUserA = status.userA.toString() === userId.toString();
    const wasHeartState = status.heartState;

    if (isUserA) {
        status.userAComplete = true;
        status.userACompletedAt = new Date();
    } else {
        status.userBComplete = true;
        status.userBCompletedAt = new Date();
    }

    status.heartState = status.userAComplete && status.userBComplete
        ? 'full'
        : (status.userAComplete || status.userBComplete ? 'half' : 'empty');

    await status.save();

    const streak = status.heartState === 'full'
        ? await applyFullHeartStreak({ coupleId: couple._id, ritualDate: status.ritualDate, status })
        : await getOrCreateCoupleStreak(couple._id);

    return {
        couple,
        status,
        streak,
        previousHeartState: wasHeartState,
        heartChanged: wasHeartState !== status.heartState,
    };
};

export const getCoupleTodayPayload = async ({ userId }) => {
    const { user, couple, partnerId } = await getActiveCoupleForUser(userId);

    if (!user) {
        return { statusCode: 404, body: { success: false, message: 'User not found' } };
    }

    if (!couple || !partnerId) {
        return {
            statusCode: 200,
            body: {
                success: true,
                data: null,
                message: 'No partner linked',
            },
        };
    }

    await ensureRitualSettings(couple, user);

    const window = getRitualWindow({
        timeZone: couple.ritualTimezone,
        resetHour: couple.ritualResetHour,
    });

    const challenge = await DailyChallenge.findOne({
        date: window.ritualDate,
        isActive: true,
    });

    if (!challenge) {
        return {
            statusCode: 404,
            body: {
                success: false,
                message: `No challenge found for ritual date: ${window.ritualDate}`,
                data: {
                    ritualDate: window.ritualDate,
                    opensAt: window.opensAt,
                    closesAt: window.closesAt,
                    ritualTimezone: couple.ritualTimezone,
                    ritualResetHour: couple.ritualResetHour,
                },
            },
        };
    }

    const status = await findOrCreateRitualStatus({ couple, challenge, window });
    let streak = await reconcileExpiredRituals({ coupleId: couple._id });
    streak = await reconcileStreakGap({ streak, currentRitualDate: window.ritualDate });

    if (status.heartState === 'full' && !status.streakApplied) {
        streak = await applyFullHeartStreak({
            coupleId: couple._id,
            ritualDate: status.ritualDate,
            status,
        });
    }

    const [answers, partnerAnswers] = await Promise.all([
        DailyAnswers.findOne({ challengeId: challenge._id, userId }),
        DailyAnswers.findOne({ challengeId: challenge._id, userId: partnerId }),
    ]);

    const userIsA = status.userA.toString() === userId.toString();
    const youComplete = userIsA ? status.userAComplete : status.userBComplete;
    const partnerComplete = userIsA ? status.userBComplete : status.userAComplete;

    return {
        statusCode: 200,
        body: {
            success: true,
            data: {
                ritualDate: window.ritualDate,
                opensAt: window.opensAt,
                closesAt: window.closesAt,
                ritualTimezone: couple.ritualTimezone,
                ritualResetHour: couple.ritualResetHour,
                challenge,
                answers,
                partnerAnswers,
                progress: answers ? {
                    completedCount: answers.completedCount,
                    totalTasks: answers.totalTasks,
                    isComplete: answers.isComplete,
                } : {
                    completedCount: 0,
                    totalTasks: challenge.tasks.length,
                    isComplete: false,
                },
                partnerProgress: partnerAnswers ? {
                    completedCount: partnerAnswers.completedCount,
                    totalTasks: partnerAnswers.totalTasks,
                    isComplete: partnerAnswers.isComplete,
                } : {
                    completedCount: 0,
                    totalTasks: challenge.tasks.length,
                    isComplete: false,
                },
                streak: {
                    heartState: status.heartState,
                    currentStreak: streak.currentStreak || 0,
                    longestStreak: streak.longestStreak || 0,
                    youComplete,
                    partnerComplete,
                    streakBroken: !!streak.streakBrokenAt && status.heartState !== 'full',
                    streakBrokenAt: streak.streakBrokenAt,
                    lastFullHeartDate: streak.lastFullHeartDate,
                },
            },
        },
    };
};
