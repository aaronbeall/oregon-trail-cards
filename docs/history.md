# Local game history

The active save remains at `oregon-trail-cards.official.v2`. A separate, versioned archive at `oregon-trail-cards.history.v1` keeps every started journey, including won, lost, and abandoned games. Starting a new trek preserves the previous record. Setup edits and opening UI panels are not game actions.

Each game has a unique ID, timestamps, outcome, an initial state containing the shuffled decks and player hands, and an ordered event list. Each event includes its sequence, timestamp, turn number, narrative calendar day, current player, action and submitted choices, all dice results, the resulting narrative note, and compact state changes. Multiple actions in one turn stay separate: rotation, supplying remedies, trades, river attempts, and wills can all be reconstructed. No fresh randomness is required for replay.

`replayGame(record)` in `History.ts` returns the final state; `replayGame(record, n)` returns the state after the first `n` events (`0` is the initial state). Events are deep-copied when recorded, so later game mutations cannot change the past. The whole archive is written atomically with one localStorage operation. Array splices avoid storing an entire deck on every draw.

Statistics group events by turn and player, compare successive replay states for deaths, remedies, supply changes and trail progress, and use the recorded choices and rolls for action-specific stats. Finished and abandoned outcomes are separate. `completeFromStart` indicates whether recording began at setup; incomplete records are not counted as complete journeys.

Storage errors show “Couldn’t save locally.” Existing records are never silently evicted. Pending history events stay in memory and are retried on the next save; if storage remains unavailable, those pending events cannot survive closing the page. Corrupt or unsupported archives are preserved rather than overwritten. History stays in this browser and origin; clearing site data clears it. The map and statistics views read this stored data.

## Map playback

The journey map can replay recorded actions with play/pause, restart, ½×/1×/2×/4× speed controls (1× by default), and a seekable progress bar with elapsed/total playback time. Full-route travel takes 200 seconds before stops at 1×; stop pauses are deliberately paced for reading. Clear trail cards pass without stopping. Rivers pause briefly; breakdowns and towns/forts pause longer. Player actions such as resting, supplying remedies, and trades do not stop the wagon; pauses follow its recorded river, breakdown, or settlement state.

A zooming camera follows the illustrated wagon. It swaps to matching fort, town, broken-wagon, or lost-journey artwork while stopped there. The framed date includes a fictional time of day; this clock is only a presentation effect and does not change game dates or records. See [marker artwork and generation prompts](map-playback-icons.md).

Trip state appears as a framed illustration and title connected to its trail point. Player actions appear separately as one-line toasts near that stop, with at most three visible; they stack, remain for 5.5 seconds, and fade out over one second of real time, even while playback is paused. Scrubbing pauses playback and shows the selected point without replaying every skipped action. Dragging or zooming also pauses playback.

Playback only reads the archive and never changes the active game or saved history.

## Turns and calendar days

`Journey.turn` controls player order, calamity rounds, and remedy deadlines. `Journey.day` is a separate, one-based narrative calendar day. Failed river attempts and turns spent at that crossing stay on its day; successfully crossing advances to the next day when play continues. A terminal arrival or death keeps the date of the actual event. Ordinary travel, draw, and supply turns advance the calendar normally. Death dates, journey totals, statistics, map headings, and playback read the calendar rather than assuming a turn is a day.

History events record the day before each action. `replayGame` reconstructs the recorded state directly; older formats are not migrated.

The map distinguishes blue river-crossing markers from other calamities. Toast arrivals have at least 3.6 seconds of playback time between them, including multiple actions at the same stop and individual inheritance recipients. This spacing never adds a stop to clear travel; the final result stays long enough to finish presenting queued actions.
