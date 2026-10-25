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
  mapPlaybackProgress,
  mapPlaybackClock,
  PLAYBACK_TOAST_GAP,
  playbackHold,
  mapTooltipPlacement,
  mapActionPresentation,
  groupSupplyActions,
  playbackToasts,
  mapPlayerProfile,
  playbackPartySummary,
  playbackPlayerStates,
  mapResultText,
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
test("map tooltip dates and action times use the recorded calendar and playback schedule", async () => {
  const { GameHistory } = await import(historySource);
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.startDate = "1847-04-12";
  g.state.players[0].hand = [
    { id: 9987, type: "river", left: 1, right: 1, rotated: false },
  ];
  const h = new GameHistory({ getItem: () => null, setItem() {} });
  h.capture(g.state, { type: "start" });
  g.play(0);
  h.capture(g.state, { type: "play", args: { play: "0" } });
  for (const [random, face] of [
    [0.4, 3],
    [0.7, 5],
    [0.3, 2],
  ]) {
    g.random = () => random;
    assert.ok(g.cross());
    h.capture(g.state, { type: "roll", rolls: [face] });
  }
  g.state.players[g.state.current].hand = [];
  h.capture(g.state, { type: "setup-test-hand" });
  assert.ok(g.draw());
  h.capture(g.state, { type: "draw" });
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const html = journeyMap(
    { ...g.state, startDate: "1847-04-01" },
    { art, calamities: {}, portraits: [] },
    h.archive.games[0],
  );
  const decode = (text) =>
    text
      .replaceAll("&quot;", '"')
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&#39;", "'")
      .replaceAll("&amp;", "&");
  const content = [...html.matchAll(/data-map-content="([^"]*)"/g)]
    .map((m) => decode(m[1]))
    .find((t) => t.includes("attempted the flowing river crossing"));
  assert.ok(content);
  assert.match(content, /datetime="1847-04-12"/);
  assert.match(content, /datetime="1847-04-13"/);
  assert.doesNotMatch(
    content,
    /Apr 1, 1847|Turn [1-9]|next traveller|Finished giving supplies/,
  );
  assert.equal((content.match(/datetime="1847-04-12"/g) ?? []).length, 1);
  assert.match(content, /Day 1/);
  assert.match(content, /Day 2/);
  const cues = JSON.parse(
    html.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  const schedule = mapPlaybackTimeline(cues);
  const times = [...content.matchAll(/class="map-action-time">([^<]*)</g)].map(
    (m) => m[1],
  );
  assert.deepEqual(
    times,
    schedule
      .filter((c) => c.step === 1 && c.toasts?.length)
      .map((c) => mapPlaybackClock(schedule, c.arrive).time),
  );
  assert.ok(
    schedule
      .filter((c) => c.step === 1)
      .slice(0, 4)
      .every((c) => c.day === 1 && c.date === "Apr 12, 1847"),
  );
});
test("settlements keep the wagon stopped through later player actions until another card is played", async () => {
  const { GameHistory } = await import(historySource);
  for (const type of ["town", "fort"]) {
    const g = new TrailGame(() => 0.25);
    g.reset(["Ada", "Bea", "Cy"]);
    g.state.shop.water = 10;
    g.state.players[0].hand = [
      { id: 9999, type, left: 1, right: 1, rotated: false },
    ];
    const history = new GameHistory({ getItem: () => null, setItem() {} });
    history.capture(g.state, { type: "start" });
    assert.ok(g.play(0));
    history.capture(g.state, { type: "play", args: { play: "0" } });
    while (g.state.phase === type) {
      assert.ok(g.takeSupply("water"));
      history.capture(g.state, { type: "take", args: { take: "water" } });
    }
    g.state.players[g.state.current].hand = [];
    history.capture(g.state, { type: "setup-test-hand" });
    assert.ok(g.draw());
    history.capture(g.state, { type: "draw" });
    const events = journeyMapEvents(g.state, history.archive.games[0]);
    const actions = events.flatMap((e) => e.actions);
    for (const action of actions) {
      assert.equal(action.wagonState, "settlement");
      assert.equal(action.wagonAfter, "settlement");
      assert.ok(playbackHold(events[1], action) > 0);
    }
    g.state.players[g.state.current].hand = [
      { id: 9998, type: "trail", left: 1, right: 1, rotated: false },
    ];
    history.capture(g.state, { type: "setup-test-hand" });
    assert.ok(g.play(0));
    history.capture(g.state, { type: "play", args: { play: "0" } });
    const departure = journeyMapEvents(g.state, history.archive.games[0])
      .at(-1)
      .actions.at(-1);
    assert.equal(departure.wagonState, "travel");
    assert.equal(departure.wagonAfter, "travel");
  }
});
test("roster status snapshots preserve health, treatment needs, and deaths at each action", () => {
  const state = fresh();
  const healthy = playbackPlayerStates(state);
  state.hazards = [
    {
      id: 90,
      kind: "typhoid",
      owner: 0,
      needs: { water: 1, medicine: 1 },
      rounds: 1,
      skip: 0,
      waiting: [0, 1, 2],
      born: 1,
    },
  ];
  const ill = playbackPlayerStates(state);
  assert.match(
    ill[0].join(" "),
    /Typhoid.*1 clean water and 1 medicine.*1 round/,
  );
  assert.match(healthy[0][0], /In good health/);
  assert.match(ill[1][0], /In good health/);
  state.players[0].alive = false;
  state.players[0].deathCause = "Typhoid";
  state.players[0].deathDate = "1847-04-03";
  state.players[0].epitaph = "Rest easy.";
  const dead = playbackPlayerStates(state);
  assert.deepEqual(dead[0], ["Died of Typhoid on Apr 3, 1847.", "Rest easy."]);
  assert.match(ill[0][0], /Typhoid/);
  assert.doesNotMatch(ill[0].join(" "), /Died/);
});
test("playback ending labels summarize the travellers' actual outcome", () => {
  const state = fresh();
  assert.equal(playbackPartySummary(state), "3 travellers still on the trail");
  state.status = "won";
  assert.equal(playbackPartySummary(state), "3 travellers reached Oregon");
  state.players[0].alive = false;
  state.players[1].alive = false;
  assert.equal(playbackPartySummary(state), "1 traveller reached Oregon");
  state.status = "lost";
  assert.equal(
    playbackPartySummary(state),
    "1 traveller survived. The wagon could go no farther.",
  );
  state.players[2].alive = false;
  assert.equal(playbackPartySummary(state), "Everyone died");
});
test("theft and successive player actions each have a distinct window without stopping travel", () => {
  const toast = (label) => ({ html: label, label, tone: "neutral" });
  const timeline = mapPlaybackTimeline([
    { step: 0, progress: 0, day: 1, hold: 0 },
    {
      step: 1,
      progress: 0.1,
      day: 2,
      hold: 0,
      player: 0,
      toasts: [toast("Ada lost food to a thief")],
    },
    {
      step: 1,
      progress: 0.1,
      day: 3,
      hold: 0,
      player: 1,
      toasts: [toast("Bea gave clean water")],
    },
    {
      step: 2,
      progress: 0.2,
      day: 4,
      hold: 2300,
      toasts: [toast("Wagon broke down")],
    },
  ]);
  for (const cue of timeline.filter((c) => c.toasts?.length)) {
    assert.ok(cue.end - cue.arrive >= PLAYBACK_TOAST_GAP);
    assert.ok(cue.toastTimes.every((at) => at >= cue.arrive && at < cue.end));
  }
  assert.ok(timeline[1].end <= timeline[2].arrive);
  const theft = timeline[1].arrive + 1000;
  const water = timeline[2].arrive + 1000;
  assert.equal(timeline.find((c) => theft < c.end).player, 0);
  assert.equal(timeline.find((c) => water < c.end).player, 1);
  assert.ok(
    mapPlaybackProgress(timeline, water) > mapPlaybackProgress(timeline, theft),
  );
  const stop = timeline[3];
  assert.equal(mapPlaybackProgress(timeline, stop.arrive + 1000), 0.2);
});
test("repair results immediately change the playback wagon icon while retaining the stop pause", async () => {
  const { GameHistory } = await import(historySource);
  for (const success of [false, true]) {
    const g = new TrailGame(() => (success ? 0.7 : 0.1));
    g.reset(["Ada", "Bea", "Cy"]);
    g.state.count = 1;
    g.state.run = [
      {
        id: 9990,
        type: "calamity",
        left: 1,
        right: 1,
        rotated: false,
        journeyStep: 1,
      },
    ];
    g.state.pending = "axle";
    g.state.phase = "repair";
    const history = new GameHistory({ getItem: () => null, setItem() {} });
    history.capture(g.state, { type: "start" });
    assert.ok(g.repair());
    history.capture(g.state, { type: "repair", rolls: [success ? 5 : 1] });
    const event = journeyMapEvents(g.state, history.archive.games[0])[1];
    const action = event.actions[0];
    assert.equal(action.wagonState, "broken");
    assert.equal(action.wagonAfter, success ? "travel" : "broken");
    const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
    const html = journeyMap(
      g.state,
      { art, calamities: {}, portraits: [] },
      history.archive.games[0],
    );
    const cues = JSON.parse(
      html.match(
        /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
      )[1],
    );
    const cue = cues.find((c) =>
      c.toasts?.some((t) => t.html.includes("attempted a repair")),
    );
    assert.equal(
      cue.marker,
      success ? "progressWagon.webp" : "mapStopped.webp",
    );
    assert.ok(cue.hold > 0);
  }
});
test("roll outcomes appear once while additional consequences remain", () => {
  const assets = { art: {}, calamities: {}, portraits: [] };
  const action = {
    day: 1,
    turn: 1,
    player: 0,
    type: "repair",
    action: "Attempted a repair",
    text: [
      "Broken axle: the repair failed. Supply one spare part within one round or the journey ends.",
    ],
    rolls: [2],
    supplies: [],
  };
  for (const [type, roll, text, outcome] of [
    ["repair", 2, action.text[0], "repair failed"],
    [
      "repair",
      4,
      "Broken axle: a lucky repair. The wagon can carry on.",
      "repaired",
    ],
    [
      "roll",
      3,
      "The crossing fails. The next traveller must try their luck.",
      "crossing failed",
    ],
    ["roll", 2, "The crossing succeeds. You reached the far bank.", "crossed"],
  ]) {
    const a = { ...action, type, rolls: [roll], text: [text] };
    const presentation = mapActionPresentation(a, fresh(), assets);
    assert.deepEqual(presentation.results, []);
    const toast = playbackToasts(a, fresh(), assets)[0].html;
    assert.equal(toast.split(outcome).length - 1, 1);
  }
  const loss = {
    ...action,
    type: "roll",
    rolls: [1],
    text: ["The crossing fails. Ada lost food in the river."],
    supplies: [{ player: 0, kind: "food", delta: -1 }],
  };
  assert.match(playbackToasts(loss, fresh(), assets)[0].html, /in the river/);
});
test("map river events use their river intensity, risk, and matching artwork", () => {
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const assets = {
    art,
    calamities: {},
    portraits: [],
    rivers: { moderate: "flowing.webp", raging: "raging.webp" },
  };
  for (const deadly of [false, true]) {
    const state = fresh();
    state.count = 1;
    const card = {
      id: 9980,
      type: "river",
      deadly,
      left: 1,
      right: 1,
      rotated: false,
      journeyStep: 1,
    };
    state.run = [card];
    const title = deadly ? "Raging river crossing" : "Flowing river crossing";
    assert.equal(journeyMapEvents(state)[1].title, title);
    const html = journeyMap(state, assets);
    const cues = JSON.parse(
      html.match(
        /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
      )[1],
    );
    assert.equal(cues[1].image, deadly ? "raging.webp" : "flowing.webp");
    const action = {
      day: 1,
      turn: 1,
      player: 0,
      type: "play",
      card,
      action: "Played River crossing",
      text: [],
      rolls: [],
      supplies: [],
    };
    const played = playbackToasts(action, state, assets)[0].html;
    assert.ok(
      played.includes(deadly ? "risk of drowning" : "risk of supply loss"),
    );
    assert.ok(played.includes(deadly ? "raging.webp" : "flowing.webp"));
    const rolled = playbackToasts(
      { ...action, type: "roll", rolls: [3] },
      state,
      assets,
    )[0].html;
    assert.ok(
      rolled.includes(
        deadly ? "raging river crossing" : "flowing river crossing",
      ),
    );
    assert.match(rolled, /crossing failed/);
  }
});
test("map results are factual summaries without instructions or next-action prompts", () => {
  const examples = [
    [
      "The wagon needs a repair. Try your luck after continuing.",
      "The wagon needs a repair.",
    ],
    [
      "Ada has typhoid. Supply water AND medicine before the round ends, or Ada dies.",
      "Ada has typhoid.",
    ],
    [
      "Ada has measles and must miss one turn. Medicine cures it; a second measles card kills Ada.",
      "Ada has measles.",
    ],
    [
      "Ada lost food in the river. The next traveller must try to cross.",
      "Ada lost food in the river.",
    ],
    [
      "Broken axle: the repair failed. Supply one spare part within one round or the journey ends.",
      "Broken axle: the repair failed.",
    ],
    [
      "Wagon stopped; replace the oxen before the round ends or everyone loses.",
      "The wagon stopped.",
    ],
    [
      "Only a town removes this. A second grass card kills the oxen.",
      "The oxen lack grazing.",
    ],
    [
      "Ada died of Dysentery. Their remaining supplies may be willed to companions.",
      "Ada died of Dysentery.",
    ],
  ];
  for (const [text, expected] of examples)
    assert.equal(mapResultText(text), expected);
  const action = {
    day: 1,
    turn: 1,
    player: 0,
    type: "play",
    card: { type: "calamity" },
    calamity: "axle",
    action: "Played Calamity",
    text: [examples[0][0]],
    rolls: [],
    supplies: [],
  };
  const assets = { art: {}, calamities: {}, portraits: [] };
  const result = mapActionPresentation(action, fresh(), assets);
  assert.match(result.action, /^played a /);
  assert.deepEqual(result.results, [examples[0][1]]);
  const toast = playbackToasts(action, fresh(), assets)[0];
  assert.match(toast.html, /Broken axle[^]*The wagon needs a repair/);
  assert.doesNotMatch(toast.html + toast.label, /Try your luck/);
});
test("map actions reveal the pulled calamity and playback includes action outcomes", async () => {
  const { GameHistory } = await import(historySource);
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.calamities = ["measles"];
  g.state.players[0].hand = [
    { id: 9999, type: "calamity", left: 1, right: 1, rotated: false },
  ];
  const history = new GameHistory({ getItem: () => null, setItem() {} });
  history.capture(g.state, { type: "start" });
  assert.ok(g.play(0));
  history.capture(g.state, { type: "play", args: { play: "0" } });
  const action = journeyMapEvents(g.state, history.archive.games[0])[1]
    .actions[0];
  assert.equal(action.calamity, "measles");
  const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const assets = {
    art,
    calamities: { measles: "measles.webp" },
    portraits: [],
  };
  assert.match(
    mapActionPresentation(action, g.state, assets).action,
    /measles.webp[^]*Measles/,
  );
  assert.match(playbackToasts(action, g.state, assets)[0].html, /Measles/);
  const cure = {
    ...action,
    type: "cure",
    calamity: undefined,
    action: "Gave Medicine to Ada",
    text: ["Ada recovered from measles."],
    supplies: [{ player: 0, kind: "medicine", delta: -1 }],
  };
  const toast = playbackToasts(cure, g.state, assets)[0].html;
  assert.match(toast, /Ada recovered from measles/);
  assert.equal((toast.match(/supply-change-bubble/g) ?? []).length, 1);
  const roll = {
    ...action,
    type: "roll",
    calamity: undefined,
    action: "Attempted the crossing",
    text: ["Ada lost food in the river."],
    rolls: [1],
    supplies: [{ player: 0, kind: "food", delta: -1 }],
  };
  const result = playbackToasts(roll, g.state, assets)[0].html;
  assert.match(result, /crossing failed/);
  assert.match(result, /in the river/);
  assert.equal((result.match(/supply-change-bubble/g) ?? []).length, 1);
});
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
  assert.ok(marker.actions.every((a) => a.wagonState === "river"));
  const rosterArt = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
  const map = journeyMap(
    g.state,
    { art: rosterArt, calamities: {}, portraits: ["Ada", "Bea", "Cy"] },
    h.archive.games[0],
  );
  const cues = JSON.parse(
    map.match(
      /<script type="application\/json" data-map-cues>([^]*?)<\/script>/,
    )[1],
  );
  assert.deepEqual(
    cues.filter((c) => c.step === 1).map((c) => c.player),
    [0, 0, 1, 2],
  );
  assert.ok(
    cues.filter((c) => c.step === 1).every((c) => c.living.length === 3),
  );
  assert.equal((map.match(/data-playback-player="/g) ?? []).length, 3);
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
  assert.match(actions[1].context, /first faced on day 1/);
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
  assert.match(events[2].actions[1].context, /first faced on day 1/);
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

test("map point titles use recorded settlement names and specific calamities", async () => {
  const { GameHistory } = await import(historySource);
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  g.state.players[0].hand = [
    {
      id: 9000,
      type: "fort",
      locationName: "Fort Cottonwood",
      left: 1,
      right: 1,
      rotated: false,
    },
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

test("recorded map artwork retains descriptive calamity titles", async () => {
  const { GameHistory } = await import(historySource);
  for (const [kind, title] of [
    ["thief", "A thief stole from Ada"],
    ["measles", "Ada has Measles"],
    ["hunting", "Ada went hunting"],
  ]) {
    const g = new TrailGame(() => 0.25);
    g.reset(["Ada", "Bea", "Cy"]);
    g.state.players[0].hand = [{ id: 9000, type: "calamity", left: 1, right: 1, rotated: false }];
    g.state.calamities = [kind];
    const history = new GameHistory({ getItem: () => null, setItem() {} });
    history.capture(g.state, { type: "start" });
    assert.ok(g.play(0));
    g.state.trailReports = { 1: { title, calamity: kind, card: { ...g.state.run[0] } } };
    history.capture(g.state, { type: "play", args: { play: "0" } });
    assert.equal(journeyMapEvents(g.state, history.archive.games[0])[1].title, title);
    const art = new Proxy({}, { get: (_, key) => `${String(key)}.webp` });
    const map = journeyMap(g.state, { art, calamities: {}, portraits: [] }, history.archive.games[0]);
    const cues = JSON.parse(map.match(/<script type="application\/json" data-map-cues>([^]*?)<\/script>/)[1]);
    assert.equal(cues.find((cue) => cue.step === 1).title, title);
  }
});

test("playback pauses for wagon states independently of player actions", () => {
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
  assert.equal(playbackHold(event, { ...action, type: "draw" }), 0);
  for (const type of [
    "play",
    "draw",
    "skip",
    "cure",
    "trade",
    "take",
    "will-supplies",
  ]) {
    assert.equal(
      playbackHold(event, { ...action, type, wagonState: "travel" }),
      0,
    );
    assert.equal(
      playbackHold(event, { ...action, type, wagonState: "broken" }),
      2300,
    );
    assert.equal(
      playbackHold(event, { ...action, type, wagonState: "river" }),
      850,
    );
    assert.equal(
      playbackHold(event, { ...action, type, wagonState: "settlement" }),
      1800,
    );
  }
  assert.equal(
    playbackHold(
      { ...event, kind: "wheel" },
      { ...action, type: "skip", wagonState: "travel" },
    ),
    0,
  );
  assert.equal(
    playbackHold(event, { ...action, deaths: [1], wagonState: "travel" }),
    4200,
  );
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


test("compact map profiles show graphical health, card stacks and counted supplies", () => {
  const g = new TrailGame(() => 0.25);
  g.reset(["Ada", "Bea", "Cy"]);
  const assets = { art: { trail: "trail.webp", tombstoneIcon: "grave.webp" }, portraits: ["portrait"], calamities: { arm: "arm.webp" } };
  g.state.players[0].supplies = ["water", "water", "medicine"];
  const healthy = mapPlayerProfile(g.state, 0, assets);
  assert.match(healthy, /map-profile-card-stack/);
  assert.match(healthy, /is-healthy/);
  assert.match(healthy, /data-supply-kind="water"/);
  assert.match(healthy, /supply-count">2</);
  g.state.hazards = [{ id: 1, kind: "arm", owner: 0, skip: 2, rounds: 2, needs: {} }];
  const injured = mapPlayerProfile(g.state, 0, assets);
  assert.match(injured, /arm.webp/);
  assert.match(injured, /2 turns to heal/);
  assert.doesNotMatch(injured, /is-healthy/);
  g.state.players[0].alive = false;
  g.state.players[0].deathCause = "Dysentery";
  g.state.players[0].epitaph = "Took the scenic route. Forever.";
  g.state.players[0].deathDate = "1847-04-12";
  g.state.players[0].deathDay = 11;
  const dead = mapPlayerProfile(g.state, 0, assets);
  assert.match(dead, /grave.webp/);
  assert.match(dead, /Dysentery/);
  assert.match(dead, /Took the scenic route. Forever./);
  assert.match(dead, /Apr 12, 1847/);
  assert.match(dead, /11 days on the trail/);
  assert.match(dead, /memorial-dates/);
  assert.doesNotMatch(dead, /<\/strong><\/div><small>/, "no unrelated snapshot date below the player name");
  assert.doesNotMatch(dead, /map-profile-inventory/);
});
