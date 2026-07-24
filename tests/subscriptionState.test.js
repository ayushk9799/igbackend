import test from 'node:test';
import assert from 'node:assert/strict';
import { __testables } from '../services/revenueCatWebhookService.js';
import { subscriptionGivesAccess } from '../services/subscriptionService.js';

const now = new Date('2026-07-22T00:00:00.000Z');
const futureMs = new Date('2026-08-22T00:00:00.000Z').getTime();

test('cancellation keeps access until expiration', () => {
    const state = __testables.determineState({
        type: 'CANCELLATION',
        expiration_at_ms: futureMs,
    }, null, now);

    assert.equal(state.status, 'cancelled');
    assert.equal(state.givesAccess, true);
    assert.equal(state.willRenew, false);
});

test('expiration revokes access', () => {
    const state = __testables.determineState({
        type: 'EXPIRATION',
        expiration_at_ms: futureMs,
    }, null, now);

    assert.equal(state.status, 'expired');
    assert.equal(state.givesAccess, false);
});

test('billing issue retains access while expiration is in the future', () => {
    const state = __testables.determineState({
        type: 'BILLING_ISSUE',
        expiration_at_ms: futureMs,
    }, { willRenew: true }, now);

    assert.equal(state.status, 'billing_issue');
    assert.equal(state.givesAccess, true);
});

test('paused subscription is not revoked before its expiration', () => {
    const state = __testables.determineState({
        type: 'SUBSCRIPTION_PAUSED',
        expiration_at_ms: futureMs,
    }, null, now);

    assert.equal(state.status, 'paused');
    assert.equal(state.givesAccess, true);
});

test('access helper requires both access state and an unexpired date', () => {
    assert.equal(subscriptionGivesAccess({
        status: 'active',
        givesAccess: true,
        expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    }, now), true);

    assert.equal(subscriptionGivesAccess({
        status: 'active',
        givesAccess: true,
        expiresAt: new Date('2026-06-22T00:00:00.000Z'),
    }, now), false);
});

test('auto-renewing access remains available during the renewal handoff', () => {
    assert.equal(subscriptionGivesAccess({
        status: 'active',
        givesAccess: true,
        willRenew: true,
        expiresAt: new Date('2026-07-21T23:55:00.000Z'),
    }, now), true);
});

test('renewal restores an expired subscription with its new expiration', () => {
    const renewedUntil = new Date('2026-08-22T00:00:00.000Z');
    const state = __testables.determineState({
        type: 'RENEWAL',
        expiration_at_ms: renewedUntil.getTime(),
    }, {
        status: 'expired',
        givesAccess: false,
        willRenew: false,
        expiresAt: new Date('2026-07-22T00:00:00.000Z'),
    }, now);

    assert.equal(state.status, 'active');
    assert.equal(state.givesAccess, true);
    assert.equal(state.willRenew, true);
    assert.equal(state.expiresAt.getTime(), renewedUntil.getTime());
});

test('an older expiration event cannot overwrite an API-verified renewal', () => {
    const state = __testables.determineState({
        type: 'EXPIRATION',
        expiration_at_ms: new Date('2026-07-22T00:00:00.000Z').getTime(),
    }, {
        status: 'active',
        givesAccess: true,
        willRenew: true,
        expiresAt: new Date('2026-08-22T00:00:00.000Z'),
    }, now);

    assert.equal(state, null);
});
