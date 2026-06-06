const normalizeAnswer = (answer) => {
    if (answer === null || answer === undefined) return null;
    if (typeof answer === 'string') return answer.trim().toLowerCase();
    if (typeof answer === 'number' || typeof answer === 'boolean') return answer;
    if (typeof answer === 'object' && answer.value !== undefined) return normalizeAnswer(answer.value);
    return JSON.stringify(answer);
};

const toNumber = (answer) => {
    if (typeof answer === 'number') return answer;
    if (typeof answer === 'string' && answer.trim() !== '') {
        const parsed = Number(answer);
        return Number.isNaN(parsed) ? null : parsed;
    }
    if (answer && typeof answer === 'object' && answer.value !== undefined) {
        return toNumber(answer.value);
    }
    return null;
};

export const isScoredSimilarityFormat = (format) => [
    'likelyto',
    'neverhaveiever',
    'wouldyourather',
    'thisorthat',
    'slider',
].includes(format);

export const compareAnswersByFormat = ({ format, userAnswer, partnerAnswer }) => {
    if (userAnswer === undefined || userAnswer === null || partnerAnswer === undefined || partnerAnswer === null) {
        return {
            comparable: isScoredSimilarityFormat(format),
            match: null,
            similarityScore: null,
        };
    }

    if (format === 'slider') {
        const left = toNumber(userAnswer);
        const right = toNumber(partnerAnswer);

        if (left === null || right === null) {
            return {
                comparable: true,
                match: null,
                similarityScore: null,
            };
        }

        const distance = Math.abs(left - right);
        const match = distance <= 1;
        const similarityScore = Math.max(0, Math.round(100 - (distance * 20)));

        return {
            comparable: true,
            match,
            similarityScore,
            distance,
        };
    }

    if (isScoredSimilarityFormat(format)) {
        const match = normalizeAnswer(userAnswer) === normalizeAnswer(partnerAnswer);
        return {
            comparable: true,
            match,
            similarityScore: match ? 100 : 0,
        };
    }

    return {
        comparable: false,
        match: null,
        similarityScore: null,
    };
};

export const buildSetSimilarityReport = ({ set, userAnswers, partnerAnswers, userId, partnerId }) => {
    const userAnswerByQuestion = new Map(
        userAnswers.map((answer) => [answer.questionId, answer])
    );
    const partnerAnswerByQuestion = new Map(
        partnerAnswers.map((answer) => [answer.questionId, answer])
    );

    const activeQuestions = (set.questions || []).filter((question) => question.isActive !== false);
    const items = activeQuestions.map((question, index) => {
        const userAnswer = userAnswerByQuestion.get(question.questionId);
        const partnerAnswer = partnerAnswerByQuestion.get(question.questionId);
        const comparison = compareAnswersByFormat({
            format: set.format,
            userAnswer: userAnswer?.answer,
            partnerAnswer: partnerAnswer?.answer,
        });

        return {
            questionId: question.questionId,
            prompt: question.prompt,
            index,
            userAnswer: userAnswer?.answer ?? null,
            partnerAnswer: partnerAnswer?.answer ?? null,
            userAnsweredAt: userAnswer?.createdAt ?? null,
            partnerAnsweredAt: partnerAnswer?.createdAt ?? null,
            bothAnswered: Boolean(userAnswer && partnerAnswer),
            match: comparison.match,
            similarityScore: comparison.similarityScore,
            comparable: comparison.comparable,
        };
    });

    const bothAnsweredItems = items.filter((item) => item.bothAnswered);
    const comparableItems = bothAnsweredItems.filter((item) => item.comparable);
    const matched = comparableItems.filter((item) => item.match === true).length;
    const different = comparableItems.filter((item) => item.match === false).length;
    const scored = comparableItems.filter((item) => typeof item.similarityScore === 'number');
    const similarityPercent = scored.length
        ? Math.round(scored.reduce((sum, item) => sum + item.similarityScore, 0) / scored.length)
        : null;

    return {
        setId: set.setId,
        title: set.title,
        format: set.format,
        userId,
        partnerId,
        summary: {
            totalQuestions: activeQuestions.length,
            bothAnswered: bothAnsweredItems.length,
            comparable: comparableItems.length,
            matched,
            different,
            similarityPercent,
        },
        items,
    };
};
