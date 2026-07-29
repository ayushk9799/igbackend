import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionToken, requireAuth, requireSelf } from '../middleware/auth.js';

const withTestSecret = (callback) => {
    const previous = process.env.APP_JWT_SECRET;
    process.env.APP_JWT_SECRET = 'test-only-secret-that-is-long-enough-for-session-signing';
    try {
        return callback();
    } finally {
        if (previous === undefined) delete process.env.APP_JWT_SECRET;
        else process.env.APP_JWT_SECRET = previous;
    }
};

test('signed app sessions authenticate only their own user', () => withTestSecret(() => {
    const token = createSessionToken({
        _id: { toString: () => 'user-123' },
        email: 'user@example.com',
    });
    const req = {
        headers: { authorization: `Bearer ${token}` },
        body: { userId: 'user-123' },
        params: {},
    };
    let statusCode = null;
    const res = {
        status(code) {
            statusCode = code;
            return this;
        },
        json() {},
    };

    let authenticated = false;
    requireAuth(req, res, () => {
        authenticated = true;
    });
    assert.equal(authenticated, true);
    assert.equal(req.auth.userId, 'user-123');

    let authorized = false;
    requireSelf(req, res, () => {
        authorized = true;
    });
    assert.equal(authorized, true);
    assert.equal(statusCode, null);
}));

test('self authorization rejects a different user id', () => {
    const req = {
        auth: { userId: 'user-123' },
        body: { userId: 'user-456' },
        params: {},
    };
    let statusCode = null;
    requireSelf(req, {
        status(code) {
            statusCode = code;
            return this;
        },
        json() {},
    }, () => assert.fail('request should not be authorized'));
    assert.equal(statusCode, 403);
});

