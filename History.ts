import type { Journey } from "./TrailCard";

export const HISTORY_KEY = "oregon-trail-cards.history.v1";
type Json = null | boolean | number | string | Json[] | { [key: string]: Json };
type Path = (string | number)[];
export type Change =
  | { path: Path; value: Json }
  | { path: Path; splice: [number, number, Json[]] };
export type GameAction = {
  type: string;
  args?: Record<string, string | string[] | undefined>;
  rolls?: number[];
};
export type HistoryEvent = {
  sequence: number;
  at: string;
  turn: number;
  player: number;
  action: GameAction;
  note: string;
  changes: Change[];
};
export type RecordedGame = {
  id: string;
  startedAt: string;
  endedAt?: string;
  outcome: Journey["status"] | "abandoned";
  completeFromStart: boolean;
  initial: Journey;
  events: HistoryEvent[];
};
export type GameArchive = {
  version: 1;
  active: string | null;
  games: RecordedGame[];
};

const equal = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
// Array splices keep draws/discards compact instead of repeating the whole deck.
function diff(before: Json, after: Json, path: Path = []): Change[] {
  if (equal(before, after)) return [];
  if (Array.isArray(before) && Array.isArray(after)) {
    if (before.length === after.length)
      return after.flatMap((value, i) => diff(before[i], value, [...path, i]));
    let start = 0,
      end = 0;
    while (
      start < Math.min(before.length, after.length) &&
      equal(before[start], after[start])
    )
      start++;
    while (
      end < Math.min(before.length, after.length) - start &&
      equal(before[before.length - 1 - end], after[after.length - 1 - end])
    )
      end++;
    return [
      {
        path,
        splice: [
          start,
          before.length - start - end,
          after.slice(start, after.length - end),
        ],
      },
    ];
  }
  if (
    before &&
    after &&
    typeof before === "object" &&
    typeof after === "object" &&
    !Array.isArray(before) &&
    !Array.isArray(after) &&
    Object.keys(before).every((key) => key in after)
  )
    return Object.keys(after).flatMap((key) =>
      key in before
        ? diff(before[key], after[key], [...path, key])
        : [{ path: [...path, key], value: after[key] }],
    );
  return [{ path, value: after }];
}

/** Reconstruct the exact state after any event, without rerolling randomness. */
export function replayGame(
  game: RecordedGame,
  through = game.events.length,
): Journey {
  if (!Number.isInteger(through) || through < 0 || through > game.events.length)
    throw new Error("Invalid replay position");
  const state = structuredClone(game.initial);
  for (const event of game.events.slice(0, through)) {
    for (const change of event.changes) {
      if (
        change.path.some((key) =>
          ["__proto__", "constructor", "prototype"].includes(String(key)),
        )
      )
        throw new Error("Invalid history path");
      // Paths are produced only from JSON game-state fields and array indices.
      let target: any = state;
      const keys = "splice" in change ? change.path : change.path.slice(0, -1);
      for (const key of keys) target = target[key];
      if ("splice" in change)
        target.splice(
          change.splice[0],
          change.splice[1],
          ...structuredClone(change.splice[2]),
        );
      else target[change.path.at(-1)!] = structuredClone(change.value);
    }
  }
  return state;
}

export class GameHistory {
  archive: GameArchive;
  private last?: Journey;
  private dirty = false;
  constructor(
    private storage: Pick<Storage, "getItem" | "setItem">,
    private now = () => new Date().toISOString(),
    private id = () => crypto.randomUUID(),
  ) {
    const raw = storage.getItem(HISTORY_KEY);
    this.archive = raw
      ? JSON.parse(raw)
      : { version: 1, active: null, games: [] };
    if (this.archive.version !== 1 || !Array.isArray(this.archive.games))
      throw new Error("Unreadable game history");
    const current = this.archive.games.find(
      (game) => game.id === this.archive.active,
    );
    if (current) this.last = replayGame(current);
  }
  capture(state: Journey, action: GameAction = { type: "resume" }) {
    if (!state.started) return;
    const current = this.archive.games.find(
      (game) => game.id === this.archive.active,
    );
    if (
      action.type !== "start" &&
      current &&
      this.last &&
      equal(this.last, state)
    ) {
      if (this.dirty) this.flush();
      return;
    }
    // Keep unflushed events in memory so a later successful write preserves them.
    const archive = structuredClone(this.archive);
    let recorded = archive.games.find((game) => game.id === archive.active);
    const at = this.now();
    if (action.type === "start" || !recorded || !this.last) {
      if (recorded && recorded.outcome === "travel") {
        recorded.outcome = "abandoned";
        recorded.endedAt = at;
      }
      recorded = {
        id: this.id(),
        startedAt: at,
        outcome: state.status,
        completeFromStart: action.type === "start",
        initial: structuredClone(state),
        events: [],
        ...(state.status !== "travel" ? { endedAt: at } : {}),
      };
      archive.games.push(recorded);
      archive.active = recorded.id;
    } else {
      recorded.events.push({
        sequence: recorded.events.length + 1,
        at,
        turn: this.last.turn,
        player: this.last.current,
        action: structuredClone(action),
        note: state.note,
        changes: structuredClone(
          diff(this.last as unknown as Json, state as unknown as Json),
        ),
      });
      recorded.outcome = state.status;
      if (state.status !== "travel") recorded.endedAt = at;
    }
    this.archive = archive;
    this.last = structuredClone(state);
    this.dirty = true;
    this.flush();
  }
  private flush() {
    this.storage.setItem(HISTORY_KEY, JSON.stringify(this.archive));
    this.dirty = false;
  }
}
