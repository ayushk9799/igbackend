import { getIO } from '../../socket/index.js';
import { getCoupleRoomId } from '../../socket/auth.js';
import WordSearchGame from '../../models/WordSearchGame.js';
import {
    serializeWordSearchGame,
    synchronizeWordSearchTurn,
} from './gameService.js';

const turnTimers = new Map();
const idOf = value => String(value?._id || value || '');

const clearScheduledTurn = gameId => {
    const timer = turnTimers.get(gameId);
    if (timer) clearTimeout(timer);
    turnTimers.delete(gameId);
};

const emitTurnUpdate = (game, metadata = {}) => {
    const io = getIO();
    if (!io) return;

    const gameId = idOf(game?._id);
    const payload = {
        gameId,
        game: serializeWordSearchGame(game),
        eventName: 'wordsearch:updated',
        timestamp: new Date().toISOString(),
        ...metadata,
    };
    let rooms = io.to(`wordsearch_${gameId}`);
    const coupleRoom = getCoupleRoomId(idOf(game.creatorId), idOf(game.partnerId));
    if (coupleRoom) rooms = rooms.to(coupleRoom);
    rooms.emit('wordsearch:updated', payload);
};

export const scheduleWordSearchTurn = (game) => {
    const gameId = idOf(game?._id);
    if (!gameId) return;
    clearScheduledTurn(gameId);

    const expiresAtMs = game?.turnExpiresAt ? new Date(game.turnExpiresAt).getTime() : Number.NaN;
    if (game.mode !== 'duel' || game.status !== 'active' || !Number.isFinite(expiresAtMs)) return;

    const delay = Math.max(0, expiresAtMs - Date.now()) + 20;
    const timer = setTimeout(async () => {
        turnTimers.delete(gameId);
        try {
            const result = await synchronizeWordSearchTurn({ gameId });
            if (result.changed) {
                emitTurnUpdate(result.game, {
                    reason: result.advanced ? 'turn_timeout' : 'turn_clock_started',
                    previousTurn: result.previousTurn,
                    turnsElapsed: result.turnsElapsed,
                });
            }
            scheduleWordSearchTurn(result.game);
        } catch (error) {
            console.error('❌ Failed to advance word-search turn:', error);
        }
    }, delay);
    timer.unref?.();
    turnTimers.set(gameId, timer);
};

export const refreshWordSearchTurn = async (game) => {
    if (!game) return null;
    if (game.mode !== 'duel' || game.status !== 'active') {
        scheduleWordSearchTurn(game);
        return game;
    }

    const result = await synchronizeWordSearchTurn({ gameId: idOf(game._id) });
    if (result.changed) {
        emitTurnUpdate(result.game, {
            reason: result.advanced ? 'turn_timeout' : 'turn_clock_started',
            previousTurn: result.previousTurn,
            turnsElapsed: result.turnsElapsed,
        });
    }
    scheduleWordSearchTurn(result.game);
    return result.game;
};

export const restoreWordSearchTurnTimers = async () => {
    const activeGames = await WordSearchGame.find({ mode: 'duel', status: 'active' });
    await Promise.all(activeGames.map(game => refreshWordSearchTurn(game)));
};
