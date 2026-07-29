import test from 'node:test';
import assert from 'node:assert/strict';
import {
    initializeOnboarding,
    markOnboardingStep,
    serializeOnboarding,
} from '../utils/onboarding.js';

test('new users start with intro completion and resumable profile decisions', () => {
    const user = { onboarding: {} };
    initializeOnboarding(user, { isNewUser: true });

    const state = serializeOnboarding(user);
    assert.equal(state.version, 1);
    assert.ok(state.introCompletedAt instanceof Date);
    assert.equal(state.avatarDecisionAt, null);
    assert.equal(state.notificationPromptedAt, null);
});

test('legacy established users do not regress to optional profile prompts', () => {
    const user = {
        nickname: 'Love',
        partnerId: 'partner-id',
        onboarding: {},
    };
    initializeOnboarding(user);

    const state = serializeOnboarding(user);
    assert.ok(state.nicknameCompletedAt);
    assert.ok(state.avatarDecisionAt);
    assert.ok(state.notificationPromptedAt);
    assert.ok(state.partnerStepCompletedAt);
    assert.ok(state.completedAt);
});

test('onboarding decisions are idempotent', () => {
    const firstTimestamp = new Date('2026-01-01T00:00:00.000Z');
    const user = { onboarding: {} };
    markOnboardingStep(user, 'notifications', firstTimestamp);
    markOnboardingStep(user, 'notifications', new Date('2026-02-01T00:00:00.000Z'));

    assert.equal(
        serializeOnboarding(user).notificationPromptedAt.toISOString(),
        firstTimestamp.toISOString(),
    );
});

