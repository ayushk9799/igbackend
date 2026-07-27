import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildDailyChallengeQuery,
    getUtcDateString,
    parseDirectTranslationArgs,
    resolveTranslationScope,
    translatePayloadDirectly,
} from '../scripts/translateDatabase.js';
import { validateTranslatedSections } from '../utils/geminiTranslation.js';

const createPayload = () => ({
    language: 'fr',
    sections: [{
        source: {
            title: 'Deep connection',
            description: 'Questions that bring you closer',
        },
        translation: {},
        context: 'relationship app; category',
    }],
});

test('direct translator accepts GTD-style equals and spaced arguments', () => {
    assert.deepEqual(
        parseDirectTranslationArgs([
            '--lang=de',
            '--scope=v2',
            '--count', '10',
            '--dry-run',
            '--include-expired',
            '--env-file=../gtdback/config/config.env',
        ]),
        {
            lang: 'de',
            scope: 'v2',
            count: '10',
            'dry-run': true,
            'include-expired': true,
            'env-file': '../gtdback/config/config.env',
        }
    );
});

test('direct translator defaults to active content and keeps legacy explicit', () => {
    assert.equal(resolveTranslationScope(), 'active');
    assert.equal(resolveTranslationScope('legacy'), 'legacy');
    assert.equal(resolveTranslationScope('all'), 'all');
});

test('direct translator skips expired Daily Challenges by default', () => {
    assert.deepEqual(
        buildDailyChallengeQuery({ today: '2026-07-27' }),
        { date: { $gte: '2026-07-27' } }
    );
    assert.deepEqual(
        buildDailyChallengeQuery({
            includeExpired: true,
            today: '2026-07-27',
        }),
        {}
    );
    assert.equal(
        getUtcDateString(new Date('2026-07-27T23:59:59.000Z')),
        '2026-07-27'
    );
});

test('direct translator fills French and validates before returning for save', async () => {
    const payload = createPayload();
    const result = await translatePayloadDirectly({
        payload,
        apiKey: 'test-key',
        callGeminiImpl: async ({ batch }) => new Map(
            batch.map(item => [item.key, `fr:${item.source}`])
        ),
    });

    assert.equal(result.skipped, false);
    assert.equal(result.translatedStrings, 2);
    assert.equal(payload.sections[0].translation.title, 'fr:Deep connection');
    assert.equal(
        payload.sections[0].translation.description,
        'fr:Questions that bring you closer'
    );
    assert.deepEqual(validateTranslatedSections(payload.sections), []);
});

test('direct translator skips content that already has complete French', async () => {
    const payload = createPayload();
    payload.sections[0].translation = {
        title: 'Connexion profonde',
        description: 'Des questions qui vous rapprochent',
    };
    let calls = 0;

    const result = await translatePayloadDirectly({
        payload,
        apiKey: 'test-key',
        callGeminiImpl: async () => {
            calls += 1;
            return new Map();
        },
    });

    assert.equal(result.skipped, true);
    assert.equal(result.translatedStrings, 0);
    assert.equal(calls, 0);
});

test('direct translator retries transient Gemini failures', async () => {
    const payload = createPayload();
    let attempts = 0;
    const result = await translatePayloadDirectly({
        payload,
        apiKey: 'test-key',
        retries: 3,
        callGeminiImpl: async ({ batch }) => {
            attempts += 1;
            if (attempts < 3) throw new Error('temporary Gemini failure');
            return new Map(batch.map(item => [item.key, `fr:${item.source}`]));
        },
    });

    assert.equal(attempts, 3);
    assert.equal(result.translatedStrings, 2);
});

test('direct translator passes the requested language to Gemini', async () => {
    const payload = createPayload();
    payload.language = 'de';
    let request;

    await translatePayloadDirectly({
        payload,
        apiKey: 'test-key',
        targetLanguageCode: 'de',
        targetLanguageName: 'German (Deutsch)',
        callGeminiImpl: async (options) => {
            request = options;
            return new Map(options.batch.map(item => [item.key, `de:${item.source}`]));
        },
    });

    assert.equal(request.targetLanguageCode, 'de');
    assert.equal(request.targetLanguageName, 'German (Deutsch)');
    assert.equal(payload.sections[0].translation.title, 'de:Deep connection');
});

test('direct translator rejects incomplete Gemini output before database save', async () => {
    const payload = createPayload();
    await assert.rejects(
        translatePayloadDirectly({
            payload,
            apiKey: 'test-key',
            retries: 1,
            callGeminiImpl: async ({ batch }) => new Map([
                [batch[0].key, 'Connexion profonde'],
            ]),
        }),
        /Generated fr translation failed validation/
    );
});
