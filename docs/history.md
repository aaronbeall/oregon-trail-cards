# Local game history

The active save remains at `oregon-trail-cards.official.v2`. A separate, versioned archive at `oregon-trail-cards.history.v1` keeps every started journey, including won, lost, and abandoned games. Starting a new trek preserves the previous record. Setup edits and opening UI panels are not game actions.

Each game has a unique ID, timestamps, outcome, an initial state containing the shuffled decks and player hands, and an ordered event list. Each event includes its sequence, timestamp, turn number, current player, action and submitted choices, all dice results, the resulting narrative note, and compact state changes. Multiple actions in one turn stay separate: rotation, supplying remedies, trades, river attempts, and wills can all be reconstructed. No fresh randomness is required for replay.

`replayGame(record)` in `History.ts` returns the final state; `replayGame(record, n)` returns the state after the first `n` events (`0` is the initial state). Events are deep-copied when recorded, so later game mutations cannot change the past. The whole archive is written atomically with one localStorage operation. Array splices avoid storing an entire deck on every draw.

Future stats can group events by turn and player, compare successive replay states for deaths, remedies, supply changes and trail progress, and use the recorded choices and rolls for action-specific stats. Finished and abandoned outcomes are separate. `completeFromStart` is false for older active saves imported when history recording was added: earlier turns are unavailable and must not be counted as a complete journey. For those games, `startedAt` is the time recording began.

Storage errors show “Couldn’t save locally.” Existing records are never silently evicted. Pending history events stay in memory and are retried on the next save; if storage remains unavailable, those pending events cannot survive closing the page. Corrupt or unsupported archives are preserved rather than overwritten. History stays in this browser and origin; clearing site data clears it. Replay and stats screens can be added later using this stored data.
