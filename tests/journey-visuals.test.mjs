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
  historySource = compile("History"),
  statsSource = compile("Stats"),
  flowsSource = compile("Flows", { Stats: statsSource });
const {
  flowCohorts,
  journeyMapEvents,
  journeyMap,
  journeyFlow,
  routePoint,
  eventRouteProgress,
  importantMapSteps,
  mapActionTone,
  routePath,
  oregonRoute,
  mapPlaybackTimeline,
  mapPlaybackClock,
  PLAYBACK_TOAST_GAP,
  playbackHold,
  mapTooltipPlacement,
  mapActionPresentation,
  groupSupplyActions,
} = await import(
  compile("JourneyVisuals", {
    TrailCard: trail,
    Supplies: supplies,
    History: historySource,
    Flows: flowsSource,
  })
);
const { TrailGame } = await import(trail);
function fresh() {
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  return g.state;
}
test("successive supply contributions become one event with all supplies and the final result", () => {
  const base = {
    turn: 4,
    day: 3,
    player: 0,
    type: "cure",
    action: "Gave Clean water to Bea",
    context: "Typhoid",
    text: ["Typhoid still needs treatment."],
    rolls: [],
    supplies: [{ player: 0, kind: "water", delta: -1 }],
  };
  const medicine = {
    ...base,
    action: "Gave Medicine to Bea",
    text: ["Bea recovered."],
    supplies: [{ player: 0, kind: "medicine", delta: -1 }],
  };
  const original = structuredClone([base, medicine]);
  const grouped = groupSupplyActions([base, medicine]);
  assert.equal(grouped.length, 1);
  assert.equal(grouped[0].action, "Gave Clean water and Medicine to Bea");
  assert.deepEqual(grouped[0].text, ["Bea recovered."]);
  assert.equal(grouped[0].supplies.length, 2);
  assert.deepEqual([base, medicine], original);
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const presentation = mapActionPresentation(grouped[0], fresh(), {
    art,
    calamities: {},
    portraits: [],
  });
  assert.equal(
    (presentation.action.match(/supply-change-bubble/g) ?? []).length,
    2,
  );
  assert.match(presentation.action, / and /);
  for (const changed of [
    { player: 1 },
    { turn: 5 },
    { day: 4 },
    { action: "Gave Medicine to Cy" },
    { context: "Cholera" },
  ]) {
    assert.equal(
      groupSupplyActions([base, { ...medicine, ...changed }]).length,
      2,
    );
  }
  const packed = {
    ...base,
    type: "take",
    action: "Packed Food",
    context: undefined,
    text: [],
    supplies: [{ player: 0, kind: "food", delta: 1 }],
  };
  const packs = groupSupplyActions([
    packed,
    packed,
    {
      ...packed,
      action: "Packed Medicine",
      supplies: [{ player: 0, kind: "medicine", delta: 1 }],
    },
  ]);
  assert.equal(packs.length, 1);
  assert.equal(packs[0].action, "Packed Food and Medicine");
  assert.equal(packs[0].supplies[0].delta, 2);
  assert.equal(
    groupSupplyActions([
      base,
      { ...base, type: "draw", supplies: [] },
      medicine,
    ]).length,
    3,
  );
});
test("personal event artwork identifies the affected traveller, not the acting player", () => {
  const s = fresh();
  s.count = 3;
  s.trailReports = {
    1: { title: "Bea has Measles", calamity: "measles", owner: 1, playedBy: 0 },
    2: { title: "Broken wheel", calamity: "wheel", owner: 0, playedBy: 0 },
    3: { title: "Cy has Typhoid", calamity: "typhoid", playedBy: 2 },
  };
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(s, {
    art,
    calamities: {
      measles: "measles.webp",
      wheel: "wheel.webp",
      typhoid: "typhoid.webp",
    },
    portraits: ["Ada-portrait", "Bea-portrait", "Cy-portrait"],
  });
  const cues = JSON.parse(
    html.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  assert.match(
    cues[1].content,
    /playback-event-subject[^]*aria-label="Bea"[^]*Bea-portrait/,
  );
  assert.match(cues[1].content, /src="measles.webp"/);
  assert.doesNotMatch(cues[1].content, /Ada-portrait/);
  assert.doesNotMatch(cues[2].content, /playback-event-subject/);
  assert.match(cues[3].content, /Cy-portrait/);
  assert.doesNotMatch(cues[0].content, /playback-event-subject/);
});
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
      Flows: flowsSource,
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
      /class="map-event-connector"[^>]* x1="([^"]+)" y1="([^"]+)" x2="([^"]+)" y2="([^"]+)"/g,
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

test("curved route passes through historic waypoints and uses the same geometry for anchors", () => {
  assert.equal((routePath.match(/C/g) ?? []).length, oregonRoute.length - 1);
  const sampled = Array.from({ length: 10001 }, (_, i) =>
    routePoint(i / 10000),
  );
  for (const waypoint of oregonRoute) {
    assert.ok(
      Math.min(
        ...sampled.map((p) => Math.hypot(p.x - waypoint.x, p.y - waypoint.y)),
      ) < 0.3,
    );
  }
  assert.deepEqual(routePoint(0), oregonRoute[0]);
  assert.deepEqual(routePoint(1), oregonRoute.at(-1));
  const s = fresh();
  s.count = 3;
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(s, { art, calamities: {}, portraits: [] });
  assert.ok(
    html.indexOf('<g class="map-connectors">') <
      html.indexOf('<g class="map-dots">'),
  );
  assert.ok(html.includes("data-map-play"));
});

test("tooltip placement clears the hovered image and favors the side away from the trail", () => {
  for (const screen of [
    { width: 1100, height: 800 },
    { width: 390, height: 600 },
  ]) {
    for (const y of [35, 280, screen.height - 50]) {
      const anchor = {
        left: screen.width / 2 - 20,
        right: screen.width / 2 + 20,
        top: y,
        bottom: y + 30,
      };
      const width = Math.min(400, screen.width - 24);
      const p = mapTooltipPlacement(anchor, width, 800, screen);
      assert.ok(
        p.top + p.height <= anchor.top ||
          p.top >= anchor.bottom ||
          p.left + width <= anchor.left ||
          p.left >= anchor.right,
      );
      assert.ok(p.left >= 12 && p.left + width <= screen.width - 12);
      assert.ok(p.top >= 12 && p.top + p.height <= screen.height - 12);
    }
  }
  const anchor = { left: 500, right: 540, top: 350, bottom: 390 };
  const p = mapTooltipPlacement(
    anchor,
    300,
    200,
    { width: 1100, height: 800 },
    Array.from({ length: 30 }, (_, i) => ({ x: 400 + i * 8, y: 450 })),
  );
  assert.ok(p.top + p.height < anchor.top);
});

test("playback keeps stationary actions at one stop and gives longer stays proportionate pauses", () => {
  const cues = [
    { step: 0, progress: 0, day: 1, hold: 1100 },
    { step: 1, progress: 0.1, day: 2, hold: 2400 },
    { step: 1, progress: 0.1, day: 5, hold: 2400 },
    { step: 2, progress: 0.2, day: 6, hold: 1100 },
  ];
  const before = structuredClone(cues);
  const t = mapPlaybackTimeline(cues);
  assert.equal(t[2].arrive, t[2].start);
  assert.ok(t[1].end - t[1].arrive > t[0].end - t[0].arrive);
  assert.ok(t.every((cue, i) => !i || cue.start === t[i - 1].end));
  assert.deepEqual(cues, before);
});

test("map action graphics belong to the matching action words and each supply delta appears once", () => {
  const s = fresh();
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const assets = { art, calamities: {}, portraits: [] };
  const action = {
    turn: 1,
    player: 0,
    type: "cure",
    action: "Gave Medicine to Bea",
    rolls: [],
    text: ["Bea recovered."],
    supplies: [{ player: 0, kind: "medicine", delta: -1 }],
  };
  const cure = mapActionPresentation(action, s, assets);
  assert.match(cure.action, /^gave <span class="map-inline-supply">/);
  assert.match(cure.action, / to Bea$/);
  assert.equal((cure.action.match(/supply-change-bubble/g) ?? []).length, 1);
  assert.equal(cure.results.join(""), "Bea recovered.");
  assert.deepEqual(
    mapActionPresentation(
      { ...action, text: ["Ada offered medicine."] },
      s,
      assets,
    ).results,
    [],
  );
  assert.deepEqual(
    mapActionPresentation(
      { ...action, text: ["Ada offered medicine. Bea recovered."] },
      s,
      assets,
    ).results,
    ["Bea recovered."],
  );
  const roll = mapActionPresentation(
    {
      ...action,
      type: "roll",
      action: "Attempted the crossing",
      rolls: [1],
      text: ["Ada lost food in the river."],
      supplies: [{ player: 0, kind: "food", delta: -1 }],
    },
    s,
    assets,
  );
  assert.match(
    roll.action,
    /rolled <span class="map-event-visual map-inline-dice">/,
  );
  assert.ok(!roll.action.includes("supply-change-bubble"));
  assert.match(roll.results[0], /Ada lost <span class="map-inline-supply">/);
  const trade = mapActionPresentation(
    {
      ...action,
      type: "trade",
      action: "Exchanged supplies",
      text: [],
      supplies: [
        { player: 0, kind: "food", delta: -1 },
        { player: 1, kind: "food", delta: 1 },
      ],
    },
    s,
    assets,
  );
  assert.equal((trade.action.match(/supply-change-bubble/g) ?? []).length, 2);
  assert.match(trade.action, /traded/);
  assert.match(trade.action, /gained/);
  const play = mapActionPresentation(
    {
      ...action,
      type: "play",
      action: "Played River crossing",
      card: { type: "river" },
      supplies: [],
      text: [],
    },
    s,
    assets,
  );
  assert.match(play.action, /^played <span class="map-inline-card">/);
});

test("map point titles prefer named settlements and specific calamities, including older recorded turns", async () => {
  const { GameHistory } = await import(historySource);
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.players[0].hand = [
    { id: 9000, type: "fort", left: 1, right: 1, rotated: false },
  ];
  const history = new GameHistory(
    { getItem: () => null, setItem() {} },
    () => "2026-10-20",
    () => "names",
  );
  history.capture(g.state, { type: "start" });
  assert.ok(g.play(0));
  history.capture(g.state, { type: "play", args: { play: "0" } });
  const state = structuredClone(g.state);
  state.run[0].locationName = "Fort Cottonwood";
  state.trailReports = {
    1: {
      title: "Fort",
      card: { ...state.run[0] },
      losses: 0,
      gains: {},
      deaths: [],
    },
  };
  const before = structuredClone(history.archive);
  const event = journeyMapEvents(state, history.archive.games[0])[1];
  assert.equal(event.title, "Fort Cottonwood");
  assert.equal(event.actions[0].action, "Played Fort Cottonwood");
  assert.equal(event.actions[0].card.locationName, "Fort Cottonwood");
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const map = journeyMap(
    state,
    { art, calamities: {}, portraits: [] },
    history.archive.games[0],
  );
  const cues = JSON.parse(
    map.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  const stop = cues.find((c) => c.step === 1);
  assert.ok(
    stop.toasts.some(
      (t) => t.html.includes("played") && t.html.includes("Fort Cottonwood"),
    ),
  );
  assert.ok(!stop.content.includes("played"));
  assert.equal(journeyMapEvents(state)[1].title, "Fort Cottonwood");
  state.run[0].type = "town";
  state.run[0].locationName = "Sparrow Ridge";
  state.trailReports[1] = {
    ...state.trailReports[1],
    title: "Town",
    card: { ...state.run[0] },
  };
  assert.equal(journeyMapEvents(state)[1].title, "Sparrow Ridge");
  state.trailReports[1] = {
    ...state.trailReports[1],
    title: "Calamity",
    card: { ...state.run[0], type: "calamity" },
    calamity: "typhoid",
  };
  assert.equal(journeyMapEvents(state)[1].title, "Typhoid");
  assert.deepEqual(history.archive, before);
});

test("playback travels through clear paths and pauses only for stops and stationary actions", () => {
  const event = {
    step: 1,
    title: "Quiet trail",
    kind: "trail",
    card: { type: "trail" },
    actions: [],
  };
  const action = {
    turn: 1,
    player: 0,
    type: "play",
    action: "Played Quiet trail",
    rolls: [],
    text: [],
    supplies: [],
  };
  assert.equal(playbackHold(event, action), 0);
  assert.equal(
    playbackHold(
      { ...event, kind: "typhoid", card: { type: "calamity" } },
      action,
    ),
    0,
  );
  assert.ok(
    playbackHold({ ...event, kind: "town", card: { type: "town" } }, action) >
      0,
  );
  const river = playbackHold(
    { ...event, kind: "river", card: { type: "river" } },
    action,
  );
  const broken = playbackHold(
    { ...event, kind: "wheel", card: { type: "calamity" } },
    action,
  );
  assert.ok(river > 0 && river < broken);
  assert.ok(playbackHold(event, { ...action, type: "draw" }) > 0);
  const timeline = mapPlaybackTimeline([
    { step: 0, progress: 0, day: 1, hold: 0 },
    { step: 1, progress: 0.1, day: 2, hold: 0 },
    { step: 2, progress: 0.2, day: 3, hold: 0 },
  ]);
  assert.ok(timeline.every((cue) => cue.end === cue.arrive));
  assert.equal(timeline[2].start, timeline[1].arrive);
  const s = fresh();
  s.count = 3;
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(s, { art, calamities: {}, portraits: [] });
  const cues = JSON.parse(
    html.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  assert.ok(
    cues.every(
      (c) =>
        !c.content.includes("map-turn-history") &&
        !c.content.includes("map-timeline-entry"),
    ),
  );
  assert.ok(cues.every((c) => c.content.includes("map-playback-event")));
  assert.ok(html.includes('src="progressWagon.webp" alt="The wagon"'));
});

test("playback clock is monotonic across actions, days, seeking and completion", () => {
  const timeline = mapPlaybackTimeline([
    { step: 0, progress: 0, day: 1, hold: 800 },
    { step: 1, progress: 0.1, day: 1, hold: 1000 },
    { step: 1, progress: 0.1, day: 2, hold: 2000 },
    { step: 2, progress: 0.2, day: 4, hold: 0 },
  ]);
  assert.ok(timeline.at(-1).end > 20000);
  let last = 0;
  for (let elapsed = 0; elapsed <= timeline.at(-1).end; elapsed += 100) {
    const clock = mapPlaybackClock(timeline, elapsed);
    assert.ok(clock.minute >= last);
    assert.match(clock.time, /^\d{1,2}:\d{2} (am|pm)$/);
    last = clock.minute;
  }
  assert.equal(mapPlaybackClock(timeline, timeline.at(-1).end).day, 4);
  assert.equal(mapPlaybackClock(timeline, 0).time, "8:00 am");
  for (const cue of timeline.filter((c) => c.hold > 0))
    assert.equal(mapPlaybackClock(timeline, cue.arrive).day, cue.day);
  assert.equal(mapPlaybackClock([], 0).time, "8:00 am");
});

test("playback separates title/art state cards from action toasts and chooses matching marker art", () => {
  const s = fresh();
  s.count = 3;
  s.status = "lost";
  const card = (id, type, locationName) => ({
    id,
    type,
    locationName,
    left: 1,
    right: 1,
    rotated: false,
  });
  s.trailReports = {
    1: { title: "Fort", card: card(1, "fort", "Fort Sparrow") },
    2: { title: "Town", card: card(2, "town", "Sparrow Ridge") },
    3: { title: "Broken wheel", calamity: "wheel", card: card(3, "calamity") },
  };
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(s, { art, calamities: {}, portraits: [] });
  const cues = JSON.parse(
    html.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  assert.equal(cues.find((c) => c.step === 1).marker, "mapFort.webp");
  assert.equal(cues.find((c) => c.step === 2).marker, "mapTown.webp");
  assert.equal(cues.find((c) => c.step === 3).marker, "mapStopped.webp");
  assert.equal(cues.at(-1).marker, "mapLost.webp");
  for (const cue of cues) {
    assert.ok(cue.content.includes("<h4>"));
    assert.ok(cue.content.includes("playback-event-art"));
    assert.ok(
      !cue.content.includes("map-event-heading") &&
        !cue.content.includes("<p>"),
    );
  }
  assert.ok(html.includes("data-map-seek"));
  assert.ok(html.includes("data-map-duration"));
});

test("river attempts group under one map date but retain distinct recorded turns", async () => {
  const { GameHistory, replayGame } = await import(historySource);
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.players[0].hand = [
    { id: 9000, type: "river", left: 1, right: 1, rotated: false },
  ];
  const h = new GameHistory(
    { getItem: () => null, setItem() {} },
    () => "2026-10-25",
    () => "river-day",
  );
  h.capture(g.state, { type: "start" });
  assert.ok(g.play(0));
  h.capture(g.state, { type: "play", args: { play: "0" } });
  for (const random of [0.4, 0.7, 0.3]) {
    g.random = () => random;
    assert.ok(g.cross());
    h.capture(g.state, { type: "roll", rolls: [g.state.die] });
  }
  assert.deepEqual(
    h.archive.games[0].events.map((e) => e.day),
    [1, 1, 1, 1],
  );
  assert.deepEqual(replayGame(h.archive.games[0]), g.state);
  const events = journeyMapEvents(g.state, h.archive.games[0]);
  const crossing = events.find((e) => e.card?.type === "river");
  assert.deepEqual(
    crossing.actions.map((a) => a.day),
    [1, 1, 1, 1],
  );
  assert.deepEqual(
    crossing.actions.map((a) => a.turn),
    [1, 1, 2, 3],
  );
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(
    g.state,
    { art, calamities: {}, portraits: [] },
    h.archive.games[0],
  );
  assert.ok(html.includes("map-stop-river"));
  assert.ok(html.includes("River crossing"));
  assert.ok(html.includes("Calamity"));
  assert.ok(!html.includes("Event connection"));
  const cues = JSON.parse(
    html.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  assert.ok(
    cues.filter((c) => c.step === crossing.step).every((c) => c.day === 1),
  );
  const timeline = mapPlaybackTimeline(cues);
  const times = timeline.flatMap((c) => c.toastTimes);
  assert.ok(
    times.every((at, i) => !i || at - times[i - 1] >= PLAYBACK_TOAST_GAP),
  );
  const many = mapPlaybackTimeline(
    Array.from({ length: 200 }, (_, i) => ({
      step: 1,
      progress: 0.1,
      day: 1,
      hold: 850,
      content: "",
      toasts: [{ html: "a", label: "a", tone: "neutral" }],
    })),
  );
  assert.equal(mapPlaybackClock(many, many.at(-1).end).day, 1);
});

test("multiple toast recipients at one stop receive separate presentation times", () => {
  const toast = { html: "a", label: "a", tone: "neutral" };
  const timeline = mapPlaybackTimeline([
    { step: 0, progress: 0, day: 1, hold: 0, toasts: [toast, toast, toast] },
    { step: 1, progress: 0.01, day: 1, hold: 0, toasts: [toast] },
    { step: 2, progress: 0.01, day: 1, hold: 2800, toasts: [] },
  ]);
  const times = timeline.flatMap((c) => c.toastTimes);
  assert.equal(times.length, 4);
  assert.ok(
    times.every((at, i) => !i || at - times[i - 1] >= PLAYBACK_TOAST_GAP),
  );
  assert.ok(timeline.at(-1).end > times.at(-1));
});
