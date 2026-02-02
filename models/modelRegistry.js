/**
 * Model Registry for Dynamic Question Model Routing
 * Simplified to only include the 3 visual types used in TaskCard.jsx
 */

import LikelyToQuestion from './LikelyToQuestion.js';
import NeverHaveIEverQuestion from './NeverHaveIEverQuestion.js';
import DeepQuestion from './DeepQuestion.js';

// Map modelName to actual Mongoose model
const modelRegistry = {
    'LikelyToQuestion': LikelyToQuestion,
    'NeverHaveIEverQuestion': NeverHaveIEverQuestion,
    'DeepQuestion': DeepQuestion,
};

// Map category slug (visual type) to modelName
const slugToModelName = {
    'likelyto': 'LikelyToQuestion',
    'neverhaveiever': 'NeverHaveIEverQuestion',
    'deep': 'DeepQuestion',
};

/**
 * Get the Mongoose model for a given modelName
 * @param {string} modelName - The model name
 * @returns {Model|null} - The Mongoose model or null if not found
 */
export const getModelByName = (modelName) => {
    return modelRegistry[modelName] || null;
};

/**
 * Get the Mongoose model for a given category slug
 * @param {string} slug - The category slug (visual type)
 * @returns {Model|null} - The Mongoose model or null if not found
 */
export const getModelBySlug = (slug) => {
    const modelName = slugToModelName[slug];
    return modelName ? modelRegistry[modelName] : null;
};

/**
 * Get the model name for a given slug
 * @param {string} slug - The category slug
 * @returns {string|null} - The model name or null
 */
export const getModelNameBySlug = (slug) => {
    return slugToModelName[slug] || null;
};

/**
 * Check if a model exists for the given name
 * @param {string} modelName - The model name to check
 * @returns {boolean}
 */
export const hasModel = (modelName) => {
    return modelName in modelRegistry;
};

export default modelRegistry;
