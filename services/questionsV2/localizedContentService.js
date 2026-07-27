import CoupleTherapyQuestionSetV2 from '../../models/v2/CoupleTherapyQuestionSetV2.js';
import FamilyQuestionSetV2 from '../../models/v2/FamilyQuestionSetV2.js';
import FutureQuestionSetV2 from '../../models/v2/FutureQuestionSetV2.js';
import GetToKnowQuestionSetV2 from '../../models/v2/GetToKnowQuestionSetV2.js';
import GossipQuestionSetV2 from '../../models/v2/GossipQuestionSetV2.js';
import LongDistanceQuestionSetV2 from '../../models/v2/LongDistanceQuestionSetV2.js';
import MoneyQuestionSetV2 from '../../models/v2/MoneyQuestionSetV2.js';
import NaughtyQuestionSetV2 from '../../models/v2/NaughtyQuestionSetV2.js';
import RelationshipQuestionSetV2 from '../../models/v2/RelationshipQuestionSetV2.js';
import SexLoveQuestionSetV2 from '../../models/v2/SexLoveQuestionSetV2.js';
import TravelQuestionSetV2 from '../../models/v2/TravelQuestionSetV2.js';
import { localizeV2Question } from '../../utils/localization.js';

const MODELS = {
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
    future: FutureQuestionSetV2,
};

export const getLocalizedV2Question = async ({
    topicId,
    setId,
    questionId,
    language,
    cache = new Map(),
}) => {
    const Model = MODELS[topicId];
    if (!Model) return null;

    const cacheKey = `${topicId}:${setId}`;
    let set = cache.get(cacheKey);
    if (set === undefined) {
        set = await Model.findOne({ setId }).select('questions').lean();
        cache.set(cacheKey, set || null);
    }

    const question = set?.questions?.find(item => item.questionId === questionId);
    return question ? localizeV2Question(question, language) : null;
};

export const localizeQuestionChatV2 = async (chat, language, cache = new Map()) => {
    const question = await getLocalizedV2Question({
        topicId: chat.topicId,
        setId: chat.setId,
        questionId: chat.questionId,
        language,
        cache,
    });

    return question ? { ...chat, prompt: question.prompt } : chat;
};

export const localizeQuestionChatMessagesV2 = (messages, prompt) => (
    messages.map((message) => {
        if (!message.answerPayload || !prompt) return message;
        return {
            ...message,
            answerPayload: {
                ...message.answerPayload,
                prompt,
            },
        };
    })
);
