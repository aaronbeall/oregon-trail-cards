import {
  titles,
  names as supplyNames,
  type Supply,
  label,
  calendarDate,
  journeyDate,
  journeyDay,
  type Journey,
  type TrailReport,
  type TrailCard,
  type Calamity,
} from "./TrailCard";
import { replayGame, type RecordedGame } from "./History";
import type { JourneySummary, Outcome } from "./Stats";
import { supplyEmblem } from "./Supplies";
import { renderJourneyFlow, type FlowMode } from "./Flows";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
export function flowCohorts(games: JourneySummary[]) {
  const groups = new Map<
    string,
    { stage: number; outcome: Outcome; count: number }
  >();
  for (const game of games) {
    const stage = Math.min(5, Math.floor(game.distance / 10));
    const key = `${stage}:${game.outcome}`;
    const group = groups.get(key) ?? { stage, outcome: game.outcome, count: 0 };
    group.count++;
    groups.set(key, group);
  }
  return [...groups.values()].sort(
    (a, b) => a.stage - b.stage || a.outcome.localeCompare(b.outcome),
  );
}
export function journeyFlow(
  games: JourneySummary[],
  selected: Outcome | "all" = "all",
  mode: FlowMode = "journeys",
) {
  return renderJourneyFlow(games, selected, mode);
}
export type MapAction = {
  playerStatesAfter?: string[][];
  livingAfter?: number[];
  calamity?: Calamity;
  wagonState?: "travel" | "broken" | "river" | "settlement";
  wagonAfter?: "travel" | "broken" | "river" | "settlement";
  turn: number;
  day: number;
  player: number;
  action: string;
  type?: string;
  card?: TrailCard;
  deaths?: number[];
  context?: string;
  text: string[];
  rolls: number[];
  supplies: { player: number; kind: Supply; delta: number }[];
  inheritance?: {
    deceased: number;
    received: { player: number; kind: Supply; count: number }[];
    returned: { kind: Supply; count: number }[];
    linkedToDeath: boolean;
  };
};
export type MapEvent = {
  step: number;
  title: string;
  kind: string;
  card?: TrailCard;
  report?: TrailReport;
  turn?: number;
  day?: number;
  player?: number;
  actions: MapAction[];
  trailStep?: number;
  progress?: number;
  artKind?: string;
};
type RecordedMapAction = {
  action: MapAction;
  count: number;
  report?: TrailReport;
  artKind?: string;
};
function playbackWagonState(
  state: Journey,
): NonNullable<MapAction["wagonState"]> {
  const phase = state.phase === "legacy" ? state.resume : state.phase;
  if (phase === "river") return "river";
  if (
    phase === "repair" ||
    state.hazards.some((h) =>
      ["axle", "tongue", "wheel", "oxen"].includes(h.kind),
    )
  )
    return "broken";
  if (
    phase === "town" ||
    phase === "fort" ||
    ["town", "fort"].includes(state.run.at(-1)?.type ?? "")
  )
    return "settlement";
  return "travel";
}
const sharedConditions = new Set([
  "axle",
  "tongue",
  "wheel",
  "oxen",
  "water",
  "grass",
]);
export function playbackPlayerStates(state: Journey) {
  return state.players.map((player, index) => {
    if (!player.alive)
      return [
        `Died of ${player.deathCause ?? "unknown causes"}${player.deathDate ? ` on ${calendarDate(player.deathDate)}` : ""}.`,
        player.epitaph,
      ].filter(Boolean);
    const conditions = state.hazards.filter(
      (h) => h.owner === index && !sharedConditions.has(h.kind),
    );
    return [
      ...(conditions.length
        ? conditions.map((h) => {
            const needs = Object.entries(h.needs)
              .filter(([, n]) => n! > 0)
              .map(
                ([kind, n]) =>
                  `${n} ${supplyNames[kind as Supply].toLowerCase()}`,
              );
            return `${titles[h.kind]}.${h.skip > 0 ? ` Resting for ${h.skip} more turn${h.skip === 1 ? "" : "s"}.` : ""}${needs.length ? ` Needs ${needs.join(" and ")}.` : ""}${h.rounds !== null ? ` ${h.rounds} round${h.rounds === 1 ? "" : "s"} remaining.` : ""}`;
          })
        : ["In good health."]),
      `${player.hand.length} trail card${player.hand.length === 1 ? "" : "s"} and ${player.supplies.length} supplies.`,
    ];
  });
}
function rosterTooltip(
  name: string,
  portrait: string,
  states: string[],
  when: string,
) {
  return `<div class="map-roster-tooltip"><div class="map-event-heading">${portrait}<strong>${esc(name)}</strong></div><small>${esc(when)}</small>${states.map((text) => `<p>${esc(text)}</p>`).join("")}</div>`;
}
function namedMapCard(state: Journey, card?: TrailCard, step?: number) {
  const recorded =
    step === undefined ? undefined : state.trailReports?.[step]?.card;
  card ??= recorded;
  if (!card || card.locationName || !["town", "fort"].includes(card.type))
    return card;
  return card;
}
function specificMapTitle(
  state: Journey,
  card?: TrailCard,
  report?: TrailReport,
  step?: number,
) {
  const named = namedMapCard(state, card ?? report?.card, step);
  if (named?.type === "river")
    return named.deadly ? "Raging river crossing" : "Flowing river crossing";
  if (named?.locationName && ["town", "fort"].includes(named.type))
    return named.locationName;
  const generic = ["Town", "Fort", "Calamity", "Trail card played"];
  if (report?.title && !generic.includes(report.title)) return report.title;
  return report?.calamity
    ? titles[report.calamity]
    : named
      ? label(named)
      : (report?.title ?? "Earlier trail");
}
export function journeyMapEvents(
  state: Journey,
  record?: RecordedGame,
): MapEvent[] {
  const timing = new Map<
    number,
    { turn: number; day: number; player: number }
  >();
  const actions = new Map<number, MapAction[]>();
  const chronological: RecordedMapAction[] = [];
  const deaths = new Map<
    number,
    { step: number; turn: number; day: number; player: number }
  >();
  let previous = record?.initial;
  for (const event of record?.events ?? []) {
    const eventDay = event.day;
    const count = event.changes.find(
      (c) => c.path.length === 1 && c.path[0] === "count" && "value" in c,
    );
    if (
      event.action.type === "play" &&
      count &&
      "value" in count &&
      typeof count.value === "number"
    )
      timing.set(count.value, {
        turn: event.turn,
        day: eventDay,
        player: event.player,
      });
    if (!previous || !record) continue;
    const next = replayGame({ ...record, initial: previous, events: [event] });
    const args = event.action.args ?? {},
      type = event.action.type;
    const hazard = previous.hazards.find(
      (h) => h.id === Number(args.cure ?? args.town),
    );
    let step =
      type === "play" && next.count > previous.count
        ? next.count
        : (hazard?.trailStep ??
          previous.run.at(-1)?.journeyStep ??
          previous.count);
    next.players.forEach((person, index) => {
      if (!previous!.players[index].alive || person.alive) return;
      const cause = previous!.hazards.find(
        (h) =>
          h.owner === index &&
          person.deathCause
            ?.toLowerCase()
            .includes(titles[h.kind].toLowerCase()),
      );
      deaths.set(index, {
        step: cause?.trailStep ?? step,
        turn: event.turn,
        day: eventDay,
        player: event.player,
      });
    });
    const deceased = type === "will-supplies" ? previous.deaths[0] : undefined;
    const death = deceased === undefined ? undefined : deaths.get(deceased);
    if (death) step = death.step;
    if (
      [
        "play",
        "roll",
        "repair",
        "cure",
        "town",
        "take",
        "draw",
        "skip",
        "end",
        "leave",
        "trade",
        "will-supplies",
      ].includes(type)
    ) {
      const who = previous.players[event.player]?.name ?? "Traveller";
      let action =
        type === "play"
          ? "Played a trail card"
          : type === "roll"
            ? "Attempted the crossing"
            : type === "repair"
              ? "Attempted a repair"
              : type === "cure"
                ? `Gave ${supplyNames[args.supply as Supply] ?? "a supply"}${hazard && !sharedConditions.has(hazard.kind) ? ` to ${previous.players[hazard.owner].name}` : " to the wagon"}`
                : type === "town"
                  ? `Town remedied ${hazard ? titles[hazard.kind] : "a condition"}`
                  : type === "take"
                    ? `Packed ${supplyNames[args.take as Supply] ?? "a supply"}`
                    : type === "draw"
                      ? "Drew a trail card"
                      : type === "skip"
                        ? "Rested this turn"
                        : type === "end"
                          ? "Finished giving supplies"
                          : type === "leave"
                            ? "Left the settlement"
                            : type === "trade"
                              ? "Exchanged supplies"
                              : "Willed supplies";
      let calamity: Calamity | undefined;
      if (type === "play") {
        const card = namedMapCard(
          state,
          previous.players[event.player]?.hand[Number(args.play)],
          next.count,
        );
        if (card) action = `Played ${label(card)}`;
        if (card?.type === "calamity") {
          const pool = previous.calamities.length
            ? previous.calamities
            : previous.discarded;
          calamity =
            next.trailReports?.[step]?.calamity ??
            (previous.calamities.length
              ? pool[0]
              : pool.find(
                  (kind) =>
                    pool.filter((k) => k === kind).length >
                    next.calamities.filter((k) => k === kind).length,
                ));
        }
      }
      const beforeResults = previous.trailReports?.[step]?.results ?? [];
      let text = (next.trailReports?.[step]?.results ?? []).slice(
        beforeResults.length,
      );
      if (
        !text.length &&
        ![
          "take",
          "draw",
          "skip",
          "end",
          "leave",
          "trade",
          "will-supplies",
        ].includes(type) &&
        next.note !== previous.note
      )
        text = [next.note];
      if (type === "draw") {
        const drawn = next.players[event.player].hand.find(
          (c) =>
            !previous!.players[event.player].hand.some(
              (old) => old.id === c.id,
            ),
        );
        text = [
          drawn
            ? `${who} drew ${label(drawn)} for a later turn.`
            : "No cards remained to draw.",
        ];
      }
      if (type === "cure" && hazard && !text.length)
        text = [
          next.hazards.some((h) => h.id === hazard.id)
            ? `${titles[hazard.kind]} still needs treatment.`
            : `${sharedConditions.has(hazard.kind) ? "The wagon" : previous.players[hazard.owner].name} recovered from ${titles[hazard.kind].toLowerCase()}.`,
        ];
      next.players.forEach((p, i) => {
        if (
          previous!.players[i].alive &&
          !p.alive &&
          !text.some((t) => t.includes(p.name) && /died|drown/i.test(t))
        )
          text.push(`${p.name} died of ${p.deathCause ?? "unknown causes"}.`);
      });
      const supplies: MapAction["supplies"] = [];
      next.players.forEach((p, i) => {
        for (const kind of Object.keys(supplyNames) as Supply[]) {
          const delta =
            p.supplies.filter((k) => k === kind).length -
            previous!.players[i].supplies.filter((k) => k === kind).length;
          if (delta) supplies.push({ player: i, kind, delta });
        }
      });
      let inheritance: MapAction["inheritance"];
      if (deceased !== undefined) {
        const received = supplies
          .filter((s) => s.player !== deceased && s.delta > 0)
          .map((s) => ({ player: s.player, kind: s.kind, count: s.delta }));
        const returned = (Object.keys(supplyNames) as Supply[]).flatMap(
          (kind) => {
            const count =
              previous!.players[deceased].supplies.filter((s) => s === kind)
                .length -
              received
                .filter((s) => s.kind === kind)
                .reduce((sum, s) => sum + s.count, 0);
            return count > 0 ? [{ kind, count }] : [];
          },
        );
        inheritance = { deceased, received, returned, linkedToDeath: !!death };
        supplies.length = 0;
        text = [];
      }
      const list = actions.get(step) ?? [];
      list.push({
        playerStatesAfter: playbackPlayerStates(next),
        livingAfter: next.players.flatMap((p, index) =>
          p.alive ? [index] : [],
        ),
        calamity,
        wagonState: playbackWagonState(type === "play" ? next : previous),
        wagonAfter: playbackWagonState(next),
        turn: death?.turn ?? event.turn,
        day: death?.day ?? eventDay,
        player: death?.player ?? event.player,
        action,
        type,
        context: hazard
          ? `${titles[hazard.kind]}${timing.get(hazard.trailStep ?? -1)?.day ? ` first faced on day ${timing.get(hazard.trailStep!)!.day}` : hazard.trailStep ? ` first faced at trail card ${hazard.trailStep}` : ""}.`
          : undefined,
        card:
          type === "play"
            ? namedMapCard(
                state,
                previous.players[event.player]?.hand[Number(args.play)],
                next.count,
              )
            : type === "roll"
              ? previous.run.at(-1)
              : type === "draw"
                ? next.players[event.player].hand.find(
                    (c) =>
                      !previous!.players[event.player].hand.some(
                        (old) => old.id === c.id,
                      ),
                  )
                : undefined,
        deaths: next.players.flatMap((p, index) =>
          previous!.players[index].alive && !p.alive ? [index] : [],
        ),
        text: [...new Set(text)],
        rolls: event.action.rolls ?? [],
        supplies,
        inheritance,
      });
      actions.set(step, list);
      chronological.push({
        action: list.at(-1)!,
        count: next.count,
        report: next.trailReports?.[step],
        artKind:
          hazard?.kind ??
          (type === "repair" ? (previous.pending ?? undefined) : undefined),
      });
    }
    previous = next;
  }
  if (record?.initial && chronological.length) {
    return chronologicalMapEvents(state, record.initial, chronological);
  }
  const cards = new Map<number, TrailCard>(),
    preserved = [...state.stacks.flat(), ...state.run];
  preserved.forEach((card, i) =>
    cards.set(card.journeyStep ?? state.count - preserved.length + i + 1, card),
  );
  const events = Array.from({ length: state.count }, (_, i) => {
    const step = i + 1,
      report = state.trailReports?.[step],
      card = namedMapCard(state, report?.card ?? cards.get(step), step),
      time = timing.get(step);
    return {
      step,
      title: specificMapTitle(state, card, report, step),
      kind: report?.calamity ?? card?.type ?? "unknown",
      card,
      report,
      turn: time?.turn,
      day: time?.day,
      player: report?.playedBy ?? time?.player,
      actions: actions.get(step) ?? [],
    };
  });
  // Draws or supply turns before the first card belong to Independence.
  return [
    {
      step: 0,
      title: "Independence",
      kind: "start",
      actions: actions.get(0) ?? [],
    },
    ...events,
  ];
}

