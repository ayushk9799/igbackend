import test from 'node:test';
import assert from 'node:assert/strict';
import User from '../models/User.js';
import QuestionAnswerV2 from '../models/v2/QuestionAnswerV2.js';
import DailyAnswers from '../models/DailyAnswers.js';
import { getCoupleQuestionStats } from '../services/questionsV2/coupleStats.js';

const userId = '507f1f77bcf86cd799439011';
const partnerId = '507f191e810c19729de860ea';

const mockAnswers = (t, { partner = partnerId, topics = [], rituals = [] } = {}) => {
    t.mock.method(User, 'findById', () => ({
        select: () => ({ lean: async () => partner ? { partnerId: partner } : null }),
    }));
    const topicQuery = t.mock.method(QuestionAnswerV2, 'aggregate', async () => topics);
    const ritualQuery = t.mock.method(DailyAnswers, 'aggregate', async () => rituals);
    return { topicQuery, ritualQuery };
};

test('an unlinked user has zero shared answers without querying answer collections', async t => {
    const { topicQuery, ritualQuery } = mockAnswers(t, { partner: null });
    assert.deepEqual(await getCoupleQuestionStats(userId), { questionsAnsweredTogether: 0 });
    assert.equal(topicQuery.mock.callCount(), 0);
    assert.equal(ritualQuery.mock.callCount(), 0);
});

test('a couple with no shared answers reports zero rather than missing data', async t => {
    mockAnswers(t);
    assert.deepEqual(await getCoupleQuestionStats(userId), { questionsAnsweredTogether: 0 });
});

test('shared topic answers and daily ritual answers both contribute to the total', async t => {
    mockAnswers(t, {
        topics: [{ questionsAnsweredTogether: 12 }],
        rituals: [{ questionsAnsweredTogether: 7 }],
    });
    assert.deepEqual(await getCoupleQuestionStats(userId), { questionsAnsweredTogether: 19 });
});

test('an empty topic history does not discard shared daily ritual answers', async t => {
    mockAnswers(t, { rituals: [{ questionsAnsweredTogether: 4 }] });
    assert.deepEqual(await getCoupleQuestionStats(userId), { questionsAnsweredTogether: 4 });
});

test('either partner uses the same couple scope and excludes answers from other couples', async t => {
    const { topicQuery, ritualQuery } = mockAnswers(t, { partner: userId });
    await getCoupleQuestionStats(partnerId);
    const expectedCoupleId = [userId, partnerId].sort().join('_');
    for (const query of [topicQuery, ritualQuery]) {
        const filter = query.mock.calls[0].arguments[0][0].$match;
        assert.equal(filter.coupleId, expectedCoupleId);
        assert.deepEqual(filter.userId.$in.map(String).sort(), [userId, partnerId].sort());
    }
});

test('a database failure remains an error instead of displaying a false zero', async t => {
    mockAnswers(t);
    t.mock.method(DailyAnswers, 'aggregate', async () => { throw new Error('Database unavailable'); });
    await assert.rejects(getCoupleQuestionStats(userId), /Database unavailable/);
});
