const DEFAULT_BATCH_ITEMS = 40;
const DEFAULT_BATCH_CHARACTERS = 8000;

const isCompletedString = value => typeof value === 'string' && value.trim().length > 0;

export const collectTranslationSlots = (sections, { force = false } = {}) => {
    const slots = [];

    sections.forEach((section, sectionIndex) => {
        for (const [field, sourceValue] of Object.entries(section.source || {})) {
            if (typeof sourceValue === 'string') {
                if (!sourceValue.trim()) continue;
                if (!force && isCompletedString(section.translation?.[field])) continue;
                slots.push({
                    key: `t${String(slots.length).padStart(7, '0')}`,
                    source: sourceValue,
                    context: `${section.context}; field=${field}`,
                    sectionIndex,
                    field,
                    itemIndex: null,
                });
            } else if (Array.isArray(sourceValue)) {
                sourceValue.forEach((item, itemIndex) => {
                    if (typeof item !== 'string' || !item.trim()) return;
                    if (!force && isCompletedString(section.translation?.[field]?.[itemIndex])) return;
                    slots.push({
                        key: `t${String(slots.length).padStart(7, '0')}`,
                        source: item,
                        context: `${section.context}; field=${field}; option=${itemIndex + 1}/${sourceValue.length}`,
                        sectionIndex,
                        field,
                        itemIndex,
                    });
                });
            }
        }
    });

    return slots;
};

export const createBatches = (
    slots,
    maxItems = DEFAULT_BATCH_ITEMS,
    maxCharacters = DEFAULT_BATCH_CHARACTERS
) => {
    const batches = [];
    let batch = [];
    let characters = 0;

    for (const slot of slots) {
        const size = slot.source.length + slot.context.length;
        if (batch.length && (batch.length >= maxItems || characters + size > maxCharacters)) {
            batches.push(batch);
            batch = [];
            characters = 0;
        }
        batch.push(slot);
        characters += size;
    }

    if (batch.length) batches.push(batch);
    return batches;
};

export const applyBatchTranslations = (sections, batch, translations) => {
    for (const slot of batch) {
        const section = sections[slot.sectionIndex];
        if (!section.translation) section.translation = {};
        if (slot.itemIndex === null) {
            section.translation[slot.field] = translations.get(slot.key);
        } else {
            if (!Array.isArray(section.translation[slot.field])) {
                section.translation[slot.field] = [];
            }
            section.translation[slot.field][slot.itemIndex] = translations.get(slot.key);
        }
    }
};

export const validateTranslatedSections = (sections) => {
    const errors = [];

    sections.forEach((section, sectionIndex) => {
        for (const [field, sourceValue] of Object.entries(section.source || {})) {
            const translated = section.translation?.[field];
            if (typeof sourceValue === 'string') {
                if (sourceValue.trim() && !isCompletedString(translated)) {
                    errors.push(`sections[${sectionIndex}].${field} is missing`);
                }
            } else if (Array.isArray(sourceValue) && sourceValue.length > 0) {
                if (!Array.isArray(translated) || translated.length !== sourceValue.length) {
                    errors.push(
                        `sections[${sectionIndex}].${field} must contain ${sourceValue.length} items`
                    );
                } else if (translated.some(item => !isCompletedString(item))) {
                    errors.push(`sections[${sectionIndex}].${field} contains an empty translation`);
                }
            }
        }
    });

    return errors;
};

const responseSchema = {
    type: 'object',
    properties: {
        translations: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    key: { type: 'string' },
                    text: { type: 'string' },
                },
                required: ['key', 'text'],
                additionalProperties: false,
            },
        },
    },
    required: ['translations'],
    additionalProperties: false,
};

const buildPrompt = (batch, targetLanguageCode, targetLanguageName) => (
    `You are a professional English-to-${targetLanguageName} translator for a couples and relationship mobile app.

Translate every supplied English string into natural, modern ${targetLanguageName} (${targetLanguageCode}) suitable for adults.

Rules:
1. Return one translation for every key and preserve each opaque key exactly.
2. Translate only the text. Do not add explanations, quotation marks, IDs, or metadata.
3. Keep the tone warm, conversational, inclusive, and concise.
4. Preserve emojis, URLs, variables such as {{0}}, punctuation intent, and meaningful line breaks.
5. For intimate or playful questions, use natural adult ${targetLanguageName} without making the wording more explicit.
6. Context is guidance only. Never translate or return the context.
7. Choice labels must remain semantically compatible with their English source.

Input:
${JSON.stringify(batch.map(({ key, source, context }) => ({ key, source, context })))}`
);

const extractResponseText = (payload) => {
    const text = (payload?.candidates?.[0]?.content?.parts || [])
        .map(part => part.text || '')
        .join('')
        .trim();

    if (!text) {
        const reason = payload?.promptFeedback?.blockReason
            || payload?.candidates?.[0]?.finishReason
            || 'empty response';
        throw new Error(`Gemini returned no translation text (${reason}).`);
    }
    return text;
};

export const validateBatchResult = (batch, result) => {
    if (!result || !Array.isArray(result.translations)) {
        throw new Error('Gemini output does not contain a translations array.');
    }

    const expectedKeys = new Set(batch.map(item => item.key));
    const actual = new Map();
    for (const item of result.translations) {
        if (!item || typeof item.key !== 'string' || !expectedKeys.has(item.key)) {
            throw new Error(`Gemini returned an unexpected translation key: ${item?.key}`);
        }
        if (actual.has(item.key)) throw new Error(`Gemini returned duplicate key: ${item.key}`);
        if (!isCompletedString(item.text)) {
            throw new Error(`Gemini returned an empty translation for: ${item.key}`);
        }
        actual.set(item.key, item.text.trim());
    }

    if (actual.size !== expectedKeys.size) {
        const missing = [...expectedKeys].filter(key => !actual.has(key));
        throw new Error(`Gemini omitted ${missing.length} translation(s): ${missing.join(', ')}`);
    }
    return actual;
};

export const callGemini = async ({
    batch,
    apiKey,
    model,
    targetLanguageCode,
    targetLanguageName,
    fetchImpl = fetch,
}) => {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`;
    const response = await fetchImpl(endpoint, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-goog-api-key': apiKey,
        },
        body: JSON.stringify({
            contents: [{
                role: 'user',
                parts: [{ text: buildPrompt(batch, targetLanguageCode, targetLanguageName) }],
            }],
            generationConfig: {
                responseMimeType: 'application/json',
                responseJsonSchema: responseSchema,
                maxOutputTokens: 8192,
                thinkingConfig: { thinkingLevel: 'minimal' },
            },
        }),
    });

    if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Gemini API request failed (${response.status}): ${errorBody.slice(0, 300)}`);
    }

    return validateBatchResult(batch, JSON.parse(extractResponseText(await response.json())));
};
