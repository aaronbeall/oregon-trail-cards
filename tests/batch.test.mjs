import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "../scripts/load-typescript.mjs";
const { runSimulationBatch, validateBatchOptions } = await loadTypeScript(
  new URL("../SimulationBatch.ts", import.meta.url),
);
const { summarizeJourneys } = await loadTypeScript(
  new URL("../Stats.ts", import.meta.url),
);
const { simulateGame } = await loadTypeScript(
  new URL("../Computer.ts", import.meta.url),
);
const options = { count: 60, minPlayers: 2, maxPlayers: 6, seed: 42 };
test("batch generates the requested random player range with monotonic progress and compact summaries", async () => {
  const progress = [];
  const result = await runSimulationBatch(options, (p) => progress.push(p));
  assert.equal(result.games.length, 60);
  assert.equal(result.progress.attempted, 60);
  assert.equal(result.progress.skipped, 0);
  assert.equal(result.cancelled, false);
  assert.ok(
    result.games
      .filter((g) => g.outcome === "lost")
      .every(
        (g) => typeof g.lossReason === "string" && g.lossReason.length > 0,
      ),
  );
  assert.equal(progress[0].attempted, 0);
  assert.equal(progress.at(-1).attempted, 60);
  assert.ok(
    progress.every((p, i) => !i || p.attempted >= progress[i - 1].attempted),
  );
  assert.deepEqual(
    [...new Set(result.games.map((g) => g.players.length))].sort(),
    [2, 3, 4, 5, 6],
  );
  assert.ok(
    result.games.every(
      (g) =>
        g.simulated &&
        ["won", "lost"].includes(g.outcome) &&
        g.players.every((p) => p.hand.length === 0 && p.supplies.length === 0),
    ),
  );
  const stats = summarizeJourneys(result.games);
  assert.equal(stats.completed, 60);
  assert.equal(stats.outcomes.won, result.progress.wins);
  assert.equal(stats.outcomes.lost, result.progress.losses);
});
test("batch is deterministic with fixed seed and can use a fixed party size", async () => {
  const fixed = { count: 10, minPlayers: 4, maxPlayers: 4, seed: 7 };
  const a = await runSimulationBatch(fixed),
    b = await runSimulationBatch(fixed);
  const stable = (r) => r.games.map(({ startedAt, ...g }) => g);
  assert.deepEqual(stable(a), stable(b));
  assert.ok(a.games.every((g) => g.players.length === 4));
});
test("cancelling retains only completed runs for analysis", async () => {
  let cancel = false;
  const result = await runSimulationBatch(
    { ...options, count: 1000 },
    (p) => {
      if (p.attempted >= 8) cancel = true;
    },
    () => cancel,
  );
  assert.equal(result.cancelled, true);
  assert.equal(result.progress.attempted, 8);
  assert.equal(result.games.length, 8);
  assert.equal(summarizeJourneys(result.games).completed, 8);
});
test("batch refuses invalid counts and reversed/out-of-range parties", () => {
  for (const changed of [
    { count: 0 },
    { count: 10001 },
    { count: 2.5 },
    { minPlayers: 1 },
    { maxPlayers: 7 },
    { minPlayers: 5, maxPlayers: 2 },
    { seed: -1 },
  ])
    assert.throws(() => validateBatchOptions({ ...options, ...changed }));
});
test("trace-free simulations still finish and use the same actions and outcome", () => {
  const traced = simulateGame({ seed: 8, players: 3 }),
    compact = simulateGame({ seed: 8, players: 3, recordTrace: false });
  assert.deepEqual(compact.state, traced.state);
  assert.equal(compact.actions, traced.trace.length);
  assert.equal(compact.trace.length, 0);
  assert.equal(compact.truncated, false);
});
