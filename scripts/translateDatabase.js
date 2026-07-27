#!/usr/bin/env node
import path from 'node:path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

import Categories from '../models/Categories.js';
import DailyChallenge from '../models/DailyChallenge.js';
import FamilyQuestion from '../models/FamilyQuestion.js';
import FitnessQuestion from '../models/FitnessQuestion.js';
import FutureQuestion from '../models/FutureQuestion.js';
import HotSpicyQuestion from '../models/HotSpicyQuestion.js';
import MoneyQuestion from '../models/MoneyQuestion.js';
import PoliticalQuestion from '../models/PoliticalQuestion.js';
import TravelQuestion from '../models/TravelQuestion.js';
import CoupleTherapyQuestionSetV2 from '../models/v2/CoupleTherapyQuestionSetV2.js';
import FamilyQuestionSetV2 from '../models/v2/FamilyQuestionSetV2.js';
import FutureQuestionSetV2 from '../models/v2/FutureQuestionSetV2.js';
import GetToKnowQuestionSetV2 from '../models/v2/GetToKnowQuestionSetV2.js';
import GossipQuestionSetV2 from '../models/v2/GossipQuestionSetV2.js';
import LongDistanceQuestionSetV2 from '../models/v2/LongDistanceQuestionSetV2.js';
import MoneyQuestionSetV2 from '../models/v2/MoneyQuestionSetV2.js';
import NaughtyQuestionSetV2 from '../models/v2/NaughtyQuestionSetV2.js';
import RelationshipQuestionSetV2 from '../models/v2/RelationshipQuestionSetV2.js';
import SexLoveQuestionSetV2 from '../models/v2/SexLoveQuestionSetV2.js';
import TravelQuestionSetV2 from '../models/v2/TravelQuestionSetV2.js';
import {
    applyBatchTranslations,
    callGemini,
    collectTranslationSlots,
    createBatches,
    validateTranslatedSections,
} from '../utils/geminiTranslation.js';

dotenv.config({ quiet: true });

const DEFAULT_MODEL = 'gemini-3.6-flash';
const DEFAULT_RETRIES = 3;
const DEFAULT_DELAY_MS = 400;
const DEFAULT_SCOPE = 'active';
const VALID_SCOPES = new Set(['active', 'all', 'v2', 'legacy', 'daily', 'categories']);
const LANGUAGE_NAMES = {
    de: 'German (Deutsch)',
    fr: 'French (Français)',
    es: 'Spanish (Español)',
    pt: 'Portuguese (Português)',
    it: 'Italian (Italiano)',
    zh: 'Chinese (中文)',
    ja: 'Japanese (日本語)',
    ko: 'Korean (한국어)',
    ar: 'Arabic (العربية)',
    hi: 'Hindi (हिन्दी)',
    tr: 'Turkish (Türkçe)',
    ru: 'Russian (Русский)',
    nl: 'Dutch (Nederlands)',
    pl: 'Polish (Polski)',
    sv: 'Swedish (Svenska)',
    id: 'Indonesian (Bahasa Indonesia)',
    vi: 'Vietnamese (Tiếng Việt)',
};

const V2_MODELS = {
    relationship: RelationshipQuestionSetV2,
    sexlove: SexLoveQuestionSetV2,
    coupletherapy: CoupleTherapyQuestionSetV2,
    longdistance: LongDistanceQuestionSetV2,
    naughty: NaughtyQuestionSetV2,
    gossip: GossipQuestionSetV2,
    money: MoneyQuestionSetV2,
    gettoknow: GetToKnowQuestionSetV2,
    travel: TravelQuestionSetV2,
    family: FamilyQuestionSetV2,
    future: FutureQuestionSetV2,
};