/** A dot marks forward travel; intervening turns stay at the wagon's current stop. */
function chronologicalMapEvents(
  state: Journey,
  initial: Journey,
  entries: RecordedMapAction[],
): MapEvent[] {
  const events = journeyMapEvents(initial);
  const groups: RecordedMapAction[][] = [];
  for (const entry of entries) {
    const action = entry.action;
    // An estate is a consequence of its death, rather than the next player's turn.
    const prior = action.inheritance?.linkedToDeath
      ? groups.find(
          (g) =>
            g[0].action.turn === action.turn &&
            g[0].action.player === action.player,
        )
      : groups.at(-1);
    if (
      prior &&
      (action.inheritance?.linkedToDeath || prior[0].count === entry.count)
    )
      prior.push(entry);
    else groups.push([entry]);
  }
  for (const group of groups) {
    const first = group[0],
      actions = group.map((e) => e.action);
    const main =
      group.find((e) => e.action.type === "play") ??
      [...group]
        .reverse()
        .find(
          (e) =>
            !["end", "leave", "will-supplies"].includes(e.action.type ?? ""),
        ) ??
      first;
    const action = main.action;
    const count = Math.max(...group.map((e) => e.count));
    const existing = events.find((e) => (e.trailStep ?? e.step) === count);
    if (existing) {
      existing.actions.push(...actions);
      if (existing.report)
        existing.report = {
          ...existing.report,
          deaths: [
            ...(existing.report.deaths ?? []),
            ...actions
              .flatMap((a) => a.deaths ?? [])
              .map((index) => ({
                name: state.players[index].name,
                cause: state.players[index].deathCause ?? "unknown causes",
              })),
          ],
        };
      continue;
    }
    const isRemedy = action.type === "cure" || action.type === "town";
    const report = [...group].reverse().find((e) => e.report)?.report;
    const deaths = actions
      .flatMap((a) => a.deaths ?? [])
      .map((index) => ({
        name: state.players[index].name,
        cause: state.players[index].deathCause ?? "unknown causes",
      }));
    const kind = isRemedy
      ? "remedy"
      : action.type === "roll"
        ? "river"
        : action.type === "repair"
          ? "repair"
          : action.type === "play"
            ? (action.calamity ??
              main.report?.calamity ??
              action.card?.type ??
              "unknown")
            : (action.type ?? "unknown");
    const title = isRemedy
      ? action.action
      : action.type === "roll"
        ? action.rolls.at(-1)! % 2 === 0
          ? "River crossing succeeded"
          : "River crossing failed"
        : action.type === "repair"
          ? action.rolls.at(-1)! >= 4
            ? "Repair succeeded"
            : "Repair failed"
          : action.type === "play"
            ? action.calamity
              ? titles[action.calamity]
              : specificMapTitle(state, action.card, main.report, count)
            : action.action;
    events.push({
      step: events.length,
      trailStep: count,
      title,
      kind,
      artKind:
        main.artKind ??
        (isRemedy || kind === "repair" ? main.report?.calamity : undefined),
      card: action.card,
      report: report ? { ...report, deaths } : undefined,
      turn: first.action.turn,
      day: first.action.day,
      player: first.action.player,
      actions,
    });
  }
  for (const event of events) {
    event.progress = eventRouteProgress(
      event.trailStep ?? event.step,
      state.count,
    );
  }
  return events;
}

// Approximate main historic corridor, projected into the generated north-up atlas extent.
const routeWaypoints = [
  [-94.415, 39.091],
  [-96.67, 39.76],
  [-99, 40.65],
  [-101.2, 41.08],
  [-103.35, 41.7],
  [-104.56, 42.2],
  [-107.13, 42.49],
  [-108.9, 42.37],
  [-110.39, 41.32],
  [-111.6, 42.65],
  [-112.65, 43.03],
  [-114.8, 42.8],
  [-116.8, 43.82],
  [-117.83, 44.77],
  [-118.47, 45.3],
  [-121.18, 45.6],
  [-121.74, 45.3],
  [-122.6, 45.36],
];
const project = ([lon, lat]: number[]) => ({
  x: ((lon + 126) / 34) * 1600,
  y: ((49 - lat) / 13) * 900,
});
export const oregonRoute = routeWaypoints.map(project);
// Catmull–Rom controls keep the route passing through each geographic waypoint.
const routeSegments = oregonRoute.slice(0, -1).map((from, i) => {
  const before = oregonRoute[Math.max(0, i - 1)];
  const to = oregonRoute[i + 1];
  const after = oregonRoute[Math.min(oregonRoute.length - 1, i + 2)];
  return {
    from,
    to,
    c1: {
      x: from.x + (to.x - before.x) / 6,
      y: from.y + (to.y - before.y) / 6,
    },
    c2: { x: to.x - (after.x - from.x) / 6, y: to.y - (after.y - from.y) / 6 },
  };
});
export const routePath =
  `M${oregonRoute[0].x} ${oregonRoute[0].y} ` +
  routeSegments
    .map(({ c1, c2, to }) => `C${c1.x} ${c1.y},${c2.x} ${c2.y},${to.x} ${to.y}`)
    .join(" ");
