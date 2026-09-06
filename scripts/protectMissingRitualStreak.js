import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Couple from '../models/Couple.js';
import CoupleDailyRitualStatus from '../models/CoupleDailyRitualStatus.js';
import CoupleStreak from '../models/CoupleStreak.js';
import DailyChallenge from '../models/DailyChallenge.js';
import User from '../models/User.js';
import { getRitualWindowForDate } from '../utils/dailyRitual.js';

const SOURCE_DATE = '2026-08-03';
const PROTECTED_DATE = '2026-08-04';
const PROTECTION_REASON = 'challenge_unavailable';
const applyChanges = process.argv.includes('--apply');
const explicitEmail = process.argv
    .find(argument => argument.startsWith('--email='))
    ?.slice('--email='.length)
    .trim()
    .toLowerCase() || null;

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required');

const buildPlan = async session => {
    const sourceStatuses = await CoupleDailyRitualStatus.find({
        ritualDate: SOURCE_DATE,
        heartState: 'full',
        userAComplete: true,
        userBComplete: true,
        streakApplied: true,
    }).session(session).lean();

    const challenge = await DailyChallenge.findOne({
        date: PROTECTED_DATE,
        isActive: true,
    }).session(session).lean();

    if (!challenge) throw new Error(`No active challenge found for ${PROTECTED_DATE}`);

    const explicitUser = explicitEmail
        ? await User.findOne({ email: explicitEmail }).session(session).lean()
        : null;
    if (explicitEmail && !explicitUser) throw new Error(`No user found for ${explicitEmail}`);

    const explicitCouple = explicitUser
        ? await Couple.findByPartner(explicitUser._id).session(session).lean()
        : null;
    if (explicitUser && !explicitCouple) throw new Error(`No active couple found for ${explicitEmail}`);

    const coupleIds = [...new Set([
        ...sourceStatuses.map(status => String(status.coupleId)),
        ...(explicitCouple ? [String(explicitCouple._id)] : []),
    ])];
    const [couples, streaks, protectedStatuses] = await Promise.all([
        Couple.find({ _id: { $in: coupleIds }, status: 'active' }).session(session).lean(),
        CoupleStreak.find({ coupleId: { $in: coupleIds } }).session(session).lean(),
        CoupleDailyRitualStatus.find({
            coupleId: { $in: coupleIds },
            ritualDate: PROTECTED_DATE,
        }).session(session).lean(),
    ]);

    const users = await User.find({
        _id: { $in: couples.flatMap(couple => [couple.partner1, couple.partner2]) },
    }).select('_id name email timezone').session(session).lean();

    const userById = new Map(users.map(user => [String(user._id), user]));
    const streakByCouple = new Map(streaks.map(streak => [String(streak.coupleId), streak]));
    const statusByCouple = new Map(protectedStatuses.map(status => [String(status.coupleId), status]));

    return couples.map(couple => {
        const streak = streakByCouple.get(String(couple._id));
        const existingStatus = statusByCouple.get(String(couple._id));
        const partner1 = userById.get(String(couple.partner1));
        const partner2 = userById.get(String(couple.partner2));
        const timeZone = couple.ritualTimezone || partner1?.timezone || 'UTC';
        const resetHour = couple.ritualResetHour ?? 5;
        const window = getRitualWindowForDate({
            ritualDate: PROTECTED_DATE,
            timeZone,
            resetHour,
        });
        const alreadyCredited = existingStatus?.streakProtection?.applied === true;
        const completedNormally = existingStatus?.heartState === 'full'
            && existingStatus?.streakApplied === true;
        const streakCanContinue = streak?.lastFullHeartDate === SOURCE_DATE;
        const administrativeOverride = String(couple._id) === String(explicitCouple?._id);
        const eligible = !alreadyCredited
            && !completedNormally
            && (streakCanContinue || administrativeOverride);
        const currentStreak = streak?.currentStreak || 0;
        const creditedStreak = eligible ? currentStreak + 1 : currentStreak;

        return {
            couple,
            partner1,
            partner2,
            challenge,
            existingStatus,
            streak,
            window,
            timeZone,
            eligible,
            administrativeOverride,
            skipReason: alreadyCredited
                ? 'already_protected'
                : completedNormally
                    ? 'completed_normally'
                    : !streakCanContinue && !administrativeOverride
                        ? 'streak_not_current_through_august_3'
                        : null,
            creditedStreak,
            creditedLongestStreak: Math.max(streak?.longestStreak || 0, creditedStreak),
        };
    });
};

const serializePlan = plan => plan.map(item => ({
    coupleId: String(item.couple._id),
    couple: `${item.partner1?.name || item.partner1?.email} + ${item.partner2?.name || item.partner2?.email}`,
    eligible: item.eligible,
    administrativeOverride: item.administrativeOverride,
    skipReason: item.skipReason,
    currentStreak: item.streak?.currentStreak || 0,
    creditedStreak: item.creditedStreak,
    currentLongestStreak: item.streak?.longestStreak || 0,
    creditedLongestStreak: item.creditedLongestStreak,
    timeZone: item.timeZone,
    opensAt: item.window.opensAt,
    closesAt: item.window.closesAt,
}));

await mongoose.connect(mongoUri);

try {
    if (!applyChanges) {
        const plan = await buildPlan(null);
    } else {
        const session = await mongoose.startSession();
        let applied = [];

        try {
            await session.withTransaction(async () => {
                const plan = await buildPlan(session);
                const appliedAt = new Date();

                for (const item of plan) {
                    if (!item.eligible) continue;

                    await CoupleDailyRitualStatus.findOneAndUpdate(
                        { coupleId: item.couple._id, ritualDate: PROTECTED_DATE },
                        {
                            $setOnInsert: {
                                coupleId: item.couple._id,
                                ritualDate: PROTECTED_DATE,
                                challengeId: item.challenge._id,
                                opensAt: item.window.opensAt,
                                closesAt: item.window.closesAt,
                                userA: item.couple.partner1,
                                userB: item.couple.partner2,
                                userAComplete: false,
                                userBComplete: false,
                                heartState: 'empty',
                            },
                            $set: {
                                streakApplied: true,
                                // Also protects the credit while older backend instances,
                                // which do not know streakProtection yet, are still running.
                                streakBrokenApplied: true,
                                streakProtection: {
                                    applied: true,
                                    reason: PROTECTION_REASON,
                                    appliedAt,
                                    fulfilledAt: null,
                                },
                            },
                        },
                        { upsert: true, new: true, runValidators: true, session },
                    );

                    const streakResult = await CoupleStreak.updateOne(
                        {
                            coupleId: item.couple._id,
                            lastFullHeartDate: item.streak.lastFullHeartDate ?? null,
                            currentStreak: item.streak.currentStreak,
                        },
                        {
                            $set: {
                                currentStreak: item.creditedStreak,
                                longestStreak: item.creditedLongestStreak,
                                lastFullHeartDate: PROTECTED_DATE,
                                lastEvaluatedRitualDate: PROTECTED_DATE,
                                streakBrokenAt: null,
                            },
                        },
                        { session },
                    );

                    if (streakResult.matchedCount !== 1) {
                        throw new Error(`Streak changed concurrently for couple ${item.couple._id}`);
                    }

                    applied.push(item);
                }
            });
        } finally {
            await session.endSession();
        }

    }
} finally {
    await mongoose.disconnect();
}
