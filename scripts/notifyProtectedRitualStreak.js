import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

import Couple from '../models/Couple.js';
import CoupleDailyRitualStatus from '../models/CoupleDailyRitualStatus.js';
import User from '../models/User.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const RITUAL_DATE = '2026-08-04';
const PROTECTION_REASON = 'challenge_unavailable';
const TITLE = '💛 Your streak is protected';
const BODY = 'A Penguin glitch made the August 4 Daily Ritual unavailable. We protected your couple’s streak—no action needed.';
const applyChanges = process.argv.includes('--apply');
const targetEmail = process.argv
    .find(argument => argument.startsWith('--email='))
    ?.slice('--email='.length)
    .trim()
    .toLowerCase() || null;

const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) throw new Error('MONGODB_URI is required');

await mongoose.connect(mongoUri);

try {
    const statuses = await CoupleDailyRitualStatus.find({
        ritualDate: RITUAL_DATE,
        'streakProtection.applied': true,
        'streakProtection.reason': PROTECTION_REASON,
    }).lean();
    const couples = await Couple.find({
        _id: { $in: statuses.map(status => status.coupleId) },
        status: 'active',
    }).lean();
    const users = await User.find({
        _id: { $in: couples.flatMap(couple => [couple.partner1, couple.partner2]) },
    }).select('_id name email fcmToken').lean();

    const statusByCouple = new Map(statuses.map(status => [String(status.coupleId), status]));
    const userById = new Map(users.map(user => [String(user._id), user]));
    const recipients = couples.flatMap(couple => {
        const status = statusByCouple.get(String(couple._id));
        const notifiedIds = new Set(
            (status?.streakProtection?.notifiedUserIds || []).map(String),
        );

        return [couple.partner1, couple.partner2].map(userId => {
            const user = userById.get(String(userId));
            return {
                coupleId: couple._id,
                statusId: status._id,
                userId,
                name: user?.name || 'Unknown user',
                email: user?.email || null,
                hasToken: Boolean(user?.fcmToken),
                alreadyNotified: notifiedIds.has(String(userId)),
            };
        });
    }).filter(recipient => !targetEmail || recipient.email === targetEmail);

    if (targetEmail && recipients.length === 0) {
        throw new Error(`No protected August 4 recipient found for ${targetEmail}`);
    }

    if (!applyChanges) {
        console.log(JSON.stringify({
            mode: 'dry-run',
            title: TITLE,
            body: BODY,
            protectedCouples: couples.length,
            recipients: recipients.length,
            readyToSend: recipients.filter(recipient => recipient.hasToken && !recipient.alreadyNotified).length,
            missingToken: recipients.filter(recipient => !recipient.hasToken).length,
            alreadyNotified: recipients.filter(recipient => recipient.alreadyNotified).length,
            rows: recipients.map(({ statusId, ...recipient }) => recipient),
        }, null, 2));
    } else {
        const results = [];

        for (const recipient of recipients) {
            if (recipient.alreadyNotified) {
                results.push({ ...recipient, outcome: 'already_notified' });
                continue;
            }
            if (!recipient.hasToken) {
                results.push({ ...recipient, outcome: 'missing_fcm_token' });
                continue;
            }

            const attemptedAt = new Date();
            const sent = await sendPushNotification(
                recipient.userId,
                TITLE,
                BODY,
                {
                    type: 'daily_challenge_streak_protected',
                    route: 'dailyChallenge',
                    tab: 'dailyChallenge',
                    ritualDate: RITUAL_DATE,
                    protectionReason: PROTECTION_REASON,
                },
            );

            const update = {
                $set: { 'streakProtection.notificationLastAttemptAt': attemptedAt },
            };
            if (sent) {
                update.$addToSet = { 'streakProtection.notifiedUserIds': recipient.userId };
            }
            await CoupleDailyRitualStatus.updateOne({ _id: recipient.statusId }, update);
            results.push({ ...recipient, outcome: sent ? 'sent' : 'send_failed' });
        }

        console.log(JSON.stringify({
            mode: 'apply',
            sent: results.filter(result => result.outcome === 'sent').length,
            missingToken: results.filter(result => result.outcome === 'missing_fcm_token').length,
            failed: results.filter(result => result.outcome === 'send_failed').length,
            alreadyNotified: results.filter(result => result.outcome === 'already_notified').length,
            rows: results.map(({ statusId, ...result }) => result),
        }, null, 2));
    }
} finally {
    await mongoose.disconnect();
}