const routeSamples = [{ ...oregonRoute[0], distance: 0 }];
for (const { from, c1, c2, to } of routeSegments) {
  for (let i = 1; i <= 40; i++) {
    const t = i / 40,
      u = 1 - t;
    const x =
      u * u * u * from.x +
      3 * u * u * t * c1.x +
      3 * u * t * t * c2.x +
      t * t * t * to.x;
    const y =
      u * u * u * from.y +
      3 * u * u * t * c1.y +
      3 * u * t * t * c2.y +
      t * t * t * to.y;
    const previous = routeSamples.at(-1)!;
    routeSamples.push({
      x,
      y,
      distance: previous.distance + Math.hypot(x - previous.x, y - previous.y),
    });
  }
}
export function routePoint(progress: number) {
  const distance =
    Math.max(0, Math.min(1, progress)) * routeSamples.at(-1)!.distance;
  const index = routeSamples.findIndex((p) => p.distance >= distance);
  const to = routeSamples[Math.max(0, index)],
    from = routeSamples[Math.max(0, index - 1)];
  const t = (distance - from.distance) / (to.distance - from.distance || 1);
  return { x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t };
}
/** Stable uneven spacing, preserving order and the exact current endpoint. */
export function eventRouteProgress(step: number, count: number) {
  if (step <= 0) return 0;
  if (step >= count) return Math.min(1, count / 50);
  const noise = Math.sin(step * 127.1 + 311.7) * 43758.5453;
  const jitter = ((noise - Math.floor(noise)) * 2 - 1) * 0.4;
  return Math.max(0, Math.min(1, (step + jitter) / 50));
}
/** Unit normal in map coordinates, sampled locally to soften waypoint corners. */
export function routeNormal(progress: number) {
  const before = routePoint(progress - 0.001);
  const after = routePoint(progress + 0.001);
  const dx = after.x - before.x,
    dy = after.y - before.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: -dy / length, y: dx / length };
}
/** Prioritize consequences and scarce landmarks; avoid a row of repeated illustrations. */
export function importantMapSteps(events: MapEvent[]) {
  const score = (e: MapEvent) => {
    if (
      e.report?.deaths?.length ||
      e.actions.some((a) => a.text.some((t) => /died|drowned/.test(t)))
    )
      return 100;
    if (
      ["oxen", "axle", "wheel", "tongue", "snake", "dysentery"].includes(e.kind)
    )
      return 90;
    if (e.kind === "river" && e.card?.deadly) return 80;
    if (
      ["typhoid", "cholera", "starvation", "cold", "measles"].includes(e.kind)
    )
      return 65;
    if (e.kind === "river")
      return (
        45 +
        Math.min(
          20,
          e.actions.filter((a) => a.action.includes("crossing")).length * 4,
        )
      );
    if (e.kind === "remedy" || e.kind === "repair") return 55;
    if (e.kind === "town" || e.kind === "fort") return 45;
    return 0;
  };
  const candidates = events
    .filter((e) => e.kind !== "start")
    .map((e) => ({ step: e.step, score: score(e) }))
    .sort((a, b) => b.score - a.score || a.step - b.step);
  const selected = new Set(
    candidates.filter((c) => c.score >= 90).map((c) => c.step),
  );
  const budget = Math.min(8, Math.max(3, Math.ceil(events.length / 6)));
  const gap = events.length > 20 ? 4 : 2;
  for (const candidate of candidates) {
    if (selected.size >= budget) break;
    if (
      candidate.score < 45 ||
      [...selected].some((step) => Math.abs(step - candidate.step) < gap)
    )
      continue;
    selected.add(candidate.step);
  }
  return selected;
}
type MapArt = {
  landscape: string;
  independence: string;
  victory: string;
  defeat: string;
  progressWagon: string;
  mapFort?: string;
  mapTown?: string;
  mapStopped?: string;
  mapLost?: string;
  tombstoneIcon: string;
  tombstone?: string;
  trail: string;
  river: string;
  town: string;
  fort: string;
  calamity: string;
  journeyMap: string;
  outcomeSuccess: string;
  outcomeFailure: string;
};
export type MapAssets = {
  rivers?: { moderate: string; raging: string };
  art: MapArt;
  calamities: Record<string, string>;
  portraits: string[];
};
function mapRiverArt(card: TrailCard | undefined, assets: MapAssets) {
  return (
    (card?.deadly ? assets.rivers?.raging : assets.rivers?.moderate) ??
    assets.art.river
  );
}
function mapSupplyChange(kind: Supply, delta: number) {
  const change = delta > 0 ? "gain" : "loss";
  return `<span class="timeline-supply-change ${change}">${supplyEmblem(kind, Math.abs(delta), true, change)}</span>`;
}
function inheritanceHistory(
  estate: NonNullable<MapAction["inheritance"]>,
  state: Journey,
  assets: MapAssets,
) {
  const recipients = [...new Set(estate.received.map((s) => s.player))];
  return `<div class="map-inheritance"><div class="map-event-heading"><span class="map-event-visual">${mapEventVisual({ type: "estate", rolls: [] }, assets)}</span><strong>${esc(state.players[estate.deceased]?.name ?? "Traveller")}’s remaining supplies</strong></div>${recipients
    .map(
      (player) =>
        `<section class="map-inheritance-group"><div class="map-inheritance-recipient">${assets.portraits[player] ?? ""}<strong>${esc(state.players[player]?.name ?? "Traveller")} inherited</strong><span class="map-inline-changes">${estate.received
          .filter((s) => s.player === player)
          .map((s) => mapSupplyChange(s.kind, s.count))
          .join("")}</span></div></section>`,
    )
    .join(
      "",
    )}${estate.returned.length ? `<section class="map-inheritance-group"><div class="map-inheritance-recipient"><strong>Returned to the supply exchange</strong><span class="map-inline-changes">${estate.returned.map((s) => mapSupplyChange(s.kind, -s.count)).join("")}</span></div></section>` : ""}${!recipients.length && !estate.returned.length ? `<p>No supplies remained.</p>` : ""}</div>`;
}
function mapEventVisual(
  action: Pick<MapAction, "type" | "card" | "rolls">,
  assets: MapAssets,
) {
  if (action.rolls.length) {
    const pips: Record<number, number[]> = {
      1: [4],
      2: [0, 8],
      3: [0, 4, 8],
      4: [0, 2, 6, 8],
      5: [0, 2, 4, 6, 8],
      6: [0, 2, 3, 5, 6, 8],
    };
    return action.rolls
      .map(
        (face) =>
          `<svg class="map-event-die" viewBox="0 0 44 44" role="img" aria-label="Rolled ${face}"><path d="M7 14 16 6H38L29 14Z" fill="#f6e9c7"/><path d="M29 14 38 6V28L29 36Z" fill="#9c8c68"/><rect x="7" y="14" width="22" height="22" rx="2" fill="#e9d8ae"/>${(pips[face] ?? []).map((i) => `<circle cx="${12 + (i % 3) * 6}" cy="${19 + Math.floor(i / 3) * 6}" r="1.7" fill="#4b513e"/>`).join("")}</svg>`,
      )
      .join("");
  }
  if (action.type === "play" || action.type === "draw") {
    const kind = action.card?.type ?? "trail";
    const image =
      kind === "river"
        ? mapRiverArt(action.card, assets)
        : kind === "calamity"
          ? assets.art.calamity
          : kind === "town"
            ? assets.art.town
            : kind === "fort"
              ? assets.art.fort
              : assets.art.trail;
    return `<span class="map-event-card" role="img" aria-label="${esc(action.card ? label(action.card) : "Trail card")}"><img src="${image}" alt=""><span></span></span>`;
  }
  const drawings: Record<string, string> = {
    cure: '<path d="M9 3h6v4l3 3v10H6V10l3-3ZM9 14h6m-3-3v6"/>',
    town: '<path d="M3 21V10l9-7 9 7v11ZM9 21v-8h6v8"/>',
    take: '<path d="M4 8h16v13H4ZM8 8V4h8v4m-4 4v6m-3-3h6"/>',
    trade: '<path d="M3 8h17l-4-4M21 16H4l4 4"/>',
    skip: '<path d="M18 4a8 8 0 1 0 2 12A8 8 0 0 1 18 4Z"/>',
    leave: '<path d="M10 4H4v16h6m0-8h11m-5-5 5 5-5 5"/>',
    death: '<path d="M6 21V9a6 6 0 0 1 12 0v12ZM12 7v8m-3-5h6"/>',
    end: '<path d="m5 12 4 4L19 6M5 21h14"/>',
    estate:
      '<path d="M3 10h18v11H3Zm9 0v11M2 7h20v3H2Zm10 0C5 7 5 1 8 2c3 0 4 5 4 5s1-5 4-5c3-1 3 5-4 5Z"/>',
  };
  return `<svg class="map-event-symbol" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${drawings[action.type ?? "end"] ?? drawings.end}</svg>`;
}
function mapGravestone(index: number, state: Journey, assets: MapAssets) {
  const person = state.players[index];
  return `<div class="memorial map-event-memorial" aria-label="Gravestone for ${esc(person.name)}"><div class="memorial-stone"><img class="memorial-template" src="${assets.art.tombstone ?? assets.art.tombstoneIcon}" alt=""><div class="memorial-inscription"><span class="memorial-rip">R.I.P.</span><h3>${esc(person.name)}</h3><div class="memorial-dates">${person.birthday ? calendarDate(person.birthday) : "?"} — ${person.deathDate ? calendarDate(person.deathDate) : "?"}${person.deathDay !== undefined ? `<small>${person.deathDay} days on the trail</small>` : ""}</div><p class="memorial-epitaph">${esc(person.epitaph || person.deathCause || "The prairie remembers.")}</p></div></div></div>`;
}
export function mapActionTone(
  action: MapAction,
): "positive" | "negative" | "neutral" {
  if (action.deaths?.length || action.type === "death") return "negative";
  if (action.type === "play" && action.card?.type === "calamity")
    return "negative";
  const roll = action.rolls.at(-1);
  if (roll !== undefined && action.type === "repair")
    return roll >= 4 ? "positive" : "negative";
  if (roll !== undefined && action.type === "roll")
    return roll % 2 === 0 ? "positive" : "negative";
  if (["cure", "town", "take"].includes(action.type ?? "")) return "positive";
  if (
    action.type === "play" &&
    action.card &&
    ["trail", "town", "fort"].includes(action.card.type)
  )
    return "positive";
  if (action.type === "trade" || action.type === "draw") return "neutral";
  if (
    action.supplies.some((s) => s.delta < 0) &&
    !action.supplies.some((s) => s.delta > 0)
  )
    return "negative";
  if (action.supplies.some((s) => s.delta > 0)) return "positive";
  return "neutral";
}
/** Map history describes what happened, without prompts or rules for the next move. */
export function mapResultText(text: string) {
  return text
    .replace(/ and must miss one turn/gi, "")
    .replace(/Wagon stopped;[^.]*\./gi, "The wagon stopped.")
    .replace(/Clean water cures this\./gi, "The water is unsafe.")
    .replace(/Only a town removes this\./gi, "The oxen lack grazing.")
    .replace(/a lucky repair\./gi, "the repair succeeded.")
    .replace(
      /The town has pasture to spare\. The oxen fill their bellies, and one Inadequate Grass condition is removed from the wagon\./gi,
      "The oxen found fresh grazing. Inadequate grass cleared.",
    )
    .replace(
      /This wagon condition is no longer active\./gi,
      "The wagon is ready to roll again.",
    )
    .replace(/The wagon politely carries on\./gi, "The wagon continues.")
    .replace(/A thief struck while (.+?) was minding the wagon\.\s*/gi, "")
    .split(/(?<=[.!?])\s+/)
    .filter(
      (sentence) =>
        !/^(?:Try |Supply |Give |Choose |Pick |Click |Press |Continue\b|Pass (?:the|to) |Put the kettle|The next traveller|Their remaining supplies|A second (?:bad-water|grass) card|It can be played|Your turn is over|(?:Two medicine cards|Medicine) cure|Bullets stay|The wheels have reconsidered|Even the oxen)/i.test(
          sentence,
        ),
    )
    .filter(
      (sentence) =>
        !/\b(?:a second .+ card kills|must miss .+ turns?, then recovers)\b/i.test(
          sentence,
        ),
    )
    .join(" ")
    .trim();
}
/** Keep each graphic beside the words it illustrates; supply deltas appear once. */
export function mapActionPresentation(
  a: MapAction,
  state: Journey,
  assets: MapAssets,
) {
  const used = new Set<number>();
  const supply = (index: number, withOwner = false) => {
    used.add(index);
    const change = a.supplies[index];
    return `<span class="map-inline-supply">${mapSupplyChange(change.kind, change.delta)}${withOwner && change.player !== a.player ? `<small>${esc(state.players[change.player]?.name ?? "Traveller")}</small>` : ""}</span>`;
  };
  const decorate = (text: string) => {
    let remaining = text,
      html = "";
    while (remaining) {
      const match = a.supplies
        .map((change, index) => ({
          index,
          name: supplyNames[change.kind],
          at: used.has(index)
            ? -1
            : remaining
                .toLowerCase()
                .indexOf(supplyNames[change.kind].toLowerCase()),
        }))
        .filter((m) => m.at >= 0)
        .sort((a, b) => a.at - b.at)[0];
      if (!match) return html + esc(remaining);
      html += esc(remaining.slice(0, match.at)) + supply(match.index);
      remaining = remaining.slice(match.at + match.name.length);
    }
    return html;
  };
  let action: string;
  if (a.type === "play" || a.type === "draw") {
    action = `${a.type === "play" ? "played" : "drew"}${a.card?.type === "calamity" ? " a" : ""} <span class="map-inline-card"><span class="map-event-visual">${mapEventVisual({ ...a, rolls: [] }, assets)}</span>${esc(a.card ? (a.card.type === "calamity" ? "calamity" : label(a.card)) : "a trail card")}</span>`;
    if (a.rolls.length)
      action += `, rolled <span class="map-event-visual map-inline-dice">${mapEventVisual(a, assets)}</span>`;
    if (a.type === "play" && a.card?.type === "river")
      action += ` — ${a.card.deadly ? "raging river; risk of drowning" : "flowing river; risk of supply loss"}`;
    if (a.calamity)
      action += ` — <span class="map-action-calamity">${assets.calamities[a.calamity] ? `<img src="${assets.calamities[a.calamity]}" alt="">` : ""}${esc(titles[a.calamity])}</span>`;
  } else {
    action =
      a.type === "roll" && a.card?.type === "river"
        ? `attempted the ${a.card.deadly ? "raging" : "flowing"} river crossing`
        : decorate(a.action.charAt(0).toLowerCase() + a.action.slice(1));
    if (a.rolls.length)
      action += `, rolled <span class="map-event-visual map-inline-dice">${mapEventVisual(a, assets)}</span>`;
    else if (!a.supplies.length)
      action += ` <span class="map-event-visual map-inline-symbol">${mapEventVisual(a, assets)}</span>`;
  }
  const resultText =
    a.type === "roll" && (a.rolls.at(-1) ?? 1) % 2 === 0
      ? ["The wagon reached the far bank."]
      : a.text;
  const results = resultText
    .map((text) => {
      const who = state.players[a.player]?.name;
      if (
        a.type === "draw" &&
        a.card &&
        text === `${who} drew ${label(a.card)} for a later turn.`
      )
        return "";
      if (a.type === "cure" || a.type === "take") {
        for (const change of a.supplies) {
          for (const verb of ["offered", "gave", "packed"]) {
            const prefix = `${who} ${verb} ${supplyNames[change.kind].toLowerCase()}.`;
            if (text.toLowerCase().startsWith(prefix.toLowerCase()))
              text = text.slice(prefix.length).trim();
          }
        }
      }
      const concise = mapResultText(text);
      if (a.type === "repair" || a.type === "roll")
        return concise
          .split(/(?<=[.!?])\s+/)
          .filter((sentence) =>
            a.type === "repair"
              ? !/^(?:[^.!?]*:\s*)?(?:the )?repair (?:failed|succeeded)\.?$|^The wagon can carry on\.$/i.test(
                  sentence,
                )
              : !/^(?:The )?crossing (?:fails|failed|succeeds|succeeded)\.?$|^The wagon reached the far bank\.$/i.test(
                  sentence,
                ),
          )
          .join(" ");
      return concise;
    })
    .filter(Boolean)
    .filter(
      (t) =>
        !(
          a.type === "play" &&
          a.card &&
          t ===
            `${state.players[a.player]?.name} laid ${label(a.card).toLowerCase()}.`
        ),
    )
    .map(decorate);
  // Unnamed changes (such as both sides of an exchange) still belong to the action sentence.
  a.supplies.forEach((change, index) => {
    if (!used.has(index))
      action += `, ${change.delta > 0 ? "gained" : a.type === "trade" ? "traded" : a.type === "cure" ? "used" : "lost"} ${supply(index, true)}`;
  });
  if (a.type === "roll" && a.rolls.length)
    action += a.rolls.at(-1)! % 2 === 0 ? " — crossed" : " — crossing failed";
  if (a.type === "repair" && a.rolls.length)
    action += a.rolls.at(-1)! >= 4 ? " — repaired" : " — repair failed";
  return { action, results };
}
function mapActionEntry(
  a: MapAction,
  state: Journey,
  assets: MapAssets,
  time = "",
) {
  if (["end", "leave"].includes(a.type ?? "")) return "";
  const stamp = time ? `<time class="map-action-time">${time}</time>` : "";
  if (a.inheritance)
    return `<div class="map-timeline-entry">${stamp}${inheritanceHistory(a.inheritance, state, assets)}</div>`;
  const { action, results } = mapActionPresentation(a, state, assets);
  return `<div class="map-turn-action map-timeline-entry tone-${mapActionTone(a)}"><div class="map-event-heading"><span class="map-action-avatar">${assets.portraits[a.player] ?? ""}</span><span class="map-action-line"><strong>${esc(state.players[a.player]?.name ?? "Traveller")}</strong> ${action}</span>${stamp}</div>${a.context ? `<p class="map-event-context">${esc(a.context)}</p>` : ""}${results.map((t) => `<p>${t}</p>`).join("")}${(a.deaths ?? []).map((index) => mapGravestone(index, state, assets)).join("")}</div>`;
}

