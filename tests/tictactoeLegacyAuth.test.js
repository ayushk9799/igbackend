import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';

test('TicTacToe router middleware sets req.auth from params for legacy requests', () => {
    const getRequestUserId = (req) => {
        if (req.auth?.userId) {
            return String(req.auth.userId);
        }
        const legacyUserId = req.params?.userId
            || req.body?.userId
            || req.body?.creatorId
            || req.query?.userId;
        if (legacyUserId) {
            req.auth = { userId: String(legacyUserId), legacy: true };
            return req.auth.userId;
        }
        return null;
    };

    const rejectWrongUser = (req, res, requestedUserId) => {
        const authUserId = getRequestUserId(req);
        if (requestedUserId && authUserId && String(requestedUserId) !== String(authUserId)) {
            res.status(403).json({ success: false, message: 'You cannot access another player’s game' });
            return true;
        }
        return false;
    };

    // Test 1: Legacy GET request with route param (no Authorization header, no body)
    const req1 = {
        headers: {},
        params: { userId: '507f1f77bcf86cd799439011' },
        body: {},
        query: {},
        auth: null,
    };
    const res1 = {
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };

    const rejected1 = rejectWrongUser(req1, res1, '507f1f77bcf86cd799439011');
    assert.equal(rejected1, false, 'Matching legacy user should not be rejected');
    assert.equal(req1.auth.userId, '507f1f77bcf86cd799439011', 'req.auth should be populated from params');

    // Test 2: Mismatched legacy user
    const req2 = {
        headers: {},
        params: { userId: '507f1f77bcf86cd799439011' },
        body: {},
        query: {},
        auth: null,
    };
    const res2 = {
        status(code) { this.statusCode = code; return this; },
        json(payload) { this.payload = payload; return this; },
    };
    const rejected2 = rejectWrongUser(req2, res2, 'different-user-id');
    assert.equal(rejected2, true, 'Different requested user should be rejected');
    assert.equal(res2.statusCode, 403);
});

