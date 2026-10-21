# Word Search game

This feature is a letter-grid word search with single-player and real-time
two-player modes. Hidden words may be horizontal, vertical, or diagonal. Medium
and hard boards can also contain words in reverse.

## Rules

- On the updated app, free users can complete three games using the new rules,
  across solo and duel play. New games then require Premium; a subscription from
  either linked partner unlocks both users. Existing unfinished boards can still
  be resumed. Legacy games and mixed-version duels remain unlimited for both
  partners and do not consume this allowance.
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
- For new-rule duels, if either player goes offline, the server pauses the duel and rejects word
  claims with `GAME_PAUSED`. The score card shows which player is offline.
  The same turn resumes with its saved remaining time once both players reconnect.
  A pending game countdown is also paused. Multiple devices count as online
  until the player's last socket disconnects.
- The server accepts either endpoint order, so words can be selected forwards or
  backwards.
- When every listed word is found, the higher score wins. Equal scores are a draw.
  For new-rule games, the result stays visible until a player taps **Start new
  game**; an explicitly started duel notifies the partner through
  `wordsearch:invited`. Legacy and mixed-version duels keep automatic rematches
  with a six-second countdown and alternate the opening player.
- Players select a word by touching its first letter, dragging across the word,
  and releasing on its last letter. The preview snaps to the nearest legal
  horizontal, vertical, or diagonal direction.

## Difficulty

New players default to Easy (8 × 8, 6 words). The app remembers a player’s
chosen difficulty for later puzzles. The released app and legacy API retain
their Medium default.

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

The released app uses `/api/word-search`. The updated app uses
`/api/v2/word-search`. Both routers use the same database and socket events.
The examples below use the updated URL; every endpoint also exists under the
legacy prefix.

### `POST /api/v2/word-search/create`

Body:

```json
{
  "creatorId": "...",
  "partnerId": "...",
  "mode": "single",
  "difficulty": "easy",
  "forceNew": false,
  "replaceGameId": null
}
```

`partnerId` is required for `duel` and must be the creator's linked partner.
If the same player/couple already has an active game in that mode, the endpoint
returns it with `isExisting: true`. `forceNew: true` ends any active game in
the requested mode before creating a new board. The server also ends the client’s
currently displayed active board using `replaceGameId` with `forceNew: true`.
For new-rule games, the free limit is checked before any board is ended. A
blocked start returns `403` with `WORD_SEARCH_FREE_LIMIT_REACHED` and the free
limit/count. Only completed records with `protocolVersion: 2` count; historical
games without this field and legacy/mixed-version games do not count. The old
URL never applies the Premium gate.

### `GET /api/v2/word-search/active/:userId`

Returns the latest active game for that user. `?mode=single` or `?mode=duel`
can restrict the lookup.

### `GET /api/v2/word-search/:gameId?userId=:userId`

Returns a participant-safe public game payload.

### `POST /api/v2/word-search/:gameId/find`

Body:

```json
{
  "userId": "...",
  "start": { "row": 2, "col": 1 },
  "end": { "row": 2, "col": 5 }
}
```

Success returns `foundWord` plus the entire current public game state. Completing
a legacy duel also returns `rematch`, as the released app expects. Expected
conflict codes include `NOT_YOUR_TURN`, `WORD_ALREADY_FOUND`, `GAME_COMPLETE`,
`GAME_PAUSED`, and `STALE_GAME`. Invalid straight-line guesses return `WORD_NOT_FOUND`.

### `POST /api/v2/word-search/:gameId/abandon`

Ends an active board for both players and allows a fresh board to be created.

## Compatibility and rollout

- Saved rounds carry `protocolVersion`: `1` means legacy rules; `2` means the
  new limit, offline pause, and explicit restart. Missing fields default to `1`
  without changing the saved grid or scores. Resuming does not upgrade a round.
- Updated sockets advertise `wordSearchVersion: 2` in their authentication
  handshake. The released app sends only `userId` and can still authenticate.
  Any connected old device requires legacy rules for that user's shared duel.
- A new versioned duel uses protocol `2` only when the partner's connected
  devices all support it and the creator has no connected legacy device.
  Mixed-version duels use protocol `1` and are free for both participants.
- An old client joining, reading, or claiming a word in an active protocol `2`
  duel switches that round to legacy rules. Any saved pause is cleared while
  preserving its remaining turn time. That round stays legacy afterward.
- Legacy turns continue while players are offline, matching the released app.
  They do not receive the new paused-clock behavior that the old UI cannot show.
- The updated frontend falls back to the legacy URL only when the versioned
  route is unavailable on an older server. New-router responses include
  `X-Word-Search-API-Version: 2`, so a missing game cannot accidentally trigger
  this fallback. Premium rejections never fall back. Business `403` responses
  are handled by the screen; only authentication `401` signs the user out.
- Deploy the backend with both routers before releasing the updated app.
  Keep the legacy router available while the released app is supported. An old
  backend has no new limit or pause behavior, even when the updated app uses it
  through fallback.

## Socket events

Clients emit:

- `wordsearch:join` with `{ gameId }` when the board opens.
- `wordsearch:leave` with `{ gameId }` when the board closes.

The server emits:

- `wordsearch:joined` with the latest public game state.
- `wordsearch:invited` when a duel is created.
- `wordsearch:updated` after a valid word or abandonment.
- `wordsearch:rematchStarted` for legacy rounds, including `previousGameId` and
  the replacement game. Updated clients accept this only for their current
  legacy round.
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
