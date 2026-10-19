import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "../scripts/load-typescript.mjs";
const { TrailGame, readSave } = await loadTypeScript(
  new URL("../TrailCard.ts", import.meta.url),
);
const { chooseComputerMove, applyComputerMove, simulateGame } =
  await loadTypeScript(new URL("../Computer.ts", import.meta.url));
const card = (type = "trail", left = 1, right = 1) => ({
  id: 1000,
  type,
  left,
  right,
  rotated: false,
});
function game(n = 3) {
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"].slice(0, n));
  g.state.current = 0;
  g.player.controller = "computer";
  g.state.players[0].supplies = [];
  g.state.hazards = [];
  g.player.hand = [card()];
  return g;
}
function hazard(kind, needs, rounds = 1) {
  return {
    id: 999,
    kind,
    needs,
    rounds,
    owner: 1,
    waiting: [0],
    born: 0,
    skip: 0,
  };
}
test("brain is read-only, deterministic, and does not inspect hidden decks", () => {
  const g = game(),
    before = JSON.stringify(g.state);
  assert.deepEqual(chooseComputerMove(g), chooseComputerMove(g));
  assert.equal(JSON.stringify(g.state), before);
  Object.defineProperty(g.state, "deck", {
    get() {
      throw Error("Hidden trail deck read");
    },
  });
  Object.defineProperty(g.state, "calamities", {
    get() {
      throw Error("Hidden calamity deck read");
    },
  });
  assert.equal(chooseComputerMove(g).type, "play");
});
test("urgent wagon remedy takes priority over a personal condition and trail progress", () => {
  const g = game();
  g.player.supplies = ["parts", "medicine"];
  g.state.hazards = [
    hazard("typhoid", { medicine: 1 }),
    { ...hazard("wheel", { parts: 1 }), id: 998 },
  ];
  const move = chooseComputerMove(g);
  assert.equal(move.type, "cure");
  assert.equal(move.hazard, 998);
  assert.ok(applyComputerMove(g, move));
  assert.equal(
    g.state.hazards.some((h) => h.kind === "wheel"),
    false,
  );
});
test("two survivors can contribute both supplies without wasting their remaining allowance", () => {
  const g = game(2);
  g.player.supplies = ["water", "medicine"];
  g.state.hazards = [hazard("typhoid", { water: 1, medicine: 1 })];
  assert.equal(chooseComputerMove(g).type, "cure");
  assert.ok(applyComputerMove(g, chooseComputerMove(g)));
  assert.equal(g.state.current, 0);
  assert.equal(g.state.used, 1);
  assert.equal(chooseComputerMove(g).type, "cure");
  assert.ok(applyComputerMove(g, chooseComputerMove(g)));
  assert.equal(g.state.current, 1);
  assert.equal(g.state.hazards.length, 0);
});
test("rotates to connect, then plays rather than oscillating", () => {
  const g = game();
  g.state.run = [card("trail", 0, 0)];
  g.player.hand = [card("trail", 1, 2)];
  const move = chooseComputerMove(g);
  assert.equal(move.type, "rotate");
  assert.ok(applyComputerMove(g, move));
  assert.equal(chooseComputerMove(g).type, "play");
});
test("prefers safe travel to calamity and draws only when nothing connects", () => {
  const g = game();
  g.player.hand = [card("calamity"), { ...card(), id: 1001 }];
  assert.equal(chooseComputerMove(g).index, 1);
  g.state.run = [card("trail", 0, 0)];
  g.player.hand = [card("trail", 1, 1)];
  assert.equal(chooseComputerMove(g).type, "draw");
});
test("urgent trade spends only own unneeded supplies, then supplies the remedy", () => {
  const g = game();
  g.player.supplies = ["bullets", "food"];
  g.state.hazards = [hazard("wheel", { parts: 1 })];
  g.state.shop.parts = 2;
  const move = chooseComputerMove(g);
  assert.equal(move.type, "trade");
  assert.ok(move.payments.every((p) => p.player === 0));
  assert.ok(applyComputerMove(g, move));
  assert.equal(chooseComputerMove(g).type, "cure");
  g.player.supplies = [];
  assert.notEqual(chooseComputerMove(g).type, "trade");
});
test("town treatment, fort restocking, repair, crossing, injury and estate all resolve legally", () => {
  for (const phase of ["town", "fort", "repair", "river", "legacy", "turn"]) {
    const g = game();
    g.state.phase = phase;
    g.state.take = 2;
    if (phase === "town") g.state.hazards = [hazard("wheel", { parts: 1 })];
    if (phase === "repair") g.state.pending = "wheel";
    if (phase === "turn")
      g.state.hazards = [{ ...hazard("arm", {}), owner: 0, skip: 1 }];
    if (phase === "legacy") {
      g.player.alive = false;
      g.player.supplies = ["food", "parts", "medicine"];
      g.state.deaths = [0];
      g.state.current = 1;
      g.state.resume = "turn";
    }
    const move = chooseComputerMove(g);
    assert.ok(move);
    assert.ok(applyComputerMove(g, move), `${phase}: ${JSON.stringify(move)}`);
  }
});
test("controller metadata survives saves and history-compatible JSON, older saves stay human", () => {
  const g = game();
  g.player.controller = "computer";
  assert.equal(
    readSave(JSON.stringify(g.state)).players[0].controller,
    "computer",
  );
  delete g.player.controller;
  assert.equal(
    readSave(JSON.stringify(g.state)).players[0].controller ?? "human",
    "human",
  );
  g.player.controller = "invalid";
  assert.equal(readSave(JSON.stringify(g.state)), undefined);
});
test("seeded full-game simulations are reproducible and terminate across all party sizes", () => {
  assert.deepEqual(simulateGame({ seed: 42 }), simulateGame({ seed: 42 }));
  for (let players = 2; players <= 6; players++)
    for (let seed = 1; seed <= 30; seed++) {
      const result = simulateGame({ players, seed });
      assert.equal(result.truncated, false, `${players} players seed ${seed}`);
      assert.ok(["won", "lost"].includes(result.state.status));
    }
});

test("human trade payments require explicit per-owner consent; computer supplies do not", () => {
  const g = game();
  g.player.supplies = [];
  g.state.players[1].supplies = ["bullets", "food"];
  g.state.players[2].supplies = [];
  g.state.hazards = [hazard("wheel", { parts: 1 })];
  g.state.shop.parts = 2;
  assert.notEqual(chooseComputerMove(g).type, "trade");
  const proposed = chooseComputerMove(g, { requestHumanSupplies: true });
  assert.equal(proposed.type, "trade");
  assert.ok(proposed.payments.every((p) => p.player === 1));
  const before = JSON.stringify(g.state);
  assert.equal(applyComputerMove(g, proposed), false);
  assert.equal(applyComputerMove(g, proposed, [2]), false);
  assert.equal(JSON.stringify(g.state), before);
  assert.equal(applyComputerMove(g, proposed, [1]), true);
  assert.deepEqual(g.state.players[1].supplies, []);
  assert.ok(g.player.supplies.includes("parts"));

  const computers = game();
  computers.player.supplies = [];
  computers.state.players[1].controller = "computer";
  computers.state.players[1].supplies = ["bullets", "food"];
  computers.state.hazards = [hazard("wheel", { parts: 1 })];
  computers.state.shop.parts = 2;
  const automatic = chooseComputerMove(computers);
  assert.equal(automatic.type, "trade");
  assert.equal(applyComputerMove(computers, automatic), true);
});
