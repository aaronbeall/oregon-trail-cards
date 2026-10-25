import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../Stats.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { gameStatistics } = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
function journey(outcome, count, alive, causes = []) {
  return {
    record: {
      id: `${outcome}-${count}`,
      startedAt: "2026-10-12T12:00:00Z",
      outcome,
      completeFromStart: true,
    },
    state: {
      started: true,
      status: outcome === "abandoned" ? "travel" : outcome,
      count,
      turn: 11,
      players: alive.map((alive, i) => ({
        name: `Player ${i}`,
        alive,
        deathCause: causes[i],
      })),
    },
  };
}
test("empty history has no misleading rates or NaN", () => {
  const s = gameStatistics([]);
  assert.equal(s.victoryRate, null);
  assert.equal(s.survivalRate, null);
  assert.equal(s.averageDays, null);
  assert.equal(s.completed, 0);
  assert.equal(s.distances.length, 6);
  assert.equal(s.games.length, 0);
});
test("rates use completed journeys, keeping in-progress and abandoned separate", () => {
  const s = gameStatistics([
    journey("won", 50, [true, false], ["", "Typhoid"]),
    journey("lost", 23, [false, false], ["Dysentery", "a second measles card"]),
    journey("travel", 10, [true, true, true]),
    journey("abandoned", 8, [true, true, true]),
  ]);
  assert.deepEqual(s.outcomes, { won: 1, lost: 1, travel: 1, abandoned: 1 });
  assert.equal(s.completed, 2);
  assert.equal(s.victoryRate, 0.5);
  assert.equal(s.survivalRate, 0.25);
  assert.equal(s.averageDistance, 36.5);
  assert.equal(s.averageDays, 10);
  assert.deepEqual(
    s.distances.map((x) => x.count),
    [1, 1, 1, 0, 0, 1],
  );
  assert.ok(s.deaths.some((x) => x.cause === "Measles" && x.count === 1));
});
test("snapshot totals include partial histories and living survivors of wagon defeats", () => {
  const r = journey("lost", 12, [true, true]);
  r.record.completeFromStart = false;
  const s = gameStatistics([r]);
  assert.equal(s.survivalRate, 1);
  assert.equal(s.games[0].partial, true);
  assert.equal(s.outcomes.lost, 1);
  assert.equal(s.deaths.length, 0);
});
test("deaths counted once per traveller per game, including ongoing journeys", () => {
  const s = gameStatistics([
    journey("travel", 4, [false, true], ["drowned crossing the river"]),
    journey("lost", 7, [false, false], ["Drowning", "Snakebite"]),
  ]);
  assert.deepEqual(s.deaths, [
    { cause: "Drowning", count: 2 },
    { cause: "Snakebite", count: 1 },
  ]);
  assert.equal(s.travellers, 2);
});

test("game type filters apply to every aggregate, not only the ledger", () => {
  const played = journey("won", 50, [true, true]);
  const simulated = journey(
    "lost",
    10,
    [false, false],
    ["Cholera", "Dysentery"],
  );
  simulated.record.id = "simulated";
  simulated.record.simulated = true;
  const records = [played, simulated];
  assert.equal(gameStatistics(records).games.length, 2);
  const human = gameStatistics(records, "played");
  assert.equal(human.games.length, 1);
  assert.equal(human.victoryRate, 1);
  assert.equal(human.survivalRate, 1);
  assert.equal(human.averageDistance, 50);
  assert.equal(human.deaths.length, 0);
  const sim = gameStatistics(records, "simulated");
  assert.equal(sim.games.length, 1);
  assert.equal(sim.victoryRate, 0);
  assert.equal(sim.survivalRate, 0);
  assert.equal(sim.averageDistance, 10);
  assert.equal(
    sim.deaths.reduce((n, d) => n + d.count, 0),
    2,
  );
  delete simulated.record.simulated;
  simulated.state.mode = "simulation";
  assert.equal(gameStatistics(records, "simulated").games.length, 1);
  const empty = gameStatistics([simulated], "played");
  assert.equal(empty.games.length, 0);
  assert.equal(empty.victoryRate, null);
});

test("statistics use the calendar day independently of the turn counter", () => {
  const sample = journey("won", 50, [true, true]);
  sample.state.day = 4;
  sample.state.turn = 20;
  assert.equal(gameStatistics([sample]).games[0].days, 3);
  assert.equal(gameStatistics([sample]).averageDays, 3);
});
