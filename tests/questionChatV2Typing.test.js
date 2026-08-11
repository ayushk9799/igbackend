import test from 'node:test';
import assert from 'node:assert/strict';

import {
    handleQuestionChatV2Leave,
    handleQuestionChatV2Typing,
} from '../socket/handlers/questionChatV2.js';

const createSocket = ({ joined = true } = {}) => {
    const emitted = [];
    const left = [];
    const roomId = 'question-chat-v2:chat-1';
    return {
        emitted,
        left,
        socket: {
            userId: 'user-1',
            userName: 'One',
            rooms: new Set(joined ? ['socket-1', roomId] : ['socket-1']),
            to: room => ({
                emit: (event, payload) => emitted.push({ room, event, payload }),
            }),
            leave: room => left.push(room),
        },
    };
};

test('V2 typing broadcasts only after the sender joined that chat room', () => {
    const joined = createSocket();
    handleQuestionChatV2Typing(joined.socket, null, { chatId: 'chat-1', isTyping: true });

    assert.equal(joined.emitted.length, 1);
    assert.equal(joined.emitted[0].event, 'questionChatV2:typing');
    assert.equal(joined.emitted[0].payload.isTyping, true);

    const notJoined = createSocket({ joined: false });
    handleQuestionChatV2Typing(notJoined.socket, null, { chatId: 'chat-1', isTyping: true });
    assert.equal(notJoined.emitted.length, 0);
});

test('leaving a V2 chat clears the partner typing indicator', () => {
    const state = createSocket();
    handleQuestionChatV2Leave(state.socket, null, { chatId: 'chat-1' });

    assert.equal(state.emitted[0].payload.isTyping, false);
    assert.deepEqual(state.left, ['question-chat-v2:chat-1']);
});

