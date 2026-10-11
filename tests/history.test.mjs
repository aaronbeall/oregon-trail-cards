import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
async function load(file) {
  const source = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  return import(
    `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
  );
}
const { GameHistory, HISTORY_KEY, replayGame } = await load("../History.ts");
const { TrailGame, names } = await load("../TrailCard.ts");
function setup() {
  let serial = 0;
  const values = new Map();
  const storage = {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
  };
  const history = new GameHistory(
    storage,
    () => new Date(1700000000000 + serial++).toISOString(),
    () => `game-${serial++}`,
  );
  const rolls = [];
  let rng = 42;
  const game = new TrailGame(
    () => {
      rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
      return rng / 4294967296;
    },
    undefined,
    (n) => rolls.push(n),
  );
  game.reset(["Ada", "Ben", "Cora"]);
  history.capture(game.state, { type: "start" });
  return { game, history, storage, values, rolls };
}
test("every state in a full journey replays exactly, including dice and nested changes", () => {
  const { game, history, storage, rolls } = setup();
  const states = [structuredClone(game.state)];
  let steps = 0;
  while (game.state.status === "travel" && steps++ < 700) {
    const s = game.state;
    let type = s.phase;
    switch (s.phase) {
      case "legacy":
        game.closeWill();
        break;
      case "river":
        game.skips ? game.skip() : game.cross();
        break;
      case "repair":
        game.repair();
        break;
      case "stack":
        game.stack(0);
        break;
      case "fort": {
        const kind = Object.keys(names).find((k) => s.shop[k]);
        kind ? game.takeSupply(kind) : game.leaveShop();
        break;
      }
      case "town":
        game.leaveShop();
        break;
      case "discard": {
        const owner = game.player.supplies.length
          ? s.current
          : s.players.findIndex((p) => p.alive && p.supplies.length);
        game.discardSupply(owner, 0);
        break;
      }
      default: {
        const playable = game.player.hand.findIndex((c) => game.canPlay(c));
        if (game.skips) game.skip();
        else if (playable >= 0) game.play(playable);
        else if (game.blocked) game.draw();
        else {
          const rotate = game.player.hand.findIndex((c) =>
            game.matches({ ...c, rotated: !c.rotated }),
          );
          if (rotate >= 0) {
            type = "rotate";
            game.rotate(rotate);
          } else game.draw();
        }
      }
    }
    const previous = structuredClone(states.at(-1));
    history.capture(s, { type, rolls: rolls.splice(0) });
    if (JSON.stringify(previous) !== JSON.stringify(s))
      states.push(structuredClone(s));
  }
  const record = history.archive.games[0];
  assert.notEqual(game.state.status, "travel");
  assert.equal(record.events.length, states.length - 1);
  states.forEach((state, i) => assert.deepEqual(replayGame(record, i), state));
  assert.ok(record.events.some((e) => e.action.rolls.length));
  for (let i = 0; i < record.events.length; i++) {
    assert.equal(record.events[i].turn, states[i].turn);
    assert.equal(record.events[i].player, states[i].current);
  }
  assert.equal(record.outcome, game.state.status);
  assert.ok(record.endedAt);
  assert.ok(record.completeFromStart);
  assert.deepEqual(
    replayGame(new GameHistory(storage).archive.games[0]),
    game.state,
  );
});
test("reloads do not duplicate events; separate new games retain abandoned and completed journeys", () => {
  const { game, history, storage } = setup();
  game.rotate(0);
  history.capture(game.state, { type: "rotate", args: { rotate: "0" } });
  const resumed = new GameHistory(storage);
  resumed.capture(game.state);
  assert.equal(resumed.archive.games[0].events.length, 1);
  game.reset(["Dee", "Eli"]);
  resumed.capture(game.state, { type: "start" });
  assert.equal(resumed.archive.games.length, 2);
  assert.equal(resumed.archive.games[0].outcome, "abandoned");
  assert.ok(resumed.archive.games[0].endedAt);
  game.state.status = "won";
  resumed.capture(game.state, { type: "play" });
  game.reset(["Flo", "Gus"]);
  resumed.capture(game.state, { type: "start" });
  assert.equal(resumed.archive.games[1].outcome, "won");
  assert.equal(resumed.archive.games.length, 3);
});
test("old saves are marked partial, while UI-only/unchanged states do not produce events", () => {
  const { game, storage } = setup();
  storage.setItem(
    HISTORY_KEY,
    JSON.stringify({ version: 1, active: null, games: [] }),
  );
  game.state.turn = 8;
  const imported = new GameHistory(storage);
  imported.capture(game.state);
  assert.equal(imported.archive.games[0].completeFromStart, false);
  imported.capture(game.state, { type: "shop" });
  assert.equal(imported.archive.games[0].events.length, 0);
  assert.deepEqual(replayGame(imported.archive.games[0]), game.state);
});
test("quota failures preserve prior disk data and retry every pending event without eviction", () => {
  const { game, history, storage, values } = setup();
  const previous = storage.getItem(HISTORY_KEY);
  const write = storage.setItem;
  storage.setItem = () => {
    throw new Error("Quota exceeded");
  };
  game.rotate(0);
  assert.throws(() => history.capture(game.state, { type: "rotate" }), /Quota/);
  game.rotate(1);
  assert.throws(() => history.capture(game.state, { type: "rotate" }), /Quota/);
  assert.equal(values.get(HISTORY_KEY), previous);
  storage.setItem = write;
  history.capture(game.state);
  const resumed = new GameHistory(storage);
  assert.equal(resumed.archive.games[0].events.length, 2);
  assert.deepEqual(replayGame(resumed.archive.games[0]), game.state);
});
test("corrupt archives are not silently overwritten", () => {
  const storage = {
    getItem: () => "{broken",
    setItem: () => assert.fail("Should not write"),
  };
  assert.throws(() => new GameHistory(storage));
});
