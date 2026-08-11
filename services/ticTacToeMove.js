import TicTacToe from '../models/TicTacToe.js';
import {
    getCanonicalTicTacToeSymbols,
    serializeTicTacToeState,
} from './ticTacToeState.js';

const WIN_PATTERNS = [
    [0, 1, 2], [3, 4, 5], [6, 7, 8],
    [0, 3, 6], [1, 4, 7], [2, 5, 8],
    [0, 4, 8], [2, 4, 6],
];

const checkWinner = board => {
    for (const [a, b, c] of WIN_PATTERNS) {
        if (board[a] && board[a] === board[b] && board[a] === board[c]) return board[a];
    }
    return null;
};

export class TicTacToeMoveError extends Error {
    constructor(status, message, data = null) {
        super(message);
        this.name = 'TicTacToeMoveError';
        this.status = status;
        this.data = data;
    }
}

export const commitTicTacToeMove = async ({ gameId, userId, position, round, revision }) => {
    const normalizedUserId = String(userId);
    const game = await TicTacToe.findById(gameId);
    if (!game) throw new TicTacToeMoveError(404, 'Game not found');

    const currentRevision = Number.isInteger(game.revision) ? game.revision : 0;
    const expectedRevision = Number.isInteger(revision) ? revision : currentRevision;
    if (
        !Number.isInteger(round)
        || round !== game.round
        || expectedRevision !== currentRevision
    ) {
        throw new TicTacToeMoveError(
            409,
            'The game changed. Refreshing the board is required.',
            serializeTicTacToeState(game)
        );
    }
    if (!Number.isInteger(position) || position < 0 || position > 8) {
        throw new TicTacToeMoveError(400, 'Invalid position. Must be 0-8');
    }
    if (!['pending', 'in_progress'].includes(game.status)) {
        throw new TicTacToeMoveError(400, 'Game is already complete');
    }
    if (game.board[position] !== null) {
        throw new TicTacToeMoveError(400, 'Cell is already occupied');
    }

    const isCreator = game.creatorId.toString() === normalizedUserId;
    const isPartner = game.partnerId.toString() === normalizedUserId;
    if (!isCreator && !isPartner) {
        throw new TicTacToeMoveError(403, 'You are not a player in this game');
    }

    const actualTurn = isCreator ? 'creator' : 'partner';
    if (game.currentTurn !== actualTurn) {
        throw new TicTacToeMoveError(400, "It's not your turn");
    }

    const { creatorSymbol, partnerSymbol } = getCanonicalTicTacToeSymbols(game);
    const symbol = isCreator ? creatorSymbol : partnerSymbol;
    const newBoard = [...game.board];
    newBoard[position] = symbol;
    const winningSymbol = checkWinner(newBoard);
    const draw = !winningSymbol && newBoard.every(cell => cell !== null);
    const gameComplete = Boolean(winningSymbol || draw);
    let nextStatus = game.status === 'pending' ? 'in_progress' : game.status;
    let nextWinner = null;
    let nextTurn = game.currentTurn;
    let completedAt = null;

    if (winningSymbol) {
        nextStatus = winningSymbol === creatorSymbol ? 'won_creator' : 'won_partner';
        nextWinner = winningSymbol === creatorSymbol ? game.creatorId : game.partnerId;
        completedAt = new Date();
    } else if (draw) {
        nextStatus = 'draw';
        completedAt = new Date();
    } else {
        nextTurn = game.currentTurn === 'creator' ? 'partner' : 'creator';
    }

    const revisionCondition = expectedRevision === 0
        ? { $or: [{ revision: 0 }, { revision: { $exists: false } }] }
        : { revision: expectedRevision };
    const updatedGame = await TicTacToe.findOneAndUpdate(
        {
            _id: game._id,
            round,
            currentTurn: actualTurn,
            status: { $in: ['pending', 'in_progress'] },
            [`board.${position}`]: null,
            ...revisionCondition,
        },
        {
            $set: {
                board: newBoard,
                currentTurn: nextTurn,
                status: nextStatus,
                winner: nextWinner,
                completedAt,
                // Repair legacy documents that accidentally stored equal symbols.
                creatorSymbol,
                partnerSymbol,
            },
            $push: {
                moveHistory: {
                    position,
                    symbol,
                    playerId: normalizedUserId,
                    timestamp: new Date(),
                },
            },
            $inc: {
                moveCount: 1,
                revision: 1,
                ...(gameComplete ? { completedRounds: 1 } : {}),
            },
        },
        { new: true, runValidators: true }
    );

    if (!updatedGame) {
        const latestGame = await TicTacToe.findById(gameId);
        throw new TicTacToeMoveError(
            409,
            'That move is no longer available.',
            latestGame ? serializeTicTacToeState(latestGame) : null
        );
    }

    return {
        game: updatedGame,
        snapshot: serializeTicTacToeState(updatedGame, {
            eventType: gameComplete ? 'completed' : 'move',
            lastMove: { position, symbol, playerId: normalizedUserId },
            gameComplete,
        }),
    };
};
