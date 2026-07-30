import express from 'express';
import mongoose from 'mongoose';
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
import {
    getRequestLanguage,
    localizeV2Question,
    localizeV2Set,
} from '../utils/localization.js';
import { getLocalizedV2Question } from '../services/questionsV2/localizedContentService.js';
import { calculateQuestionProgress } from '../services/questionsV2/progressMath.js';

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

const TOPIC_TITLES_FR = {
    relationship: 'Relation',
    sexlove: 'Sexe et amour',
    coupletherapy: 'Thérapie de couple',
    longdistance: 'Relation à distance',
    naughty: 'Coquin',
    gossip: 'Potins',
    money: 'Argent',
    gettoknow: 'Mieux se connaître',
    travel: 'Voyage',
    family: 'Famille',
    future: 'Avenir',
};

const TOPIC_TITLES_DE = {
    relationship: 'Beziehung',
    sexlove: 'Sex und Liebe',
    coupletherapy: 'Paartherapie',
    longdistance: 'Fernbeziehung',
    naughty: 'Frech',
    gossip: 'Klatsch',
    money: 'Geld',
    gettoknow: 'Kennenlernen',
    travel: 'Reisen',
    family: 'Familie',
    future: 'Zukunft',
};

const TOPIC_TITLES_ES = {
    relationship: 'Relación',
    sexlove: 'Sexo y amor',
    coupletherapy: 'Terapia de pareja',
    longdistance: 'Relación a distancia',
    naughty: 'Atrevido',
    gossip: 'Cotilleos',
    money: 'Dinero',
    gettoknow: 'Conocerse',
    travel: 'Viajes',
    family: 'Familia',
    future: 'Futuro',
};

const TOPIC_TITLES_IT = {
    relationship: 'Relazione',
    sexlove: 'Sesso e amore',
    coupletherapy: 'Terapia di coppia',
    longdistance: 'Relazione a distanza',
    naughty: 'Piccante',
    gossip: 'Pettegolezzi',
    money: 'Denaro',
    gettoknow: 'Conoscersi',
    travel: 'Viaggi',
    family: 'Famiglia',
    future: 'Futuro',
};

const TOPIC_TITLES_JA = {
    relationship: '恋愛',
    sexlove: 'セックスと愛',
    coupletherapy: 'カップルセラピー',
    longdistance: '遠距離恋愛',
    naughty: 'ちょっと刺激的',
    gossip: 'ゴシップ',
    money: 'お金',
    gettoknow: 'お互いを知る',
    travel: '旅行',
    family: '家族',
    future: '将来',
};

const TOPIC_TITLES_KO = {
    relationship: '연애',
    sexlove: '사랑과 성',
    coupletherapy: '커플 상담',
    longdistance: '장거리 연애',
    naughty: '짜릿한 질문',
    gossip: '가십',
    money: '돈',
    gettoknow: '서로 알아가기',
    travel: '여행',
    family: '가족',
    future: '미래',
};

const TOPIC_TITLES = {
    fr: TOPIC_TITLES_FR,
    de: TOPIC_TITLES_DE,
    es: TOPIC_TITLES_ES,
    it: TOPIC_TITLES_IT,
    ja: TOPIC_TITLES_JA,
    ko: TOPIC_TITLES_KO,
};

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
const TOPIC_TOTALS_REFRESH_MS = 30 * 60 * 1000;
const QUESTION_KEY_SEPARATOR = '\u0000';

let topicQuestionMetadata = new Map();
let topicTotalsRefreshPromise = null;
let topicTotalsRefreshTimer = null;

const buildQuestionKey = (setId, questionId) => (
    `${String(setId)}${QUESTION_KEY_SEPARATOR}${String(questionId)}`
);

export const refreshTopicQuestionMetadata = async () => {
    if (topicTotalsRefreshPromise) {
        return topicTotalsRefreshPromise;
    }

    topicTotalsRefreshPromise = (async () => {
        const topicRows = await Promise.all(
            Object.entries(TOPIC_SET_MODELS_V2).map(async ([topicId, Model]) => {
                const setRows = await Model.aggregate([
                    { $match: { isActive: true } },
                    { $unwind: '$questions' },
                    { $match: { 'questions.isActive': { $ne: false } } },
                    {
                        $group: {
                            _id: '$setId',
                            questionIds: { $addToSet: '$questions.questionId' },
                        },
                    },
                ]);

                const activeQuestionKeys = new Set();
                for (const setRow of setRows) {
                    for (const questionId of setRow.questionIds || []) {
                        activeQuestionKeys.add(buildQuestionKey(setRow._id, questionId));
                    }
                }

                return [
                    topicId,
                    {
                        totalQuestions: activeQuestionKeys.size,
                        activeQuestionKeys,
                    },
                ];
            })
        );

        // Replace the complete snapshot at once so requests never observe a partial refresh.
        topicQuestionMetadata = new Map(topicRows);
        return topicQuestionMetadata;
    })().finally(() => {
        topicTotalsRefreshPromise = null;
    });

    return topicTotalsRefreshPromise;
};

