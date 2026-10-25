# Local game history

The active save remains at `oregon-trail-cards.official.v2`. A separate, versioned archive at `oregon-trail-cards.history.v1` keeps every started journey, including won, lost, and abandoned games. Starting a new trek preserves the previous record. Setup edits and opening UI panels are not game actions.

Each game has a unique ID, timestamps, outcome, an initial state containing the shuffled decks and player hands, and an ordered event list. Each event includes its sequence, timestamp, turn number, narrative calendar day, current player, action and submitted choices, all dice results, the resulting narrative note, and compact state changes. Multiple actions in one turn stay separate: rotation, supplying remedies, trades, river attempts, and wills can all be reconstructed. No fresh randomness is required for replay.

`replayGame(record)` in `History.ts` returns the final state; `replayGame(record, n)` returns the state after the first `n` events (`0` is the initial state). Events are deep-copied when recorded, so later game mutations cannot change the past. The whole archive is written atomically with one localStorage operation. Array splices avoid storing an entire deck on every draw.

Statistics group events by turn and player, compare successive replay states for deaths, remedies, supply changes and trail progress, and use the recorded choices and rolls for action-specific stats. Finished and abandoned outcomes are separate. `completeFromStart` is false for older active saves imported when history recording was added: earlier turns are unavailable and must not be counted as a complete journey. For those games, `startedAt` is the time recording began.

Storage errors show “Couldn’t save locally.” Existing records are never silently evicted. Pending history events stay in memory and are retried on the next save; if storage remains unavailable, those pending events cannot survive closing the page. Corrupt or unsupported archives are preserved rather than overwritten. History stays in this browser and origin; clearing site data clears it. The map and statistics views read this stored data.

## Map playback

The journey map can replay recorded actions with play/pause, restart, 1×/2×/4× speed controls, and a seekable progress bar with elapsed/total playback time. Full-route travel takes 100 seconds before stops at 1×; stop pauses are deliberately paced for reading. Clear trail cards pass without stopping. Rivers pause briefly; breakdowns and towns/forts pause longer. Drawing, resting, supplying remedies, and trades stay at their recorded location, with longer stays given more time.

A zooming camera follows the illustrated wagon. It swaps to matching fort, town, broken-wagon, or lost-journey artwork while stopped there. The framed date includes a fictional time of day; this clock is only a presentation effect and does not change game dates or records. See [marker artwork and generation prompts](map-playback-icons.md).

Trip state appears as a framed illustration and title connected to its trail point. Player actions appear separately as one-line toasts near that stop, with at most three visible; they stack and fade over 6.5 seconds of playback time. Pausing freezes playback and toast ages. Scrubbing pauses playback and shows the selected point without replaying every skipped action. Dragging or zooming also pauses playback.

Playback only reads the archive and never changes the active game or saved history. Older partial histories can only show events that were recorded.

## Turns and calendar days

`Journey.turn` controls player order, calamity rounds, and remedy deadlines. `Journey.day` is a separate, one-based narrative calendar day. Failed river attempts and turns spent at that crossing stay on its day; successfully crossing advances to the next day when play continues. A terminal arrival or death keeps the date of the actual event. Ordinary travel, draw, and supply turns advance the calendar normally. Death dates, journey totals, statistics, map headings, and playback read the calendar rather than assuming a turn is a day.

History events record the day before each action. Older archives are projected onto the new calendar from their recorded actions when enough history exists. That projection corrects map/statistics dates and the date of river deaths without rewriting original actions, rolls, or replay snapshots. An active old save resumes from its projected day. Partial histories retain the calendar date at the beginning of their known record. `replayGame` still reconstructs exact originally saved states; `calendarReplay` supplies the updated narrative calendar for display and continued play.

The map distinguishes blue river-crossing markers from other calamities. Toast arrivals have at least 1.8 seconds of playback time between them, including multiple actions at the same stop and individual inheritance recipients. This spacing never adds a stop to clear travel; the final result stays long enough to finish presenting queued actions.
