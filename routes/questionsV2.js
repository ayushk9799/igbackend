import express from 'express';
import User from '../models/User.js';
import FutureQuestionSetV2 from '../models/v2/FutureQuestionSetV2.js';
import RelationshipQuestionSetV2 from '../models/v2/RelationshipQuestionSetV2.js';
import SexLoveQuestionSetV2 from '../models/v2/SexLoveQuestionSetV2.js';
import CoupleTherapyQuestionSetV2 from '../models/v2/CoupleTherapyQuestionSetV2.js';
import LongDistanceQuestionSetV2 from '../models/v2/LongDistanceQuestionSetV2.js';
import NaughtyQuestionSetV2 from '../models/v2/NaughtyQuestionSetV2.js';
import GossipQuestionSetV2 from '../models/v2/GossipQuestionSetV2.js';
import MoneyQuestionSetV2 from '../models/v2/MoneyQuestionSetV2.js';
import GetToKnowQuestionSetV2 from '../models/v2/GetToKnowQuestionSetV2.js';
import TravelQuestionSetV2 from '../models/v2/TravelQuestionSetV2.js';
import FamilyQuestionSetV2 from '../models/v2/FamilyQuestionSetV2.js';
import QuestionProgressV2 from '../models/v2/QuestionProgressV2.js';
import QuestionAnswerV2 from '../models/v2/QuestionAnswerV2.js';
import QuestionChatV2 from '../models/v2/QuestionChatV2.js';
import QuestionChatMessageV2 from '../models/v2/QuestionChatMessageV2.js';
import { buildSetSimilarityReport, compareAnswersByFormat } from '../services/questionsV2/reportService.js';
import { getIO } from '../socket/index.js';
import { getSocketId } from '../socket/auth.js';
import { sendPushNotification } from '../utils/pushNotification.js';

const router = express.Router();

const TOPICS_V2 = [
    { topicId: 'relationship', title: 'Relationship', order: 1, isActive: true },
    { topicId: 'sexlove', title: 'Sex & Love', order: 2, isActive: true },
    { topicId: 'coupletherapy', title: 'Couple Therapy', order: 3, isActive: true },
    { topicId: 'longdistance', title: 'Long Distance', order: 4, isActive: true },
    { topicId: 'naughty', title: 'Naughty', order: 5, isActive: true },
    { topicId: 'gossip', title: 'Gossip', order: 6, isActive: true },
    { topicId: 'money', title: 'Money', order: 7, isActive: true },
    { topicId: 'gettoknow', title: 'Get To Know', order: 8, isActive: true },
    { topicId: 'travel', title: 'Travel', order: 9, isActive: true },
    { topicId: 'family', title: 'Family', order: 10, isActive: true },
    { topicId: 'future', title: 'Future', order: 11, isActive: true },
];

const TOPIC_SET_MODELS_V2 = {
    future: FutureQuestionSetV2,
    relationship: RelationshipQuestionSetV2,
    sexlove: SexLoveQuestionSetV2,
    coupletherapy: CoupleTherapyQuestionSetV2,
    longdistance: LongDistanceQuestionSetV2,
    naughty: NaughtyQuestionSetV2,
    gossip: GossipQuestionSetV2,
    money: MoneyQuestionSetV2,
    gettoknow: GetToKnowQuestionSetV2,
    travel: TravelQuestionSetV2,
    family: FamilyQuestionSetV2,
};

const getTopicModel = (topicId) => TOPIC_SET_MODELS_V2[topicId];

const clampLimit = (value) => {
    const parsed = Number.parseInt(value || '10', 10);
    if (!Number.isInteger(parsed)) return 10;
    return Math.min(Math.max(parsed, 1), 25);
};

const parseCursor = (value) => {
    const parsed = Number.parseInt(value || '0', 10);
    if (!Number.isInteger(parsed) || parsed < 0) return 0;
    return parsed;
};

const getAnswerPreview = (answer, answerType = 'text') => {
    if (answerType === 'photo') return 'Photo';
    if (answerType === 'video') return 'Video';
    if (answerType === 'voice') return 'Voice message';
    if (typeof answer === 'string') return answer.substring(0, 120);
    return JSON.stringify(answer).substring(0, 120);
};

