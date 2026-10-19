import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
function compile(name, imports = {}) {
  let code = ts.transpileModule(
    readFileSync(new URL(`../${name}.ts`, import.meta.url), "utf8"),
    {
      compilerOptions: {
        target: ts.ScriptTarget.ES2022,
        module: ts.ModuleKind.ESNext,
      },
    },
  ).outputText;
  for (const [key, value] of Object.entries(imports))
    code = code
      .replaceAll(`"./${key}"`, JSON.stringify(value))
      .replaceAll(`'./${key}'`, JSON.stringify(value));
  return `data:text/javascript;base64,${Buffer.from(code).toString("base64")}`;
}
const trail = compile("TrailCard"),
  supplies = compile("Supplies", { TrailCard: trail }),
  historySource = compile("History");
const {
  flowCohorts,
  journeyMapEvents,
  journeyMap,
  journeyFlow,
  routePoint,
  eventRouteProgress,
  importantMapSteps,
  mapActionTone,
} = await import(
  compile("JourneyVisuals", {
    TrailCard: trail,
    Supplies: supplies,
    History: historySource,
  })
);
const { TrailGame } = await import(trail);
function fresh() {
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  return g.state;
}
test("Sankey cohorts conserve every journey and keep progress/outcome groups distinct", () => {
  const games = [
    { distance: 0, outcome: "lost" },
    { distance: 9, outcome: "lost" },
    { distance: 10, outcome: "travel" },
    { distance: 50, outcome: "won" },
    { distance: 49, outcome: "abandoned" },
  ];
  const cohorts = flowCohorts(games);
  assert.equal(
    cohorts.reduce((n, c) => n + c.count, 0),
    5,
  );
  assert.deepEqual(
    cohorts.find((c) => c.stage === 0),
    { stage: 0, outcome: "lost", count: 2 },
  );
  assert.equal(journeyFlow([]), "");
  assert.ok(!/NaN|Infinity/.test(journeyFlow(games)));
  assert.match(
    journeyFlow(games, "won"),
    /aria-pressed="true" class="flow-won"/,
  );
});
test("map preserves all earlier positions and overlays recorded event identities and actual turn dates", () => {
  const s = fresh();
  s.count = 7;
  s.run = [{ id: 7, type: "river", left: 1, right: 1, rotated: false }];
  s.trailReports = {
    2: { title: "Bea has Typhoid", calamity: "typhoid", owner: 1, playedBy: 0 },
  };
  const before = structuredClone(s);
  const events = journeyMapEvents(s, {
    events: [
      {
        action: { type: "play" },
        turn: 12,
        player: 2,
        changes: [{ path: ["count"], value: 7 }],
      },
    ],
  });
  assert.equal(events.length, 8);
  assert.equal(events[1].kind, "unknown");
  assert.equal(events[2].title, "Bea has Typhoid");
  assert.equal(events[2].player, 0);
  assert.equal(events[7].kind, "river");
  assert.equal(events[7].turn, 12);
  assert.equal(events[7].player, 2);
  assert.deepEqual(s, before);
  s.stacks = [[{ id: 1, type: "trail", left: 1, right: 1, rotated: false }]];
  assert.equal(journeyMapEvents(s)[6].card.id, 1);
});
test("empty and long completed maps render start/end markers and escape recorded text", () => {
  const s = fresh();
  const art = Object.fromEntries(
    [
      "journeyMap",
      "outcomeSuccess",
      "outcomeFailure",
      "landscape",
      "independence",
      "victory",
      "defeat",
      "progressWagon",
      "tombstoneIcon",
      "trail",
      "river",
      "town",
      "fort",
      "calamity",
    ].map((k) => [k, k + ".webp"]),
  );
  const assets = { art, calamities: {}, portraits: ["", "", ""] };
  assert.equal(
    (journeyMap(s, assets).match(/data-map-marker /g) || []).length,
    2,
  );
  s.count = 50;
  s.status = "won";
  s.trailReports = {
    1: {
      title: "<script>bad</script>",
      results: ['<img onerror="bad">'],
      deaths: [],
      gains: {},
      losses: 0,
    },
  };
  const html = journeyMap(s, assets);
  assert.equal((html.match(/data-map-marker /g) || []).length, 52);
  assert.ok(!html.includes("<script>"));
  assert.ok(!html.includes("<img onerror="));
  assert.ok(html.includes("Oregon"));
  assert.ok(html.includes("map-outcome-won"));
  s.status = "lost";
  assert.ok(journeyMap(s, assets).includes("map-outcome-lost"));
  assert.ok(!/NaN|undefined/.test(html));
});

