import assert from 'node:assert/strict';
import test from 'node:test';
import {
    getLegacyScribbleData,
    isFcmMessageTooLargeError,
} from '../utils/scribbleNotificationCompatibility.js';

const baseEnvironment = {
    SCRIBBLE_LEGACY_PATHS_ENABLED: 'true',
    SCRIBBLE_LEGACY_PATHS_MAX_BYTES: '2500',
};

const smallSnapshot = {
    legacyPaths: [{ d: 'M0 0 L10 10', color: '#fff', strokeWidth: 3 }],
    canvasWidth: 350,
    canvasHeight: 420,
};

test('adds legacy paths for iOS while temporary compatibility is enabled', () => {
    const data = getLegacyScribbleData({ platform: 'ios', appBuildNumber: 6 }, smallSnapshot, baseEnvironment);
    assert.equal(data.paths, JSON.stringify(smallSnapshot.legacyPaths));
    assert.equal(data.canvasWidth, '350');
    assert.equal(data.canvasHeight, '420');
});

test('does not require an iOS build number', () => {
    const data = getLegacyScribbleData({ platform: 'ios' }, smallSnapshot, baseEnvironment);
    assert.ok(data?.paths);
});

test('still adds legacy paths for newer iOS builds during the temporary phase', () => {
    const data = getLegacyScribbleData({ platform: 'ios', appBuildNumber: 8 }, smallSnapshot, baseEnvironment);
    assert.ok(data?.paths);
});

test('does not add legacy paths to Android notifications', () => {
    const data = getLegacyScribbleData({ platform: 'android', appBuildNumber: 6 }, smallSnapshot, baseEnvironment);
    assert.equal(data, null);
});

test('omits legacy paths when the drawing exceeds the byte budget', () => {
    const largeSnapshot = {
        ...smallSnapshot,
        legacyPaths: [{ d: 'M'.repeat(3000), color: '#fff', strokeWidth: 3 }],
    };
    const data = getLegacyScribbleData({ platform: 'ios', appBuildNumber: 6 }, largeSnapshot, baseEnvironment);
    assert.equal(data, null);
});

test('legacy compatibility can be disabled without a deployment', () => {
    const data = getLegacyScribbleData(
        { platform: 'ios', appBuildNumber: 6 },
        smallSnapshot,
        { ...baseEnvironment, SCRIBBLE_LEGACY_PATHS_ENABLED: 'false' }
    );
    assert.equal(data, null);
});

test('recognizes Firebase message-too-large errors for compact retry', () => {
    assert.equal(isFcmMessageTooLargeError({
        code: 'messaging/invalid-argument',
        message: 'Message is too large. The maximum is 4K (4096 bytes).',
    }), true);
});
