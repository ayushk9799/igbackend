export const calculateQuestionProgress = (progress = {}, activeQuestionIds = []) => {
    const activeIds = new Set(activeQuestionIds);
    const answeredQuestionIds = progress?.answeredQuestionIds || [];
    const skippedQuestionIds = progress?.skippedQuestionIds || [];
    const doneQuestionIds = new Set([
        ...answeredQuestionIds,
        ...skippedQuestionIds,
    ]);
    const doneCount = [...doneQuestionIds]
        .filter((questionId) => activeIds.has(questionId))
        .length;
    const totalQuestions = activeIds.size;

    return {
        answeredCount: answeredQuestionIds.length,
        skippedCount: skippedQuestionIds.length,
        seenCount: progress?.seenQuestionIds?.length || 0,
        doneCount,
        totalQuestions,
        percentComplete: totalQuestions > 0
            ? Math.min(100, Math.round((doneCount / totalQuestions) * 100))
            : 0,
        completedAt: progress?.completedAt || null,
    };
};
