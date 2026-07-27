import mongoose from 'mongoose';

/**
 * Locale keyed content overlays, for example:
 * translations.fr = { title: '...', prompt: '...' }
 *
 * Mixed is intentional: each content type owns and validates the fields it reads,
 * while the migration scripts validate the complete translated payload.
 */
export const translationsField = {
    type: Map,
    of: mongoose.Schema.Types.Mixed,
    default: undefined,
};