const LEGACY_MODELS = {
    future: FutureQuestion,
    hotspicy: HotSpicyQuestion,
    money: MoneyQuestion,
    political: PoliticalQuestion,
    fitness: FitnessQuestion,
    travel: TravelQuestion,
    family: FamilyQuestion,
};

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export const parseDirectTranslationArgs = (argv) => {
    const parsed = {};
    for (let index = 0; index < argv.length; index += 1) {
        const value = argv[index];
        if (!value.startsWith('--')) continue;
        const equalsIndex = value.indexOf('=');
        if (equalsIndex > 0) {
            parsed[value.slice(2, equalsIndex)] = value.slice(equalsIndex + 1);
        } else if (argv[index + 1] && !argv[index + 1].startsWith('--')) {
            parsed[value.slice(2)] = argv[index + 1];
            index += 1;
        } else {
            parsed[value.slice(2)] = true;
        }
    }
    return parsed;
};

export const getLanguageName = language => LANGUAGE_NAMES[language] || language;
export const resolveTranslationScope = value => String(value || DEFAULT_SCOPE);
export const getUtcDateString = (date = new Date()) => date.toISOString().slice(0, 10);
export const buildDailyChallengeQuery = ({
    includeExpired = false,
    today = getUtcDateString(),
} = {}) => (
    includeExpired ? {} : { date: { $gte: today } }
);

const getTranslation = (document, language) => {
    if (!document?.translations) return {};
    if (document.translations instanceof Map) return document.translations.get(language) || {};
    return document.translations[language] || {};
};

const setTranslation = (document, language, translation) => {
    if (!document.translations) document.translations = new Map();
    document.translations.set(language, translation);
};

const sourceFields = (source, fields) => Object.fromEntries(
    fields
        .filter(field => source[field] !== undefined)
        .map(field => [field, source[field]])
);

const buildV2Payload = (topicId, document, language) => ({
    language,
    sections: [
        {
            source: sourceFields(document, ['title']),
            translation: sourceFields(getTranslation(document, language), ['title']),
            context: `Penguin relationship app; content=v2-set; topic=${topicId}`,
        },
        ...document.questions.map(question => ({
            source: sourceFields(question, ['prompt', 'options', 'minLabel', 'maxLabel']),
            translation: sourceFields(
                getTranslation(question, language),
                ['prompt', 'options', 'minLabel', 'maxLabel']
            ),
            context: `Penguin relationship app; content=v2-question; topic=${topicId}`,
        })),
    ],
});

const buildLegacyPayload = (topicId, document, language) => ({
    language,
    sections: [{
        source: sourceFields(document, ['question', 'options', 'placeholder', 'minLabel', 'maxLabel']),
        translation: sourceFields(
            getTranslation(document, language),
            ['question', 'options', 'placeholder', 'minLabel', 'maxLabel']
        ),
        context: `Penguin relationship app; content=legacy-question; topic=${topicId}`,
    }],
});

const buildDailyPayload = (document, language) => ({
    language,
    sections: [
        {
            source: sourceFields(document, ['title']),
            translation: sourceFields(getTranslation(document, language), ['title']),
            context: 'Penguin relationship app; content=daily-challenge',
        },
        ...document.tasks.map(task => ({
            source: sourceFields(task, ['taskstatement', 'options', 'minLabel', 'maxLabel']),
            translation: sourceFields(
                getTranslation(task, language),
                ['taskstatement', 'options', 'minLabel', 'maxLabel']
            ),
            context: 'Penguin relationship app; content=daily-task',
        })),
    ],
});

const buildCategoryPayload = (document, language) => ({
    language,
    sections: [{
        source: sourceFields(document, ['title', 'description']),
        translation: sourceFields(getTranslation(document, language), ['title', 'description']),
        context: 'Penguin relationship app; content=category',
    }],
});

export const translatePayloadDirectly = async ({
    payload,
    apiKey,
    model = DEFAULT_MODEL,
    targetLanguageCode = payload.language || 'fr',
    targetLanguageName = getLanguageName(targetLanguageCode),
    force = false,
    callGeminiImpl = callGemini,
    retries = DEFAULT_RETRIES,
}) => {
    const slots = collectTranslationSlots(payload.sections, { force });
    if (slots.length === 0) {
        return { payload, translatedStrings: 0, skipped: true };
    }

    const batches = createBatches(slots);
    for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        let translations;
        let lastError;

        for (let attempt = 1; attempt <= retries; attempt += 1) {
            try {
                translations = await callGeminiImpl({
                    batch,
                    apiKey,
                    model,
                    targetLanguageCode,
                    targetLanguageName,
                });
                break;
            } catch (error) {
                lastError = error;
                if (attempt < retries) await sleep(1000 * (2 ** (attempt - 1)));
            }
        }
        if (!translations) throw lastError;

        applyBatchTranslations(payload.sections, batch, translations);
    }

    const validationErrors = validateTranslatedSections(payload.sections);
    if (validationErrors.length) {
        throw new Error(`Generated ${targetLanguageCode} translation failed validation: ${validationErrors.join('; ')}`);
    }

    return { payload, translatedStrings: slots.length, skipped: false };
};

