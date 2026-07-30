export const PUZZLE_TIMER_MODES = Object.freeze({
    UNTIMED: 'untimed',
    FIVE_MINUTE: 'five_minute'
});

export const normalizePuzzleTimerMode = (timerMode) => (
    timerMode === PUZZLE_TIMER_MODES.FIVE_MINUTE
        ? PUZZLE_TIMER_MODES.FIVE_MINUTE
        : PUZZLE_TIMER_MODES.UNTIMED
);

export const buildPuzzleStartFields = (timerMode, now, durationMs) => {
    const fields = {
        status: 'in_progress',
        startedAt: now
    };

    if (normalizePuzzleTimerMode(timerMode) === PUZZLE_TIMER_MODES.FIVE_MINUTE) {
        fields.expiresAt = new Date(now.getTime() + durationMs);
    }

    return fields;
};
