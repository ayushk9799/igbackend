import assert from 'node:assert/strict';
import test from 'node:test';
import {
    createCurrentScribbleSignature,
    verifyCurrentScribbleSignature,
} from '../utils/scribbleWidgetAccess.js';

const environment = {
    SCRIBBLE_WIDGET_SIGNING_SECRET: 'test-only-signing-secret',
};

test('verifies a signed current-canvas request', () => {
    const coupleId = '507f1f77bcf86cd799439011';
    const recipientId = '507f191e810c19729de860ea';
    const signature = createCurrentScribbleSignature(coupleId, recipientId, environment);

    assert.equal(
        verifyCurrentScribbleSignature(coupleId, recipientId, signature, environment),
        true
    );
});

test('rejects a signature copied to another recipient', () => {
    const coupleId = '507f1f77bcf86cd799439011';
    const recipientId = '507f191e810c19729de860ea';
    const signature = createCurrentScribbleSignature(coupleId, recipientId, environment);

    assert.equal(
        verifyCurrentScribbleSignature(
            coupleId,
            '507f191e810c19729de860eb',
            signature,
            environment
        ),
        false
    );
});

test('rejects malformed signatures', () => {
    assert.equal(
        verifyCurrentScribbleSignature(
            '507f1f77bcf86cd799439011',
            '507f191e810c19729de860ea',
            'not-a-signature',
            environment
        ),
        false
    );
});
