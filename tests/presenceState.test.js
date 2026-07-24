import assert from 'node:assert/strict';
import test from 'node:test';
import User from '../models/User.js';
import {
    connectedUsers,
    getSocketId,
    handleConnection,
    isUserOnline,
} from '../socket/auth.js';

const createSocket = (id, userId, partnerId = 'partner-1') => {
    const handlers = new Map();
    return {
        id,
        userId,
        partnerId,
        userName: 'Test User',
        handlers,
        join() {},
        leave() {},
        to() {
            return { emit() {} };
        },
        on(event, handler) {
            handlers.set(event, handler);
        },
    };
};

const createIO = () => ({
    sockets: { sockets: new Map() },
    to() {
        return { emit() {} };
    },
});

test('disconnecting an older socket keeps a newer socket online', async (t) => {
    connectedUsers.clear();
    const originalFindByIdAndUpdate = User.findByIdAndUpdate;
    const databaseUpdates = [];
    User.findByIdAndUpdate = async (userId, update) => {
        databaseUpdates.push({ userId, update });
        return null;
    };

    t.after(() => {
        User.findByIdAndUpdate = originalFindByIdAndUpdate;
        connectedUsers.clear();
    });

    const io = createIO();
    const firstSocket = createSocket('socket-1', 'user-1');
    const secondSocket = createSocket('socket-2', 'user-1');

    await handleConnection(firstSocket, io);
    await handleConnection(secondSocket, io);

    assert.equal(isUserOnline('user-1'), true);
    assert.equal(getSocketId('user-1'), 'socket-1');

    await firstSocket.handlers.get('disconnect')('transport close');

    assert.equal(isUserOnline('user-1'), true);
    assert.equal(getSocketId('user-1'), 'socket-2');
    assert.equal(databaseUpdates.some(({ update }) => update.isOnline === false), false);

    await secondSocket.handlers.get('disconnect')('transport close');

    assert.equal(isUserOnline('user-1'), false);
    assert.equal(getSocketId('user-1'), null);
    assert.equal(databaseUpdates.at(-1).update.isOnline, false);
});
