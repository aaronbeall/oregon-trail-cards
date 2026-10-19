import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "../scripts/load-typescript.mjs";
const { TrailGame, readSave } = await loadTypeScript(
  new URL("../TrailCard.ts", import.meta.url),
);
const { seededRandom } = await loadTypeScript(
  new URL("../Computer.ts", import.meta.url),
);
const { advanceSimulation } = await loadTypeScript(
  new URL("../Simulation.ts", import.meta.url),
);
const { GameHistory, replayGame } = await loadTypeScript(
  new URL("../History.ts", import.meta.url),
);
const { gameStatistics } = await loadTypeScript(
  new URL("../Stats.ts", import.meta.url),
);
function fixture(seed = 1) {
  const rolls = [];
  const game = new TrailGame(seededRandom(seed), undefined, (n) =>
    rolls.push(n),
  );
  game.reset(["Ada", "Bea", "Cy"]);
  game.state.mode = "simulation";
  game.state.simulationActions = 0;
  game.state.players.forEach((p) => (p.controller = "computer"));
  const values = new Map();
  const history = new GameHistory(
    {
      getItem: (k) => values.get(k) ?? null,
      setItem: (k, v) => values.set(k, v),
    },
    () => new Date().toISOString(),
    () => `sim-${seed}`,
  );
  history.capture(game.state, { type: "start" });
  return { game, history, rolls };
}
test("simulation reaches a terminal outcome and history replays every recorded step exactly", () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { game, history, rolls } = fixture(seed);
    let count = 0;
    while (game.state.status === "travel" && count < 5000) {
      rolls.length = 0;
      const step = advanceSimulation(game);
      assert.ok(step);
      history.capture(game.state, { ...step.action, rolls: [...rolls] });
      count++;
    }
    assert.notEqual(game.state.status, "travel");
    const record = history.archive.games[0];
    assert.equal(record.simulated, true);
    assert.equal(record.initial.mode, "simulation");
    assert.equal(record.events.length, count);
    assert.equal(game.state.simulationActions, count);
    assert.deepEqual(replayGame(record), game.state);
    assert.ok(record.events.every((e) => Array.isArray(e.action.rolls)));
    assert.equal(
      gameStatistics([{ record, state: game.state }]).games[0].simulated,
      true,
    );
  }
});
test("inheritance is recorded as one transaction with gifts and shop returns together", () => {
  const { game, history } = fixture();
  game.player.alive = false;
  game.player.supplies = ["food", "water", "parts"];
  game.state.deaths = [0];
  game.state.current = 1;
  game.state.phase = "legacy";
  game.state.resume = "turn";
  history.capture(game.state, { type: "play", args: { play: "0" } });
  const step = advanceSimulation(game);
  assert.equal(step.action.type, "will-supplies");
  assert.equal(step.action.args.recipients.length, 2);
  assert.equal(game.state.players[0].supplies.length, 0);
  assert.notEqual(game.state.phase, "legacy");
  history.capture(game.state, step.action);
  assert.deepEqual(replayGame(history.archive.games[0]), game.state);
});
test("simulation metadata survives saving, while regular journeys stay unmarked", () => {
  const { game } = fixture();
  assert.equal(readSave(JSON.stringify(game.state)).mode, "simulation");
  game.state.mode = "invalid";
  assert.equal(readSave(JSON.stringify(game.state)), undefined);
  delete game.state.mode;
  const restored = readSave(JSON.stringify(game.state));
  assert.equal(restored.mode, undefined);
  const summary = gameStatistics([
    {
      record: {
        id: "normal",
        startedAt: "2026-10-18",
        outcome: "travel",
        completeFromStart: true,
      },
      state: restored,
    },
  ]).games[0];
  assert.equal(summary.simulated, false);
});
test("simulation advance does nothing after game completion", () => {
  const { game } = fixture();
  game.state.status = "lost";
  const before = JSON.stringify(game.state);
  assert.equal(advanceSimulation(game), undefined);
  assert.equal(JSON.stringify(game.state), before);
});
