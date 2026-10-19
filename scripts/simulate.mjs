import { loadTypeScript } from "./load-typescript.mjs";
const { simulateGame } = await loadTypeScript(
  new URL("../Computer.ts", import.meta.url),
);
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(`--${name}`);
  const value = index < 0 ? fallback : Number(args[index + 1]);
  if (!Number.isSafeInteger(value) || value < 1)
    throw new Error(`--${name} requires a positive integer`);
  return value;
}
const games = option("games", 100),
  seed = option("seed", 1),
  players = option("players", 3);
const results = [];
for (let i = 0; i < games; i++) {
  const result = simulateGame({ seed: seed + i, players });
  results.push({
    seed: seed + i,
    outcome: result.truncated ? "action-limit" : result.state.status,
    days: result.state.turn,
    cards: result.state.count,
    survivors: result.state.players.filter((p) => p.alive).length,
    actions: result.trace.length,
  });
}
console.log(
  JSON.stringify(
    {
      games,
      players,
      seed,
      wins: results.filter((r) => r.outcome === "won").length,
      losses: results.filter((r) => r.outcome === "lost").length,
      truncated: results.filter((r) => r.outcome === "action-limit").length,
      averageCards: results.reduce((n, r) => n + r.cards, 0) / games,
      results,
    },
    null,
    2,
  ),
);
