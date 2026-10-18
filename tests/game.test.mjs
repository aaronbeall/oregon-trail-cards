import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = ts.transpileModule(
  readFileSync(new URL("../TrailCard.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const {
  TrailGame,
  trailDeck,
  ends,
  readSave,
  names,
  portraitBirthdays,
  journeyDate,
  nextJourneyStartDate,
  JOURNEY_START_DATE,
  hazardDeadline,
} = await import(
  `data:text/javascript;base64,${Buffer.from(source).toString("base64")}`
);
function seed(n) {
  return () => {
    n = (Math.imul(n, 1664525) + 1013904223) >>> 0;
    return n / 4294967296;
  };
}
const card = (type = "trail", left = 1, right = 1, extra = {}) => ({
  id: 999,
  type,
  left,
  right,
  rotated: false,
  ...extra,
});
function fresh(n = 3, random = seed(1)) {
  const g = new TrailGame(random);
  g.reset(Array.from({ length: n }, (_, i) => `P${i}`));
  return g;
}
function calamity(g, kind) {
  g.player.hand = [card("calamity")];
  g.state.calamities = [kind, ...g.state.calamities];
  g.play(0);
}
function total(g, k) {
  return (
    g.state.shop[k] +
    g.state.players.reduce(
      (n, p) => n + p.supplies.filter((x) => x === k).length,
      0,
    )
  );
}
test("printed deck counts and supplies by party size", () => {
  const d = trailDeck();
  assert.equal(d.length, 56);
  for (const [type, n] of [
    ["trail", 8],
    ["calamity", 24],
    ["river", 20],
    ["town", 2],
    ["fort", 2],
  ])
    assert.equal(d.filter((c) => c.type === type).length, n);
  assert.equal(d.filter((c) => c.deadly).length, 3);
  for (let n = 2; n <= 6; n++) {
    const g = fresh(n);
    assert.equal(g.state.calamities.length, 32);
    assert.equal(g.state.deck.length, 56 - n * 5);
    assert.ok(
      g.state.players.every(
        (p) =>
          p.hand.length === 5 &&
          p.supplies.length === (n === 2 ? 8 : n < 5 ? 5 : n === 5 ? 4 : 3),
      ),
    );
    assert.equal(
      Object.keys(names).reduce((sum, k) => sum + total(g, k), 0),
      26,
    );
  }
});
test("180 degree rotation flips positions as well as ends; locations are universal", () => {
  assert.deepEqual(ends(card("trail", 0, 1, { rotated: true })), [1, 2]);
  const g = fresh();
  g.state.run = [card("trail", 1, 0)];
  g.player.hand = [card("trail", 2, 2)];
  assert.equal(g.play(0), false);
  assert.equal(g.draw(), false, "other orientation fits; must rotate");
  g.rotate(0);
  assert.equal(g.play(0), true);
  assert.equal(g.state.current, 1);
  g.player.hand = [card("town", 1, 1)];
  assert.equal(g.play(0), true);
});
test("playing does not replenish; draw one ends turn even if it now fits", () => {
  const g = fresh();
  const n = g.player.hand.length;
  g.player.hand[0] = card();
  g.play(0);
  assert.equal(g.state.players[0].hand.length, n - 1);
  g.state.run = [card("trail", 1, 1)];
  g.player.hand = [card("trail", 0, 0)];
  g.state.deck = [card()];
  assert.equal(g.draw(), true);
  assert.equal(g.state.players[1].hand.length, 2);
  assert.equal(g.state.current, 2);
});
test("the trail stays continuous across five-card boundaries and wins at fifty", () => {
  const g = fresh();
  g.state.run = Array.from({ length: 4 }, (_, i) =>
    card("trail", 1, 1, { id: i }),
  );
  g.state.count = 4;
  g.player.hand = [card("trail", 1, 0, { id: 4 })];
  assert.equal(g.play(0), true);
  assert.equal(g.state.phase, "turn");
  assert.equal(g.state.stacks.length, 0);
  assert.equal(g.state.run.length, 5);
  assert.equal(g.top.id, 4);
  assert.equal(g.state.current, 1);
  g.player.hand = [card("trail", 0, 0, { id: 5 })];
  assert.equal(g.play(0), true);
  assert.equal(g.top.id, 5);
  assert.equal(g.state.run.length, 6);
  g.state.count = 49;
  g.player.hand = [card("trail", 0, 0)];
  assert.equal(g.play(0), true);
  assert.equal(g.state.status, "won");
});
test("failed crossings pass players without laying cards; all rolls emit animation results", () => {
  const rolls = [];
  const g = new TrailGame(
    () => 0.4,
    undefined,
    (n) => rolls.push(n),
  );
  g.reset(["A", "B"]);
  g.player.hand = [card("river")];
  g.play(0);
  g.cross();
  assert.equal(g.state.current, 1);
  assert.equal(g.state.count, 1);
  assert.equal(g.state.phase, "river");
  g.random = () => 0.6;
  g.cross();
  assert.equal(g.state.current, 0);
  assert.equal(g.state.phase, "turn");
  assert.deepEqual(rolls, [3, 4]);
});
test("river one automatically loses another living player’s supply when own bag is empty", () => {
  const g = fresh(2, () => 0);
  g.player.hand = [card("river")];
  g.player.supplies = [];
  g.state.players[1].supplies = ["food"];
  g.play(0);
  g.cross();
  assert.equal(g.state.lastSupplyLoss.owner, 1);
  assert.equal(g.state.lastSupplyLoss.supply, "food");
  assert.equal(g.state.players[1].supplies.length, 0);
  assert.equal(g.state.current, 1);
  assert.equal(g.state.phase, "river");
});
test("drowning returns trail hand, allows two wills, skips dead turns", () => {
  const g = fresh(3, () => 0);
  g.player.hand = [card("river", 1, 1, { deadly: true }), card()];
  g.player.supplies = ["food", "water", "medicine"];
  g.play(0);
  g.cross();
  assert.equal(g.state.phase, "legacy");
  assert.equal(g.state.players[0].alive, false);
  assert.equal(g.state.current, 1);
  assert.ok(g.state.deck.some((c) => c.id === 999));
  g.will(0, 1);
  g.will(0, 2);
  assert.equal(g.will(0, 1), false);
  g.closeWill();
  assert.equal(g.state.phase, "river");
  assert.equal(g.state.players[0].supplies.length, 0);
});
test("deadline gives drawer one last cure turn; supplies use turns and return to shop", () => {
  const g = fresh();
  calamity(g, "cold");
  for (let i = 0; i < 2; i++) {
    g.player.hand = [card()];
    g.play(0);
  }
  assert.equal(g.state.current, 0);
  assert.equal(g.state.players[0].alive, true);
  g.player.supplies.push("clothes");
  const before = g.state.shop.clothes;
  assert.equal(g.cure(g.state.hazards[0].id, "clothes"), true);
  assert.equal(g.state.current, 1);
  assert.equal(g.state.shop.clothes, before + 1);
  assert.equal(g.state.hazards.length, 0);
});
test("unremedied deadline kills player; broken wagon loses whole party", () => {
  const g = fresh();
  calamity(g, "cold");
  for (let i = 0; i < 3; i++) {
    g.player.hand = [card()];
    g.play(0);
  }
  assert.equal(g.state.players[0].alive, false);
  assert.equal(g.state.phase, "legacy");
  const w = fresh(2, () => 0);
  calamity(w, "axle");
  assert.equal(w.state.phase, "repair");
  w.repair();
  assert.equal(w.blocked, true);
  assert.equal(w.play(0), false);
  w.draw();
  w.draw();
  assert.equal(w.state.status, "lost");
});
test("two survivors can use two supplies; typhoid needs both distinct remedies", () => {
  const g = fresh(2);
  calamity(g, "typhoid");
  g.player.supplies = ["water", "medicine"];
  const id = g.state.hazards[0].id;
  g.cure(id, "water");
  assert.equal(g.state.current, 1);
  assert.equal(g.play(0), false);
  g.cure(id, "medicine");
  assert.equal(g.state.current, 0);
  assert.equal(g.state.hazards.length, 0);
});
test("duplicate grass kills oxen; town removes grass, no invented food cure", () => {
  const g = fresh();
  calamity(g, "grass");
  calamity(g, "grass");
  assert.equal(g.blocked, true);
  assert.equal(g.state.hazards.filter((h) => h.kind === "grass").length, 2);
  assert.equal(g.cure(g.state.hazards[0].id, "food"), false);
  g.state.phase = "town";
  const h = g.state.hazards.find((h) => h.kind === "grass");
  g.townCure(h.id);
  assert.equal(g.state.hazards.filter((h) => h.kind === "grass").length, 1);
});
test("cholera duplicates kill the original sufferer; arm sits out two rounds", () => {
  const g = fresh();
  calamity(g, "cholera");
  calamity(g, "cholera");
  assert.equal(g.state.players[0].alive, false);
  assert.equal(g.state.phase, "legacy");
  g.closeWill();
  assert.equal(g.state.hazards.find((h) => h.kind === "cholera").owner, 1);
  const a = fresh();
  calamity(a, "arm");
  for (let round = 0; round < 2; round++) {
    for (let i = 0; i < 2; i++) {
      a.player.hand = [card()];
      a.play(0);
      if (a.state.phase === "stack") a.stack(0);
    }
    assert.equal(a.skips, true);
    a.skip();
  }
  assert.equal(a.state.hazards.length, 0);
});
test("a town can clear inadequate grass instead of taking a supply", () => {
  const g = fresh();
  calamity(g, "grass");
  const grass = g.state.hazards.find((h) => h.kind === "grass");
  assert.ok(grass);
  const supplies = g.state.players.map((p) => [...p.supplies]);
  const shop = { ...g.state.shop };
  g.player.hand = [card("town")];
  assert.equal(g.play(0), true);
  assert.equal(g.state.phase, "town");
  assert.ok(g.state.hazards.some((h) => h.id === grass.id));
  assert.equal(g.townCure(grass.id), true);
  assert.equal(
    g.state.hazards.some((h) => h.id === grass.id),
    false,
  );
  assert.ok(g.state.discarded.includes("grass"));
  assert.equal(g.state.phase, "turn");
  assert.deepEqual(
    g.state.players.map((p) => p.supplies),
    supplies,
  );
  assert.deepEqual(g.state.shop, shop);
});

test("town and fort take only available stock; trading is atomic and no turn consumed", () => {
  const g = fresh();
  g.player.hand = [card("fort")];
  g.play(0);
  const available = Object.keys(names).filter((k) => g.state.shop[k]);
  g.takeSupply(available[0]);
  assert.equal(g.state.phase, "fort");
  g.takeSupply(Object.keys(names).find((k) => g.state.shop[k]));
  assert.equal(g.state.current, 1);
  g.player.supplies = ["food", "water"];
  g.state.shop.medicine = 1;
  const turn = g.state.turn;
  assert.equal(
    g.trade(
      [
        { player: 1, index: 0 },
        { player: 1, index: 0 },
      ],
      "medicine",
      1,
    ),
    false,
  );
  assert.equal(
    g.trade(
      [
        { player: 1, index: 0 },
        { player: 1, index: 1 },
      ],
      "medicine",
      1,
    ),
    true,
  );
  assert.deepEqual(g.player.supplies, ["medicine"]);
  assert.equal(g.state.turn, turn);
});
test("empty draw pile recycles earlier roads, preserving the last connection and visit history", () => {
  const g = fresh();
  g.state.run = Array.from({ length: 5 }, (_, i) =>
    card("trail", 0, 0, { id: i + 1, journeyStep: i + 1 }),
  );
  g.state.count = 5;
  g.state.deck = [];
  g.player.hand = [card("trail", 1, 1)];
  assert.equal(g.draw(), true);
  assert.equal(g.state.run.length, 1);
  assert.equal(g.top.id, 5);
  assert.equal(g.state.deck.length, 3);
  assert.equal(g.state.count, 5);
  assert.deepEqual(
    Object.values(g.state.trailReports).map((r) => r.card.id),
    [1, 2, 3, 4, 5],
  );
});
test("versioned saves resume pending states and reject incompatible data", () => {
  const g = fresh();
  calamity(g, "axle");
  assert.deepEqual(readSave(JSON.stringify(g.state)), g.state);
  for (const value of [
    "{}",
    "null",
    "bad",
    JSON.stringify({ ...g.state, version: 1 }),
    JSON.stringify({ ...g.state, shop: {} }),
  ])
    assert.equal(readSave(value), undefined);
});
test("seeded journeys conserve every physical trail and supply card through deaths and recycling", () => {
  for (let n = 1; n <= 100; n++) {
    const g = fresh(3, seed(n));
    const initial = Object.fromEntries(
      Object.keys(names).map((k) => [k, total(g, k)]),
    );
    let steps = 0;
    while (g.state.status === "travel" && steps++ < 700) {
      const s = g.state;
      switch (s.phase) {
        case "legacy":
          g.closeWill();
          break;
        case "river":
          g.skips ? g.skip() : g.cross();
          break;
        case "repair":
          g.repair();
          break;
        case "stack":
          g.stack(0);
          break;
        case "fort":
        case "town": {
          const k = Object.keys(names).find((k) => s.shop[k] > 0);
          k ? g.takeSupply(k) : g.leaveShop();
          break;
        }
        case "discard": {
          const i = g.player.supplies.length
            ? s.current
            : g.living.find((i) => s.players[i].supplies.length);
          g.discardSupply(i, 0);
          break;
        }
        default:
          if (g.skips) {
            g.skip();
            break;
          }
          const h = s.hazards.find((h) =>
            Object.keys(h.needs).some(
              (k) => h.needs[k] > 0 && g.player.supplies.includes(k),
            ),
          );
          if (h) {
            g.cure(
              h.id,
              Object.keys(h.needs).find(
                (k) => h.needs[k] > 0 && g.player.supplies.includes(k),
              ),
            );
            if (s.used) g.endSupplies();
            break;
          }
          let i = g.player.hand.findIndex((c) => g.canPlay(c));
          if (i < 0 && !g.blocked) {
            i = g.player.hand.findIndex((c) =>
              g.matches({ ...c, rotated: !c.rotated }),
            );
            if (i >= 0) g.rotate(i);
          }
          i >= 0 && !g.blocked ? g.play(i) : g.draw();
      }
      const physical = [
        ...s.deck,
        ...s.run,
        ...s.stacks.flat(),
        ...s.players.flatMap((p) => p.hand),
      ];
      assert.equal(
        s.calamities.length +
          s.discarded.length +
          s.hazards.filter((h) => !h.virtual).length +
          (s.pending ? 1 : 0),
        32,
        `calamities seed ${n}`,
      );
      assert.equal(physical.length, 56);
      assert.equal(new Set(physical.map((c) => c.id)).size, 56);
      for (const k of Object.keys(names)) assert.equal(total(g, k), initial[k]);
      assert.ok(readSave(JSON.stringify(s)));
    }
    assert.notEqual(g.state.status, "travel", `seed ${n} stalled`);
  }
});
test("fiftieth river must resolve before winning; sitting out passes a river without a roll", () => {
  const g = fresh(2, () => 0.5);
  g.state.stacks = Array.from({ length: 9 }, () => [card()]);
  g.state.run = Array.from({ length: 4 }, () => card());
  g.state.count = 49;
  g.player.hand = [card("river")];
  g.play(0);
  assert.equal(g.state.status, "travel");
  g.state.hazards = [
    {
      id: 1,
      kind: "arm",
      owner: 0,
      needs: {},
      rounds: 2,
      waiting: [1, 0],
      born: 0,
      skip: 2,
    },
  ];
  assert.equal(g.cross(), false);
  g.skip();
  assert.equal(g.state.phase, "river");
  assert.equal(g.state.current, 1);
  g.cross();
  assert.equal(g.state.status, "won");
});
test("hunting needs bullets, bad water duplicates stop the wagon, starvation permits two rounds", () => {
  const g = fresh();
  g.player.supplies = ["bullets"];
  g.state.shop.food = 1;
  calamity(g, "hunting");
  assert.deepEqual(g.state.players[0].supplies, ["bullets", "food"]);
  calamity(g, "water");
  calamity(g, "water");
  assert.equal(g.blocked, true);
  const a = fresh(2);
  calamity(a, "starvation");
  for (let i = 0; i < 3; i++) {
    a.player.hand = [card()];
    a.play(0);
  }
  assert.equal(a.state.players[0].alive, true);
  a.player.hand = [card()];
  a.play(0);
  if (a.state.phase === "stack") a.stack(0);
  assert.equal(a.state.players[0].alive, false);
});
test("two contributors trade without revealing or consuming the next turn; town removes a hazard", () => {
  const g = fresh();
  g.state.players[0].supplies = ["food"];
  g.state.players[1].supplies = ["water"];
  g.state.shop.oxen = 1;
  assert.equal(
    g.trade(
      [
        { player: 0, index: 0 },
        { player: 1, index: 0 },
      ],
      "oxen",
      1,
    ),
    true,
  );
  assert.deepEqual(g.state.players[1].supplies, ["oxen"]);
  assert.equal(g.state.current, 0);
  calamity(g, "cold");
  g.player.hand = [card("town")];
  g.play(0);
  g.townCure(g.state.hazards[0].id);
  assert.equal(g.state.hazards.length, 0);
  assert.equal(g.state.phase, "turn");
});

test("portraits are unique within a party and persist with the journey", () => {
  const g = fresh(6);
  const portraits = g.state.players.map((p) => p.portrait);
  assert.equal(new Set(portraits).size, 6);
  assert.ok(portraits.every((n) => Number.isInteger(n) && n >= 0 && n < 18));
  const restored = new TrailGame(
    Math.random,
    readSave(JSON.stringify(g.state)),
  );
  assert.deepEqual(
    restored.state.players.map((p) => p.portrait),
    portraits,
  );
});

test("selected portraits and leader survive starting and saving; invalid choices are atomic", () => {
  const g = fresh();
  assert.equal(g.reset(["Ada Moss", "Felix Wren"], 1, [4, 2]), true);
  assert.equal(g.state.current, 1);
  assert.deepEqual(
    g.state.players.map((p) => p.portrait),
    [4, 2],
  );
  assert.deepEqual(
    readSave(JSON.stringify(g.state)).players.map((p) => p.portrait),
    [4, 2],
  );
  const before = JSON.stringify(g.state);
  for (const portraits of [[0], [0, 18], [1, NaN]])
    assert.equal(g.reset(["A", "B"], 0, portraits), false);
  assert.equal(JSON.stringify(g.state), before);
});

const partySource = ts.transpileModule(
  readFileSync(new URL("../Party.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
    },
  },
).outputText;
const { randomParty, randomName, nameCategories, portraitCategories } =
  await import(
    `data:text/javascript;base64,${Buffer.from(partySource).toString("base64")}`
  );
test("randomizing all party sizes changes every name and face without duplicates", () => {
  for (let count = 2; count <= 6; count++) {
    const random = seed(count);
    let previous = randomParty(count, [], random);
    for (let i = 0; i < 40; i++) {
      const next = randomParty(count, previous, random);
      assert.equal(next.length, count);
      assert.equal(new Set(next.map((p) => p.name)).size, count);
      assert.equal(new Set(next.map((p) => p.portrait)).size, count);
      next.forEach((p, j) => {
        assert.notEqual(p.name, previous[j].name);
        assert.notEqual(p.portrait, previous[j].portrait);
      });
      previous = next;
    }
  }
});

test("randomize handles six manually identical portraits without leaving a face unchanged", () => {
  const previous = Array.from({ length: 6 }, (_, i) => ({
    name: `Player ${i}`,
    portrait: 0,
  }));
  const next = randomParty(6, previous, seed(42));
  assert.equal(next.length, 6);
  assert.ok(next.every((p) => p.portrait !== 0));
});

test("automatic names match portrait categories, allowing neutral names", () => {
  assert.equal(nameCategories.Mabel, "feminine");
  assert.equal(nameCategories.Jasper, "masculine");
  assert.equal(nameCategories.Kit, "neutral");
  assert.deepEqual(portraitCategories.slice(0, 6), [
    "feminine",
    "masculine",
    "feminine",
    "masculine",
    "feminine",
    "masculine",
  ]);
  for (let i = 1; i <= 100; i++) {
    const random = seed(i);
    for (const p of randomParty(6, [], random)) {
      const category = nameCategories[p.name.split(" ")[0]];
      assert.ok(
        category === "neutral" || category === portraitCategories[p.portrait],
      );
    }
    for (let slot = 0; slot < 18; slot++) {
      const name = randomName([], random, slot);
      const category = nameCategories[name.split(" ")[0]];
      assert.ok(
        category === "neutral" || category === portraitCategories[slot],
      );
    }
  }
});

test("all 18 portraits can be selected and appear in the random pool", () => {
  const seen = new Set();
  const random = seed(42);
  for (let i = 1; i <= 100; i++)
    randomParty(6, [], random).forEach((p) => seen.add(p.portrait));
  assert.equal(seen.size, 18);
  const g = fresh();
  assert.equal(g.reset(["A", "B"], 0, [6, 17]), true);
  assert.deepEqual(
    readSave(JSON.stringify(g.state)).players.map((p) => p.portrait),
    [6, 17],
  );
});

test("portrait birthdays and fictional journey dates persist through death and reload", () => {
  const g = fresh();
  g.reset(["Willa", "Otis"], 0, [0, 11]);
  assert.equal(g.state.startDate, JOURNEY_START_DATE);
  assert.equal(g.state.players[0].birthday, portraitBirthdays[0]);
  assert.equal(g.state.players[1].birthday, portraitBirthdays[11]);
  assert.equal(journeyDate(30), "1847-05-01");
  g.state.turn = 13;
  calamity(g, "dysentery");
  assert.equal(g.state.players[0].deathDay, 12);
  assert.equal(g.state.players[0].deathDate, "1847-04-13");
  const restored = new TrailGame(
    Math.random,
    readSave(JSON.stringify(g.state)),
  );
  assert.equal(restored.state.players[0].deathDate, "1847-04-13");
  assert.equal(restored.state.players[0].birthday, portraitBirthdays[0]);
});

test("automatic losses sample actual supply cards and preserve the result for replay", () => {
  const g = fresh(3);
  g.player.supplies = ["food", "medicine", "water"];
  g.player.hand = [card("river")];
  g.play(0);
  const draws = [0, 0.99];
  g.random = () => draws.shift();
  g.cross();
  assert.equal(g.state.phase, "river");
  assert.deepEqual(g.state.players[0].supplies, ["food", "medicine"]);
  assert.equal(g.state.lastSupplyLoss.supply, "water");
  assert.equal(g.state.lastSupplyLoss.reason, "river");
  g.random = () => 0.5;
  g.cross();
  g.player.supplies = ["parts", "medicine"];
  g.random = () => 0;
  calamity(g, "thief");
  assert.equal(g.state.phase, "turn");
  assert.equal(g.state.lastSupplyLoss.supply, "parts");
  assert.equal(g.state.lastSupplyLoss.reason, "thief");
  assert.equal(g.state.lastSupplyLoss.sequence, 2);
  assert.deepEqual(
    readSave(JSON.stringify(g.state)).lastSupplyLoss,
    g.state.lastSupplyLoss,
  );
});

test("remedy deadline counts living player turns through the actual fatal deadline", () => {
  const g = fresh();
  const h = {
    id: 1000,
    kind: "typhoid",
    owner: 0,
    needs: { medicine: 1 },
    rounds: 1,
    waiting: [1, 2, 0],
    born: 0,
    skip: 0,
  };
  g.state.current = 1;
  assert.deepEqual(hazardDeadline(g.state, h), { turns: 3, player: 0 });
  assert.deepEqual(hazardDeadline(g.state, { ...h, rounds: 2 }), {
    turns: 6,
    player: 0,
  });
  g.state.current = 0;
  assert.deepEqual(hazardDeadline(g.state, { ...h, waiting: [0] }), {
    turns: 1,
    player: 0,
  });
  assert.deepEqual(hazardDeadline(g.state, { ...h, born: g.state.turn }), {
    turns: 4,
    player: 0,
  });
  g.state.players[1].alive = false;
  g.state.current = 2;
  assert.deepEqual(hazardDeadline(g.state, h), { turns: 2, player: 0 });
  assert.equal(hazardDeadline(g.state, { ...h, rounds: null }), undefined);
});

test("new journeys advance their fictional departure date without changing existing dates", () => {
  assert.equal(nextJourneyStartDate([]), "1847-04-01");
  assert.equal(nextJourneyStartDate(["1847-04-01"]), "1847-04-02");
  assert.equal(
    nextJourneyStartDate(["1847-04-01", "1847-04-02"]),
    "1847-04-03",
  );
  assert.equal(nextJourneyStartDate([undefined, "1847-04-01"]), "1847-04-03");
  const dates = ["1847-04-30", "1847-04-02"];
  assert.equal(nextJourneyStartDate(dates), "1847-05-01");
  assert.deepEqual(dates, ["1847-04-30", "1847-04-02"]);
});
