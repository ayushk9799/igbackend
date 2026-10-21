import mongoose from 'mongoose';
import User from '../../models/User.js';
import QuestionAnswerV2 from '../../models/v2/QuestionAnswerV2.js';
import DailyAnswers from '../../models/DailyAnswers.js';

export const getCoupleQuestionStats = async (userId) => {
    const user = await User.findById(userId).select('partnerId').lean();
    if (!user?.partnerId) return { questionsAnsweredTogether: 0 };

    const partnerIds = [String(userId), String(user.partnerId)].sort();
    const coupleFilter = {
        coupleId: partnerIds.join('_'),
        userId: { $in: partnerIds.map(id => new mongoose.Types.ObjectId(id)) },
    };
    const bothAnsweredStages = [
        { $match: { $expr: { $eq: [{ $size: '$answeredBy' }, 2] } } },
        { $count: 'questionsAnsweredTogether' },
    ];
    const [topicResults, ritualResults] = await Promise.all([
        QuestionAnswerV2.aggregate([
            {
                $match: {
                    ...coupleFilter,
                    answer: { $exists: true, $ne: null },
                },
            },
            {
                $group: {
                    _id: { topicId: '$topicId', setId: '$setId', questionId: '$questionId' },
                    answeredBy: { $addToSet: '$userId' },
                },
            },
            ...bothAnsweredStages,
        ]),
        DailyAnswers.aggregate([
            { $match: coupleFilter },
            { $unwind: { path: '$answers', includeArrayIndex: 'questionIndex' } },
            { $match: { 'answers.value': { $exists: true, $nin: [null, ''] } } },
            {
                $group: {
                    _id: { challengeId: '$challengeId', questionIndex: '$questionIndex' },
                    answeredBy: { $addToSet: '$userId' },
                },
            },
            ...bothAnsweredStages,
        ]),
    ]);

    return {
        questionsAnsweredTogether: (topicResults[0]?.questionsAnsweredTogether ?? 0)
            + (ritualResults[0]?.questionsAnsweredTogether ?? 0),
    };
};