/** Combine adjacent contributions without merging different recipients or days. */
export function groupSupplyActions(actions: MapAction[]): MapAction[] {
  const grouped: MapAction[] = [];
  const target = (a: MapAction) =>
    a.type === "take" ? "" : a.action.match(/^Gave .+?( to .+)$/i)?.[1];
  const eligible = (a: MapAction) =>
    ["take", "cure"].includes(a.type ?? "") &&
    a.supplies.length > 0 &&
    !a.rolls.length &&
    !a.deaths?.length &&
    !a.inheritance &&
    target(a) !== undefined;
  for (const action of actions) {
    const previous = grouped.at(-1);
    if (
      previous &&
      eligible(previous) &&
      eligible(action) &&
      previous.type === action.type &&
      previous.wagonState === action.wagonState &&
      previous.player === action.player &&
      previous.turn === action.turn &&
      previous.day === action.day &&
      previous.context === action.context &&
      target(previous) === target(action)
    ) {
      const supplies = previous.supplies.map((s) => ({ ...s }));
      for (const change of action.supplies) {
        const existing = supplies.find(
          (s) => s.player === change.player && s.kind === change.kind,
        );
        if (existing) existing.delta += change.delta;
        else supplies.push({ ...change });
      }
      const names = [...new Set(supplies.map((s) => supplyNames[s.kind]))];
      const list =
        names.length > 1
          ? `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`
          : names[0];
      grouped[grouped.length - 1] = {
        ...previous,
        playerStatesAfter: action.playerStatesAfter,
        livingAfter: action.livingAfter,
        wagonAfter: action.wagonAfter,
        supplies,
        action: `${action.type === "take" ? "Packed" : "Gave"} ${list}${target(action)}`,
        // The final contribution contains the current treatment result.
        text:
          action.type === "cure"
            ? [...action.text]
            : [...new Set([...previous.text, ...action.text])],
      };
    } else grouped.push(action);
  }
  return grouped;
}
function turnHistory(
  actions: MapAction[],
  state: Journey,
  assets: MapAssets,
  clocks: Map<MapAction, string>,
) {
  const groups: {
    turn: number;
    day: number;
    player: number;
    actions: MapAction[];
  }[] = [];
  for (const action of actions.filter(
    (a) => !["end", "leave"].includes(a.type ?? ""),
  )) {
    // An estate belongs beside the death that caused it, even when the engine
    // has already advanced the active player before distributing supplies.
    const matching = action.inheritance?.linkedToDeath
      ? groups.find((g) => g.turn === action.turn && g.player === action.player)
      : groups.at(-1);
    if (matching?.day === action.day) matching.actions.push(action);
    else
      groups.push({
        turn: action.turn,
        day: action.day ?? journeyDay(state),
        player: action.player,
        actions: [action],
      });
  }
  return `<div class="map-turn-history">${groups
    .map((group) => {
      const heading = `<div class="map-turn-heading"><time datetime="${journeyDate(group.day - 1, state.startDate)}">${calendarDate(journeyDate(group.day - 1, state.startDate))}</time><span class="map-turn-badge">Day ${group.day}</span></div>`;
      return `<section class="map-turn">${heading}${group.actions.map((a) => mapActionEntry(a, state, assets, clocks.get(a))).join("")}</section>`;
    })
    .join("")}</div>`;
}
type MapStopKind = "stopped" | "river" | "challenge" | "settlement" | "travel";
function mapStopKind(event: MapEvent): MapStopKind {
  const kind = event.report?.calamity ?? event.kind;
  if (["axle", "tongue", "wheel", "oxen", "repair"].includes(kind))
    return "stopped";
  if (["town", "fort"].includes(event.card?.type ?? kind)) return "settlement";
  if (event.card?.type === "river" || kind === "river") return "river";
  if (kind === "calamity" || kind in titles || event.card?.type === "calamity")
    return "challenge";
  return "travel";
}
function mapStopSymbol(kind: MapStopKind) {
  if (kind === "river")
    return '<circle r="7"/><path class="map-stop-glyph" d="M-4-2Q-2-4 0-2T4-2M-4 2Q-2 0 0 2T4 2"/>';
  if (kind === "stopped")
    return '<path d="M-4-7H4L7-4V4L4 7H-4L-7 4V-4Z"/><path class="map-stop-glyph" d="M-2-3V3M2-3V3"/>';
  if (kind === "challenge")
    return '<path d="M0-8 8 0 0 8-8 0Z"/><path class="map-stop-glyph" d="M0-3V1M0 4v.1"/>';
  if (kind === "settlement")
    return '<path d="M-7-1 0-7 7-1V7H-7Z"/><path class="map-stop-glyph" d="M-2 7V1H2V7"/>';
  return '<circle r="5.5"/>';
}
function mapOutcome(
  state: Journey,
  point: { x: number; y: number },
  assets: MapAssets,
) {
  if (state.status === "travel") return "";
  const image =
    state.status === "won"
      ? assets.art.outcomeSuccess
      : assets.art.outcomeFailure;
  return `<g class="map-outcome map-outcome-${state.status}" transform="translate(${point.x} ${point.y})"><image href="${image}" x="-26" y="-26" width="52" height="52" preserveAspectRatio="xMidYMid meet"/></g>`;
}
export type PlaybackToast = { html: string; label: string; tone: string };
export function playbackToasts(
  action: MapAction | undefined,
  state: Journey,
  assets: MapAssets,
): PlaybackToast[] {
  if (!action || ["end", "leave"].includes(action.type ?? "")) return [];
  const who = state.players[action.player]?.name ?? "Traveller";
  if (action.inheritance) {
    const estate = action.inheritance;
    return [...new Set(estate.received.map((s) => s.player))]
      .map((player) => ({
        html: `${assets.portraits[player] ?? ""}<span><strong>${esc(state.players[player].name)}</strong> inherited ${estate.received
          .filter((s) => s.player === player)
          .map((s) => mapSupplyChange(s.kind, s.count))
          .join(" ")}</span>`,
        label: `${state.players[player].name} inherited supplies from ${state.players[estate.deceased]?.name}.`,
        tone: "positive",
      }))
      .concat(
        estate.returned.length
          ? [
              {
                html: `<span>Returned to the exchange ${estate.returned.map((s) => mapSupplyChange(s.kind, -s.count)).join(" ")}</span>`,
                label: "Remaining supplies returned to the exchange.",
                tone: "neutral",
              },
            ]
          : [],
      );
  }
  const presentation = mapActionPresentation(action, state, assets);
  let text = presentation.action;
  if (presentation.results.length)
    text += `. ${presentation.results.join(" ")}`;
  for (const change of action.supplies) {
    if (!text.includes(`data-supply-kind="${change.kind}"`))
      text += ` ${mapSupplyChange(change.kind, change.delta)}`;
  }
  for (const index of action.deaths ?? []) {
    const name = esc(state.players[index].name);
    if (
      presentation.results.some(
        (result) => result.includes(name) && /died|drown/i.test(result),
      )
    )
      continue;
    text += `. <img class="playback-toast-grave" src="${assets.art.tombstoneIcon}" alt="">${name} died of ${esc(state.players[index].deathCause ?? "unknown causes")}`;
  }
  return [
    {
      html: `${assets.portraits[action.player] ?? ""}<span><strong>${esc(who)}</strong> ${text}</span>`,
      label: `${who} ${action.action}. ${action.text.map(mapResultText).filter(Boolean).join(" ")}`,
      tone: mapActionTone(action),
    },
  ];
}
export type MapPlaybackCue = {
  playerStates?: string[][];
  summary?: string;
  turn?: number;
  player?: number;
  living?: number[];
  step: number;
  progress: number;
  day: number;
  date: string;
  hold: number;
  content: string;
  title?: string;
  image?: string;
  marker?: string;
  markerFacesWest?: boolean;
  toasts?: PlaybackToast[];
};
export function playbackPartySummary(
  state: Pick<Journey, "players" | "status">,
) {
  const alive = state.players.filter((p) => p.alive).length;
  if (!alive) return "Everyone died";
  const travellers = `${alive} traveller${alive === 1 ? "" : "s"}`;
  return state.status === "won"
    ? `${travellers} reached Oregon`
    : state.status === "lost"
      ? `${travellers} survived. The wagon could go no farther.`
      : `${travellers} still on the trail`;
}
export function playbackHold(event: MapEvent, action?: MapAction) {
  if (action?.deaths?.length) return 4200;
  if (event.kind === "finish") return 2800;
  if (event.kind === "start" && !action) return 800;
  if (action?.type === "end" || action?.type === "leave") return 0;
  if (action?.wagonState !== undefined) {
    return { travel: 0, broken: 2300, river: 850, settlement: 1800 }[
      action.wagonState
    ];
  }
  if (action?.type === "roll" || event.card?.type === "river") return 850;
  const kind = mapStopKind(event);
  if (kind === "stopped" || action?.type === "repair") return 2300;
  if (kind === "settlement") return 1800;
  return 0;
}
function playbackContent(
  event: MapEvent,
  image: string,
  state: Journey,
  assets: MapAssets,
  action?: MapAction,
) {
  if (action?.deaths?.length)
    return `<article class="map-playback-event playback-death-event">${action.deaths.map((index) => `<h4>${esc(state.players[index].name)} died of ${esc(state.players[index].deathCause ?? "unknown causes")}</h4>${mapGravestone(index, state, assets)}`).join("")}</article>`;
  const kind = event.report?.calamity ?? event.artKind ?? event.kind;
  const personal = Object.hasOwn(titles, kind) && !sharedConditions.has(kind);
  const owner = event.report?.owner ?? event.player;
  const player = owner === undefined ? undefined : state.players[owner];
  const portrait =
    personal && player && assets.portraits[owner!]
      ? `<span class="playback-event-subject" role="img" aria-label="${esc(player.name)}">${assets.portraits[owner!]}</span>`
      : "";
  return `<article class="map-playback-event"><div class="playback-event-illustration"><img class="playback-event-art" src="${image}" alt="">${portrait}</div><h4>${esc(event.title)}</h4></article>`;
}
/** Recorded actions share a location; days spent there lengthen its pause. */
export const PLAYBACK_TOAST_GAP = 3600;
export function mapPlaybackTimeline(cues: MapPlaybackCue[]) {
  let time = 0,
    progress = 0;
  const dayCounts = new Map<number, number>();
  cues.forEach((cue) =>
    dayCounts.set(cue.day, (dayCounts.get(cue.day) ?? 0) + 1),
  );
  const dayOrdinals = new Map<number, number>();
  let previousClock = 8 * 60;
  let nextToast = 0;
  const timeline = cues.map((cue, index) => {
    const from = progress;
    const move = Math.max(0, cue.progress - from) * 200000;
    const start = time,
      arrive = start + move;
    const daysHere = Math.max(0, (cues[index + 1]?.day ?? cue.day) - cue.day);
    time =
      arrive +
      cue.hold * 2.7 +
      (cue.hold > 0 ? Math.min(7000, daysHere * 480) : 0);
    progress = cue.progress;
    const ordinal = dayOrdinals.get(cue.day) ?? 0;
    dayOrdinals.set(cue.day, ordinal + 1);
    const clockAt = Math.max(
      previousClock,
      (Math.max(1, cue.day) - 1) * 1440 +
        480 +
        (index === 0
          ? 0
          : ((ordinal + 1) / ((dayCounts.get(cue.day) ?? 1) + 1)) * 600),
    );
    const clockFrom = previousClock;
    const clockTo =
      clockAt +
      (cue.hold > 0
        ? Math.min(20, 240 / ((dayCounts.get(cue.day) ?? 1) + 1))
        : 0);
    previousClock = clockTo;
    const toastTimes = (cue.toasts ?? []).map(() => {
      const at = Math.max(arrive, nextToast);
      nextToast = at + PLAYBACK_TOAST_GAP;
      return at;
    });
    // Each action gets its own window; its notifications cannot spill into the next turn.
    if (toastTimes.length) time = Math.max(time, nextToast);
    return {
      ...cue,
      toastTimes,
      from,
      start,
      arrive,
      end: time,
      clockFrom,
      clockAt,
      clockTo,
    };
  });
  const last = timeline.at(-1);
  if (last && nextToast > 0) last.end = Math.max(last.end, nextToast + 3000);
  return timeline;
}

/** Presentation time need not stop a travelling wagon. Only wagon holds anchor it. */
export function mapPlaybackProgress(
  timeline: ReturnType<typeof mapPlaybackTimeline>,
  elapsed: number,
) {
  const anchors = [{ at: 0, progress: 0 }];
  for (const cue of timeline) {
    if (cue.progress > anchors.at(-1)!.progress || cue.hold > 0)
      anchors.push({ at: cue.arrive, progress: cue.progress });
    if (cue.hold > 0) anchors.push({ at: cue.end, progress: cue.progress });
  }
  const next = anchors.findIndex((a) => a.at > elapsed);
  if (next < 0) return anchors.at(-1)!.progress;
  const from = anchors[Math.max(0, next - 1)],
    to = anchors[next];
  const fraction = Math.max(
    0,
    Math.min(1, (elapsed - from.at) / (to.at - from.at || 1)),
  );
  return from.progress + (to.progress - from.progress) * fraction;
}

/** Fictional clock, monotonic across every recorded day and action. */
export function mapPlaybackClock(
  timeline: ReturnType<typeof mapPlaybackTimeline>,
  elapsed: number,
) {
  const cue = timeline.find((c) => elapsed < c.end) ?? timeline.at(-1);
  const moving = cue && elapsed < cue.arrive;
  const from = cue ? (moving ? cue.clockFrom : cue.clockAt) : 480;
  const to = cue ? (moving ? cue.clockAt : cue.clockTo) : 480;
  const start = cue ? (moving ? cue.start : cue.arrive) : 0;
  const end = cue ? (moving ? cue.arrive : cue.end) : 0;
  const fraction = Math.max(
    0,
    Math.min(1, (elapsed - start) / (end - start || 1)),
  );
  const minute = Math.floor(from + (to - from) * fraction);
  const day = Math.floor(minute / 1440) + 1;
  const hour = Math.floor(minute / 60) % 24;
  return {
    day,
    minute,
    time: `${hour % 12 || 12}:${String(minute % 60).padStart(2, "0")} ${hour < 12 ? "am" : "pm"}`,
  };
}

