import test from 'node:test';
import assert from 'node:assert/strict';
import {
    claimMediaSession,
    getMediaSession,
    MEDIA_SESSION_TYPE,
    releaseMediaSession,
} from '../socket/mediaSessionRegistry.js';

test('one couple cannot claim normal call and live chat at the same time', () => {
    const coupleId = `couple_test_${Date.now()}`;
    const live = claimMediaSession({
        coupleId,
        type: MEDIA_SESSION_TYPE.LIVE_CHAT,
        sessionId: 'live-1',
        participantIds: ['one', 'two'],
    });
    assert.equal(live.success, true);

    const call = claimMediaSession({
        coupleId,
        type: MEDIA_SESSION_TYPE.CALL,
        sessionId: 'call-1',
        participantIds: ['one', 'two'],
    });
    assert.equal(call.success, false);
    assert.equal(call.session.type, MEDIA_SESSION_TYPE.LIVE_CHAT);

    assert.equal(releaseMediaSession({
        coupleId,
        type: MEDIA_SESSION_TYPE.LIVE_CHAT,
        sessionId: 'live-1',
    }), true);
    assert.equal(getMediaSession(coupleId), null);
});

test('claims are idempotent but another session cannot release the owner', () => {
    const coupleId = `couple_test_${Date.now()}_idempotent`;
    const input = {
        coupleId,
        type: MEDIA_SESSION_TYPE.CALL,
        sessionId: 'call-owner',
        participantIds: ['one', 'two'],
    };
    assert.equal(claimMediaSession(input).success, true);
    assert.equal(claimMediaSession(input).success, true);
    assert.equal(releaseMediaSession({ ...input, sessionId: 'other-call' }), false);
    assert.equal(getMediaSession(coupleId)?.sessionId, 'call-owner');
    assert.equal(releaseMediaSession(input), true);
});
