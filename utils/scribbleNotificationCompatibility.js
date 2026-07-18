const getPositiveInteger = (value, fallback) => {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

/**
 * Temporary compatibility layer for iOS notification extensions that only
 * understand data.paths. Remove after the snapshot-capable build is forced.
 */
export const getLegacyScribbleData = (user, scribble = {}, env = process.env) => {
    const enabled = String(env.SCRIBBLE_LEGACY_PATHS_ENABLED ?? 'true').toLowerCase() !== 'false';
    if (!enabled || user?.platform !== 'ios') return null;

    // Intentionally no build-number branching. While this temporary flag is
    // enabled, every iOS notification supports both old and new extensions.
    if (!Array.isArray(scribble.legacyPaths)) return null;

    const serializedPaths = JSON.stringify(scribble.legacyPaths);
    const maximumPathBytes = getPositiveInteger(env.SCRIBBLE_LEGACY_PATHS_MAX_BYTES, 2500);
    if (Buffer.byteLength(serializedPaths, 'utf8') > maximumPathBytes) return null;

    const canvasWidth = Number(scribble.canvasWidth);
    const canvasHeight = Number(scribble.canvasHeight);
    const safeCanvasWidth = Number.isFinite(canvasWidth) && canvasWidth > 0 ? canvasWidth : 350;
    const safeCanvasHeight = Number.isFinite(canvasHeight) && canvasHeight > 0
        ? canvasHeight
        : safeCanvasWidth;

    return {
        paths: serializedPaths,
        canvasWidth: String(safeCanvasWidth),
        canvasHeight: String(safeCanvasHeight),
    };
};

export const isFcmMessageTooLargeError = (error) => (
    error?.code === 'messaging/invalid-argument'
    && /message is too large|maximum is 4k/i.test(error?.message || '')
);
