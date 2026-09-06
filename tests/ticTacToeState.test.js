import test from 'node:test';
import assert from 'node:assert/strict';
import {
    getCanonicalTicTacToeGameId,
    getCanonicalTicTacToeSymbols,
    getTicTacToeCoupleKey,
    isTicTacToePlayer,
    serializeTicTacToeState,
} from '../services/ticTacToeState.js';

test('canonical game id is stable regardless of which partner opens first', () => {
    const first = getCanonicalTicTacToeGameId('user-a', 'user-b');
    const second = getCanonicalTicTacToeGameId('user-b', 'user-a');

    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{24}$/);
});

test('canonical symbols repair an invalid equal-symbol assignment', () => {
    assert.deepEqual(
        getCanonicalTicTacToeSymbols({ creatorSymbol: 'X', partnerSymbol: 'X' }),
        { creatorSymbol: 'X', partnerSymbol: 'O' }
    );
    const snapshot = serializeTicTacToeState({
        creatorId: 'creator',
        partnerId: 'partner',
        creatorSymbol: 'X',
        partnerSymbol: 'X',
        board: Array(9).fill(null),
        currentTurn: 'creator',
        status: 'pending',
    });
    assert.equal(snapshot.creatorSymbol, 'X');
    assert.equal(snapshot.partnerSymbol, 'O');
    assert.equal(snapshot.xPlayerId, 'creator');
    assert.equal(snapshot.oPlayerId, 'partner');
});

test('couple key is stable regardless of which player opens first', () => {
    assert.equal(getTicTacToeCoupleKey('user-b', 'user-a'), 'user-a:user-b');
    assert.equal(getTicTacToeCoupleKey('user-a', 'user-b'), 'user-a:user-b');
});

test('authoritative snapshot exposes player ids, first turn, and revision', () => {
    const snapshot = serializeTicTacToeState({
        _id: 'game-1',
        creatorId: 'user-b',
        partnerId: 'user-a',
        creatorSymbol: 'X',
        partnerSymbol: 'O',
        currentTurn: 'creator',
        board: Array(9).fill(null),
        status: 'pending',
        round: 2,
        revision: 7,
        moveCount: 0,
    });

    assert.equal(snapshot.coupleKey, 'user-a:user-b');
    assert.equal(snapshot.xPlayerId, 'user-b');
    assert.equal(snapshot.oPlayerId, 'user-a');
    assert.equal(snapshot.turnPlayerId, 'user-b');
    assert.equal(snapshot.revision, 7);
});

test('player membership accepts populated and plain ids', () => {
    const game = {
        creatorId: { _id: 'creator' },
        partnerId: 'partner',
    };
    assert.equal(isTicTacToePlayer(game, 'creator'), true);
    assert.equal(isTicTacToePlayer(game, 'partner'), true);
    assert.equal(isTicTacToePlayer(game, 'stranger'), false);
});
