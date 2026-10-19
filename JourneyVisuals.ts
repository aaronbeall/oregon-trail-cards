import {
  titles,
  names as supplyNames,
  type Supply,
  label,
  calendarDate,
  journeyDate,
  type Journey,
  type TrailReport,
  type TrailCard,
} from "./TrailCard";
import { replayGame, type RecordedGame } from "./History";
import type { JourneySummary, Outcome } from "./Stats";
import { supplyEmblem } from "./Supplies";
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
const names: Record<Outcome, string> = {
  won: "Oregon",
  lost: "Lost on the trail",
  travel: "Still travelling",
  abandoned: "Set aside",
};
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
) {
  if (!games.length) return "";
  const cohorts = flowCohorts(games),
    unit = 220 / games.length;
  const order: Outcome[] = ["won", "travel", "abandoned", "lost"];
  const totals = Object.fromEntries(
    order.map((outcome) => [
      outcome,
      games.filter((g) => g.outcome === outcome).length,
    ]),
  ) as Record<Outcome, number>;
  let endY = 50;
  const ports = new Map<Outcome, number>();
  const labels = order
    .filter((o) => totals[o])
    .map((outcome) => {
      ports.set(outcome, endY);
      const y = endY;
      endY += totals[outcome] * unit + 30;
      return `<g class="flow-port flow-${outcome}"><rect x="912" y="${y}" width="6" height="${totals[outcome] * unit}" rx="2"/><text x="930" y="${y + (totals[outcome] * unit) / 2 - 3}">${names[outcome]}</text><text class="flow-count" x="930" y="${y + (totals[outcome] * unit) / 2 + 15}">${totals[outcome]} journey${totals[outcome] === 1 ? "" : "s"}</text></g>`;
    })
    .join("");
  let sourceY = 65;
  const ribbons = cohorts
    .map((c) => {
      const y = sourceY,
        h = c.count * unit;
      sourceY += h;
      const to = ports.get(c.outcome)!;
      ports.set(c.outcome, to + h);
      const exit = 75 + c.stage * 125;
      const path = `M45 ${y} H${exit} C${exit + 90} ${y},800 ${to},912 ${to} V${to + h} C800 ${to + h},${exit + 90} ${y + h},${exit} ${y + h} H45Z`;
      return `<path class="flow-ribbon flow-${c.outcome}" d="${path}"><title>${c.count} journey${c.count === 1 ? "" : "s"} · ${c.stage === 5 ? "50 cards" : `${c.stage * 10}–${c.stage * 10 + 9} cards`} · ${names[c.outcome]}</title></path>`;
    })
    .join("");
  return `<section class="journey-flow stats-panel"><div class="stats-panel-heading"><h3>Where the trail takes us</h3><span>${games.length} journey${games.length === 1 ? "" : "s"}</span></div><p class="stats-chart-note">Follow the ribbons from departure to outcome. Width shows how many journeys; each ribbon branches in the range where those wagons stop or currently rest.</p><div class="flow-scroll"><svg viewBox="0 0 1100 400" role="img" aria-label="Journeys flowing from Independence through trail-card progress to their outcomes"><text class="flow-start-label" x="40" y="25">INDEPENDENCE</text>${[0, 10, 20, 30, 40, 50].map((n, i) => `<g class="flow-stage"><path d="M${75 + i * 125} 45V335"/><text x="${75 + i * 125}" y="358" text-anchor="middle">${n === 50 ? "50 · Oregon" : `${n} cards`}</text></g>`).join("")}${ribbons}${labels}</svg></div><div class="flow-legend">${order.map((o) => `<button data-stats-filter="${o}" aria-pressed="${selected === o}" class="flow-${o}"><i></i>${names[o]} <strong>${totals[o]}</strong></button>`).join("")}</div></section>`;
}
export type MapAction = {
  turn: number;
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
const sharedConditions = new Set([
  "axle",
  "tongue",
  "wheel",
  "oxen",
  "water",
  "grass",
]);
export function journeyMapEvents(
  state: Journey,
  record?: RecordedGame,
): MapEvent[] {
  const timing = new Map<number, { turn: number; player: number }>();
  const actions = new Map<number, MapAction[]>();
  const chronological: RecordedMapAction[] = [];
  const deaths = new Map<
    number,
    { step: number; turn: number; player: number }
  >();
  let previous = record?.initial;
  for (const event of record?.events ?? []) {
    const count = event.changes.find(
      (c) => c.path.length === 1 && c.path[0] === "count" && "value" in c,
    );
    if (
      event.action.type === "play" &&
      count &&
      "value" in count &&
      typeof count.value === "number"
    )
      timing.set(count.value, { turn: event.turn, player: event.player });
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
      if (type === "play") {
        const card = previous.players[event.player]?.hand[Number(args.play)];
        if (card) action = `Played ${label(card)}`;
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
        turn: death?.turn ?? event.turn,
        player: death?.player ?? event.player,
        action,
        type,
        context: hazard
          ? `${titles[hazard.kind]}${timing.get(hazard.trailStep ?? -1)?.turn ? ` first faced on turn ${timing.get(hazard.trailStep!)!.turn}` : hazard.trailStep ? ` first faced at trail card ${hazard.trailStep}` : ""}.`
          : undefined,
        card:
          type === "play"
            ? previous.players[event.player]?.hand[Number(args.play)]
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
      card = report?.card ?? cards.get(step),
      time = timing.get(step);
    return {
      step,
      title:
        report?.title ??
        (report?.calamity
          ? titles[report.calamity]
          : card
            ? label(card)
            : "Earlier trail"),
      kind: report?.calamity ?? card?.type ?? "unknown",
      card,
      report,
      turn: time?.turn,
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
            ? (main.report?.calamity ?? action.card?.type ?? "unknown")
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
            ? (main.report?.title ??
              (action.card ? label(action.card) : "Trail card played"))
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
export function routePoint(progress: number) {
  const p = Math.max(0, Math.min(1, progress));
  const lengths = oregonRoute
    .slice(1)
    .map((point, i) =>
      Math.hypot(point.x - oregonRoute[i].x, point.y - oregonRoute[i].y),
    );
  let remaining = p * lengths.reduce((a, b) => a + b, 0);
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i] || i === lengths.length - 1) {
      const t = remaining / lengths[i];
      return {
        x: oregonRoute[i].x + (oregonRoute[i + 1].x - oregonRoute[i].x) * t,
        y: oregonRoute[i].y + (oregonRoute[i + 1].y - oregonRoute[i].y) * t,
      };
    }
    remaining -= lengths[i];
  }
  return oregonRoute[0];
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
  art: MapArt;
  calamities: Record<string, string>;
  portraits: string[];
};
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
        `<section class="map-inheritance-group"><div class="map-inheritance-recipient">${assets.portraits[player] ?? ""}<strong>${esc(state.players[player]?.name ?? "Traveller")} inherited</strong></div><div class="map-supplies">${estate.received
          .filter((s) => s.player === player)
          .map((s) => mapSupplyChange(s.kind, s.count))
          .join("")}</div></section>`,
    )
    .join(
      "",
    )}${estate.returned.length ? `<section class="map-inheritance-group"><strong>Returned to the supply exchange</strong><div class="map-supplies">${estate.returned.map((s) => mapSupplyChange(s.kind, -s.count)).join("")}</div></section>` : ""}${!recipients.length && !estate.returned.length ? `<p>No supplies remained.</p>` : ""}</div>`;
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
        ? assets.art.river
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
function turnHistory(actions: MapAction[], state: Journey, assets: MapAssets) {
  const groups: { turn: number; player: number; actions: MapAction[] }[] = [];
  for (const action of actions) {
    // An estate belongs beside the death that caused it, even when the engine
    // has already advanced the active player before distributing supplies.
    const matching = action.inheritance?.linkedToDeath
      ? groups.find((g) => g.turn === action.turn && g.player === action.player)
      : groups.at(-1);
    if (matching?.turn === action.turn && matching.player === action.player)
      matching.actions.push(action);
    else
      groups.push({
        turn: action.turn,
        player: action.player,
        actions: [action],
      });
  }
  return `<div class="map-turn-history">${groups
    .map((group) => {
      const estateOnly = group.actions.every((a) => a.inheritance);
      const heading = estateOnly
        ? ""
        : `<div class="map-turn-heading">${assets.portraits[group.player] ?? ""}<div><strong><span class="map-turn-badge">Turn ${group.turn}</span> ${esc(state.players[group.player]?.name ?? "Traveller")}</strong><small>${calendarDate(journeyDate(group.turn - 1, state.startDate))}</small></div></div>`;
      return `<section class="map-turn">${heading}${group.actions
        .map((a) =>
          a.inheritance
            ? inheritanceHistory(a.inheritance, state, assets)
            : `<div class="map-turn-action tone-${mapActionTone(a)}"><div class="map-event-heading"><span class="map-event-visual">${mapEventVisual(a, assets)}</span><strong>${esc(a.action)}${a.rolls.length ? ` · rolled ${a.rolls.join(", ")}` : ""}</strong></div>${a.context ? `<p class="map-event-context">${esc(a.context)}</p>` : ""}${a.text.map((t) => `<p>${esc(t)}</p>`).join("")}${a.supplies.length ? `<div class="map-supplies">${a.supplies.map((s) => `<span class="map-supply-change">${mapSupplyChange(s.kind, s.delta)}<small>${esc(state.players[s.player]?.name ?? "Traveller")}</small></span>`).join("")}</div>` : ""}${(a.deaths ?? []).map((index) => mapGravestone(index, state, assets)).join("")}</div>`,
        )
        .join("")}</section>`;
    })
    .join("")}</div>`;
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
export function journeyMap(
  state: Journey,
  assets: MapAssets,
  record?: RecordedGame,
) {
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
  const important = importantMapSteps(events);
  const path = oregonRoute
    .map((p, i) => `${i ? "L" : "M"}${p.x} ${p.y}`)
    .join(" ");
  const trailAnchors: string[] = [];
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
      trailAnchors.push(
        `${offset ? `<line class="map-event-connector" x1="${point.x}" y1="${point.y}" x2="${detail.x}" y2="${detail.y}"/>` : ""}${e.kind !== "finish" ? `<circle class="map-event-dot" data-map-dot="${e.step}" cx="${point.x}" cy="${point.y}" r="${endpointDot ? 8 : 5.5}"/>` : ""}`,
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
                ? assets.art.river
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
        ? turnHistory(e.actions, state, assets)
        : `${owner ? `<div class="map-detail-owner">${assets.portraits[e.player!]}<span>Card played by ${esc(owner.name)}${e.turn ? ` · turn ${e.turn}` : ""}</span></div>` : ""}${e.kind !== "start" && e.kind !== "finish" ? `<p class="map-record-note">Detailed turn history is unavailable for this marker. Outcomes below may span several players’ turns.</p>` : ""}${[...new Set(report?.results ?? [])].map((t) => `<p>${esc(t)}</p>`).join("")}${(
            report?.deaths ?? []
          )
            .map((d) => {
              const index = state.players.findIndex((p) => p.name === d.name);
              return `<p class="map-death">${esc(d.name)} died of ${esc(d.cause)}.</p>${index >= 0 ? mapGravestone(index, state, assets) : `<img class="map-fallback-grave" src="${assets.art.tombstone ?? assets.art.tombstoneIcon}" alt="Gravestone">`}`;
            })
            .join("")}`;
      const stopTurns = [...new Set(e.actions.map((a) => a.turn))];
      const description =
        e.kind === "start"
          ? `Departed ${calendarDate(state.startDate ?? "1847-04-01")} from Independence, Missouri.`
          : e.kind === "finish"
            ? state.note
            : `Trail card ${e.trailStep ?? e.step} of 50${stopTurns.length > 1 ? ` · Turns ${Math.min(...stopTurns)}–${Math.max(...stopTurns)} at this stop` : ""}`;
      const content = `<div class="map-tooltip-summary"><img class="map-detail-art" src="${image}" alt=""><div><p class="eyebrow">${e.kind === "start" ? "Departure" : e.kind === "finish" ? "Journey status" : e.turn !== undefined ? `Turn ${e.turn}` : `Trail marker ${e.trailStep ?? e.step}`}</p><h4>${esc(e.title)}</h4><p>${esc(description)}</p></div></div>${recorded}`;
      const turns = new Set(e.actions.map((a) => `${a.turn}:${a.player}`)).size;
      const dot =
        quiet || e.kind === "finish"
          ? ""
          : `<button type="button" class="map-trail-dot" style="left:${point.x / 16}%;top:${point.y / 9}%" data-map-dot-target="${e.step}" data-map-content="${esc(content)}" aria-label="${esc(e.title)}: event details"></button>`;
      return `${dot}<button type="button" class="map-marker ${quiet ? "is-quiet" : ""} ${e.kind === "finish" || e.kind === "start" ? "is-endpoint" : ""}" style="left:${detail.x / 16}%;top:${detail.y / 9}%" data-map-marker data-map-step="${e.step}" data-map-content="${esc(content)}" aria-label="${e.kind === "start" ? "Start" : e.kind === "finish" ? "Current outcome" : e.turn !== undefined ? `Turn ${e.turn}` : `Card ${e.trailStep ?? e.step}`}: ${esc(e.title)}${turns > 1 ? ` · ${turns} turns` : ""}"><span class="map-marker-image"><img src="${image}" alt="">${report?.deaths?.length ? `<img class="map-death-badge" src="${assets.art.tombstoneIcon}" alt="Death">` : ""}</span>${e.kind === "start" || e.kind === "finish" ? `<span class="map-marker-label">${esc(e.title)}</span>` : ""}</button>`;
    })
    .join("");
  const landmarks = [
    ["Fort Laramie", -104.56, 42.2],
    ["South Pass", -108.9, 42.37],
    ["Fort Hall", -112.65, 43.03],
    ["The Dalles", -121.18, 45.6],
  ] as const;
  return `<section class="journey-map geographic-map" aria-label="Illustrated journey timeline"><div class="map-tools" aria-label="Map controls"><button data-map-zoom="out" aria-label="Zoom out" title="Zoom out">−</button><button data-map-zoom="in" aria-label="Zoom in" title="Zoom in">+</button><button data-map-zoom="fit" aria-label="Fit whole map" title="Fit whole map"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" aria-hidden="true"><path d="M4 9V4h5m6 0h5v5m0 6v5h-5M9 20H4v-5"/></svg></button><output class="map-zoom-level" aria-live="polite">100%</output></div><div class="journey-map-scroll" tabindex="0" aria-label="Scroll the journey map"><div class="journey-map-stage"><div class="journey-map-canvas"><img class="journey-map-background" src="${assets.art.journeyMap}" alt="Weathered north-up map of the western United States"><svg class="journey-map-terrain" viewBox="0 0 1600 900" aria-hidden="true"><path class="map-route-shadow" d="${path}"/><path class="map-route-remaining" d="${path}"/><path class="map-route-completed-halo" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/><path class="map-route" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/>${landmarks
    .map(([name, lon, lat]) => {
      const p = project([lon, lat]);
      return `<g class="map-landmark"><circle cx="${p.x}" cy="${p.y}" r="3"/><text x="${p.x}" y="${p.y - 54}" text-anchor="middle">${name}</text></g>`;
    })
    .join(
      "",
    )}<text class="map-geographic-label" x="200" y="180">OREGON COUNTRY</text><text class="map-geographic-label" x="1120" y="700">GREAT PLAINS</text><text class="map-geographic-label" x="810" y="255" transform="rotate(-20 810 255)">ROCKY MOUNTAINS</text><text class="map-geographic-label" x="60" y="670" transform="rotate(-90 60 670)">PACIFIC OCEAN</text><g class="map-compass" transform="translate(1450 120)"><path d="M0-35 9 0 0 35-9 0Z"/><path d="M-25 0H25"/><text y="-44" text-anchor="middle">N</text></g>${trailAnchors.join("")}${mapOutcome(state, routePoint(state.count / 50), assets)}</svg>${state.status !== "won" ? '<span class="map-destination-label" style="left:10%;top:24%">Oregon City<br><small>Willamette Valley</small></span>' : ""}${markers}</div></div></div><div class="map-key"><span><i class="map-key-complete"></i>Travelled</span><span><i class="map-key-remaining"></i>Ahead</span><small>Drag to pan · scroll or pinch to zoom · point to an event for its story</small></div></section>`;
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
  const path = oregonRoute
    .map((point, i) => `${i ? "L" : "M"}${point.x} ${point.y}`)
    .join(" ");
  return `<button class="journey-map-preview ${extraClass}" ${attributes} aria-label="Explore journey map near the wagon’s latest position"><svg viewBox="${x} ${y} ${width} ${height}" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><image href="${assets.art.journeyMap}" x="0" y="0" width="1600" height="900"/><path class="map-route-remaining" d="${path}"/><path class="map-route-completed-halo" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/><path class="map-preview-travelled" d="${path}" pathLength="100" stroke-dasharray="${Math.min(100, state.count * 2)} 100"/>${state.status === "travel" ? `<circle cx="${end.x}" cy="${end.y}" r="24" fill="var(--paper)" stroke="#59654b" stroke-width="2"/><image href="${assets.art.progressWagon}" x="${end.x - 22}" y="${end.y - 20}" width="44" height="40"/>` : mapOutcome(state, end, assets)}</svg><span class="map-preview-caption"><strong>${state.status === "travel" ? "The latest stretch of trail" : "Your journey’s final stretch"}</strong><span>Explore map →</span></span></button>`;
}
export function installJourneyMapInteraction() {
  let active: HTMLButtonElement | undefined,
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
    const r = active.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) {
      hide();
      return;
    }
    const width = tooltip.offsetWidth,
      height = tooltip.offsetHeight;
    const left = Math.max(
      12,
      Math.min(innerWidth - width - 12, r.left + r.width / 2 - width / 2),
    );
    const top =
      r.bottom + 12 + height <= innerHeight - 12
        ? r.bottom + 12
        : Math.max(12, r.top - height - 12);
    Object.assign(tooltip.style, { left: `${left}px`, top: `${top}px` });
  };
  const show = (marker: HTMLButtonElement) => {
    if (timer) clearTimeout(timer);
    if (active === marker) {
      position();
      return;
    }
    hide();
    active = marker;
    tooltip = document.createElement("div");
    tooltip.id = "journey-map-tooltip";
    tooltip.className = "journey-map-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.innerHTML = marker.dataset.mapContent!;
    document.body.append(tooltip);
    active.setAttribute("aria-describedby", tooltip.id);
    position();
    tooltip.addEventListener("pointerenter", () => {
      if (timer) clearTimeout(timer);
    });
    tooltip.addEventListener("pointerleave", () => {
      timer = setTimeout(hide, 120);
    });
  };
  document.addEventListener("pointerover", (event) => {
    const marker = (event.target as Element).closest<HTMLButtonElement>(
      "[data-map-marker], [data-map-dot-target]",
    );
    if (marker) show(marker);
  });
  document.addEventListener("pointerout", (event) => {
    if (
      (event.target as Element).closest(
        "[data-map-marker], [data-map-dot-target]",
      ) &&
      !(event.relatedTarget as Element | null)?.closest?.(
        "[data-map-marker], [data-map-dot-target], .journey-map-tooltip",
      )
    )
      timer = setTimeout(hide, 120);
  });
  document.addEventListener("focusin", (event) => {
    const marker = (event.target as Element).closest<HTMLButtonElement>(
      "[data-map-marker], [data-map-dot-target]",
    );
    if (marker) show(marker);
    else hide();
  });
  document.addEventListener(
    "click",
    (event) => {
      const marker = (event.target as Element).closest<HTMLButtonElement>(
        "[data-map-marker], [data-map-dot-target]",
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
    const marker = map.querySelector<HTMLElement>(
      ".map-marker.is-endpoint:last-child",
    );
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
  disposeMapViewport = () => {
    observer.disconnect();
    cancelAnimationFrame(zoomFrame);
    abort.abort();
  };
  requestAnimationFrame(focusEnd);
}
