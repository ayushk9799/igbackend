import test from 'node:test';
import assert from 'node:assert/strict';

import {
    buildContentManifest,
    getSetContentRevision,
} from '../services/questionsV2/contentRevision.js';

test('set revision prefers the explicit revision and falls back to updatedAt', () => {
    assert.equal(getSetContentRevision({ revision: 42, updatedAt: '2026-01-01' }), 42);
    assert.equal(
        getSetContentRevision({ updatedAt: '2026-08-05T00:00:00.000Z' }),
        Date.parse('2026-08-05T00:00:00.000Z'),
    );
    assert.equal(getSetContentRevision({}), 1);
});

test('manifest includes active ids while retaining inactive set revisions', () => {
    const manifest = buildContentManifest([
        {
            topicId: 'relationship',
            sets: [
                { setId: 'active-set', isActive: true, revision: 10 },
                { setId: 'removed-set', isActive: false, revision: 12 },
            ],
        },
        {
            topicId: 'future',
            sets: [{ setId: 'future-set', isActive: true, revision: 8 }],
        },
    ]);

    assert.equal(manifest.schemaVersion, 1);
    assert.equal(manifest.contentRevision, 12);
    assert.deepEqual(manifest.topics[0], {
        topicId: 'relationship',
        revision: 12,
        activeSetIds: ['active-set'],
        setRevisions: {
            'active-set': 10,
            'removed-set': 12,
        },
    });
});
