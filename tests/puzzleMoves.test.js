import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLegacyPuzzleMove } from '../services/puzzle/moves.js';

test('legacy index-only moves produce a visible board state', () => {
    const result = applyLegacyPuzzleMove([-3, -1, -2], 0, 2);

    assert.deepEqual(result, [1, 0, 2]);
});

test('legacy moves preserve an existing positive board', () => {
    const result = applyLegacyPuzzleMove([2, 0, 1], 1, 2);

    assert.deepEqual(result, [2, 1, 0]);
});

test('invalid legacy indices leave the normalized board unchanged', () => {
    const result = applyLegacyPuzzleMove([-1, -2, -3], 0, -1);

    assert.deepEqual(result, [0, 1, 2]);
});
