import type { Journey } from "./TrailCard";
import type { RecordedGame } from "./History";

export type JourneyModeFilter = "all" | "played" | "simulated";
export type Outcome = "won" | "lost" | "abandoned" | "travel";
export type JourneySummary = {
  simulated: boolean;
  id: string;
  startedAt: string;
  outcome: Outcome;
  distance: number;
  days: number;
  players: Journey["players"];
  survivors: number;
  partial: boolean;
  lossReason?: string;
};
/** Canonical labels keep legacy “second card” wording out of analysis. */
export function canonicalCause(raw?: string): string {
  if (!raw?.trim()) return "Cause unrecorded";
  if (/drown/i.test(raw)) return "Drowning";
  const known = [
    "Broken axle",
    "Broken tongue",
    "Broken wheel",
    "Dead oxen",
    "Dysentery",
    "Snakebite",
    "Cholera",
    "Measles",
    "Typhoid",
    "Starvation",
    "Extreme cold",
  ];
  return (
    known.find((cause) => raw.toLowerCase().includes(cause.toLowerCase())) ??
    raw.trim()
  );
}
export function journeyLossCause(state: Journey): string | undefined {
  if (state.status !== "lost") return;
  const wagon = (state.note ?? "").match(
    /The wagon cannot continue:\s*(.*?)\s+went unremedied/i,
  );
  if (wagon) return canonicalCause(wagon[1]);
  const death = (state.note ?? "").match(/died:\s*(.*?)\.?$/i);
  if (death) return canonicalCause(death[1].replace(/\.$/, ""));
  return state.players.some((p) => p.alive)
    ? "Wagon stopped · cause unrecorded"
    : "No survivors · cause unrecorded";
}
export function gameStatistics(
  records: { record: RecordedGame; state: Journey }[],
  mode: JourneyModeFilter = "all",
) {
  const games: JourneySummary[] = records
    .filter(
      ({ record, state }) =>
        state.started &&
        (mode === "all" ||
          (record.simulated === true || state.mode === "simulation") ===
            (mode === "simulated")),
    )
    .map(({ record, state }) => ({
      id: record.id,
      simulated: record.simulated === true || state.mode === "simulation",
      startedAt: record.startedAt,
      outcome: record.outcome === "abandoned" ? "abandoned" : state.status,
      distance: Math.min(50, Math.max(0, state.count)),
      days: Math.max(0, state.turn - 1),
      players: state.players,
      survivors: state.players.filter((player) => player.alive).length,
      partial: !record.completeFromStart,
      lossReason: journeyLossCause(state),
    }));
  return summarizeJourneys(games);
}

/** Aggregate standalone summaries without requiring stored game histories. */
export function summarizeJourneys(games: JourneySummary[]) {
  const outcomes: Record<Outcome, number> = {
    won: 0,
    lost: 0,
    abandoned: 0,
    travel: 0,
  };
  games.forEach((game) => outcomes[game.outcome]++);
  const finished = games.filter(
    (game) => game.outcome === "won" || game.outcome === "lost",
  );
  const travellers = finished.reduce(
    (sum, game) => sum + game.players.length,
    0,
  );
  const survivors = finished.reduce((sum, game) => sum + game.survivors, 0);
  const causes = new Map<string, number>();
  for (const game of games)
    for (const player of game.players.filter((player) => !player.alive)) {
      const raw = player.deathCause ?? "Unknown cause";
      const known = [
        "Dysentery",
        "Snakebite",
        "Cholera",
        "Measles",
        "Typhoid",
        "Starvation",
        "Extreme cold",
      ].find((cause) => raw.toLowerCase().includes(cause.toLowerCase()));
      const cause = /drown/i.test(raw) ? "Drowning" : (known ?? raw);
      causes.set(cause, (causes.get(cause) ?? 0) + 1);
    }
  const distances = ["0–9", "10–19", "20–29", "30–39", "40–49", "Oregon"].map(
    (label, index) => ({
      label,
      count: games.filter(
        (game) => Math.min(5, Math.floor(game.distance / 10)) === index,
      ).length,
    }),
  );
  return {
    games,
    outcomes,
    completed: finished.length,
    victoryRate: finished.length ? outcomes.won / finished.length : null,
    survivalRate: travellers ? survivors / travellers : null,
    averageDays: finished.length
      ? finished.reduce((sum, game) => sum + game.days, 0) / finished.length
      : null,
    averageDistance: finished.length
      ? finished.reduce((sum, game) => sum + game.distance, 0) / finished.length
      : null,
    travellers,
    survivors,
    deaths: [...causes]
      .map(([cause, count]) => ({ cause, count }))
      .sort((a, b) => b.count - a.count || a.cause.localeCompare(b.cause)),
    distances,
  };
}
