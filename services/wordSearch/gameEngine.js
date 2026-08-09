const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

export const WORD_SEARCH_DIFFICULTIES = Object.freeze({
    easy: { gridSize: 8, wordCount: 6, directions: ['E', 'S'] },
    medium: { gridSize: 10, wordCount: 8, directions: ['E', 'W', 'S', 'N', 'SE', 'NW', 'SW', 'NE'] },
    hard: { gridSize: 12, wordCount: 12, directions: ['E', 'W', 'S', 'N', 'SE', 'NW', 'SW', 'NE'] },
});

const DIRECTION_VECTORS = Object.freeze({
    E: [0, 1],
    W: [0, -1],
    S: [1, 0],
    N: [-1, 0],
    SE: [1, 1],
    NW: [-1, -1],
    SW: [1, -1],
    NE: [-1, 1],
});

export const DEFAULT_WORD_BANK = Object.freeze([
    'ADORE', 'ALWAYS', 'AMOUR', 'BLISS', 'BOND', 'CUDDLE', 'DATE', 'DREAM',
    'FOREVER', 'GIGGLE', 'HEART', 'HONEY', 'HUGS', 'JOY', 'KIND', 'KISS',
    'LAUGH', 'LOVE', 'LOYAL', 'LUCKY', 'MEMORY', 'PARTNER', 'PEACE', 'ROMANCE',
    'SMILE', 'SOUL', 'SPARK', 'SWEET', 'TEAM', 'TRUST', 'UNITY', 'WARMTH',
]);

const randomIndex = (length, random) => Math.floor(random() * length);

const shuffle = (items, random) => {
    const result = [...items];
    for (let index = result.length - 1; index > 0; index -= 1) {
        const swapIndex = randomIndex(index + 1, random);
        [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
};

export const normalizeWordList = (words) => Array.from(new Set(
    (words || [])
        .map(word => String(word).toUpperCase().replace(/[^A-Z]/g, ''))
        .filter(word => word.length >= 3)
));

const canPlaceWord = (grid, word, row, col, rowStep, colStep) => {
    for (let index = 0; index < word.length; index += 1) {
        const nextRow = row + (rowStep * index);
        const nextCol = col + (colStep * index);
        const existing = grid[nextRow][nextCol];
        if (existing && existing !== word[index]) return false;
    }
    return true;
};

const placeWord = (grid, word, row, col, rowStep, colStep) => {
    for (let index = 0; index < word.length; index += 1) {
        grid[row + (rowStep * index)][col + (colStep * index)] = word[index];
    }
};

const getStartRange = (size, wordLength, step) => {
    if (step > 0) return [0, size - wordLength];
    if (step < 0) return [wordLength - 1, size - 1];
    return [0, size - 1];
};

const randomBetween = (min, max, random) => min + randomIndex((max - min) + 1, random);

/**
 * Builds a server-authoritative word-search puzzle. The optional random
 * function makes generation deterministic in tests.
 */
export const generateWordSearch = ({
    difficulty = 'medium',
    words = DEFAULT_WORD_BANK,
    random = Math.random,
} = {}) => {
    const config = WORD_SEARCH_DIFFICULTIES[difficulty];
    if (!config) throw new Error('Unsupported word-search difficulty');

    const candidates = shuffle(normalizeWordList(words), random)
        .filter(word => word.length <= config.gridSize)
        .slice(0, config.wordCount)
        .sort((left, right) => right.length - left.length);

    if (candidates.length < config.wordCount) {
        throw new Error(`At least ${config.wordCount} suitable words are required`);
    }

    // Retry the entire layout when a locally unlucky placement sequence jams.
    for (let layoutAttempt = 0; layoutAttempt < 30; layoutAttempt += 1) {
        const grid = Array.from({ length: config.gridSize }, () => (
            Array(config.gridSize).fill('')
        ));
        const entries = [];

        for (const word of candidates) {
            let placement = null;
            for (let attempt = 0; attempt < 300 && !placement; attempt += 1) {
                const direction = config.directions[randomIndex(config.directions.length, random)];
                const [rowStep, colStep] = DIRECTION_VECTORS[direction];
                const [minRow, maxRow] = getStartRange(config.gridSize, word.length, rowStep);
                const [minCol, maxCol] = getStartRange(config.gridSize, word.length, colStep);
                const row = randomBetween(minRow, maxRow, random);
                const col = randomBetween(minCol, maxCol, random);

                if (canPlaceWord(grid, word, row, col, rowStep, colStep)) {
                    placement = { direction, row, col, rowStep, colStep };
                }
            }

            if (!placement) break;
            placeWord(
                grid,
                word,
                placement.row,
                placement.col,
                placement.rowStep,
                placement.colStep,
            );
            entries.push({
                word,
                direction: placement.direction,
                start: { row: placement.row, col: placement.col },
                end: {
                    row: placement.row + (placement.rowStep * (word.length - 1)),
                    col: placement.col + (placement.colStep * (word.length - 1)),
                },
            });
        }

        if (entries.length !== candidates.length) continue;

        for (let row = 0; row < config.gridSize; row += 1) {
            for (let col = 0; col < config.gridSize; col += 1) {
                if (!grid[row][col]) {
                    grid[row][col] = ALPHABET[randomIndex(ALPHABET.length, random)];
                }
            }
        }

        return {
            grid: grid.map(row => row.join('')),
            gridSize: config.gridSize,
            entries,
        };
    }

    throw new Error('Could not generate a complete word-search layout');
};

export const isValidCoordinate = (coordinate, gridSize) => (
    Number.isInteger(coordinate?.row)
    && Number.isInteger(coordinate?.col)
    && coordinate.row >= 0
    && coordinate.col >= 0
    && coordinate.row < gridSize
    && coordinate.col < gridSize
);

export const getSelectionCoordinates = (start, end, gridSize) => {
    if (!isValidCoordinate(start, gridSize) || !isValidCoordinate(end, gridSize)) return null;

    const rowDistance = end.row - start.row;
    const colDistance = end.col - start.col;
    const isStraight = rowDistance === 0 || colDistance === 0;
    const isDiagonal = Math.abs(rowDistance) === Math.abs(colDistance);
    if (!isStraight && !isDiagonal) return null;

    const length = Math.max(Math.abs(rowDistance), Math.abs(colDistance)) + 1;
    if (length < 3) return null;
    const rowStep = Math.sign(rowDistance);
    const colStep = Math.sign(colDistance);

    return Array.from({ length }, (_, index) => ({
        row: start.row + (rowStep * index),
        col: start.col + (colStep * index),
    }));
};

const sameCoordinate = (left, right) => left.row === right.row && left.col === right.col;

export const findEntryBySelection = (entries, start, end, gridSize) => {
    if (!getSelectionCoordinates(start, end, gridSize)) return null;

    return (entries || []).find(entry => (
        (sameCoordinate(entry.start, start) && sameCoordinate(entry.end, end))
        || (sameCoordinate(entry.start, end) && sameCoordinate(entry.end, start))
    )) || null;
};

