/**
 * Model Registry for Dynamic Question Model Routing
 * Maps category slugs to their corresponding Mongoose models
 */

import LikelyToQuestion from './LikelyToQuestion.js';
import KnowledgeQuestion from './KnowledgeQuestion.js';
import AgreementQuestion from './AgreementQuestion.js';
import ConfessionQuestion from './ConfessionQuestion.js';

// Map modelName (from Categories) to actual Mongoose model
const modelRegistry = {
    'LikelyToQuestion': LikelyToQuestion,
    'KnowledgeQuestion': KnowledgeQuestion,
    'AgreementQuestion': AgreementQuestion,
    'ConfessionQuestion': ConfessionQuestion,
};

// Map category slug to modelName for convenience
const slugToModelName = {
    'likelyto': 'LikelyToQuestion',
    'knowledge': 'KnowledgeQuestion',
    'agreement': 'AgreementQuestion',
    'confessions': 'ConfessionQuestion',
};

/**
 * Get the Mongoose model for a given modelName
 * @param {string} modelName - The model name from Categories collection
 * @returns {Model|null} - The Mongoose model or null if not found
 */
export const getModelByName = (modelName) => {
    return modelRegistry[modelName] || null;
};

/**
 * Get the Mongoose model for a given category slug
 * @param {string} slug - The category slug
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
