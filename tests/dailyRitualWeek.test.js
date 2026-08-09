import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildRitualWeekDays,
    deriveHeartState,
    getRitualWindowForDate,
    getRitualWeekDateKeys,
    shouldApplyFullHeartStreak,
} from '../utils/dailyRitual.js';

test('ritual week runs Sunday through Saturday across month boundaries', () => {
    assert.deepEqual(getRitualWeekDateKeys('2026-07-26'), [
        '2026-07-26',
        '2026-07-27',
        '2026-07-28',
        '2026-07-29',
        '2026-07-30',
        '2026-07-31',
        '2026-08-01',
    ]);
});

test('weekly visual states do not alter or infer the continuous streak', () => {
    const userId = 'user-a';
    const statuses = [
        {
            ritualDate: '2026-07-26',
            userA: userId,
            userB: 'user-b',
            userAComplete: true,
            userBComplete: true,
            heartState: 'full',
        },
        {
            ritualDate: '2026-07-27',
            userA: userId,
            userB: 'user-b',
            userAComplete: true,
            userBComplete: false,
            heartState: 'half',
        },
    ];

    const days = buildRitualWeekDays({
        ritualDate: '2026-07-27',
        statuses,
        userId,
    });

    assert.equal(days[0].state, 'full');
    assert.equal(days[1].state, 'half');
    assert.equal(days[1].isToday, true);
    assert.equal(days[1].youComplete, true);
    assert.equal(days[1].partnerComplete, false);
    assert.ok(days.slice(2).every(day => day.state === 'future'));
});

test('expired incomplete days are shown as missed', () => {
    const days = buildRitualWeekDays({
        ritualDate: '2026-07-29',
        statuses: [{
            ritualDate: '2026-07-27',
            userA: 'user-a',
            userB: 'user-b',
            userAComplete: true,
            userBComplete: false,
            heartState: 'half',
        }],
        userId: 'user-a',
    });

    assert.equal(days[1].state, 'missed');
    assert.equal(days[3].state, 'today-empty');
});

test('protected days preserve the streak visual without fabricating completion', () => {
    const days = buildRitualWeekDays({
        ritualDate: '2026-08-05',
        statuses: [{
            ritualDate: '2026-08-04',
            userA: 'user-a',
            userB: 'user-b',
            userAComplete: false,
            userBComplete: false,
            heartState: 'empty',
            streakApplied: true,
            streakProtection: {
                applied: true,
                reason: 'challenge_unavailable',
            },
        }],
        userId: 'user-a',
    });

    const protectedDay = days.find(day => day.date === '2026-08-04');
    assert.equal(protectedDay.state, 'protected');
    assert.equal(protectedDay.youComplete, false);
    assert.equal(protectedDay.partnerComplete, false);
});

test('builds an explicit ritual window independently of the current date', () => {
    const window = getRitualWindowForDate({
        ritualDate: '2026-08-04',
        timeZone: 'Asia/Kolkata',
        resetHour: 5,
    });

    assert.equal(window.opensAt.toISOString(), '2026-08-03T23:30:00.000Z');
    assert.equal(window.closesAt.toISOString(), '2026-08-04T23:30:00.000Z');
    assert.equal(window.nextRitualDate, '2026-08-05');
});

test('protected users can answer later without receiving a duplicate streak increment', () => {
    const status = {
        userAComplete: false,
        userBComplete: false,
        heartState: 'empty',
        streakApplied: true,
        streakProtection: { applied: true },
    };

    status.userAComplete = true;
    status.heartState = deriveHeartState(status);
    assert.equal(status.heartState, 'half');
    assert.equal(shouldApplyFullHeartStreak(status), false);

    status.userBComplete = true;
    status.heartState = deriveHeartState(status);
    assert.equal(status.heartState, 'full');
    assert.equal(shouldApplyFullHeartStreak(status), false);
});