const applyV2Payload = (document, payload, language) => {
    setTranslation(document, language, payload.sections[0].translation);
    payload.sections.slice(1).forEach((section, index) => {
        setTranslation(document.questions[index], language, section.translation);
    });
    document.markModified('translations');
    document.markModified('questions');
};

const applyLegacyPayload = (document, payload, language) => {
    setTranslation(document, language, payload.sections[0].translation);
    document.markModified('translations');
};

const applyDailyPayload = (document, payload, language) => {
    setTranslation(document, language, payload.sections[0].translation);
    payload.sections.slice(1).forEach((section, index) => {
        setTranslation(document.tasks[index], language, section.translation);
    });
    document.markModified('translations');
    document.markModified('tasks');
};

const applyCategoryPayload = (document, payload, language) => {
    setTranslation(document, language, payload.sections[0].translation);
    document.markModified('translations');
};

const createJobs = async (
    scope,
    language,
    { includeExpired = false, today = getUtcDateString() } = {}
) => {
    const jobs = [];

    if (scope === 'active' || scope === 'all' || scope === 'v2') {
        for (const [topicId, Model] of Object.entries(V2_MODELS)) {
            const documents = await Model.find({}).sort({ order: 1, createdAt: 1 });
            for (const document of documents) {
                jobs.push({
                    label: `V2 ${topicId}/${document.setId}`,
                    document,
                    buildPayload: () => buildV2Payload(topicId, document, language),
                    applyPayload: payload => applyV2Payload(document, payload, language),
                });
            }
        }
    }

    if (scope === 'all' || scope === 'legacy') {
        for (const [topicId, Model] of Object.entries(LEGACY_MODELS)) {
            const documents = await Model.find({}).sort({ order: 1, createdAt: 1 });
            for (const document of documents) {
                jobs.push({
                    label: `Legacy ${topicId}/${document._id}`,
                    document,
                    buildPayload: () => buildLegacyPayload(topicId, document, language),
                    applyPayload: payload => applyLegacyPayload(document, payload, language),
                });
            }
        }
    }

    if (scope === 'active' || scope === 'all' || scope === 'daily') {
        const dailyQuery = buildDailyChallengeQuery({ includeExpired, today });
        const documents = await DailyChallenge.find(dailyQuery).sort({ date: 1 });
        for (const document of documents) {
            jobs.push({
                label: `Daily ${document.date}`,
                document,
                buildPayload: () => buildDailyPayload(document, language),
                applyPayload: payload => applyDailyPayload(document, payload, language),
            });
        }
    }

    if (scope === 'all' || scope === 'categories') {
        const documents = await Categories.find({}).sort({ slug: 1 });
        for (const document of documents) {
            jobs.push({
                label: `Category ${document.slug}`,
                document,
                buildPayload: () => buildCategoryPayload(document, language),
                applyPayload: payload => applyCategoryPayload(document, payload, language),
            });
        }
    }

    return jobs;
};

const printUsage = () => {
    console.log(`
Database translation using Gemini

Usage:
  npm run translate:database -- --lang=fr --count=5
  npm run translate:database -- --lang=de --count=all
  npm run translate:database -- --lang=es --scope=daily --dry-run

Options:
  --lang        target language code, such as fr, de, es, pt, or hi (required)
  --scope       active, all, v2, legacy, daily, or categories (default: active)
                active translates only content used by this app version: v2 + daily
                all also includes unused legacy questions and legacy categories
  --count       number of untranslated documents, or all (default: 5)
  --dry-run     list untranslated documents without Gemini calls or writes
  --force       regenerate existing translations for the requested language
  --include-expired
                include Daily Challenges dated before today (skipped by default)
  --env-file    optional private env file containing GEMINI_API_KEY
  --model       Gemini model (default: GEMINI_TRANSLATION_MODEL or gemini-3.6-flash)
`);
};

