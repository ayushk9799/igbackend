export const DEFAULT_LANGUAGE = 'en';
export const SUPPORTED_LANGUAGES = Object.freeze(['en', 'fr', 'de', 'es', 'it', 'ja', 'ko']);

const asPlainObject = (value) => {
    if (!value) return {};
    if (typeof value.toObject === 'function') {
        return value.toObject({ flattenMaps: true });
    }
    return { ...value };
};

const getTranslation = (translations, language) => {
    if (!translations || language === DEFAULT_LANGUAGE) return {};
    if (translations instanceof Map) return translations.get(language) || {};
    return translations[language] || {};
};

const localizedText = (translation, source, field) => {
    const translated = translation?.[field];
    return typeof translated === 'string' && translated.trim()
        ? translated
        : source?.[field];
};

const localizedStringArray = (translation, source, field) => {
    const canonical = Array.isArray(source?.[field]) ? source[field] : [];
    const translated = translation?.[field];
    if (!Array.isArray(translated) || translated.length !== canonical.length) {
        return canonical;
    }
    return translated.map((value, index) => (
        typeof value === 'string' && value.trim() ? value : canonical[index]
    ));
};

export const normalizeLanguage = (value) => {
    const candidate = Array.isArray(value) ? value[0] : value;
    const language = String(candidate || '')
        .split(',')[0]
        .split(';')[0]
        .trim()
        .toLowerCase()
        .split(/[-_]/)[0];

    return SUPPORTED_LANGUAGES.includes(language) ? language : DEFAULT_LANGUAGE;
};

export const getRequestLanguage = (req) => (
    normalizeLanguage(req?.query?.lang || req?.get?.('accept-language'))
);

export const localizeOptions = (source, translation) => {
    const values = Array.isArray(source?.options) ? source.options : [];
    const labels = localizedStringArray(translation, source, 'options');

    return {
        options: labels,
        optionItems: values.map((value, index) => ({
            value,
            label: labels[index] ?? value,
        })),
    };
};

export const localizeV2Question = (question, language) => {
    const source = asPlainObject(question);
    const translation = getTranslation(source.translations, language);

    return {
        ...source,
        prompt: localizedText(translation, source, 'prompt'),
        minLabel: localizedText(translation, source, 'minLabel'),
        maxLabel: localizedText(translation, source, 'maxLabel'),
        ...localizeOptions(source, translation),
        translations: undefined,
    };
};

export const localizeV2Set = (set, language) => {
    const source = asPlainObject(set);
    const translation = getTranslation(source.translations, language);

    return {
        ...source,
        title: localizedText(translation, source, 'title'),
        questions: (source.questions || []).map(question => localizeV2Question(question, language)),
        translations: undefined,
    };
};

export const localizeLegacyQuestion = (question, language) => {
    const source = asPlainObject(question);
    const translation = getTranslation(source.translations, language);

    return {
        ...source,
        question: localizedText(translation, source, 'question'),
        placeholder: localizedText(translation, source, 'placeholder'),
        minLabel: localizedText(translation, source, 'minLabel'),
        maxLabel: localizedText(translation, source, 'maxLabel'),
        ...localizeOptions(source, translation),
        translations: undefined,
    };
};

export const localizeCategory = (category, language) => {
    const source = asPlainObject(category);
    const translation = getTranslation(source.translations, language);

    return {
        ...source,
        title: localizedText(translation, source, 'title'),
        description: localizedText(translation, source, 'description'),
        translations: undefined,
    };
};

export const localizeDailyChallenge = (challenge, language) => {
    const source = asPlainObject(challenge);
    const translation = getTranslation(source.translations, language);

    return {
        ...source,
        title: localizedText(translation, source, 'title'),
        tasks: (source.tasks || []).map((task) => {
            const taskSource = asPlainObject(task);
            const taskTranslation = getTranslation(taskSource.translations, language);
            return {
                ...taskSource,
                taskstatement: localizedText(taskTranslation, taskSource, 'taskstatement'),
                minLabel: localizedText(taskTranslation, taskSource, 'minLabel'),
                maxLabel: localizedText(taskTranslation, taskSource, 'maxLabel'),
                ...localizeOptions(taskSource, taskTranslation),
                translations: undefined,
            };
        }),
        translations: undefined,
    };
};
