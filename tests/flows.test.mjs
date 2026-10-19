import { test } from "node:test";
import assert from "node:assert/strict";
import { loadTypeScript } from "../scripts/load-typescript.mjs";
const { buildFlowGraph, renderJourneyFlow } = await loadTypeScript(
  new URL("../Flows.ts", import.meta.url),
);
const { journeyLossCause, canonicalCause } = await loadTypeScript(
  new URL("../Stats.ts", import.meta.url),
);
const person = (alive, cause) => ({
  name: "Ada",
  alive,
  deathCause: cause,
  hand: [],
  supplies: [],
  epitaph: "",
});
function game(outcome, days, lossReason, players = [person(true)]) {
  return {
    id: `${outcome}-${days}`,
    outcome,
    days,
    distance: days,
    lossReason,
    players,
    survivors: players.filter((p) => p.alive).length,
    simulated: false,
    startedAt: "2026-10-18",
    partial: false,
  };
}
const games = [
  game("won", 50, undefined, [person(true), person(true)]),
  game("lost", 19, "Broken wheel", [person(true), person(false, "Cholera")]),
  game("lost", 29, "Drowning", [
    person(false, "drowned crossing the river"),
    person(false, "a second measles card"),
  ]),
  game("travel", 10),
  game("abandoned", 9),
];
test("loss cause uses the recorded journey-ending event and normalizes old illness wording", () => {
  assert.equal(canonicalCause("a second cholera card"), "Cholera");
  assert.equal(
    journeyLossCause({
      status: "lost",
      note: "The wagon cannot continue: broken wheel went unremedied.",
      players: [person(true)],
    }),
    "Broken wheel",
  );
  assert.equal(
    journeyLossCause({
      status: "lost",
      note: "Ada died: drowned crossing the river.",
      players: [person(false)],
    }),
    "Drowning",
  );
  assert.equal(
    journeyLossCause({
      status: "lost",
      note: "",
      players: [person(false, "Cholera")],
    }),
    "No survivors · cause unrecorded",
  );
  assert.equal(journeyLossCause({ status: "won", players: [] }), undefined);
});
test("lost journeys branch to actual causes without counting a journey twice", () => {
  const graph = buildFlowGraph(games);
  assert.equal(graph.total, 5);
  assert.equal(graph.nodes.find((n) => n.id === "outcome-lost").count, 2);
  assert.deepEqual(
    graph.nodes
      .filter((n) => n.id.startsWith("loss-"))
      .map((n) => [n.label, n.count]),
    [
      ["Broken wheel", 1],
      ["Drowning", 1],
    ],
  );
});
test("player fates distinguish deaths, Oregon survivors, and survivors of a stopped wagon", () => {
  const graph = buildFlowGraph(games, "players");
  assert.equal(graph.total, 8);
  assert.equal(graph.nodes.find((n) => n.id === "fate-Died").count, 3);
  assert.equal(
    graph.nodes.find((n) => n.id === "fate-Alive when the wagon stopped").count,
    1,
  );
  assert.equal(
    graph.nodes.find((n) => n.id === "fate-Reached Oregon alive").count,
    2,
  );
  assert.equal(graph.nodes.find((n) => n.id === "death-Measles").count, 1);
});
test("day batches stop at the observed outcome and retain unfinished journeys as unfinished", () => {
  const graph = buildFlowGraph(games, "days");
  assert.equal(graph.dayStep, 10);
  assert.equal(graph.nodes.find((n) => n.id === "day-1").count, 4);
  assert.equal(graph.nodes.find((n) => n.id === "day-2").count, 2);
  assert.equal(graph.nodes.find((n) => n.id === "end-1-travel").count, 1);
  assert.equal(graph.nodes.find((n) => n.id === "end-0-abandoned").count, 1);
});
test("all flow views conserve counts at every internal node and move forward only", () => {
  for (const mode of ["journeys", "players", "days"]) {
    const g = buildFlowGraph(games, mode);
    for (const n of g.nodes) {
      const incoming = g.links
          .filter((l) => l.target === n.id)
          .reduce((sum, l) => sum + l.count, 0),
        outgoing = g.links
          .filter((l) => l.source === n.id)
          .reduce((sum, l) => sum + l.count, 0);
      if (n.layer) assert.equal(incoming, n.count, `${mode}: ${n.id}`);
      if (outgoing) assert.equal(outgoing, n.count, `${mode}: ${n.id}`);
    }
    for (const l of g.links)
      assert.ok(
        g.nodes.find((n) => n.id === l.source).layer <
          g.nodes.find((n) => n.id === l.target).layer,
      );
    assert.ok(!/NaN|Infinity/.test(renderJourneyFlow(games, "all", mode)));
  }
});
test("completed journeys stay below earlier progress outcomes rather than crossing over them", () => {
  const html = renderJourneyFlow(games);
  const y = (id) =>
    Number(
      html.match(
        new RegExp(`data-flow-node="${id}"[^]*?<rect x="[^"]+" y="([^"]+)"`),
      )[1],
    );
  assert.ok(y("outcome-won") > y("outcome-lost"));
  assert.ok(y("outcome-lost") > y("outcome-travel"));
  assert.ok(y("outcome-travel") > y("outcome-abandoned"));
});
