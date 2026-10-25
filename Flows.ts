import { canonicalCause, type JourneySummary, type Outcome } from "./Stats";
export type FlowMode = "journeys" | "players" | "days";
type Tone = Outcome | "neutral" | "illness" | "wagon" | "drowning";
export type FlowNode = {
  id: string;
  layer: number;
  label: string;
  count: number;
  tone: Tone;
  order: number;
};
export type FlowLink = { source: string; target: string; count: number };
const outcomeNames: Record<Outcome, string> = {
  won: "Oregon",
  lost: "Lost on the trail",
  travel: "Still travelling",
  abandoned: "Set aside",
};
const outcomeOrder: Outcome[] = ["won", "travel", "abandoned", "lost"];
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ]!,
  );
function causeTone(cause: string): Tone {
  return /axle|tongue|wheel|oxen|wagon/i.test(cause)
    ? "wagon"
    : /drown/i.test(cause)
      ? "drowning"
      : /cholera|measles|typhoid|dysentery|cold|starvation/i.test(cause)
        ? "illness"
        : "lost";
}
/** Each journey (or traveller) contributes one complete observed path. */
export function buildFlowGraph(
  games: JourneySummary[],
  mode: FlowMode = "journeys",
) {
  const nodes = new Map<string, FlowNode>(),
    links = new Map<string, FlowLink>();
  let total = 0;
  const maxDays = Math.max(0, ...games.map((g) => g.days ?? 0));
  const dayStep = Math.max(10, Math.ceil(maxDays / 80) * 10);
  const node = (
    id: string,
    layer: number,
    label: string,
    tone: Tone = "neutral",
    order = 0,
  ) => ({ id, layer, label, tone, order });
  const path = (items: Omit<FlowNode, "count">[]) => {
    total++;
    items.forEach((item, i) => {
      const existing = nodes.get(item.id);
      if (existing) existing.count++;
      else nodes.set(item.id, { ...item, count: 1 });
      if (i) {
        const source = items[i - 1].id,
          target = item.id,
          key = `${source}>${target}`,
          link = links.get(key);
        if (link) link.count++;
        else links.set(key, { source, target, count: 1 });
      }
    });
  };
  for (const game of games) {
    if (mode === "players") {
      for (const player of game.players ?? []) {
        const fate = !player.alive
          ? "Died"
          : game.outcome === "won"
            ? "Reached Oregon alive"
            : game.outcome === "lost"
              ? "Alive when the wagon stopped"
              : game.outcome === "abandoned"
                ? "Journey set aside"
                : "Still travelling";
        const tone: Tone = !player.alive
          ? "lost"
          : game.outcome === "won"
            ? "won"
            : game.outcome === "lost"
              ? "abandoned"
              : game.outcome;
        const items = [
          node("travellers", 0, "All travellers"),
          node(
            `party-${game.players.length}`,
            1,
            `${game.players.length}-person wagon`,
            "neutral",
            game.players.length,
          ),
          node(`fate-${fate}`, 2, fate, tone, player.alive ? 0 : 2),
        ];
        if (!player.alive) {
          const cause = canonicalCause(player.deathCause);
          items.push(node(`death-${cause}`, 3, cause, causeTone(cause)));
        }
        path(items);
      }
    } else if (mode === "days") {
      const end = Math.floor(Math.max(0, game.days ?? 0) / dayStep);
      const items = [];
      for (let bucket = 0; bucket <= end; bucket++)
        items.push(
          node(
            `day-${bucket}`,
            bucket,
            bucket ? `On trail at day ${bucket * dayStep}` : "All journeys",
            "neutral",
            -1,
          ),
        );
      items.push(
        node(
          `end-${end}-${game.outcome}`,
          end + 1,
          outcomeNames[game.outcome],
          game.outcome,
          outcomeOrder.indexOf(game.outcome),
        ),
      );
      path(items);
    } else {
      const stage = Math.min(5, Math.floor(game.distance / 10));
      const items = [
        node("journeys", 0, "All journeys"),
        node(
          `cards-${stage}`,
          1,
          stage === 5
            ? "50 cards — Oregon"
            : `${stage * 10}–${stage * 10 + 9} trail cards`,
          "neutral",
          stage,
        ),
        node(
          `outcome-${game.outcome}`,
          2,
          outcomeNames[game.outcome],
          game.outcome,
          outcomeOrder.indexOf(game.outcome),
        ),
      ];
      if (game.outcome === "lost") {
        const cause = game.lossReason ?? "Cause unrecorded";
        items.push(node(`loss-${cause}`, 3, cause, causeTone(cause)));
      }
      path(items);
    }
  }
  return {
    nodes: [...nodes.values()],
    links: [...links.values()],
    total,
    dayStep,
  };
}
function renderGraph(graph: ReturnType<typeof buildFlowGraph>, mode: FlowMode) {
  if (!graph.total)
    return '<p class="stats-no-records">No traveller details recorded for this dataset.</p>';
  const layers = Math.max(...graph.nodes.map((n) => n.layer)) + 1;
  const unit = 260 / graph.total,
    gap = 17;
  const columns = Array.from({ length: layers }, (_, layer) =>
    graph.nodes
      .filter((n) => n.layer === layer)
      .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label)),
  );
  const columnHeight = (nodes: FlowNode[]) =>
    nodes.reduce((sum, n) => sum + Math.max(20, n.count * unit), 0) +
    Math.max(0, nodes.length - 1) * gap;
  const height = Math.max(370, ...columns.map((c) => columnHeight(c) + 100));
  const width = layers * 250 + 100;
  const positioned = new Map<
    string,
    FlowNode & { x: number; y: number; h: number }
  >();
  columns.forEach((nodes, layer) => {
    // Keep progress chronological, then place outcomes near their incoming flows.
    // A fixed outcome order otherwise sends the completed ribbon from bottom to top.
    if (layer >= 2 && mode !== "days") {
      const sourceCenter = (node: FlowNode) => {
        const links = graph.links.filter((link) => link.target === node.id);
        return (
          links.reduce((sum, link) => {
            const source = positioned.get(link.source)!;
            return sum + (source.y + source.h / 2) * link.count;
          }, 0) / node.count
        );
      };
      nodes.sort(
        (a, b) =>
          sourceCenter(a) - sourceCenter(b) ||
          a.order - b.order ||
          a.label.localeCompare(b.label),
      );
    }
    let y = 55 + (height - 85 - columnHeight(nodes)) / 2;
    for (const n of nodes) {
      const h = n.count * unit,
        allocated = Math.max(20, h);
      positioned.set(n.id, {
        ...n,
        x: 24 + layer * 250,
        y: y + (allocated - h) / 2,
        h,
      });
      y += allocated + gap;
    }
  });
  const incoming = new Map<string, number>(),
    outgoing = new Map<string, number>();
  const ribbons = [...graph.links]
    .sort(
      (a, b) =>
        positioned.get(a.source)!.y - positioned.get(b.source)!.y ||
        positioned.get(a.target)!.y - positioned.get(b.target)!.y,
    )
    .map((link) => {
      const source = positioned.get(link.source)!,
        target = positioned.get(link.target)!;
      const sy = source.y + (outgoing.get(source.id) ?? 0),
        ty = target.y + (incoming.get(target.id) ?? 0),
        h = link.count * unit;
      outgoing.set(source.id, (outgoing.get(source.id) ?? 0) + h);
      incoming.set(target.id, (incoming.get(target.id) ?? 0) + h);
      const x = source.x + 7,
        tx = target.x,
        middle = (x + tx) / 2;
      const d = `M${x} ${sy} C${middle} ${sy},${middle} ${ty},${tx} ${ty} V${ty + h} C${middle} ${ty + h},${middle} ${sy + h},${x} ${sy + h}Z`;
      const tone = target.tone === "neutral" ? source.tone : target.tone;
      return `<path class="flow-ribbon flow-${tone}" d="${d}" data-flow-count="${link.count}"><title>${esc(source.label)} → ${esc(target.label)}: ${link.count.toLocaleString()} ${mode === "players" ? "travellers" : "journeys"}</title></path>`;
    })
    .join("");
  const bars = [...positioned.values()]
    .map(
      (n) =>
        `<g class="sankey-node flow-${n.tone}" data-flow-node="${esc(n.id)}"><title>${esc(n.label)}: ${n.count.toLocaleString()} (${((n.count / graph.total) * 100).toFixed(1)}%)</title><rect x="${n.x}" y="${n.y}" width="7" height="${Math.max(0.8, n.h)}" rx="1.5"/><text x="${n.x + 15}" y="${n.y + n.h / 2 - 3}">${esc(n.label)}</text><text class="flow-count" x="${n.x + 15}" y="${n.y + n.h / 2 + 12}">${n.count.toLocaleString()} (${((n.count / graph.total) * 100).toFixed(1)}%)</text></g>`,
    )
    .join("");
  const headings = Array.from({ length: layers }, (_, i) => {
    const label =
      mode === "players"
        ? ["Travellers", "Wagon size", "Traveller fates", "Cause of death"][i]
        : mode === "days"
          ? i === 0
            ? "Departure"
            : `Days ${(i - 1) * graph.dayStep}–${i * graph.dayStep - 1}`
          : [
              "Departure",
              "Trail progress",
              "Journey outcomes",
              "Journey-ending cause",
            ][i];
    return `<text class="flow-start-label" x="${24 + i * 250}" y="23">${label}</text>`;
  }).join("");
  return `<div class="flow-scroll"><svg class="layered-sankey" style="min-width:${Math.max(690, width * 0.8)}px" viewBox="0 0 ${width} ${height}" role="img" aria-label="${mode === "players" ? "Traveller fates by wagon size and recorded cause of death" : mode === "days" ? `Journey outcomes in ${graph.dayStep}-day groups` : "Journey outcomes with a second-level breakdown of loss causes"}">${headings}${ribbons}${bars}</svg></div>`;
}
export function renderJourneyFlow(
  games: JourneySummary[],
  selected: Outcome | "all" = "all",
  mode: FlowMode = "journeys",
) {
  if (!games.length) return "";
  const graph = buildFlowGraph(games, mode);
  const description =
    mode === "players"
      ? "Follow each traveller through wagon size to their fate. Survivors of a stopped wagon stay separate from deaths."
      : mode === "days"
        ? `Follow wagons through ${graph.dayStep}-day batches. Each branch shows when a journey ends or was last observed; unfinished journeys remain “Still travelling”.`
        : "Follow journeys from trail progress to outcome, then see what ended the lost journeys. The final cause is distinct from individual traveller deaths.";
  const legend =
    mode === "players"
      ? graph.nodes
          .filter((n) => n.id.startsWith("fate-"))
          .map(
            (n) =>
              `<span class="flow-fate-legend flow-${n.tone}"><i></i>${esc(n.label)} <strong>${n.count.toLocaleString()}</strong></span>`,
          )
          .join("")
      : outcomeOrder
          .map(
            (o) =>
              `<button data-stats-filter="${o}" aria-pressed="${selected === o}" class="flow-${o}"><i></i>${outcomeNames[o]} <strong>${games.filter((g) => g.outcome === o).length.toLocaleString()}</strong></button>`,
          )
          .join("");
  return `<section class="journey-flow stats-panel"><div class="stats-panel-heading"><h3>Where the trail takes us</h3><span>${graph.total.toLocaleString()} ${mode === "players" ? "travellers" : "journeys"}</span></div><div class="flow-modes" role="group" aria-label="Flow chart view">${(["journeys", "players", "days"] as const).map((value) => `<button type="button" data-flow-mode="${value}" aria-pressed="${mode === value}">${value === "journeys" ? "Journey outcomes" : value === "players" ? "Traveller fates" : "Days on the trail"}</button>`).join("")}</div><p class="stats-chart-note">${description} Ribbon width represents the count. Point to a ribbon for details.</p>${renderGraph(graph, mode)}<div class="flow-legend">${legend}</div></section>`;
}
