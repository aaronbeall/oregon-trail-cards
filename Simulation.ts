import { type TrailGame, type TrailCard } from "./TrailCard";
import {
  chooseComputerMove,
  applyComputerMove,
  chooseBequests,
  type ComputerMove,
} from "./Computer";
import type { GameAction } from "./History";

/** Map brain decisions to the same action schema used by interactive journeys. */
function recordedMove(move: ComputerMove): GameAction {
  switch (move.type) {
    case "play":
      return { type: "play", args: { play: String(move.index) } };
    case "rotate":
      return { type: "rotate", args: { rotate: String(move.index) } };
    case "cure":
      return {
        type: "cure",
        args: { cure: String(move.hazard), supply: move.supply },
      };
    case "town":
      return { type: "town", args: { town: String(move.hazard) } };
    case "take":
      return { type: "take", args: { take: move.supply } };
    case "trade":
      return {
        type: "trade",
        args: {
          payments: move.payments.map((p) => `${p.player}:${p.index}`),
          "trade-kind": move.supply,
          "trade-recipient": String(move.recipient),
        },
      };
    default:
      return { type: move.type, args: { action: move.type } };
  }
}
/** Advance one recorded action without a DOM, pacing, or interstitials. */
export function advanceSimulation(game: TrailGame) {
  if (game.state.status !== "travel" || !game.state.started) return;
  const before = structuredClone(game.state);
  let action: GameAction;
  let played: TrailCard | undefined;
  if (game.state.phase === "legacy") {
    // Commit inheritance together so the map can distinguish gifts from returns.
    const gifts = chooseBequests(game).sort((a, b) => b.index - a.index);
    for (const gift of gifts)
      if (!game.will(gift.index, gift.recipient))
        throw new Error("Could not distribute an inheritance.");
    if (!game.closeWill()) throw new Error("Could not finish an inheritance.");
    action = {
      type: "will-supplies",
      args: { recipients: gifts.map((g) => `${g.index}:${g.recipient}`) },
    };
  } else {
    const move = chooseComputerMove(game);
    if (!move) throw new Error(`No simulation move for ${game.state.phase}.`);
    if (move.type === "play") played = game.player.hand[move.index];
    if (!applyComputerMove(game, move))
      throw new Error(`Could not apply simulation action: ${move.type}.`);
    action = recordedMove(move);
  }
  game.state.simulationActions = (game.state.simulationActions ?? 0) + 1;
  return { before, action, played };
}