const buildProgressUpdate = ({ action, questionId, cursor }) => {
    const update = {
        $set: {},
        $addToSet: {},
    };

    if (cursor !== undefined && cursor !== null) {
        update.$set.lastCursor = cursor;
    }

    if (questionId && ['seen', 'skipped', 'answered'].includes(action)) {
        update.$addToSet.seenQuestionIds = questionId;
    }

    if (questionId && action === 'skipped') {
        update.$addToSet.skippedQuestionIds = questionId;
    }

    if (questionId && action === 'answered') {
        update.$addToSet.answeredQuestionIds = questionId;
    }

    if (action === 'completed') {
        update.$set.completedAt = new Date();
    }

    if (Object.keys(update.$set).length === 0) delete update.$set;
    if (Object.keys(update.$addToSet).length === 0) delete update.$addToSet;

    return update;
};

const updateProgress = async ({ userId, topicId, setId, questionId, action, cursor }) => {
    const update = buildProgressUpdate({ action, questionId, cursor });
    if (Object.keys(update).length === 0) {
        return QuestionProgressV2.findOne({ userId, topicId, setId });
    }

    return QuestionProgressV2.findOneAndUpdate(
        { userId, topicId, setId },
        update,
        { upsert: true, new: true }
    );
};

const findQuestionInSet = (set, questionId) => {
    return (set.questions || []).find((question) => (
        question.questionId === questionId && question.isActive !== false
    ));
};

const latestAnswersByQuestion = (answers) => {
    const latest = new Map();
    for (const answer of answers) {
        if (!latest.has(answer.questionId)) {
            latest.set(answer.questionId, answer);
        }
    }
    return Array.from(latest.values());
};

const getPartnerAnswersForQuestion = async ({ coupleId, topicId, setId, questionId, partner1, partner2 }) => {
    const answers = await QuestionAnswerV2.find({
        coupleId,
        topicId,
        setId,
        questionId,
        userId: { $in: [partner1, partner2] },
    })
        .sort({ createdAt: -1 })
        .lean();

    const latestByUser = new Map();
    for (const answer of answers) {
        const key = answer.userId.toString();
        if (!latestByUser.has(key)) latestByUser.set(key, answer);
    }

    return {
        partner1Answer: latestByUser.get(partner1.toString()) || null,
        partner2Answer: latestByUser.get(partner2.toString()) || null,
    };
};

const createOrUpdateQuestionChat = async ({ user, set, topicId, question, answer, answerType }) => {
    const partnerId = user.partnerId;
    const coupleId = QuestionChatV2.generateCoupleId(user._id, partnerId);
    const { partner1, partner2 } = QuestionChatV2.getPartnerFields(user._id, partnerId);
    const now = new Date();

    let chat = await QuestionChatV2.findOne({
        coupleId,
        topicId,
        setId: set.setId,
        questionId: question.questionId,
    });

    const wasCreated = !chat;
    if (!chat) {
        chat = new QuestionChatV2({
            coupleId,
            partner1,
            partner2,
            userIds: [partner1, partner2],
            topicId,
            setId: set.setId,
            questionId: question.questionId,
            format: set.format,
            prompt: question.prompt,
            status: 'active',
        });
    }

    const message = await QuestionChatMessageV2.create({
        chatId: chat._id,
        senderId: user._id,
        messageType: 'answer',
        content: getAnswerPreview(answer, answerType),
        answerPayload: {
            answer,
            answerType,
            topicId,
            setId: set.setId,
            questionId: question.questionId,
            format: set.format,
            prompt: question.prompt,
        },
    });

    const { partner1Answer, partner2Answer } = await getPartnerAnswersForQuestion({
        coupleId,
        topicId,
        setId: set.setId,
        questionId: question.questionId,
        partner1,
        partner2,
    });

    const comparison = compareAnswersByFormat({
        format: set.format,
        userAnswer: partner1Answer?.answer,
        partnerAnswer: partner2Answer?.answer,
    });

    const isPartner1Sender = user._id.toString() === partner1.toString();
    const unreadField = isPartner1Sender ? 'partner2Unread' : 'partner1Unread';

    chat.answerSummary = {
        userAnswer: partner1Answer?.answer ?? null,
        partnerAnswer: partner2Answer?.answer ?? null,
        bothAnswered: Boolean(partner1Answer && partner2Answer),
        match: comparison.match,
        similarityScore: comparison.similarityScore,
    };
    chat.lastMessage = message.content;
    chat.lastMessageAt = now;
    chat.messageCount += 1;
    chat[unreadField] += 1;

    await chat.save();

    return { chat, message, created: wasCreated };
};

router.get('/topics', async (req, res) => {
    res.status(200).json({
        success: true,
        data: {
            topics: TOPICS_V2.filter((topic) => topic.isActive),
        },
    });
});

