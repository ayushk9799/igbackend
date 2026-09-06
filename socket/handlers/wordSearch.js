import WordSearchGame from '../../models/WordSearchGame.js';
import { isWordSearchPlayer, serializeWordSearchGame } from '../../services/wordSearch/gameService.js';
import { refreshWordSearchTurn } from '../../services/wordSearch/turnTimer.js';

export const handleWordSearchJoin = async (socket, io, data = {}, acknowledge) => {
    try {
        const { gameId } = data;
        let game = await WordSearchGame.findById(gameId);
        if (!game) throw new Error('Game not found');
        if (!isWordSearchPlayer(game, socket.userId)) throw new Error('Not a player in this game');

        game = await refreshWordSearchTurn(game);

        socket.join(`wordsearch_${gameId}`);
        const payload = { success: true, game: serializeWordSearchGame(game) };
        socket.emit('wordsearch:joined', payload);
        if (typeof acknowledge === 'function') acknowledge(payload);
    } catch (error) {
        const payload = { success: false, message: error.message || 'Failed to join game' };
        socket.emit('wordsearch:error', payload);
        if (typeof acknowledge === 'function') acknowledge(payload);
    }
};

export const handleWordSearchLeave = (socket, io, data = {}) => {
    if (data.gameId) socket.leave(`wordsearch_${data.gameId}`);
};