const run = async () => {
    const args = parseDirectTranslationArgs(process.argv.slice(2));
    if (args.help) {
        printUsage();
        return;
    }

    if (args['env-file']) {
        dotenv.config({
            path: path.resolve(String(args['env-file'])),
            override: false,
            quiet: true,
        });
    }

    const language = String(args.lang || '').trim().toLowerCase();
    if (!/^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/.test(language)) {
        throw new Error('A valid --lang code is required, for example --lang=fr or --lang=de.');
    }
    const languageName = getLanguageName(language);
    const scope = resolveTranslationScope(args.scope);
    if (!VALID_SCOPES.has(scope)) {
        throw new Error(`Invalid scope "${scope}". Use active, all, v2, legacy, daily, or categories.`);
    }

    const count = args.count === 'all'
        ? Number.POSITIVE_INFINITY
        : Math.max(1, Number.parseInt(args.count || '5', 10));
    const dryRun = Boolean(args['dry-run']);
    const force = Boolean(args.force);
    const includeExpired = Boolean(args['include-expired']);
    const today = getUtcDateString();
    const model = String(args.model || process.env.GEMINI_TRANSLATION_MODEL || DEFAULT_MODEL);
    const mongoUri = process.env.MONGODB_URI;
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;

    if (!mongoUri) throw new Error('MONGODB_URI is required.');
    if (!dryRun && !apiKey) throw new Error('GEMINI_API_KEY is required.');

    console.log('Database translation');
    console.log(`Language: ${languageName} (${language})`);
    console.log(`Scope: ${scope}; count: ${Number.isFinite(count) ? count : 'all'}; model: ${model}`);
    console.log(
        `Daily Challenges: ${includeExpired ? 'including expired' : `UTC date ${today} and future only`}`
    );
    console.log(`Mode: ${dryRun ? 'dry run' : 'translate and save directly'}`);

    await mongoose.connect(mongoUri);
    try {
        const jobs = await createJobs(scope, language, { includeExpired, today });
        const pendingJobs = jobs
            .filter(job => (
                force || collectTranslationSlots(job.buildPayload().sections).length > 0
            ))
            .slice(0, count);

        console.log(`Found ${pendingJobs.length} document(s) to process.`);
        if (dryRun) {
            pendingJobs.forEach((job, index) => console.log(`${index + 1}. ${job.label}`));
            console.log('Dry run complete. Gemini was not called and MongoDB was not modified.');
            return;
        }

        let translatedDocuments = 0;
        let translatedStrings = 0;
        const failures = [];

        for (let index = 0; index < pendingJobs.length; index += 1) {
            const job = pendingJobs[index];
            process.stdout.write(`[${index + 1}/${pendingJobs.length}] ${job.label} ... `);
            try {
                const result = await translatePayloadDirectly({
                    payload: job.buildPayload(),
                    apiKey,
                    model,
                    force,
                    targetLanguageCode: language,
                    targetLanguageName: languageName,
                });
                job.applyPayload(result.payload);
                await job.document.save();
                translatedDocuments += 1;
                translatedStrings += result.translatedStrings;
                console.log(`saved (${result.translatedStrings} strings)`);
            } catch (error) {
                failures.push({ label: job.label, error: error.message });
                console.log(`failed: ${error.message}`);
            }

            if (index < pendingJobs.length - 1) await sleep(DEFAULT_DELAY_MS);
        }

        console.log(`Finished: ${translatedDocuments} document(s), ${translatedStrings} string(s).`);
        if (failures.length) {
            console.log(`Failures: ${failures.length}`);
            failures.forEach(failure => console.log(`- ${failure.label}: ${failure.error}`));
            process.exitCode = 1;
        }
    } finally {
        await mongoose.disconnect();
    }
};

if (process.argv[1]?.endsWith('translateDatabase.js')) {
    run().catch((error) => {
        console.error(error.message);
        process.exitCode = 1;
    });
}