router.get('/topic/:topicId/sets', async (req, res) => {
    try {
        const { topicId } = req.params;
        const TopicSetModel = getTopicModel(topicId);

        if (!TopicSetModel) {
            return res.status(400).json({ success: false, message: 'Invalid V2 topic' });
        }

        const sets = await TopicSetModel.find({ isActive: true })
            .select('setId title format order premium questions')
            .sort({ order: 1, createdAt: 1 })
            .lean();

        res.status(200).json({
            success: true,
            data: {
                topicId,
                sets: sets.map((set) => ({
                    setId: set.setId,
                    title: set.title,
                    format: set.format,
                    order: set.order,
                    premium: set.premium,
                    totalQuestions: (set.questions || []).filter((q) => q.isActive !== false).length,
                })),
            },
        });
    } catch (error) {
        console.error('Error fetching V2 question sets:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch V2 question sets',
            error: error.message,
        });
    }
});

router.get('/topic/:topicId/sets/:setId/report', async (req, res) => {
    try {
        const { topicId, setId } = req.params;
        const { userId } = req.query;
        const TopicSetModel = getTopicModel(topicId);

        if (!TopicSetModel) {
            return res.status(400).json({ success: false, message: 'Invalid V2 topic' });
        }

        if (!userId) {
            return res.status(400).json({ success: false, message: 'userId is required' });
        }

        const user = await User.findById(userId).select('partnerId').lean();
        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.partnerId) {
            return res.status(400).json({ success: false, message: 'User has no partner linked' });
        }

        const set = await TopicSetModel.findOne({ setId, isActive: true }).lean();
        if (!set) {
            return res.status(404).json({ success: false, message: 'Question set not found' });
        }

        const coupleId = QuestionChatV2.generateCoupleId(userId, user.partnerId);
        const [userAnswers, partnerAnswers] = await Promise.all([
            QuestionAnswerV2.find({ coupleId, topicId, setId, userId }).sort({ createdAt: -1 }).lean(),
            QuestionAnswerV2.find({ coupleId, topicId, setId, userId: user.partnerId }).sort({ createdAt: -1 }).lean(),
        ]);

        const latestUserAnswers = latestAnswersByQuestion(userAnswers);
        const latestPartnerAnswers = latestAnswersByQuestion(partnerAnswers);

        const report = buildSetSimilarityReport({
            set,
            userAnswers: latestUserAnswers,
            partnerAnswers: latestPartnerAnswers,
            userId,
            partnerId: user.partnerId,
        });

        res.status(200).json({
            success: true,
            data: {
                topicId,
                ...report,
            },
        });
    } catch (error) {
        console.error('Error building V2 similarity report:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to build V2 similarity report',
            error: error.message,
        });
    }
});

router.get('/topic/:topicId/sets/:setId', async (req, res) => {
    try {
        const { topicId, setId } = req.params;
        const { userId } = req.query;
        const limit = clampLimit(req.query.limit);
        const cursor = parseCursor(req.query.cursor);
        const TopicSetModel = getTopicModel(topicId);

        if (!TopicSetModel) {
            return res.status(400).json({ success: false, message: 'Invalid V2 topic' });
        }

        const set = await TopicSetModel.findOne({ setId, isActive: true }).lean();
        if (!set) {
            return res.status(404).json({ success: false, message: 'Question set not found' });
        }

        const activeQuestions = (set.questions || []).filter((question) => question.isActive !== false);
        const pageQuestions = activeQuestions.slice(cursor, cursor + limit);
        const nextIndex = cursor + pageQuestions.length;
        const hasMore = nextIndex < activeQuestions.length;
        const progress = userId
            ? await QuestionProgressV2.findOne({ userId, topicId, setId }).lean()
            : null;

        res.status(200).json({
            success: true,
            data: {
                topicId,
                set: {
                    setId: set.setId,
                    title: set.title,
                    format: set.format,
                    premium: set.premium,
                },
                questions: pageQuestions.map((question, offset) => ({
                    questionId: question.questionId,
                    prompt: question.prompt,
                    index: cursor + offset,
                    options: question.options || [],
                    minValue: question.minValue,
                    maxValue: question.maxValue,
                    minLabel: question.minLabel,
                    maxLabel: question.maxLabel,
                })),
                page: {
                    limit,
                    cursor,
                    returned: pageQuestions.length,
                    totalQuestions: activeQuestions.length,
                    nextCursor: hasMore ? String(nextIndex) : null,
                    hasMore,
                },
                progress: {
                    answeredCount: progress?.answeredQuestionIds?.length || 0,
                    skippedCount: progress?.skippedQuestionIds?.length || 0,
                    seenCount: progress?.seenQuestionIds?.length || 0,
                    currentIndex: cursor,
                    completedAt: progress?.completedAt || null,
                },
            },
        });
    } catch (error) {
        console.error('Error fetching V2 set questions:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch V2 set questions',
            error: error.message,
        });
    }
});