test("geographic trail runs from Independence in the east to Oregon City in the west", () => {
  const start = routePoint(0),
    end = routePoint(1);
  assert.ok(start.x > 1400 && start.y > 650);
  assert.ok(end.x < 200 && end.y < 300);
  assert.deepEqual(routePoint(-1), start);
  assert.deepEqual(routePoint(2), end);
});

test("multi-turn crossings retain each player's own rolls and results", async () => {
  const { GameHistory } = await import(historySource);
  const values = new Map();
  const h = new GameHistory(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    () => "2026-10-18T00:00:00Z",
    () => "river-test",
  );
  let random = 0.25;
  const g = new TrailGame(() => random);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.players[0].hand = [
    {
      id: 1000,
      type: "river",
      left: 1,
      right: 1,
      rotated: false,
      journeyStep: 1,
    },
  ];
  h.capture(g.state, { type: "start" });
  g.play(0);
  h.capture(g.state, { type: "play", args: { play: "0" } });
  random = 0.34;
  g.cross();
  h.capture(g.state, { type: "roll", rolls: [3] });
  random = 0.67;
  g.cross();
  h.capture(g.state, { type: "roll", rolls: [5] });
  random = 0.2;
  g.cross();
  h.capture(g.state, { type: "roll", rolls: [2] });
  const before = structuredClone(h.archive);
  const markers = journeyMapEvents(g.state, h.archive.games[0]).slice(1);
  const marker = markers[0];
  assert.deepEqual(
    markers.map((m) => m.turn),
    [1],
  );
  assert.equal(markers.length, 1);
  assert.deepEqual(
    markers.flatMap((m) => m.actions).map((a) => [a.turn, a.player, a.rolls]),
    [
      [1, 0, []],
      [1, 0, [3]],
      [2, 1, [5]],
      [3, 2, [2]],
    ],
  );
  assert.equal(marker.player, 0);
  assert.deepEqual(
    markers
      .flatMap((m) => m.actions)
      .filter((a) => a.type === "roll")
      .map(mapActionTone),
    ["negative", "negative", "positive"],
  );
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(
    g.state,
    { art, calamities: {}, portraits: [] },
    h.archive.games[0],
  );
  for (const face of [3, 5, 2]) assert.ok(html.includes(`Rolled ${face}`));
  assert.match(html, /map-event-die/);
  assert.deepEqual(h.archive, before);
});

test("remedies at the same stop keep chronological turns without adding travel dots", async () => {
  const { GameHistory } = await import(historySource);
  const values = new Map();
  const h = new GameHistory(
    {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    },
    () => "2026-10-18T00:00:00Z",
    () => "remedy-test",
  );
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.players[0].hand = [
    {
      id: 1000,
      type: "calamity",
      left: 1,
      right: 1,
      rotated: false,
      journeyStep: 1,
    },
  ];
  g.state.players[1].supplies = ["medicine"];
  g.state.players[2].supplies = ["water"];
  g.state.calamities = ["typhoid"];
  h.capture(g.state, { type: "start" });
  g.play(0);
  const hazard = g.state.hazards[0];
  hazard.trailStep = 1;
  h.capture(g.state, { type: "play", args: { play: "0" } });
  g.cure(hazard.id, "medicine");
  h.capture(g.state, {
    type: "cure",
    args: { cure: String(hazard.id), supply: "medicine" },
  });
  g.cure(hazard.id, "water");
  h.capture(g.state, {
    type: "cure",
    args: { cure: String(hazard.id), supply: "water" },
  });
  const markers = journeyMapEvents(g.state, h.archive.games[0]).slice(1);
  assert.equal(markers.length, 1);
  const actions = markers[0].actions;
  assert.deepEqual(
    actions.map((a) => a.player),
    [0, 1, 2],
  );
  assert.deepEqual(
    actions.map((a) => a.turn),
    [1, 2, 3],
  );
  assert.match(actions[1].action, /Medicine to Ada/);
  assert.match(actions[1].context, /first faced on turn 1/);
  assert.deepEqual(actions[1].supplies, [
    { player: 1, kind: "medicine", delta: -1 },
  ]);
  assert.deepEqual(actions[2].supplies, [
    { player: 2, kind: "water", delta: -1 },
  ]);
});

