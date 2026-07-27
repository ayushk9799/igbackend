import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getRequestLanguage,
    localizeCategory,
    localizeDailyChallenge,
    localizeLegacyQuestion,
    localizeV2Set,
    normalizeLanguage,
} from '../utils/localization.js';
import { compareAnswersByFormat } from '../services/questionsV2/reportService.js';

test('normalizes supported locale variants and falls back to English', () => {
    assert.equal(normalizeLanguage('fr-FR'), 'fr');
    assert.equal(normalizeLanguage('fr-CA,fr;q=0.9,en;q=0.8'), 'fr');
    assert.equal(normalizeLanguage('de-DE'), 'de');
    assert.equal(normalizeLanguage('es-ES'), 'es');
    assert.equal(normalizeLanguage('it-IT'), 'it');
    assert.equal(normalizeLanguage('ja-JP'), 'ja');
    assert.equal(normalizeLanguage('ko-KR'), 'ko');
    assert.equal(normalizeLanguage('pt-BR'), 'en');
    assert.equal(getRequestLanguage({
        query: {},
        get: header => header === 'accept-language' ? 'fr-FR' : undefined,
    }), 'fr');
});

test('localizes German content when a German translation exists', () => {
    const localized = localizeV2Set({
        setId: 'set-1',
        title: 'Connection',
        translations: { de: { title: 'Verbindung' } },
        questions: [{
            questionId: 'question-1',
            prompt: 'Do you agree?',
            options: ['Yes', 'No'],
            translations: {
                de: {
                    prompt: 'Stimmst du zu?',
                    options: ['Ja', 'Nein'],
                },
            },
        }],
    }, 'de');

    assert.equal(localized.title, 'Verbindung');
    assert.equal(localized.questions[0].prompt, 'Stimmst du zu?');
    assert.deepEqual(localized.questions[0].optionItems, [
        { value: 'Yes', label: 'Ja' },
        { value: 'No', label: 'Nein' },
    ]);
});

test('localizes a V2 set while preserving canonical option values', () => {
    const localized = localizeV2Set({
        setId: 'set-1',
        title: 'Connection',
        translations: { fr: { title: 'Connexion' } },
        questions: [{
            questionId: 'question-1',
            prompt: 'Do you agree?',
            options: ['Yes', 'No'],
            minLabel: 'Not much',
            translations: {
                fr: {
                    prompt: 'Êtes-vous d’accord ?',
                    options: ['Oui', 'Non'],
                    minLabel: 'Pas beaucoup',
                },
            },
        }],
    }, 'fr');

    assert.equal(localized.title, 'Connexion');
    assert.equal(localized.questions[0].prompt, 'Êtes-vous d’accord ?');
    assert.deepEqual(localized.questions[0].options, ['Oui', 'Non']);
    assert.deepEqual(localized.questions[0].optionItems, [
        { value: 'Yes', label: 'Oui' },
        { value: 'No', label: 'Non' },
    ]);
    assert.equal(localized.questions[0].minLabel, 'Pas beaucoup');
    assert.equal(localized.questions[0].maxLabel, undefined);
    assert.equal(localized.translations, undefined);
});

test('falls back field-by-field when a translation is incomplete or invalid', () => {
    const localized = localizeLegacyQuestion({
        _id: 'legacy-1',
        question: 'English question',
        placeholder: 'Share your thoughts',
        options: ['A', 'B'],
        translations: {
            fr: {
                question: 'Question française',
                options: ['Seulement une'],
            },
        },
    }, 'fr');

    assert.equal(localized.question, 'Question française');
    assert.equal(localized.placeholder, 'Share your thoughts');
    assert.deepEqual(localized.options, ['A', 'B']);
    assert.deepEqual(localized.optionItems, [
        { value: 'A', label: 'A' },
        { value: 'B', label: 'B' },
    ]);
});

test('localizes categories and daily tasks without changing IDs or task order', () => {
    const category = localizeCategory({
        _id: 'category-1',
        slug: 'family',
        title: 'Family',
        description: 'Talk about family',
        translations: { fr: { title: 'Famille', description: 'Parlez de la famille' } },
    }, 'fr');
    assert.equal(category.slug, 'family');
    assert.equal(category.title, 'Famille');

    const challenge = localizeDailyChallenge({
        _id: 'challenge-1',
        title: 'Daily questions',
        translations: { fr: { title: 'Questions du jour' } },
        tasks: [
            {
                _id: 'task-1',
                taskstatement: 'First',
                options: ['Yes'],
                translations: { fr: { taskstatement: 'Première', options: ['Oui'] } },
            },
            {
                _id: 'task-2',
                taskstatement: 'Second',
                options: [],
                translations: { fr: { taskstatement: 'Deuxième' } },
            },
        ],
    }, 'fr');

    assert.deepEqual(challenge.tasks.map(task => task._id), ['task-1', 'task-2']);
    assert.deepEqual(challenge.tasks[0].optionItems, [{ value: 'Yes', label: 'Oui' }]);
});

test('canonical option values compare equally across displayed languages', () => {
    const comparison = compareAnswersByFormat({
        format: 'neverhaveiever',
        userAnswer: { value: 'Yes', label: 'Yes' },
        partnerAnswer: { value: 'Yes', label: 'Oui' },
    });

    assert.equal(comparison.match, true);
    assert.equal(comparison.similarityScore, 100);
});
