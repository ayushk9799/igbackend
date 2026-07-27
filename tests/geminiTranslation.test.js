import assert from 'node:assert/strict';
import test from 'node:test';
import {
    applyBatchTranslations,
    callGemini,
    collectTranslationSlots,
    createBatches,
    validateBatchResult,
    validateTranslatedSections,
} from '../utils/geminiTranslation.js';

const sections = [{
    source: {
        title: 'Connection',
        options: ['Words', 'Actions'],
    },
    translation: {},
    context: 'relationship app; category',
}];

test('collects untranslated strings and applies translated values', () => {
    const working = structuredClone(sections);
    const slots = collectTranslationSlots(working);
    assert.deepEqual(slots.map(slot => slot.source), ['Connection', 'Words', 'Actions']);

    const translations = new Map(slots.map(slot => [slot.key, `fr:${slot.source}`]));
    applyBatchTranslations(working, slots, translations);

    assert.equal(working[0].translation.title, 'fr:Connection');
    assert.deepEqual(working[0].translation.options, ['fr:Words', 'fr:Actions']);
    assert.deepEqual(validateTranslatedSections(working), []);
});

test('skips complete translations unless force is enabled', () => {
    const complete = structuredClone(sections);
    complete[0].translation = {
        title: 'Connexion',
        options: ['Les mots', 'Les gestes'],
    };
    assert.equal(collectTranslationSlots(complete).length, 0);
    assert.equal(collectTranslationSlots(complete, { force: true }).length, 3);
});

test('creates bounded batches', () => {
    const slots = collectTranslationSlots(sections);
    assert.deepEqual(createBatches(slots, 2, 10_000).map(batch => batch.length), [2, 1]);
});

test('rejects missing, duplicate, and unexpected Gemini keys', () => {
    const batch = collectTranslationSlots(sections).slice(0, 2);
    assert.throws(
        () => validateBatchResult(batch, { translations: [{ key: batch[0].key, text: 'Connexion' }] }),
        /omitted/
    );
    assert.throws(
        () => validateBatchResult(batch, {
            translations: [
                { key: batch[0].key, text: 'Connexion' },
                { key: batch[0].key, text: 'Connexion' },
            ],
        }),
        /duplicate/
    );
    assert.throws(
        () => validateBatchResult(batch, {
            translations: [
                { key: batch[0].key, text: 'Connexion' },
                { key: 'unknown', text: 'Inconnu' },
            ],
        }),
        /unexpected/
    );
});

test('Gemini request uses header authentication and structured JSON', async () => {
    const batch = collectTranslationSlots(sections).slice(0, 2);
    let captured;
    const fakeFetch = async (url, options) => {
        captured = { url, options, body: JSON.parse(options.body) };
        return {
            ok: true,
            async json() {
                return {
                    candidates: [{
                        content: {
                            parts: [{
                                text: JSON.stringify({
                                    translations: batch.map(item => ({
                                        key: item.key,
                                        text: `de:${item.source}`,
                                    })),
                                }),
                            }],
                        },
                    }],
                };
            },
        };
    };

    const result = await callGemini({
        batch,
        apiKey: 'test-secret-key',
        model: 'test-model',
        targetLanguageCode: 'de',
        targetLanguageName: 'German (Deutsch)',
        fetchImpl: fakeFetch,
    });

    assert.equal(captured.url.includes('test-secret-key'), false);
    assert.equal(captured.options.headers['x-goog-api-key'], 'test-secret-key');
    assert.equal(captured.body.generationConfig.responseMimeType, 'application/json');
    assert.equal(result.size, batch.length);
});