const ensureTopicQuestionMetadata = async () => {
    if (topicQuestionMetadata.size === 0) {
        await refreshTopicQuestionMetadata();
    }
    return topicQuestionMetadata;
};

export const initializeTopicQuestionMetadataCache = async () => {
    if (!topicTotalsRefreshTimer) {
        topicTotalsRefreshTimer = setInterval(() => {
            refreshTopicQuestionMetadata().catch((error) => {
                console.error('[questionsV2] Failed to refresh topic question metadata:', error);
            });
        }, TOPIC_TOTALS_REFRESH_MS);
        topicTotalsRefreshTimer.unref?.();
    }

    await refreshTopicQuestionMetadata();
};

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
        update.$pull = { answeredQuestionIds: questionId };
    }

    if (questionId && action === 'answered') {
        update.$addToSet.answeredQuestionIds = questionId;
        update.$pull = { skippedQuestionIds: questionId };
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

const buildSetProgressSummary = (progress, activeQuestionIds) => {
    return calculateQuestionProgress(progress, activeQuestionIds);
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
    try {
        const { userId } = req.query;
        const language = getRequestLanguage(req);
        const metadata = await ensureTopicQuestionMetadata();
        const doneCountByTopic = new Map();

        if (userId) {
            if (!mongoose.isValidObjectId(userId)) {
                return res.status(400).json({ success: false, message: 'Invalid userId' });
            }

            const progressRows = await QuestionProgressV2.aggregate([
                {
                    $match: {
                        userId: new mongoose.Types.ObjectId(userId),
                    },
                },
                {
                    $project: {
                        topicId: 1,
                        setId: 1,
                        doneQuestionIds: {
                            $setUnion: [
                                { $ifNull: ['$answeredQuestionIds', []] },
                                { $ifNull: ['$skippedQuestionIds', []] },
                            ],
                        },
                    },
                },
            ]);

            for (const row of progressRows) {
                const activeQuestionKeys = metadata.get(row.topicId)?.activeQuestionKeys;
                if (!activeQuestionKeys) continue;

                const activeDoneCount = (row.doneQuestionIds || []).reduce(
                    (count, questionId) => (
                        activeQuestionKeys.has(buildQuestionKey(row.setId, questionId))
                            ? count + 1
                            : count
                    ),
                    0
                );
                doneCountByTopic.set(
                    row.topicId,
                    (doneCountByTopic.get(row.topicId) || 0) + activeDoneCount
                );
            }
        }

        res.status(200).json({
            success: true,
            data: {
                topics: TOPICS_V2
                    .filter((topic) => topic.isActive)
                    .map((topic) => {
                        const totalQuestions = metadata.get(topic.topicId)?.totalQuestions || 0;
                        const doneCount = doneCountByTopic.get(topic.topicId) || 0;

                        return {
                            ...topic,
                            title: TOPIC_TITLES[language]?.[topic.topicId] ?? topic.title,
                            progress: userId
                                ? {
                                    doneCount,
                                    totalQuestions,
                                    percentComplete: totalQuestions > 0
                                        ? Math.min(100, Math.round((doneCount / totalQuestions) * 100))
                                        : 0,
                                }
                                : null,
                        };
                    }),
            },
        });
    } catch (error) {
        console.error('Error fetching V2 topics:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch V2 topics',
            error: error.message,
        });
    }
});

