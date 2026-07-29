import test from 'node:test';
import assert from 'node:assert/strict';
import { calculateQuestionProgress } from '../services/questionsV2/progressMath.js';

test('answered and skipped questions both count as done', () => {
    const result = calculateQuestionProgress(
        {
            answeredQuestionIds: ['q1', 'q2'],
            skippedQuestionIds: ['q3'],
        },
        ['q1', 'q2', 'q3', 'q4']
    );

    assert.equal(result.doneCount, 3);
    assert.equal(result.totalQuestions, 4);
    assert.equal(result.percentComplete, 75);
});

test('a question present in both arrays is counted once', () => {
    const result = calculateQuestionProgress(
        {
            answeredQuestionIds: ['q1'],
            skippedQuestionIds: ['q1', 'q2'],
        },
        ['q1', 'q2']
    );

    assert.equal(result.doneCount, 2);
    assert.equal(result.percentComplete, 100);
});

test('inactive question IDs do not contribute to progress', () => {
    const result = calculateQuestionProgress(
        {
            answeredQuestionIds: ['active', 'disabled'],
            skippedQuestionIds: ['deleted'],
        },
        ['active', 'remaining']
    );

    assert.equal(result.doneCount, 1);
    assert.equal(result.percentComplete, 50);
});

test('an empty active set reports zero percent', () => {
    const result = calculateQuestionProgress(
        { answeredQuestionIds: ['old-question'] },
        []
    );

    assert.equal(result.doneCount, 0);
    assert.equal(result.totalQuestions, 0);
    assert.equal(result.percentComplete, 0);
});