type TooltipRect = { left: number; top: number; right: number; bottom: number };
/** Favor vertical placements with room to read, clear of the hovered marker and route. */
export function mapTooltipPlacement(
  anchor: TooltipRect,
  width: number,
  height: number,
  screen: { width: number; height: number },
  trail: { x: number; y: number }[] = [],
) {
  const margin = 12,
    gap = 14;
  const cap = Math.min(height, 380, screen.height * 0.48);
  const center = (anchor.left + anchor.right) / 2;
  const candidates: {
    left: number;
    top: number;
    height: number;
    score: number;
  }[] = [];
  for (const side of ["above", "below"] as const) {
    const available =
      side === "above"
        ? anchor.top - gap - margin
        : screen.height - anchor.bottom - gap - margin;
    if (available < 72) continue;
    const h = Math.min(cap, available);
    for (const shift of [0, -width * 0.4, width * 0.4]) {
      const left = Math.max(
        margin,
        Math.min(screen.width - width - margin, center - width / 2 + shift),
      );
      const top = side === "above" ? anchor.top - gap - h : anchor.bottom + gap;
      const covered = trail.filter(
        (p) =>
          p.x >= left - 8 &&
          p.x <= left + width + 8 &&
          p.y >= top - 8 &&
          p.y <= top + h + 8,
      ).length;
      candidates.push({
        left,
        top,
        height: h,
        score: covered * 30 + (cap - h) * 2 + Math.abs(shift) * 0.02,
      });
    }
  }
  // At very small viewport heights, a lateral placement still leaves the marker visible.
  for (const side of ["left", "right"] as const) {
    const left =
      side === "left" ? anchor.left - gap - width : anchor.right + gap;
    if (left < margin || left + width > screen.width - margin) continue;
    const top = Math.max(
      margin,
      Math.min(
        screen.height - cap - margin,
        (anchor.top + anchor.bottom - cap) / 2,
      ),
    );
    const covered = trail.filter(
      (p) =>
        p.x >= left && p.x <= left + width && p.y >= top && p.y <= top + cap,
    ).length;
    candidates.push({ left, top, height: cap, score: covered * 30 + 12 });
  }
  return (
    candidates.sort((a, b) => a.score - b.score)[0] ?? {
      left: margin,
      top: anchor.bottom + gap,
      height: Math.max(40, screen.height - anchor.bottom - gap - margin),
      score: 0,
    }
  );
}

