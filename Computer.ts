import {
  TrailGame,
  ends,
  hazardDeadline,
  names,
  type Hazard,
  type Supply,
} from "./TrailCard";

export type ComputerMove =
  | { type: "play" | "rotate"; index: number; reason: string }
  | { type: "cure"; hazard: number; supply: Supply; reason: string }
  | { type: "town"; hazard: number; reason: string }
  | { type: "take"; supply: Supply; reason: string }
  | {
      type: "trade";
      payments: { player: number; index: number }[];
      supply: Supply;
      recipient: number;
      reason: string;
    }
  | { type: "will"; index: number; recipient: number; reason: string }
  | {
      type:
        | "roll"
        | "repair"
        | "draw"
        | "skip"
        | "end"
        | "leave"
        | "close-will"
        | "auto-loss";
      reason: string;
    };
const kinds = Object.keys(names) as Supply[];
const stopping = new Set(["axle", "tongue", "wheel", "oxen"]);
const counts = (supplies: Supply[], kind: Supply) =>
  supplies.filter((k) => k === kind).length;
function urgency(game: TrailGame, h: Hazard) {
  if (h.kind === "arm") return 0;
  const deadline = hazardDeadline(game.state, h)?.turns;
  return (
    (stopping.has(h.kind) ? 500 : 0) +
    (deadline === 1 ? 1000 : 0) +
    (deadline !== undefined ? 350 + 300 / deadline : 100) +
    (game.living.length === 1 && h.owner === game.state.current ? 300 : 0)
  );
}
/** Value only visible needs and supplies. Never inspect draw/calamity deck order. */
function supplyValue(
  game: TrailGame,
  kind: Supply,
  recipient = game.state.current,
) {
  const s = game.state;
  const held = game.living.reduce(
    (n, i) => n + counts(s.players[i].supplies, kind),
    0,
  );
  const needed = s.hazards.reduce((n, h) => n + (h.needs[kind] ?? 0), 0);
  const base: Record<Supply, number> = {
    medicine: 30,
    water: 28,
    parts: 32,
    oxen: 24,
    clothes: 25,
    food: 26,
    bullets: 12,
  };
  return (
    base[kind] / (1 + held * 0.7) +
    needed * 30 +
    (needed && !s.players[recipient].supplies.includes(kind) ? 15 : 0)
  );
}
export function chooseBequests(game: TrailGame) {
  const dead = game.state.players[game.state.deaths[0]];
  if (!dead) return [];
  return dead.supplies
    .flatMap((supply, index) =>
      game.living.map((recipient) => ({
        index,
        recipient,
        score: supplyValue(game, supply, recipient),
      })),
    )
    .sort(
      (a, b) =>
        b.score - a.score || a.index - b.index || a.recipient - b.recipient,
    )
    .filter(
      (entry, i, all) => all.findIndex((x) => x.index === entry.index) === i,
    )
    .slice(0, Math.max(0, 2 - game.state.legacyCount));
}
/** Deterministic, read-only policy. The engine remains the authority on legality. */
export function chooseComputerMove(
  game: TrailGame,
  options: { requestHumanSupplies?: boolean } = {},
): ComputerMove | undefined {
  const s = game.state;
  if (!s.started || s.status !== "travel") return;
  if (s.phase === "legacy") {
    const gift = chooseBequests(game)[0];
    return gift
      ? {
          type: "will",
          ...gift,
          reason: "Keep useful supplies with the living.",
        }
      : {
          type: "close-will",
          reason: "Return the remaining supplies to the exchange.",
        };
  }
  if (s.phase === "discard")
    return { type: "auto-loss", reason: "Resolve the supply loss." };
  if (s.phase === "repair")
    return {
      type: "repair",
      reason: "Try the free repair before spending spare parts.",
    };
  if (s.phase === "river")
    return {
      type: game.skips ? "skip" : "roll",
      reason: game.skips
        ? "Rest this crossing attempt."
        : "Try to reach the far bank.",
    };
  const hazards = [...s.hazards].sort(
    (a, b) => urgency(game, b) - urgency(game, a) || a.id - b.id,
  );
  if (s.phase === "town" || s.phase === "fort") {
    const h = hazards.find((h) => urgency(game, h) >= 100);
    if (s.phase === "town" && h)
      return {
        type: "town",
        hazard: h.id,
        reason: "Use town care for the most urgent condition.",
      };
    const supply = kinds
      .filter((k) => s.shop[k] > 0)
      .sort((a, b) => supplyValue(game, b) - supplyValue(game, a))[0];
    return supply && s.take
      ? {
          type: "take",
          supply,
          reason: "Restock an unmet need or a scarce emergency supply.",
        }
      : { type: "leave", reason: "Carry on; no supplies remain to take." };
  }
  if (s.phase !== "turn") return;
  if (game.skips)
    return { type: "skip", reason: "Rest until the injury heals." };
  const allowance = game.living.length === 2 ? 2 : 1;
  if (s.used < allowance) {
    for (const h of hazards) {
      if (!urgency(game, h)) continue;
      const supply = kinds
        .filter(
          (k) => (h.needs[k] ?? 0) > 0 && game.player.supplies.includes(k),
        )
        .sort((a, b) => supplyValue(game, a) - supplyValue(game, b))[0];
      if (supply)
        return {
          type: "cure",
          hazard: h.id,
          supply,
          reason: `Help resolve ${h.kind} before its consequence.`,
        };
    }
    // Prefer computer-owned surplus; human payments must be proposed for approval.
    for (const h of hazards.filter((h) => urgency(game, h) >= 350)) {
      const supply = kinds.find(
        (k) =>
          (h.needs[k] ?? 0) > 0 &&
          s.shop[k] > 0 &&
          !game.player.supplies.includes(k),
      );
      if (!supply) continue;
      const payments = game.living
        .filter(
          (player) =>
            s.players[player].controller === "computer" ||
            options.requestHumanSupplies,
        )
        .flatMap((player) =>
          s.players[player].supplies.map((kind, index) => ({
            kind,
            index,
            player,
            value:
              supplyValue(game, kind) +
              (s.players[player].controller === "computer" ? 0 : 100),
          })),
        )
        .filter(
          (p) =>
            p.kind !== supply &&
            !s.hazards.some((h) => (h.needs[p.kind] ?? 0) > 0),
        )
        .sort(
          (a, b) =>
            a.value - b.value || a.player - b.player || a.index - b.index,
        )
        .slice(0, 2);
      if (payments.length === 2)
        return {
          type: "trade",
          supply,
          recipient: s.current,
          payments: payments.map((p) => ({
            player: p.player,
            index: p.index,
          })),
          reason: "Exchange two unneeded supplies for an urgent remedy.",
        };
    }
  }
  if (s.used) return { type: "end", reason: "Finish the supply turn." };
  const candidates: { index: number; rotate: boolean; score: number }[] = [];
  if (!game.blocked)
    game.player.hand.forEach((card, index) => {
      for (const rotate of [false, true]) {
        const c = { ...card, rotated: rotate ? !card.rotated : card.rotated };
        if (!game.canPlay(c)) continue;
        const next =
          game.living[
            (game.living.indexOf(s.current) + 1) % game.living.length
          ];
        const follow = s.players[next].hand.filter(
          (n) =>
            ["town", "fort"].includes(n.type) ||
            ends(n)[0] === ends(c)[1] ||
            ends({ ...n, rotated: !n.rotated })[0] === ends(c)[1],
        ).length;
        const value = {
          trail: 65,
          town: 78,
          fort: 88,
          river: card.deadly ? 18 : 38,
          calamity: 5,
        }[c.type];
        const score =
          value +
          Math.min(4, follow) * 3 +
          (s.count === 49 && c.type === "trail" ? 1000 : 0) -
          (rotate ? 0.1 : 0);
        candidates.push({ index, rotate, score });
      }
    });
  const best = candidates.sort(
    (a, b) => b.score - a.score || a.index - b.index,
  )[0];
  if (best)
    return {
      type: best.rotate ? "rotate" : "play",
      index: best.index,
      reason: "Advance safely and leave a connection for the next traveller.",
    };
  return { type: "draw", reason: "No playable road; draw and pass the turn." };
}
export function applyComputerMove(
  game: TrailGame,
  move: ComputerMove,
  approvedHumanOwners: readonly number[] = [],
): boolean {
  switch (move.type) {
    case "play":
      return game.play(move.index);
    case "rotate":
      return game.rotate(move.index);
    case "cure":
      return game.cure(move.hazard, move.supply);
    case "town":
      return game.townCure(move.hazard);
    case "take":
      return game.takeSupply(move.supply);
    case "trade":
      if (
        move.payments.some(
          (payment) =>
            game.state.players[payment.player]?.controller !== "computer" &&
            !approvedHumanOwners.includes(payment.player),
        )
      )
        return false;
      return game.trade(move.payments, move.supply, move.recipient);
    case "will":
      return game.will(move.index, move.recipient);
    case "close-will":
      return game.closeWill();
    case "auto-loss":
      return game.autoDiscardSupply();
    case "roll":
      return game.cross();
    case "repair":
      return game.repair();
    case "draw":
      return game.draw();
    case "skip":
      return game.skip();
    case "end":
      return game.endSupplies();
    case "leave":
      return game.leaveShop();
  }
}
export function seededRandom(seed: number) {
  let value = seed >>> 0;
  return () => {
    value += 0x6d2b79f5;
    let n = Math.imul(value ^ (value >>> 15), 1 | value);
    n ^= n + Math.imul(n ^ (n >>> 7), 61 | n);
    return ((n ^ (n >>> 14)) >>> 0) / 4294967296;
  };
}
export function simulateGame(
  options: { seed?: number; players?: number; maxActions?: number } = {},
) {
  const players = options.players ?? 3;
  if (!Number.isInteger(players) || players < 2 || players > 6)
    throw new Error("Use 2–6 travellers.");
  const game = new TrailGame(seededRandom(options.seed ?? 1));
  game.reset(Array.from({ length: players }, (_, i) => `Traveller ${i + 1}`));
  game.state.players.forEach((p) => (p.controller = "computer"));
  const trace: { turn: number; player: number; move: ComputerMove }[] = [];
  const limit = options.maxActions ?? 5000;
  while (game.state.status === "travel" && trace.length < limit) {
    const move = chooseComputerMove(game);
    if (!move) throw new Error(`No AI move in ${game.state.phase}`);
    trace.push({ turn: game.state.turn, player: game.state.current, move });
    if (!applyComputerMove(game, move))
      throw new Error(`Illegal AI move: ${JSON.stringify(move)}`);
  }
  return {
    state: game.state,
    trace,
    truncated: game.state.status === "travel",
  };
}