test("map importance preserves serious consequences while reducing repeated ordinary landmarks", () => {
  const events = Array.from({ length: 50 }, (_, i) => ({
    step: i + 1,
    title: "River crossing",
    kind: "river",
    actions: [],
    card: { deadly: false },
  }));
  events[9] = {
    ...events[9],
    kind: "trail",
    report: { deaths: [{ name: "Ada", cause: "Dysentery" }] },
  };
  events[10] = { ...events[10], kind: "oxen" };
  const important = importantMapSteps(events);
  assert.ok(important.has(10));
  assert.ok(important.has(11));
  assert.ok(important.size <= 8);
  assert.equal(
    importantMapSteps(
      events.map((e) => ({ ...e, kind: "trail", report: undefined })),
    ).size,
    0,
  );
});

test("inheritance stays attached to the death turn and separates recipients from returned supplies", async () => {
  const { GameHistory } = await import(historySource);
  const h = new GameHistory(
    { getItem: () => null, setItem() {} },
    () => "2026-10-18T00:00:00Z",
    () => "estate",
  );
  const g = new TrailGame(() => 0.25);
  g.reset(["Elias Reed", "Juniper Alder", "Cy"]);
  g.state.turn = 9;
  g.state.players[0].hand = [
    {
      id: 1000,
      type: "calamity",
      left: 1,
      right: 1,
      rotated: false,
      journeyStep: 1,
    },
  ];
  g.state.players[0].supplies = [
    "food",
    "water",
    "parts",
    "oxen",
    "oxen",
    "bullets",
  ];
  g.state.players[1].supplies = [];
  g.state.calamities = ["dysentery"];
  h.capture(g.state, { type: "start" });
  g.play(0);
  h.capture(g.state, { type: "play", args: { play: "0" } });
  assert.equal(g.state.phase, "legacy");
  g.will(4, 1);
  g.will(3, 1);
  g.closeWill();
  h.capture(g.state, { type: "will-supplies" });
  const actions = journeyMapEvents(g.state, h.archive.games[0])[1].actions;
  const estate = actions.find((a) => a.inheritance);
  assert.deepEqual(actions[0].deaths, [0]);
  assert.equal(actions[0].type, "play");
  assert.equal(actions[0].card.type, "calamity");
  assert.equal(estate.turn, 9);
  assert.equal(estate.player, 0);
  assert.deepEqual(estate.supplies, []);
  assert.deepEqual(estate.inheritance.received, [
    { player: 1, kind: "oxen", count: 2 },
  ]);
  assert.deepEqual(estate.inheritance.returned.map((s) => s.kind).sort(), [
    "bullets",
    "food",
    "parts",
    "water",
  ]);
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(
    g.state,
    { art, calamities: {}, portraits: ["", "", ""] },
    h.archive.games[0],
  );
  assert.match(html, /Juniper Alder inherited/);
  assert.match(html, /map-turn-badge/);
  assert.match(html, /map-event-card/);
  assert.match(html, /map-event-memorial/);
  assert.match(html, /tone-negative/);
  assert.match(html, /R.I.P./);
  assert.match(html, /Returned to the supply exchange/);
  assert.match(html, /timeline-supply-change gain/);
  assert.match(html, /timeline-supply-change loss/);
  assert.ok(!html.includes("Turn 10"));
});

test("each event has a trail anchor and detail connectors follow the route normal", async () => {
  const { routeNormal } = await import(
    compile("JourneyVisuals", {
      TrailCard: trail,
      Supplies: supplies,
      History: historySource,
    })
  );
  for (const progress of [0, 0.15, 0.45, 0.75, 1]) {
    const a = routePoint(progress - 0.001),
      b = routePoint(progress + 0.001);
    const n = routeNormal(progress);
    assert.ok(Math.abs(n.x * (b.x - a.x) + n.y * (b.y - a.y)) < 1e-8);
    assert.ok(Math.abs(Math.hypot(n.x, n.y) - 1) < 1e-8);
  }
  const s = fresh();
  s.count = 10;
  s.trailReports = { 4: { title: "Dead oxen", calamity: "oxen" } };
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(s, { art, calamities: {}, portraits: [] });
  assert.equal((html.match(/data-map-dot=/g) ?? []).length, 11);
  const lines = [
    ...html.matchAll(
      /class="map-event-connector" x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g,
    ),
  ];
  assert.ok(lines.length >= 3);
  assert.ok(
    lines.some(([, x1, , x2]) => Math.abs(Number(x1) - Number(x2)) > 1),
  );
});

