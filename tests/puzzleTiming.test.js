import test from 'node:test';
import assert from 'node:assert/strict';
import {
    buildPuzzleStartFields,
    normalizePuzzleTimerMode,
    PUZZLE_TIMER_MODES
} from '../services/puzzle/timing.js';

const FIVE_MINUTES_MS = 5 * 60 * 1000;

test('missing timer capability remains untimed for legacy clients', () => {
    assert.equal(
        normalizePuzzleTimerMode(undefined),
        PUZZLE_TIMER_MODES.UNTIMED
    );

    const fields = buildPuzzleStartFields(
        undefined,
        new Date('2026-07-29T00:00:00.000Z'),
        FIVE_MINUTES_MS
    );

    assert.equal(fields.status, 'in_progress');
    assert.equal(fields.expiresAt, undefined);
});

test('five-minute capability receives an exact deadline', () => {
    const now = new Date('2026-07-29T00:00:00.000Z');
    const fields = buildPuzzleStartFields(
        PUZZLE_TIMER_MODES.FIVE_MINUTE,
        now,
        FIVE_MINUTES_MS
    );

    assert.equal(
        fields.expiresAt.toISOString(),
        '2026-07-29T00:05:00.000Z'
    );
});

test('unknown timer modes fail safely to untimed', () => {
    assert.equal(
        normalizePuzzleTimerMode('future_timer_mode'),
        PUZZLE_TIMER_MODES.UNTIMED
    );
});
