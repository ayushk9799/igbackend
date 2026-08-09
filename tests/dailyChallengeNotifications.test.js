import assert from 'node:assert/strict';
import test from 'node:test';

import {
    buildDailyChallengeCompletionNotification,
    shouldSendImmediateAnswerNotification,
} from '../services/dailyChallengeNotificationService.js';

test('Daily Challenge answers do not send immediate per-answer notifications', () => {
    assert.equal(shouldSendImmediateAnswerNotification('dailychallenge'), false);
    assert.equal(shouldSendImmediateAnswerNotification('DailyChallenge'), false);
    assert.equal(shouldSendImmediateAnswerNotification('future'), true);
});

test('completion notification targets the Daily Challenge and identifies its sender', () => {
    const notification = buildDailyChallengeCompletionNotification({
        senderName: 'Penguin',
        senderId: 'user-a',
        challengeId: 'challenge-1',
        ritualDate: '2026-08-04',
        isCoupleComplete: false,
    });

    assert.match(notification.body, /Penguin completed their side/);
    assert.equal(notification.data.type, 'daily_challenge_complete');
    assert.equal(notification.data.route, 'dailyChallenge');
    assert.equal(notification.data.senderId, 'user-a');
    assert.equal(notification.data.coupleComplete, false);
});

test('second partner completion uses the together message and identifies that partner', () => {
    const notification = buildDailyChallengeCompletionNotification({
        senderName: 'Partner',
        senderId: 'user-b',
        challengeId: 'challenge-1',
        ritualDate: '2026-08-04',
        isCoupleComplete: true,
    });

    assert.match(notification.body, /finished today's challenge together/);
    assert.equal(notification.data.senderId, 'user-b');
    assert.equal(notification.data.coupleComplete, true);
});