function mapLegend(assets: MapAssets) {
  const stops = (
    [
      ["travel", "Passed through"],
      ["river", "River crossing"],
      ["challenge", "Calamity"],
      ["stopped", "Wagon stopped"],
      ["settlement", "Town / fort"],
    ] as const
  )
    .map(
      ([kind, text]) =>
        `<span><svg class="map-key-stop map-event-dot map-stop-${kind}" viewBox="-10 -10 20 20" aria-hidden="true">${mapStopSymbol(kind)}</svg>${text}</span>`,
    )
    .join("");
  return `<details class="map-legend" open><summary>Map legend <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="m4 6 4 4 4-4"/></svg></summary><div class="map-legend-items"><span><i class="map-key-complete"></i>Travelled</span><span><i class="map-key-remaining"></i>Ahead</span>${stops}<span><img class="map-legend-picture" src="${assets.art.trail}" alt="">Featured event</span></div><p>Point to any marker for its story.<br>Drag to pan. Scroll or pinch to zoom.</p></details>`;
}
export function journeyMap(
  state: Journey,
  assets: MapAssets,
  record?: RecordedGame,
) {
  if (record) state = { ...state, startDate: record.initial.startDate };
  const events = journeyMapEvents(state, record);
  const end: MapEvent = {
    step: events.length,
    progress: state.count / 50,
    title:
      state.status === "won"
        ? "Oregon City"
        : state.status === "lost"
          ? "The trail falls silent"
          : "The wagon rests here",
    kind: "finish",
    actions: [],
  };
  const entries = [...events, end];
  const actionsByEvent = new Map(
    entries.map((event) => [event, groupSupplyActions(event.actions)]),
  );
  const scheduledActions: (MapAction | undefined)[] = [];
  const baseCues = new Map<MapAction | MapEvent, MapPlaybackCue>();
  entries.forEach((event) => {
    const actions = actionsByEvent.get(event)!;
    for (const action of actions.length ? actions : [undefined]) {
      const day =
        action?.day ??
        (event.kind === "start" ? 1 : (event.day ?? journeyDay(state)));
      scheduledActions.push(action);
      baseCues.set(action ?? event, {
        step: event.step,
        progress: event.progress ?? eventRouteProgress(event.step, state.count),
        day,
        date: calendarDate(journeyDate(day - 1, state.startDate)),
        hold: playbackHold(event, action),
        content: "",
        toasts: playbackToasts(action, state, assets),
      });
    }
  });
  const schedule = mapPlaybackTimeline([...baseCues.values()]);
  const actionClocks = new Map<MapAction, string>();
  schedule.forEach((cue, index) => {
    const action = scheduledActions[index];
    if (action)
      actionClocks.set(action, mapPlaybackClock(schedule, cue.arrive).time);
  });
  const important = importantMapSteps(events);
  const path = routePath;
  const connectors: string[] = [];
  const trailAnchors: string[] = [];
  const playback: MapPlaybackCue[] = [];
  let living = (record?.initial ?? state).players.flatMap((p, index) =>
    p.alive ? [index] : [],
  );
  let playerStates = playbackPlayerStates(record?.initial ?? state);
  const markers = entries
    .map((e, i) => {
      const progress = e.progress ?? eventRouteProgress(e.step, state.count);
      const point = routePoint(progress);
      const quiet =
        e.kind !== "start" && e.kind !== "finish" && !important.has(e.step);
      const offset =
        e.kind === "start"
          ? 90
          : e.kind === "finish"
            ? -120
            : quiet
              ? 0
              : (i % 2 ? 1 : -1) * 34;
      const normal = routeNormal(progress);
      const detail = {
        x: point.x + normal.x * offset,
        y: point.y + normal.y * offset,
      };
      const endpointDot =
        e.kind === "start" ||
        (state.status === "travel" && i === events.length - 1);
      if (offset)
        connectors.push(
          `<line class="map-event-connector" data-map-connector="${e.step}" x1="${point.x}" y1="${point.y}" x2="${detail.x}" y2="${detail.y}"/>`,
        );
      if (e.kind !== "finish")
        trailAnchors.push(
          `<g class="map-event-dot map-stop-${mapStopKind(e)}" data-map-dot="${e.step}" transform="translate(${point.x} ${point.y})">${endpointDot && (e.kind === "start" || mapStopKind(e) === "travel") ? `<circle r="8"/>` : mapStopSymbol(mapStopKind(e))}</g>`,
        );
      const report = e.report;
      const image =
        e.kind === "start"
          ? assets.art.independence
          : e.kind === "finish"
            ? state.status === "won"
              ? assets.art.victory
              : state.status === "lost"
                ? assets.art.defeat
                : assets.art.progressWagon
            : (assets.calamities[e.artKind ?? e.kind] ??
              (e.kind === "river"
                ? mapRiverArt(e.card, assets)
                : e.kind === "town"
                  ? assets.art.town
                  : e.kind === "fort"
                    ? assets.art.fort
                    : e.kind === "calamity"
                      ? assets.art.calamity
                      : assets.art.trail));
      const owner =
        e.player !== undefined ? state.players[e.player] : undefined;
      const recorded = e.actions.length
        ? turnHistory(actionsByEvent.get(e)!, state, assets, actionClocks)
        : `${owner ? `<div class="map-detail-owner">${assets.portraits[e.player!]}<span>Card played by ${esc(owner.name)}${e.day ? ` on day ${e.day}` : ""}</span></div>` : ""}${e.kind !== "start" && e.kind !== "finish" ? `<p class="map-record-note">Detailed turn history is unavailable for this marker. Outcomes below may span several players’ turns.</p>` : ""}${[...new Set((report?.results ?? []).map(mapResultText).filter(Boolean))].map((t) => `<p>${esc(t)}</p>`).join("")}${(
            report?.deaths ?? []
          )
            .map((d) => {
              const index = state.players.findIndex((p) => p.name === d.name);
              return `<p class="map-death">${esc(d.name)} died of ${esc(d.cause)}.</p>${index >= 0 ? mapGravestone(index, state, assets) : `<img class="map-fallback-grave" src="${assets.art.tombstone ?? assets.art.tombstoneIcon}" alt="Gravestone">`}`;
            })
            .join("")}`;
      const stopDays = [...new Set(e.actions.map((a) => a.day))];
      const description =
        e.kind === "start"
          ? `Departed ${calendarDate(state.startDate ?? "1847-04-01")} from Independence, Missouri.`
          : e.kind === "finish"
            ? playbackPartySummary(state)
            : `Trail card ${e.trailStep ?? e.step} of 50${stopDays.length > 1 ? ` — Days ${Math.min(...stopDays)}–${Math.max(...stopDays)} at this stop` : ""}`;
      const content = `<div class="map-tooltip-summary"><img class="map-detail-art" src="${image}" alt=""><div><p class="eyebrow">${e.kind === "start" ? "Departure" : e.kind === "finish" ? "Journey status" : e.day !== undefined ? `Day ${e.day}` : `Trail marker ${e.trailStep ?? e.step}`}</p><h4>${esc(e.title)}</h4><p>${esc(description)}</p></div></div>${recorded}`;
      const cueActions = e.actions.length
        ? actionsByEvent.get(e)!
        : [undefined];
      let markerIcon =
        e.kind === "finish" && state.status === "lost"
          ? assets.art.mapLost
          : e.card?.type === "fort" || e.kind === "fort"
            ? assets.art.mapFort
            : e.card?.type === "town" || e.kind === "town"
              ? assets.art.mapTown
              : mapStopKind(e) === "stopped"
                ? assets.art.mapStopped
                : assets.art.progressWagon;
      for (const action of cueActions) {
        if (action?.wagonState !== undefined && e.kind !== "finish")
          markerIcon =
            (action.wagonAfter ?? action.wagonState) === "broken"
              ? assets.art.mapStopped
              : (action.wagonAfter ?? action.wagonState) === "settlement"
                ? e.card?.type === "fort"
                  ? assets.art.mapFort
                  : assets.art.mapTown
                : assets.art.progressWagon;
        if (
          action?.wagonState === undefined &&
          mapStopKind(e) === "stopped" &&
          (action?.type === "cure" ||
            action?.type === "town" ||
            (action?.type === "repair" && (action.rolls.at(-1) ?? 0) >= 4))
        )
          markerIcon = assets.art.progressWagon;
        playback.push({
          ...baseCues.get(action ?? e)!,
          playerStates: action?.playerStatesAfter ?? playerStates,
          summary:
            e.kind === "finish" ? playbackPartySummary(state) : undefined,
          turn:
            action?.turn ??
            (e.kind === "finish"
              ? undefined
              : (e.turn ?? record?.initial.turn)),
          player:
            e.kind === "finish"
              ? undefined
              : (action?.player ?? e.player ?? record?.initial.current),
          living: action?.livingAfter ?? living,
          step: e.step,
          progress,
          content: playbackContent(e, image, state, assets, action),
          title: e.title,
          image,
          marker: markerIcon ?? assets.art.progressWagon,
          markerFacesWest:
            markerIcon !== assets.art.mapFort &&
            markerIcon !== assets.art.mapTown,
        });
        living = action?.livingAfter ?? living;
        playerStates = action?.playerStatesAfter ?? playerStates;
      }
      const turns = new Set(e.actions.map((a) => `${a.turn}:${a.player}`)).size;
      const dot =
        quiet || e.kind === "finish"
          ? ""
          : `<button type="button" class="map-trail-dot ${mapStopKind(e) === "settlement" ? "is-settlement" : ""}" style="left:${point.x / 16}%;top:${point.y / 9}%" data-map-dot-target="${e.step}" data-map-progress="${progress}" data-map-content="${esc(content)}" aria-label="${esc(e.title)}: event details"></button>`;
      return `${dot}<button type="button" class="map-marker map-marker-${mapStopKind(e)} ${quiet ? "is-quiet" : ""} ${e.kind === "finish" || e.kind === "start" ? "is-endpoint" : ""}" style="left:${detail.x / 16}%;top:${detail.y / 9}%" data-map-marker data-map-step="${e.step}" data-map-progress="${progress}" data-map-content="${esc(content)}" aria-label="${e.kind === "start" ? "Start" : e.kind === "finish" ? "Current outcome" : e.day !== undefined ? `Day ${e.day}` : `Card ${e.trailStep ?? e.step}`}: ${esc(e.title)}${turns > 1 ? ` — ${turns} turns` : ""}"><span class="map-marker-image"><img class="${image === assets.art.progressWagon ? "faces-west" : ""}" src="${image}" alt="">${report?.deaths?.length ? `<img class="map-death-badge" src="${assets.art.tombstoneIcon}" alt="Death">` : ""}</span>${e.kind === "start" || e.kind === "finish" ? `<span class="map-marker-label">${esc(e.title)}</span>` : ""}</button>`;
    })
    .join("");
  const landmarks = [
    ["Fort Laramie", -104.56, 42.2],
    ["South Pass", -108.9, 42.37],
    ["Fort Hall", -112.65, 43.03],
    ["The Dalles", -121.18, 45.6],
  ] as const;
  return `<section class="journey-map geographic-map" data-map-start="${state.startDate ?? "1847-04-01"}" aria-label="Illustrated journey timeline"><div class="map-playback" aria-label="Journey playback"><button type="button" data-map-prev-turn aria-label="Previous turn" title="Previous turn" disabled><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 5h2v14H5Zm13 0L8 12l10 7Z"/></svg></button><button type="button" data-map-play aria-label="Play journey" title="Play journey"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m8 5 11 7-11 7Z"/></svg></button><button type="button" data-map-next-turn aria-label="Next turn" title="Next turn"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M17 5h2v14h-2ZM6 5l10 7-10 7Z"/></svg></button><button type="button" data-map-restart aria-label="Restart journey playback" title="Restart journey playback"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M5 8a8 8 0 1 1-1 7M5 3v6h6"/></svg></button><select data-map-speed aria-label="Playback speed"><option value="0.5">½×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option></select><div class="map-playback-timing"><input type="range" data-map-seek min="0" max="1000" value="0" aria-label="Playback position"><div><output data-map-elapsed>0:00</output><span> / </span><output data-map-duration>0:00</output></div></div></div><div class="map-playback-date" aria-live="off"><div class="playback-date-copy"><span class="map-playback-day">Journey playback</span><time>${calendarDate(state.startDate ?? "1847-04-01")}</time><small class="map-playback-clock" title="Simulated time of day">8:00 am</small></div><div class="map-playback-roster" aria-label="Playback travellers"><div class="playback-player-portraits">${state.players.map((p, i) => `<span class="playback-player${p.alive ? "" : " is-dead"}" data-playback-player="${i}" data-player-name="${esc(p.name)}" tabindex="0" aria-label="${esc(p.name)}: current state" data-map-content="${esc(rosterTooltip(p.name, assets.portraits[i] ?? "", playbackPlayerStates(state)[i], calendarDate(journeyDate(journeyDay(state) - 1, state.startDate))))}">${assets.portraits[i] ?? ""}<img class="playback-player-grave" src="${assets.art.tombstoneIcon}" alt="Gravestone for ${esc(p.name)}"><span class="playback-player-turn" aria-hidden="true">▸</span></span>`).join("")}</div><span data-playback-player-label></span></div></div><script type="application/json" data-map-cues>${JSON.stringify(playback).replaceAll("<", "\\u003c")}</script><div class="map-tools" aria-label="Map controls"><button data-map-zoom="out" aria-label="Zoom out" title="Zoom out">−</button><button data-map-zoom="in" aria-label="Zoom in" title="Zoom in">+</button><button data-map-zoom="fit" aria-label="Fit whole map" title="Fit whole map"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/></svg></button><output class="map-zoom-level" aria-live="polite">100%</output></div><div class="journey-map-scroll" tabindex="0" aria-label="Scroll the journey map"><div class="journey-map-stage"><div class="journey-map-canvas"><img class="journey-map-background" src="${assets.art.journeyMap}" alt="Weathered north-up map of the western United States"><svg class="journey-map-terrain" viewBox="0 0 1600 900" aria-hidden="true"><path class="map-route-shadow" d="${path}"/><path class="map-route-remaining" d="${path}"/><path class="map-route-completed-halo" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/><path class="map-route" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/>${landmarks
    .map(([name, lon, lat]) => {
      const p = project([lon, lat]);
      return `<g class="map-landmark"><circle cx="${p.x}" cy="${p.y}" r="3"/><text x="${p.x}" y="${p.y - 54}" text-anchor="middle">${name}</text></g>`;
    })
    .join(
      "",
    )}<text class="map-geographic-label" x="200" y="180">OREGON COUNTRY</text><text class="map-geographic-label" x="1120" y="700">GREAT PLAINS</text><text class="map-geographic-label" x="810" y="255" transform="rotate(-20 810 255)">ROCKY MOUNTAINS</text><text class="map-geographic-label" x="60" y="670" transform="rotate(-90 60 670)">PACIFIC OCEAN</text><g class="map-compass" transform="translate(1450 120)"><path d="M0-35 9 0 0 35-9 0Z"/><path d="M-25 0H25"/><text y="-44" text-anchor="middle">N</text></g><g class="map-connectors">${connectors.join("")}</g><g class="map-dots">${trailAnchors.sort((a, b) => Number(a.includes("map-stop-settlement")) - Number(b.includes("map-stop-settlement"))).join("")}</g>${mapOutcome(state, routePoint(state.count / 50), assets)}</svg>${state.status !== "won" ? '<span class="map-destination-label" style="left:10%;top:24%">Oregon City<br><small>Willamette Valley</small></span>' : ""}${markers}<div class="map-playback-wagon" data-map-progress="0" hidden><img class="faces-west" src="${assets.art.progressWagon}" alt="The wagon"></div></div></div></div>${mapLegend(assets)}<svg class="playback-callout-leader" aria-hidden="true" hidden><path/><circle r="3"/></svg><aside class="map-playback-callout" hidden aria-label="Current trail event"></aside><div class="map-playback-toasts" aria-live="polite" aria-label="Journey actions"></div></section>`;
}
export function journeyMapPreview(
  state: Journey,
  assets: MapAssets,
  attributes = "",
  extraClass = "",
) {
  const end = routePoint(state.count / 50);
  const width = 640,
    height = 240;
  const x = Math.max(0, Math.min(1600 - width, end.x - width / 2));
  const y = Math.max(0, Math.min(900 - height, end.y - height / 2));
  const path = routePath;
  return `<button class="journey-map-preview ${extraClass}" ${attributes} aria-label="Explore journey map near the wagon’s latest position"><svg viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="${assets.art.journeyMap}" x="0" y="0" width="1600" height="900"/><path class="map-route-remaining" d="${path}"/><path class="map-route-completed-halo" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/><path class="map-preview-travelled" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/>${state.status === "travel" ? `<circle cx="${end.x}" cy="${end.y}" r="24" fill="var(--paper)" stroke="#59654b" stroke-width="2"/><image transform="translate(${end.x * 2} 0) scale(-1 1)" href="${assets.art.progressWagon}" x="${end.x - 22}" y="${end.y - 20}" width="44" height="40"/>` : mapOutcome(state, end, assets)}</svg><span class="map-preview-caption"><strong>${state.status === "travel" ? "The latest stretch of trail" : "Your journey’s final stretch"}</strong><span>Explore map →</span></span></button>`;
}
export function installJourneyMapInteraction() {
  let active: HTMLElement | undefined,
    tooltip: HTMLDivElement | undefined,
    timer: ReturnType<typeof setTimeout> | undefined;
  const hide = () => {
    if (timer) clearTimeout(timer);
    active?.removeAttribute("aria-describedby");
    active = undefined;
    tooltip?.remove();
    tooltip = undefined;
  };
  const position = () => {
    if (!active?.isConnected || !tooltip) {
      hide();
      return;
    }
    if (
      active.hasAttribute("data-playback-player") &&
      tooltip.dataset.content !== active.dataset.mapContent
    ) {
      tooltip.innerHTML = active.dataset.mapContent ?? "";
      tooltip.dataset.content = active.dataset.mapContent;
    }
    const r = active.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      hide();
      return;
    }
    const width = tooltip.offsetWidth;
    const canvas = active
      .closest(".journey-map-canvas")
      ?.getBoundingClientRect();
    const progress = Number(active.dataset.mapProgress ?? 0);
    const trail = canvas
      ? Array.from({ length: 61 }, (_, i) => {
          const point = routePoint(progress + (i - 30) * 0.002);
          return {
            x: canvas.left + (point.x / 1600) * canvas.width,
            y: canvas.top + (point.y / 900) * canvas.height,
          };
        })
      : [];
    const placement = mapTooltipPlacement(
      r,
      width,
      tooltip.scrollHeight + 2,
      { width: innerWidth, height: innerHeight },
      trail,
    );
    Object.assign(tooltip.style, {
      left: `${placement.left}px`,
      top: `${placement.top}px`,
      maxHeight: `${placement.height}px`,
    });
  };
  const show = (
    marker: HTMLElement,
    content = marker.dataset.mapContent!,
    playback = false,
  ) => {
    if (timer) clearTimeout(timer);
    if (active === marker && !playback) {
      position();
      return;
    }
    hide();
    active = marker;
    tooltip = document.createElement("div");
    tooltip.id = "journey-map-tooltip";
    tooltip.className = `journey-map-tooltip${playback ? " is-playback" : ""}`;
    tooltip.setAttribute("role", "tooltip");
    tooltip.innerHTML = content;
    tooltip.dataset.content = content;
    document.body.append(tooltip);
    active.setAttribute("aria-describedby", tooltip.id);
    position();
    tooltip.addEventListener("pointerenter", () => {
      if (timer) clearTimeout(timer);
    });
    tooltip.addEventListener("pointerleave", () => {
      if (!playback) timer = setTimeout(hide, 120);
    });
    tooltip
      .querySelectorAll("img")
      .forEach((img) => img.addEventListener("load", position, { once: true }));
  };
  document.addEventListener("pointerover", (event) => {
    const marker = (event.target as Element).closest<HTMLButtonElement>(
      "[data-map-marker], [data-map-dot-target], [data-playback-player]",
    );
    if (
      marker &&
      (marker.hasAttribute("data-playback-player") ||
        marker.closest<HTMLElement>(".journey-map")?.dataset.playbackRunning !==
          "true")
    )
      show(marker);
  });
  document.addEventListener("pointerout", (event) => {
    if (
      (event.target as Element).closest(
        "[data-map-marker], [data-map-dot-target], [data-playback-player]",
      ) &&
      !(event.relatedTarget as Element | null)?.closest?.(
        "[data-map-marker], [data-map-dot-target], [data-playback-player], .journey-map-tooltip",
      )
    )
      timer = setTimeout(hide, 120);
  });
  document.addEventListener("focusin", (event) => {
    const marker = (event.target as Element).closest<HTMLButtonElement>(
      "[data-map-marker], [data-map-dot-target], [data-playback-player]",
    );
    if (marker) show(marker);
    else hide();
  });
  document.addEventListener(
    "click",
    (event) => {
      const marker = (event.target as Element).closest<HTMLButtonElement>(
        "[data-map-marker], [data-map-dot-target], [data-playback-player]",
      );
      if (marker) {
        event.stopImmediatePropagation();
        marker.focus({ preventScroll: true });
        show(marker);
      } else if (!(event.target as Element).closest(".journey-map-tooltip"))
        hide();
    },
    true,
  );
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") hide();
  });
  window.addEventListener("journey-map-playback-event", ((
    event: CustomEvent<{ marker: HTMLElement; content: string }>,
  ) => {
    show(event.detail.marker, event.detail.content, true);
  }) as EventListener);
  window.addEventListener("journey-map-playback-hide", hide);
  window.addEventListener("journey-map-camera", position);
  window.addEventListener("resize", hide);
  window.addEventListener("journey-map-pan", hide);
  document.addEventListener("scroll", position, true);
}