router.post('/progress', async (req, res) => {
    try {
        const { userId, topicId, setId, questionId, action, cursor } = req.body;

        if (!userId || !topicId || !setId || !action) {
            return res.status(400).json({
                success: false,
                message: 'userId, topicId, setId, and action are required',
            });
        }

        if (!['seen', 'skipped', 'answered', 'completed'].includes(action)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid progress action',
            });
        }

        const progress = await updateProgress({ userId, topicId, setId, questionId, action, cursor });

        res.status(200).json({
            success: true,
            message: 'V2 progress updated',
            data: { progress },
        });
    } catch (error) {
        console.error('Error updating V2 question progress:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update V2 question progress',
            error: error.message,
        });
    }
});

router.post('/answer', async (req, res) => {
    try {
        const {
            userId,
            topicId,
            setId,
            questionId,
            answer,
            answerType = 'text',
            cursor,
        } = req.body;

        if (!userId || !topicId || !setId || !questionId || answer === undefined || answer === null) {
            return res.status(400).json({
                success: false,
                message: 'userId, topicId, setId, questionId, and answer are required',
            });
        }

        const TopicSetModel = getTopicModel(topicId);
        if (!TopicSetModel) {
            return res.status(400).json({ success: false, message: 'Invalid V2 topic' });
        }

        const [user, set] = await Promise.all([
            User.findById(userId).select('name partnerId').lean(),
            TopicSetModel.findOne({ setId, isActive: true }).lean(),
        ]);

        if (!user) {
            return res.status(404).json({ success: false, message: 'User not found' });
        }

        if (!user.partnerId) {
            return res.status(400).json({ success: false, message: 'User has no partner linked' });
        }

        if (!set) {
            return res.status(404).json({ success: false, message: 'Question set not found' });
        }

        const question = findQuestionInSet(set, questionId);
        if (!question) {
            return res.status(404).json({ success: false, message: 'Question not found in set' });
        }

        const coupleId = QuestionChatV2.generateCoupleId(userId, user.partnerId);
        const savedAnswer = await QuestionAnswerV2.findOneAndUpdate(
            { userId, topicId, setId, questionId },
            {
                userId,
                partnerId: user.partnerId,
                coupleId,
                topicId,
                setId,
                questionId,
                format: set.format,
                prompt: question.prompt,
                answerType,
                answer,
            },
            { upsert: true, new: true, runValidators: true }
        );

        const progress = await updateProgress({
            userId,
            topicId,
            setId,
            questionId,
            action: 'answered',
            cursor,
        });

        const { chat, created } = await createOrUpdateQuestionChat({
            user,
            set,
            topicId,
            question,
            answer,
            answerType,
        });

        const io = getIO();
        const partnerSocketId = getSocketId(user.partnerId.toString());
        if (io && partnerSocketId) {
            io.to(partnerSocketId).emit('questionChatV2:notification', {
                chatId: chat._id,
                senderName: user.name,
                preview: getAnswerPreview(answer, answerType),
                questionText: question.prompt.substring(0, 120),
                bothAnswered: chat.answerSummary?.bothAnswered || false,
            });
        }

        try {
            await sendPushNotification(
                user.partnerId,
                question.prompt.substring(0, 120),
                `${user.name || 'Your partner'}: ${getAnswerPreview(answer, answerType)}`,
                {
                    type: 'questionChatV2',
                    chatId: chat._id.toString(),
                    senderId: userId,
                    topicId,
                    setId,
                    questionId,
                }
            );
        } catch (notifError) {
            console.warn('[questionsV2/answer] Push notification failed:', notifError.message);
        }

        res.status(200).json({
            success: true,
            message: 'V2 answer saved and chat created/updated',
            data: {
                answer: savedAnswer,
                progress,
                chat: {
                    chatId: chat._id,
                    created,
                    bothAnswered: chat.answerSummary?.bothAnswered || false,
                    match: chat.answerSummary?.match ?? null,
                    similarityScore: chat.answerSummary?.similarityScore ?? null,
                },
            },
        });
    } catch (error) {
        console.error('Error saving V2 question answer:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to save V2 question answer',
            error: error.message,
        });
    }
});

export default router;