router.get('/topic/:topicId/sets', async (req, res) => {
    try {
        const { topicId } = req.params;
        const { userId } = req.query;
        const language = getRequestLanguage(req);
        const TopicSetModel = getTopicModel(topicId);

        if (!TopicSetModel) {
            return res.status(400).json({ success: false, message: 'Invalid V2 topic' });
        }

        const sets = await TopicSetModel.find({ isActive: true })
            .select('setId title format order premium icon iconType iconUrl iconKey questions translations')
            .sort({ order: 1, createdAt: 1 })
            .lean();

        const progressBySetId = new Map();
        const partnerProgressBySetId = new Map();
        let partnerProgressUserId = null;
        if (userId && sets.length > 0) {
            const user = await User.findById(userId).select('partnerId').lean();
            partnerProgressUserId = user?.partnerId?.toString() || null;
            const progressUserIds = partnerProgressUserId ? [userId, partnerProgressUserId] : [userId];
            const progressRows = await QuestionProgressV2.find({
                userId: { $in: progressUserIds },
                topicId,
                setId: { $in: sets.map((set) => set.setId) },
            }).lean();

            for (const progress of progressRows) {
                if (progress.userId?.toString() === partnerProgressUserId) {
                    partnerProgressBySetId.set(progress.setId, progress);
                } else {
                    progressBySetId.set(progress.setId, progress);
                }
            }
        }

        res.status(200).json({
            success: true,
            data: {
                topicId,
                sets: sets.map((set) => {
                    const localizedSet = localizeV2Set(set, language);
                    const activeQuestionIds = (set.questions || [])
                        .filter((q) => q.isActive !== false)
                        .map((q) => q.questionId);
                    const totalQuestions = activeQuestionIds.length;
                    const progress = progressBySetId.get(set.setId);
                    const partnerProgress = partnerProgressUserId
                        ? partnerProgressBySetId.get(set.setId)
                        : null;

                    return {
                        setId: set.setId,
                        title: localizedSet.title,
                        format: set.format,
                        order: set.order,
                        premium: set.premium,
                        icon: set.icon || null,
                        iconType: set.iconType || 'auto',
                        iconUrl: set.iconUrl || null,
                        iconKey: set.iconKey || null,
                        totalQuestions,
                        progress: buildSetProgressSummary(progress, activeQuestionIds),
                        partnerProgress: partnerProgressUserId
                            ? buildSetProgressSummary(partnerProgress, activeQuestionIds)
                            : null,
                    };
                }),
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
        const language = getRequestLanguage(req);
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
            set: localizeV2Set(set, language),
            userAnswers: latestUserAnswers,
            partnerAnswers: latestPartnerAnswers,
            userId,
            partnerId: user.partnerId,
        });

        const chats = await QuestionChatV2.find({
            coupleId,
            topicId,
            setId,
            status: 'active',
        }).select('_id questionId').lean();
        const chatIdByQuestion = new Map(
            chats.map((chat) => [chat.questionId, chat._id])
        );

        res.status(200).json({
            success: true,
            data: {
                topicId,
                ...report,
                items: report.items.map((item) => ({
                    ...item,
                    chatId: chatIdByQuestion.get(item.questionId) || null,
                })),
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
        const language = getRequestLanguage(req);
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
        const localizedSet = localizeV2Set(set, language);
        const localizedQuestionsById = new Map(
            localizedSet.questions.map(question => [question.questionId, question])
        );
        const nextIndex = cursor + pageQuestions.length;
        const hasMore = nextIndex < activeQuestions.length;
        const [progress, savedAnswers] = userId
            ? await Promise.all([
                QuestionProgressV2.findOne({ userId, topicId, setId }).lean(),
                QuestionAnswerV2.find({ userId, topicId, setId })
                    .select('questionId answer answerType createdAt updatedAt')
                    .lean(),
            ])
            : [null, []];

        res.status(200).json({
            success: true,
            data: {
                topicId,
                set: {
                    setId: set.setId,
                    title: localizedSet.title,
                    format: set.format,
                    premium: set.premium,
                    icon: set.icon || null,
                    iconType: set.iconType || 'auto',
                    iconUrl: set.iconUrl || null,
                    iconKey: set.iconKey || null,
                },
                questions: pageQuestions.map((question, offset) => {
                    const localizedQuestion = localizedQuestionsById.get(question.questionId)
                        || localizeV2Question(question, language);
                    return ({
                    questionId: localizedQuestion.questionId,
                    prompt: localizedQuestion.prompt,
                    index: cursor + offset,
                    options: localizedQuestion.options || [],
                    optionItems: localizedQuestion.optionItems || [],
                    minValue: localizedQuestion.minValue,
                    maxValue: localizedQuestion.maxValue,
                    minLabel: localizedQuestion.minLabel,
                    maxLabel: localizedQuestion.maxLabel,
                });
                }),
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
                    answeredQuestionIds: progress?.answeredQuestionIds || [],
                    skippedQuestionIds: progress?.skippedQuestionIds || [],
                    seenQuestionIds: progress?.seenQuestionIds || [],
                    currentIndex: cursor,
                    completedAt: progress?.completedAt || null,
                },
                userAnswers: savedAnswers,
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

        const recipient = await User.findById(user.partnerId).select('preferredLanguage').lean();
        const recipientQuestion = await getLocalizedV2Question({
            topicId,
            setId,
            questionId,
            language: recipient?.preferredLanguage || 'en',
        });
        const recipientPrompt = recipientQuestion?.prompt || question.prompt;
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
                questionText: recipientPrompt.substring(0, 120),
                bothAnswered: chat.answerSummary?.bothAnswered || false,
            });
        }

        try {
            await sendPushNotification(
                user.partnerId,
                recipientPrompt.substring(0, 120),
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