let disposeMapViewport: (() => void) | undefined;
let initializedMapViewport: HTMLElement | undefined;
export function initializeJourneyMapViewport() {
  const viewport = document.querySelector<HTMLElement>(".journey-map-scroll");
  if (viewport === initializedMapViewport) return;
  disposeMapViewport?.();
  initializedMapViewport = viewport ?? undefined;
  if (!viewport) return;
  const canvas = viewport.querySelector<HTMLElement>(".journey-map-canvas")!;
  const map = viewport.closest(".journey-map")!;
  let zoomFrame = 0;
  let zoom = 1,
    baseWidth = 1,
    suppressClickUntil = 0;
  const abort = new AbortController(),
    signal = abort.signal;
  const pointers = new Map<number, { x: number; y: number }>();
  let dragging = false,
    start: { x: number; y: number } | undefined;
  const update = (
    next: number,
    x = viewport.getBoundingClientRect().left + viewport.clientWidth / 2,
    y = viewport.getBoundingClientRect().top + viewport.clientHeight / 2,
  ) => {
    const old = canvas.getBoundingClientRect(),
      u = (x - old.left) / old.width,
      v = (y - old.top) / old.height;
    zoom = Math.max(1, Math.min(5, next));
    canvas.style.width = `${baseWidth * zoom}px`;
    const current = canvas.getBoundingClientRect();
    viewport.scrollLeft += current.left + u * current.width - x;
    viewport.scrollTop += current.top + v * current.height - y;
    map.querySelector(".map-zoom-level")!.textContent =
      `${Math.round(zoom * 100)}%`;
    map.querySelector<HTMLButtonElement>('[data-map-zoom="out"]')!.disabled =
      zoom <= 1;
    map.querySelector<HTMLButtonElement>('[data-map-zoom="in"]')!.disabled =
      zoom >= 5;
  };
  const animateZoom = (next: number) => {
    cancelAnimationFrame(zoomFrame);
    const from = zoom,
      target = Math.max(1, Math.min(5, next));
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      update(target);
      return;
    }
    const started = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - started) / 220);
      update(from + (target - from) * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) zoomFrame = requestAnimationFrame(tick);
    };
    zoomFrame = requestAnimationFrame(tick);
  };
  const fit = () => {
    baseWidth = Math.max(
      1,
      Math.min(viewport.clientWidth, (viewport.clientHeight * 16) / 9),
    );
    update(1);
    viewport.scrollLeft = 0;
    viewport.scrollTop = 0;
  };
  const focusEnd = () => {
    fit();
    update(viewport.clientWidth < 600 ? 3.5 : 2.3);
    const marker = Array.from(
      map.querySelectorAll<HTMLElement>(".map-marker.is-endpoint"),
    ).at(-1);
    if (marker) {
      const rect = marker.getBoundingClientRect(),
        view = viewport.getBoundingClientRect();
      viewport.scrollLeft +=
        rect.left + rect.width / 2 - view.left - viewport.clientWidth / 2;
      viewport.scrollTop +=
        rect.top + rect.height / 2 - view.top - viewport.clientHeight / 2;
    }
  };
  let viewportSize = "";
  const observer = new ResizeObserver(() => {
    const size = `${viewport.offsetWidth}:${viewport.offsetHeight}`;
    if (size !== viewportSize) {
      viewportSize = size;
      focusEnd();
    }
  });
  observer.observe(viewport);
  map.addEventListener(
    "click",
    (event) => {
      const button = (event.target as Element).closest<HTMLButtonElement>(
        "[data-map-zoom]",
      );
      if (!button) return;
      event.stopPropagation();
      if (button.dataset.mapZoom === "fit") animateZoom(1);
      else
        animateZoom(zoom * (button.dataset.mapZoom === "in" ? 1.35 : 1 / 1.35));
    },
    { signal },
  );
  viewport.addEventListener(
    "wheel",
    (event) => {
      event.preventDefault();
      cancelAnimationFrame(zoomFrame);
      window.dispatchEvent(new Event("journey-map-pan"));
      update(
        zoom * Math.exp(-event.deltaY * (event.ctrlKey ? 0.004 : 0.0015)),
        event.clientX,
        event.clientY,
      );
    },
    { passive: false, signal },
  );
  viewport.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "mouse" && event.button !== 0) return;
      cancelAnimationFrame(zoomFrame);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      start = { x: event.clientX, y: event.clientY };
      if (pointers.size > 1) {
        dragging = true;
        for (const id of pointers.keys()) viewport.setPointerCapture(id);
      }
    },
    { signal },
  );
  viewport.addEventListener(
    "pointermove",
    (event) => {
      const old = pointers.get(event.pointerId);
      if (!old) return;
      const before = [...pointers.values()];
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) {
        const after = [...pointers.values()];
        const distance = (p: { x: number; y: number }[]) =>
          Math.hypot(p[0].x - p[1].x, p[0].y - p[1].y);
        const oldDistance = distance(before);
        if (oldDistance > 1)
          update(
            (zoom * distance(after)) / oldDistance,
            (after[0].x + after[1].x) / 2,
            (after[0].y + after[1].y) / 2,
          );
        viewport.scrollLeft -=
          (after[0].x + after[1].x - before[0].x - before[1].x) / 2;
        viewport.scrollTop -=
          (after[0].y + after[1].y - before[0].y - before[1].y) / 2;
      } else {
        if (
          !dragging &&
          start &&
          Math.hypot(event.clientX - start.x, event.clientY - start.y) > 5
        ) {
          dragging = true;
          viewport.setPointerCapture(event.pointerId);
        }
        if (dragging) {
          viewport.scrollLeft -= event.clientX - old.x;
          viewport.scrollTop -= event.clientY - old.y;
        }
      }
      if (dragging) {
        viewport.classList.add("is-panning");
        window.dispatchEvent(new Event("journey-map-pan"));
        event.preventDefault();
      }
    },
    { signal },
  );
  const finish = (event: PointerEvent) => {
    pointers.delete(event.pointerId);
    if (dragging) suppressClickUntil = performance.now() + 250;
    if (viewport.hasPointerCapture(event.pointerId))
      viewport.releasePointerCapture(event.pointerId);
    if (!pointers.size) {
      dragging = false;
      start = undefined;
      viewport.classList.remove("is-panning");
    }
  };
  viewport.addEventListener("pointerup", finish, { signal });
  viewport.addEventListener("pointercancel", finish, { signal });
  viewport.addEventListener(
    "click",
    (event) => {
      if (performance.now() < suppressClickUntil) {
        event.stopImmediatePropagation();
        event.preventDefault();
      }
    },
    { capture: true, signal },
  );
  viewport.addEventListener(
    "keydown",
    (event) => {
      if (["+", "=", "-", "0"].includes(event.key)) {
        event.preventDefault();
        event.key === "0"
          ? fit()
          : update(zoom * (event.key === "-" ? 1 / 1.35 : 1.35));
      }
    },
    { signal },
  );
  const followWagon = (
    point: { x: number; y: number },
    stopped: boolean,
    delta: number,
    memorial = false,
  ) => {
    cancelAnimationFrame(zoomFrame);
    const smooth = matchMedia("(prefers-reduced-motion: reduce)").matches
      ? 1
      : 1 - Math.exp(-delta / 360);
    const target =
      viewport.clientWidth < 600 ? (stopped ? 4 : 3.4) : stopped ? 2.8 : 2.3;
    update(zoom + (target - zoom) * smooth);
    const rect = canvas.getBoundingClientRect(),
      view = viewport.getBoundingClientRect();
    const dateBottom =
      map.querySelector(".map-playback-date")?.getBoundingClientRect().bottom ??
      view.top;
    const targetY = memorial
      ? Math.min(
          innerHeight - 155,
          Math.max(
            view.top + view.height / 2,
            dateBottom + (view.width < 600 ? 420 : 465),
          ),
        )
      : view.top + view.height / 2;
    viewport.scrollLeft +=
      (rect.left + (point.x / 1600) * rect.width - view.left - view.width / 2) *
      smooth;
    viewport.scrollTop +=
      (rect.top + (point.y / 900) * rect.height - targetY) * smooth;
    window.dispatchEvent(new Event("journey-map-camera"));
  };
  const disposePlayback = installMapPlayback(
    map as HTMLElement,
    viewport,
    fit,
    followWagon,
  );
  disposeMapViewport = () => {
    disposePlayback();
    observer.disconnect();
    cancelAnimationFrame(zoomFrame);
    abort.abort();
  };
  requestAnimationFrame(focusEnd);
}

