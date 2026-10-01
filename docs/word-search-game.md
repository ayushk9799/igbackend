# Word Search game

This feature is a letter-grid word search with single-player and real-time
two-player modes. Hidden words may be horizontal, vertical, or diagonal. Medium
and hard boards can also contain words in reverse.

## Rules

- Single player: one player finds every word. The score is the number found.
- Duel: the creator starts. Each player has a 45-second turn and may find as
  many words as possible during that turn. Correct words score one point.
- Opening Word Search automatically resumes or creates the board. The saved
  mode preference is used when possible; an offline partner causes a duel
  preference to fall back to solo. Solo remains available when a partner is
  online. Mode and difficulty can be changed in Game Options for a new board.
- An offline partner can be nudged from the setup or active-game UI. The nudge
  is delivered by socket and push notification.
- A duel turn changes when its timer expires. Correct words, wrong guesses,
  already-found words, and invalid gestures do not reset the timer.
- The server accepts either endpoint order, so words can be selected forwards or
  backwards.
- When every listed word is found, the higher score wins. Equal scores are a draw.
- Players select a word by touching its first letter, dragging across the word,
  and releasing on its last letter. The preview snaps to the nearest legal
  horizontal, vertical, or diagonal direction.

## Difficulty

| Level | Grid | Words | Directions |
| --- | ---: | ---: | --- |
| Easy | 8 × 8 | 6 | Horizontal and vertical, forwards |
| Medium | 10 × 10 | 8 | Horizontal, vertical, diagonal, forwards/backwards |
| Hard | 12 × 12 | 12 | Horizontal, vertical, diagonal, forwards/backwards |

The generator places the longest sampled words first, allows compatible letter
overlap, retries unlucky layouts, and fills remaining cells with random letters.

## Server authority and concurrency

`WordSearchGame.words` stores the answer coordinates. API responses remove the
coordinates for every unfound word, so the client cannot inspect the solution.
Coordinates become public only after that word is found, allowing both clients
to highlight it. All paths are revealed when a game is complete.

The find operation checks, in order:

1. The caller is one of the players.
2. The game is active.
3. In a duel, it is the caller's turn.
4. The endpoints form a horizontal, vertical, or 45-degree diagonal line.
5. The line exactly matches an unfound stored answer in either direction.
   A miss is rejected without changing the score or current turn.

Mongoose optimistic concurrency protects the complete mutation: word claim,
score increment, history append, and winner calculation. Concurrent claims
cannot both score from the same version of the game. A unique active duel pair
key prevents concurrent create requests from producing separate boards.

## REST API

### `POST /api/word-search/create`

Body:

```json
{
  "creatorId": "...",
  "partnerId": "...",
  "mode": "single",
  "difficulty": "medium",
  "forceNew": false
}
```

`partnerId` is required for `duel` and must be the creator's linked partner.
If the same player/couple already has an active game in that mode, the endpoint
returns it with `isExisting: true`. `forceNew: true` ends any active game in
the requested mode before creating a new board. The client first ends its
currently displayed active board.

### `GET /api/word-search/active/:userId`

Returns the latest active game for that user. `?mode=single` or `?mode=duel`
can restrict the lookup.

### `GET /api/word-search/:gameId?userId=:userId`

Returns a participant-safe public game payload.

### `POST /api/word-search/:gameId/find`

Body:

```json
{
  "userId": "...",
  "start": { "row": 2, "col": 1 },
  "end": { "row": 2, "col": 5 }
}
```

Success returns `foundWord` plus the entire current public game state. Expected
conflict codes include `NOT_YOUR_TURN`, `WORD_ALREADY_FOUND`, `GAME_COMPLETE`,
and `STALE_GAME`. Invalid straight-line guesses return `WORD_NOT_FOUND`.

### `POST /api/word-search/:gameId/abandon`

Ends an active board for both players and allows a fresh board to be created.

## Socket events

Clients emit:

- `wordsearch:join` with `{ gameId }` when the board opens.
- `wordsearch:leave` with `{ gameId }` when the board closes.

The server emits:

- `wordsearch:joined` with the latest public game state.
- `wordsearch:invited` when a duel is created.
- `wordsearch:updated` after a valid word or abandonment.
- `wordsearch:error` when joining is rejected.

Updates go to the game room and the couple room as one Socket.IO room-union
broadcast. This gives open boards instant updates and keeps the Games badge and
notification center current elsewhere in the app.

## Key files

- `models/WordSearchGame.js` — persistent game state.
- `services/wordSearch/gameEngine.js` — generation and path validation.
- `services/wordSearch/gameService.js` — scoring, turns, winner, concurrency.
- `routes/wordSearch.js` — REST interface and broadcasts.
- `socket/handlers/wordSearch.js` — authenticated room membership.
- `src/screens/WordSearchScreen.jsx` — setup, board, scores, and live UI.
- `tests/wordSearchEngine.test.js` — generation, directions, invalid paths, and
  hidden-answer serialization.