test("event spacing varies deterministically without changing order or progress endpoints", () => {
  const points = Array.from({ length: 31 }, (_, step) =>
    eventRouteProgress(step, 30),
  );
  const gaps = points.slice(1).map((point, i) => point - points[i]);
  assert.equal(points[0], 0);
  assert.equal(points.at(-1), 30 / 50);
  assert.ok(gaps.every((gap) => gap > 0));
  assert.ok(Math.max(...gaps) / Math.min(...gaps) > 3);
  assert.equal(eventRouteProgress(12, 30), eventRouteProgress(12, 40));
  assert.equal(eventRouteProgress(50, 50), 1);
  assert.equal(eventRouteProgress(51, 50), 1);
});

test("map event colors reflect actual rolls and effects rather than wording", () => {
  const action = {
    turn: 1,
    player: 0,
    action: "Attempted a repair",
    text: ["A lucky repair"],
    rolls: [1],
    supplies: [],
    type: "repair",
  };
  assert.equal(mapActionTone(action), "negative");
  assert.equal(
    mapActionTone({ ...action, rolls: [4], text: ["The wheel was broken"] }),
    "positive",
  );
  assert.equal(
    mapActionTone({
      ...action,
      type: "play",
      rolls: [],
      card: { type: "calamity" },
    }),
    "negative",
  );
  assert.equal(
    mapActionTone({
      ...action,
      type: "cure",
      rolls: [],
      supplies: [{ player: 0, kind: "water", delta: -1 }],
    }),
    "positive",
  );
  assert.equal(
    mapActionTone({ ...action, type: "take", rolls: [] }),
    "positive",
  );
  assert.equal(
    mapActionTone({ ...action, type: "draw", rolls: [] }),
    "neutral",
  );
  assert.equal(
    mapActionTone({ ...action, rolls: [6], deaths: [1] }),
    "negative",
  );
});

test("turn 8 treatment follows turns 6 and 7 instead of rewriting the turn 5 calamity", async () => {
  const { GameHistory } = await import(historySource);
  const h = new GameHistory(
    { getItem: () => null, setItem() {} },
    () => "2026-10-18",
    () => "chronology",
  );
  const g = new TrailGame(() => 0.25);
  g.reset(["Bram Whitlow", "Ada", "Bea"]);
  g.state.turn = 5;
  let id = 1000;
  const card = (type) => ({
    id: id++,
    type,
    left: 1,
    right: 1,
    rotated: false,
  });
  g.state.players[0].hand = [card("calamity")];
  g.state.players[0].supplies = ["clothes"];
  g.state.players[1].hand = [card("trail"), card("trail")];
  g.state.players[2].hand = [card("trail"), card("trail")];
  g.state.calamities = ["cold"];
  h.capture(g.state, { type: "start" });
  assert.ok(g.play(0));
  const hazard = g.state.hazards[0];
  hazard.trailStep = 1;
  g.state.trailReports = {
    1: {
      title: "Bram Whitlow is suffering from extreme cold",
      calamity: "cold",
      owner: 0,
      playedBy: 0,
      card: { ...g.state.run[0] },
      results: ["Bram Whitlow is suffering from extreme cold."],
      gains: {},
      losses: 0,
      deaths: [],
    },
  };
  h.capture(g.state, { type: "play", args: { play: "0" } });
  for (let i = 0; i < 2; i++) {
    assert.ok(g.play(0));
    h.capture(g.state, { type: "play", args: { play: "0" } });
  }
  assert.equal(g.state.turn, 8);
  assert.ok(g.cure(hazard.id, "clothes"));
  g.state.trailReports[1].title = "Extreme cold remedied";
  g.state.trailReports[1].results.push(
    "Bram Whitlow no longer has extreme cold.",
  );
  h.capture(g.state, {
    type: "cure",
    args: { cure: String(hazard.id), supply: "clothes" },
  });
  for (let i = 0; i < 2; i++) {
    assert.ok(g.play(0));
    h.capture(g.state, { type: "play", args: { play: "0" } });
  }
  const before = structuredClone(h.archive);
  const events = journeyMapEvents(g.state, h.archive.games[0]).slice(1);
  assert.deepEqual(
    events.map((e) => e.turn),
    [5, 6, 7, 9, 10],
  );
  assert.equal(events.length, g.state.count);
  assert.deepEqual(
    events[2].actions.map((a) => a.turn),
    [7, 8],
  );
  assert.match(events[2].actions[1].context, /first faced on turn 5/);
  assert.equal(events[2].actions[1].type, "cure");
  assert.ok(!events[0].actions.some((a) => a.turn === 8));
  assert.ok(!JSON.stringify(events[0]).includes("remedied"));
  assert.ok(events.every((e, i) => !i || e.progress > events[i - 1].progress));
  assert.equal(events.at(-1).progress, g.state.count / 50);
  assert.deepEqual(h.archive, before);
});
