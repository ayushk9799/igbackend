/**
 * Word Validator Utility
 * Loads 5-letter words from file into a Set for O(1) lookup
 */

import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load words once at module initialization for maximum performance
const wordsPath = join(__dirname, '../assets/5-letter-words.txt');
let validWords = new Set();

try {
    const wordsContent = readFileSync(wordsPath, 'utf-8');
    validWords = new Set(
        wordsContent
            .split('\n')
            .map(word => word.trim().toLowerCase())
            .filter(w => w.length === 5)
    );
    console.log(`✅ Loaded ${validWords.size} valid 5-letter words`);
} catch (error) {
    console.error('❌ Error loading word list:', error.message);
}

/**
 * Check if a word is valid (exists in the dictionary)
 * @param {string} word - The word to validate
 * @returns {boolean} - True if valid, false otherwise
 */
export const isValidWord = (word) => {
    if (!word || typeof word !== 'string') return false;
    const normalized = word.toLowerCase().trim();
    if (normalized.length !== 5) return false;
    return validWords.has(normalized);
};

/**
 * Get the total count of valid words
 * @returns {number} - Number of words in dictionary
 */
export const getWordCount = () => validWords.size;

export default { isValidWord, getWordCount };
