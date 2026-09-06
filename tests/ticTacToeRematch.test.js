import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTicTacToeRestartAssignment } from '../services/ticTacToeRematch.js';
import {
    clearTicTacToeScreenPresenceForSocket,
    getActiveTicTacToePlayerIds,
    markTicTacToeScreenActive,
    markTicTacToeScreenInactive,
    resetTicTacToeScreenPresence,
} from '../services/ticTacToeScreenPresence.js';

const completedGame = {
    creatorId: 'creator',
    partnerId: 'partner',
    creatorSymbol: 'X',
    partnerSymbol: 'O',
    status: 'draw',
};

test('completed hybrid rematch gives X to the player who starts the round', () => {
    const result = resolveTicTacToeRestartAssignment({
        game: completedGame,
        requesterId: 'creator',
        hybridRequested: true,
        activePlayerIds: new Set(['creator', 'partner']),
    });

    assert.deepEqual(result, {
        creatorSymbol: 'X',
        partnerSymbol: 'O',
        currentTurn: 'creator',
        assignmentReason: 'requester_started_round',
    });
});

test('partner receives X when partner starts the next round', () => {
    const result = resolveTicTacToeRestartAssignment({
        game: {
            ...completedGame,
            creatorSymbol: 'O',
            partnerSymbol: 'X',
            status: 'won_partner',
        },
        requesterId: 'partner',
        hybridRequested: true,
        activePlayerIds: new Set(['creator', 'partner']),
    });

    assert.equal(result.creatorSymbol, 'O');
    assert.equal(result.partnerSymbol, 'X');
    assert.equal(result.currentTurn, 'partner');
});

test('completed hybrid rematch gives X to the only active requester', () => {
    const result = resolveTicTacToeRestartAssignment({
        game: completedGame,
        requesterId: 'partner',
        hybridRequested: true,
        activePlayerIds: new Set(['partner']),
    });

    assert.equal(result.creatorSymbol, 'O');
    assert.equal(result.partnerSymbol, 'X');
    assert.equal(result.currentTurn, 'partner');
    assert.equal(result.assignmentReason, 'requester_started_round');
});

test('legacy and mid-game restarts preserve symbols', () => {
    const legacy = resolveTicTacToeRestartAssignment({
        game: completedGame,
        requesterId: 'partner',
        hybridRequested: false,
        activePlayerIds: new Set(['creator', 'partner']),
    });
    const midGame = resolveTicTacToeRestartAssignment({
        game: { ...completedGame, status: 'in_progress' },
        requesterId: 'partner',
        hybridRequested: true,
        activePlayerIds: new Set(['creator', 'partner']),
    });

    assert.equal(legacy.creatorSymbol, 'X');
    assert.equal(legacy.currentTurn, 'creator');
    assert.equal(midGame.creatorSymbol, 'X');
    assert.equal(midGame.currentTurn, 'creator');

    const swappedMidGame = resolveTicTacToeRestartAssignment({
        game: {
            ...completedGame,
            creatorSymbol: 'O',
            partnerSymbol: 'X',
            status: 'in_progress',
        },
        requesterId: 'creator',
        hybridRequested: true,
        activePlayerIds: new Set(['creator', 'partner']),
    });
    assert.equal(swappedMidGame.creatorSymbol, 'O');
    assert.equal(swappedMidGame.partnerSymbol, 'X');
    assert.equal(swappedMidGame.currentTurn, 'partner');
});

test('restart repairs a legacy game where both players were X', () => {
    const result = resolveTicTacToeRestartAssignment({
        game: {
            ...completedGame,
            creatorSymbol: 'X',
            partnerSymbol: 'X',
            status: 'in_progress',
        },
        requesterId: 'partner',
        hybridRequested: true,
    });

    assert.equal(result.creatorSymbol, 'X');
    assert.equal(result.partnerSymbol, 'O');
    assert.equal(result.currentTurn, 'creator');
});

test('presence tracks distinct players and clears inactive sockets', () => {
    resetTicTacToeScreenPresence();
    markTicTacToeScreenActive({ gameId: 'game', userId: 'creator', socketId: 'socket-a' });
    markTicTacToeScreenActive({ gameId: 'game', userId: 'creator', socketId: 'socket-b' });
    markTicTacToeScreenActive({ gameId: 'game', userId: 'partner', socketId: 'socket-c' });

    assert.deepEqual([...getActiveTicTacToePlayerIds('game')].sort(), ['creator', 'partner']);

    markTicTacToeScreenInactive({ gameId: 'game', userId: 'creator', socketId: 'socket-a' });
    assert.equal(getActiveTicTacToePlayerIds('game').has('creator'), true);

    clearTicTacToeScreenPresenceForSocket('socket-b');
    assert.equal(getActiveTicTacToePlayerIds('game').has('creator'), false);
    assert.equal(getActiveTicTacToePlayerIds('game').has('partner'), true);
    resetTicTacToeScreenPresence();
});