function installMapPlayback(
  map: HTMLElement,
  viewport: HTMLElement,
  fit: () => void,
  followWagon: (
    point: { x: number; y: number },
    stopped: boolean,
    delta: number,
    memorial?: boolean,
  ) => void,
) {
  const cues = JSON.parse(
    map.querySelector("[data-map-cues]")?.textContent ?? "[]",
  ) as MapPlaybackCue[];
  const timeline = mapPlaybackTimeline(cues),
    duration = timeline.at(-1)?.end ?? 0;
  const turnStops = timeline.flatMap((cue, index) =>
    cue.turn !== undefined &&
    timeline.findIndex((c) => c.turn === cue.turn) === index
      ? [index]
      : [],
  );
  let pinnedIndex: number | undefined;
  // Prime marker decodes before their first on-map swap.
  new Set(
    cues.map((cue) => cue.marker).filter((src): src is string => !!src),
  ).forEach((src) => {
    const image = new Image();
    image.src = src;
    image.decode().catch(() => {});
  });
  const notifications = timeline.flatMap((cue) =>
    (cue.toasts ?? []).map((toast, index) => ({
      toast,
      at: cue.toastTimes[index],
      progress: cue.progress,
    })),
  );
  const play = map.querySelector<HTMLButtonElement>("[data-map-play]")!;
  const prevTurn = map.querySelector<HTMLButtonElement>(
    "[data-map-prev-turn]",
  )!;
  const nextTurn = map.querySelector<HTMLButtonElement>(
    "[data-map-next-turn]",
  )!;
  const restart = map.querySelector<HTMLButtonElement>("[data-map-restart]")!;
  const speed = map.querySelector<HTMLSelectElement>("[data-map-speed]")!;
  const seek = map.querySelector<HTMLInputElement>("[data-map-seek]")!;
  const elapsedOutput =
    map.querySelector<HTMLOutputElement>("[data-map-elapsed]")!;
  const durationOutput = map.querySelector<HTMLOutputElement>(
    "[data-map-duration]",
  )!;
  const day = map.querySelector<HTMLElement>(".map-playback-day")!;
  const date = map.querySelector<HTMLElement>(".map-playback-date time")!;
  const clock = map.querySelector<HTMLElement>(".map-playback-clock")!;
  const path = map.querySelector<SVGPathElement>(".map-route")!;
  const halo = map.querySelector<SVGPathElement>(".map-route-completed-halo")!;
  const wagon = map.querySelector<HTMLElement>(".map-playback-wagon")!;
  const wagonImage = wagon.querySelector<HTMLImageElement>("img")!;
  const defaultIcon = wagonImage.getAttribute("src")!;
  const canvas = map.querySelector<HTMLElement>(".journey-map-canvas")!;
  const callout = map.querySelector<HTMLElement>(".map-playback-callout")!;
  const leader = map.querySelector<SVGSVGElement>(".playback-callout-leader")!;
  const stack = map.querySelector<HTMLElement>(".map-playback-toasts")!;
  const abort = new AbortController();
  const reduced = matchMedia("(prefers-reduced-motion: reduce)");
  const formatTime = (ms: number) =>
    `${Math.floor(ms / 60000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")}`;
  durationOutput.textContent = formatTime(duration);
  let frame = 0,
    elapsed = 0,
    previous = 0,
    running = false,
    started = false;
  let shownIndex = -1;
  let stepping = false;
  let resumeAfterStep = false;
  let shownContent = "";
  let shownStep = -1,
    lastToast = -1,
    presented: MapPlaybackCue | undefined;
  const toasts: { el: HTMLDivElement; born: number; retiring?: number }[] = [];
  let toastFrame = 0;
  let steppedToast: { toast: PlaybackToast; at: number } | undefined;
  const hideHover = () =>
    window.dispatchEvent(new Event("journey-map-playback-hide"));
  const updateButton = () => {
    const playing = running || stepping;
    map.dataset.playbackRunning = String(playing);
    const label = playing
      ? "Pause journey"
      : elapsed >= duration
        ? "Replay journey"
        : started
          ? "Resume journey"
          : "Play journey";
    play.setAttribute("aria-label", label);
    play.title = label;
    play.setAttribute("aria-pressed", String(playing));
    play.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${playing ? "M7 5h4v14H7ZM14 5h4v14h-4Z" : "m8 5 11 7-11 7Z"}"/></svg>`;
  };
  const pause = () => {
    running = false;
    stepping = false;
    resumeAfterStep = false;
    cancelAnimationFrame(frame);
    updateButton();
  };
  const screenPoint = (progress: number) => {
    const p = routePoint(progress),
      r = canvas.getBoundingClientRect();
    return {
      x: r.left + (p.x / 1600) * r.width,
      y: r.top + (p.y / 900) * r.height,
    };
  };
  const positionDetails = () => {
    if (!presented) return;
    const wagonPoint = screenPoint(
        Number(wagon.dataset.mapProgress ?? presented.progress),
      ),
      point = screenPoint(presented.progress),
      view = viewport.getBoundingClientRect(),
      base = map.getBoundingClientRect();
    const visible =
      point.x >= view.left + 8 &&
      point.x <= view.right - 8 &&
      point.y >= view.top + 8 &&
      point.y <= view.bottom - 8;
    callout.hidden = !visible;
    leader.toggleAttribute("hidden", !visible);
    if (visible) {
      const width = callout.offsetWidth,
        height = callout.offsetHeight;
      const left = Math.max(
        view.left + 10,
        Math.min(view.right - width - 10, point.x - width / 2),
      );
      // Artwork belongs to the event's trail location, independently of the wagon.
      const top = point.y - height - 52;
      callout.style.left = `${left - base.left}px`;
      callout.style.top = `${top - base.top}px`;
      const sx = Math.max(left + 10, Math.min(left + width - 10, point.x));
      const sy =
        point.y > top + height
          ? top + height
          : point.y < top
            ? top
            : Math.max(top + 10, Math.min(top + height - 10, point.y));
      leader.setAttribute("viewBox", `0 0 ${base.width} ${base.height}`);
      leader
        .querySelector("path")!
        .setAttribute(
          "d",
          `M${sx - base.left} ${sy - base.top} L${point.x - base.left} ${point.y - base.top}`,
        );
      const dot = leader.querySelector("circle")!;
      dot.setAttribute("cx", String(point.x - base.left));
      dot.setAttribute("cy", String(point.y - base.top));
    }
    if (toasts.length) {
      stack.style.left = `${wagonPoint.x - base.left}px`;
      stack.style.top = `${wagonPoint.y + 54 - base.top}px`;
      stack.style.maxWidth = `${Math.max(120, Math.min(360, view.width - 24))}px`;
      // Keep the naturally sized stack inside the map at either edge.
      const width = stack.offsetWidth;
      stack.style.left = `${Math.max(view.left + width / 2 + 10, Math.min(view.right - width / 2 - 10, wagonPoint.x)) - base.left}px`;
      stack.hidden =
        wagonPoint.x < view.left + 8 ||
        wagonPoint.x > view.right - 8 ||
        wagonPoint.y < view.top + 8 ||
        wagonPoint.y > view.bottom - 8;
    }
  };
  const clearToasts = () => {
    cancelAnimationFrame(toastFrame);
    toastFrame = 0;
    toasts.forEach((t) => t.el.remove());
    toasts.length = 0;
  };
  const showToasts = () => {
    // Present at most one new action per frame, with a fixed gap in playback time.
    if (
      steppedToast ||
      (!stepping &&
        pinnedIndex === undefined &&
        lastToast + 1 < notifications.length &&
        notifications[lastToast + 1].at <= elapsed)
    ) {
      const notification = steppedToast ?? notifications[++lastToast];
      steppedToast = undefined;
      if (elapsed - notification.at < 13000) {
        const toast = notification.toast;
        const el = document.createElement("div");
        el.className = `map-playback-toast tone-${toast.tone}`;
        el.innerHTML = toast.html;
        el.title = toast.label;
        el.setAttribute("role", "status");
        el.dataset.playbackAt = String(notification.at);
        stack.append(el);
        toasts.push({ el, born: performance.now() });
        if (!reduced.matches)
          el.animate(
            [
              { opacity: 0, translate: "0 24px" },
              { opacity: 1, translate: "0 0" },
            ],
            { duration: 260, easing: "ease-out" },
          );
      }
    }
    refreshToasts();
    if (toasts.length && !toastFrame)
      toastFrame = requestAnimationFrame(ageToasts);
  };
  const refreshToasts = () => {
    const now = performance.now();
    const activeToasts = toasts.filter((toast) => toast.retiring === undefined);
    activeToasts
      .slice(0, Math.max(0, activeToasts.length - 3))
      .forEach((toast) => {
        toast.retiring = now;
      });
    for (let i = toasts.length - 1; i >= 0; i--) {
      const toast = toasts[i],
        age = now - toast.born;
      if (
        age >= 6600 ||
        (toast.retiring !== undefined && now - toast.retiring >= 700)
      ) {
        toast.el.remove();
        toasts.splice(i, 1);
      }
    }
    const front = toasts.at(-1)?.el;
    stack.style.width = front ? `${front.offsetWidth}px` : "";
    stack.style.height = front ? `${front.offsetHeight}px` : "";
    for (let i = 0; i < toasts.length; i++) {
      const toast = toasts[i],
        depth = Math.min(3, toasts.length - 1 - i);
      toast.el.style.zIndex = String(3 - depth);
      toast.el.style.transform = `translateX(-50%) translateY(${-depth * 9}px) scale(${1 - depth * 0.055})`;
      toast.el.style.opacity = String(
        Math.max(0, Math.min(1, (6500 - (now - toast.born)) / 1000)) *
          (toast.retiring === undefined
            ? 1
            : Math.max(0, 1 - (now - toast.retiring) / 600)) *
          (1 - depth * 0.24),
      );
      toast.el.setAttribute("aria-hidden", String(depth > 0));
    }
  };
  const ageToasts = () => {
    toastFrame = 0;
    if (!map.isConnected) return;
    refreshToasts();
    positionDetails();
    if (toasts.length) toastFrame = requestAnimationFrame(ageToasts);
  };
  const draw = (delta = 16) => {
    const found = timeline.findIndex((c) => elapsed < c.end),
      index = pinnedIndex ?? (found < 0 ? timeline.length - 1 : found),
      cue = timeline[index];
    if (!cue) return;
    const moving = elapsed < cue.arrive;
    const progress =
      pinnedIndex !== undefined
        ? cue.progress
        : mapPlaybackProgress(timeline, elapsed);
    path.setAttribute("stroke-dasharray", `${progress * 100} 100`);
    halo.setAttribute("stroke-dasharray", `${progress * 100} 100`);
    const point = routePoint(progress);
    wagon.hidden = false;
    wagon.style.left = `${point.x / 16}%`;
    wagon.style.top = `${point.y / 9}%`;
    wagon.dataset.mapProgress = String(progress);
    const icon = moving ? defaultIcon : (cue.marker ?? defaultIcon);
    wagonImage.classList.toggle(
      "faces-west",
      moving || cue.markerFacesWest === true,
    );
    if (wagonImage.getAttribute("src") !== icon) {
      wagonImage.src = icon;
      wagonImage.alt = moving ? "The wagon" : (cue.title ?? "The wagon");
    }
    followWagon(
      point,
      !moving && cue.hold > 0,
      delta,
      !moving && cue.content.includes("playback-death-event"),
    );
    map
      .querySelectorAll<HTMLElement | SVGElement>(
        "[data-map-step], [data-map-dot-target], [data-map-dot], [data-map-connector]",
      )
      .forEach((el) => {
        const step = Number(
          el.dataset.mapStep ??
            el.dataset.mapDotTarget ??
            el.dataset.mapDot ??
            el.dataset.mapConnector,
        );
        el.classList.toggle(
          "is-playback-unreached",
          step > cue.step || (step === cue.step && moving),
        );
      });
    map
      .querySelector(".map-outcome")
      ?.classList.toggle(
        "is-playback-unreached",
        elapsed < (timeline.at(-1)?.arrive ?? duration),
      );
    const simulated = mapPlaybackClock(timeline, elapsed);
    day.textContent = `Day ${simulated.day}`;
    date.textContent = calendarDate(
      journeyDate(simulated.day - 1, map.dataset.mapStart),
    );
    clock.textContent = simulated.time;
    elapsedOutput.textContent = formatTime(elapsed);
    seek.value = String(duration ? (elapsed / duration) * 1000 : 0);
    seek.style.setProperty(
      "--played",
      `${duration ? (elapsed / duration) * 100 : 0}%`,
    );
    seek.setAttribute(
      "aria-valuetext",
      `${formatTime(elapsed)} of ${formatTime(duration)}`,
    );
    const displayIndex =
      pinnedIndex ?? (moving ? Math.max(0, index - 1) : index);
    presented = timeline[displayIndex];
    shownIndex = displayIndex;
    const currentTurn = turnStops.reduce(
      (current, i, turn) => (i <= shownIndex ? turn : current),
      -1,
    );
    prevTurn.disabled = currentTurn <= 0;
    nextTurn.disabled = currentTurn >= turnStops.length - 1;
    map
      .querySelectorAll<HTMLElement>("[data-playback-player]")
      .forEach((el) => {
        const player = Number(el.dataset.playbackPlayer);
        const active = player === presented!.player;
        const alive = presented!.living?.includes(player) ?? true;
        el.classList.toggle("is-active", active);
        el.classList.toggle("is-dead", !alive);
        if (active) el.setAttribute("aria-current", "true");
        else el.removeAttribute("aria-current");
        el.dataset.mapContent = rosterTooltip(
          el.dataset.playerName!,
          el.querySelector(".portrait")?.outerHTML ?? "",
          presented!.playerStates?.[player] ?? [],
          `${date.textContent}, ${simulated.time}`,
        );
      });
    const playerLabel = map.querySelector<HTMLElement>(
      "[data-playback-player-label]",
    );
    if (playerLabel) {
      const current = map.querySelector<HTMLElement>(
        `[data-playback-player="${presented.player}"]`,
      );
      playerLabel.textContent = current
        ? `${current.dataset.playerName}’s turn`
        : presented.step === timeline.at(-1)?.step
          ? (presented.summary ?? "")
          : "";
    }
    if (shownStep !== presented.step || shownContent !== presented.content) {
      shownStep = presented.step;
      shownContent = presented.content;
      callout.innerHTML = presented.content;
      callout.classList.toggle(
        "is-death-event",
        !!callout.querySelector(".playback-death-event"),
      );
      callout.hidden = false;
      if (!reduced.matches)
        callout.animate(
          [
            { opacity: 0, transform: "translateY(6px) scale(.98)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, easing: "ease-out" },
        );
    }
    map
      .querySelectorAll(".is-playback-active")
      .forEach((el) => el.classList.remove("is-playback-active"));
    map
      .querySelector(`[data-map-step="${presented.step}"]`)
      ?.classList.add("is-playback-active");
    showToasts();
    positionDetails();
  };
  const tick = (now: number) => {
    if (!running || !map.isConnected) return;
    const delta = Math.min(100, now - previous);
    elapsed = Math.min(duration, elapsed + delta * Number(speed.value));
    previous = now;
    draw(delta);
    if (elapsed >= duration) pause();
    else frame = requestAnimationFrame(tick);
  };
  const start = (reset = false) => {
    stepping = false;
    pinnedIndex = undefined;
    if (!timeline.length) return;
    if (reset || elapsed >= duration) {
      elapsed = 0;
      shownStep = -1;
      lastToast = -1;
      clearToasts();
    }
    if (!started || reset) {
      map.classList.add("is-playing-journey");
      fit();
    }
    hideHover();
    started = true;
    running = true;
    previous = performance.now();
    draw();
    updateButton();
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(tick);
  };
  play.addEventListener(
    "click",
    () => (running || stepping ? pause() : start()),
    {
      signal: abort.signal,
    },
  );
  restart.addEventListener("click", () => start(true), {
    signal: abort.signal,
  });
  const stepTurn = (direction: number) => {
    const wasPlaying = running || (stepping && resumeAfterStep);
    pause();
    resumeAfterStep = wasPlaying;
    hideHover();
    const current = turnStops.reduce(
      (current, i, turn) => (i <= shownIndex ? turn : current),
      -1,
    );
    const target =
      turnStops[
        Math.max(0, Math.min(turnStops.length - 1, current + direction))
      ];
    if (target === undefined) return;
    if (!started) {
      map.classList.add("is-playing-journey");
      fit();
      started = true;
    }
    pinnedIndex = undefined;
    clearToasts();
    const destination = timeline[target].arrive;
    const finish = () => {
      stepping = false;
      elapsed = destination;
      pinnedIndex = target;
      const toast = timeline[target].toasts?.[0];
      steppedToast = toast ? { toast, at: elapsed } : undefined;
      const future = notifications.findIndex((n) => n.at > elapsed);
      lastToast = (future < 0 ? notifications.length : future) - 1;
      shownStep = -1;
      draw();
      if (resumeAfterStep) start();
      else updateButton();
    };
    if (reduced.matches || destination === elapsed) {
      finish();
      return;
    }
    stepping = true;
    let lastFrame = performance.now();
    const sweep = (now: number) => {
      if (!stepping || !map.isConnected) return;
      const delta = Math.min(100, now - lastFrame);
      lastFrame = now;
      const distance = destination - elapsed;
      if (Math.abs(distance) <= delta * 10) {
        finish();
        return;
      }
      elapsed += Math.sign(distance) * delta * 10;
      draw(delta);
      frame = requestAnimationFrame(sweep);
    };
    updateButton();
    frame = requestAnimationFrame(sweep);
  };
  prevTurn.addEventListener("click", () => stepTurn(-1), {
    signal: abort.signal,
  });
  nextTurn.addEventListener("click", () => stepTurn(1), {
    signal: abort.signal,
  });
  seek.addEventListener(
    "input",
    () => {
      pause();
      pinnedIndex = undefined;
      hideHover();
      if (!started) {
        map.classList.add("is-playing-journey");
        fit();
        started = true;
      }
      elapsed = (duration * Number(seek.value)) / 1000;
      shownStep = -1;
      clearToasts();
      const futureToast = notifications.findIndex((n) => n.at > elapsed);
      lastToast = (futureToast < 0 ? notifications.length : futureToast) - 2;
      lastToast = Math.max(-1, lastToast);
      draw(1000);
      updateButton();
    },
    { signal: abort.signal },
  );
  map.addEventListener(
    "click",
    (event) => {
      if ((event.target as Element).closest("[data-map-zoom]")) pause();
    },
    { signal: abort.signal },
  );
  viewport.addEventListener(
    "keydown",
    (event) => {
      if (["+", "=", "-", "0"].includes(event.key)) pause();
    },
    { signal: abort.signal },
  );
  viewport.addEventListener("pointerdown", pause, { signal: abort.signal });
  viewport.addEventListener("wheel", pause, { signal: abort.signal });
  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.hidden) pause();
    },
    { signal: abort.signal },
  );
  window.addEventListener(
    "resize",
    () => {
      if (started) positionDetails();
    },
    { signal: abort.signal },
  );
  return () => {
    pause();
    hideHover();
    clearToasts();
    callout.hidden = true;
    leader.setAttribute("hidden", "");
    abort.abort();
  };
}
