import { seededRandom, simulateGame } from "./Computer";
import { journeyLossCause, type JourneySummary } from "./Stats";
export type BatchOptions = {
  count: number;
  minPlayers: number;
  maxPlayers: number;
  seed: number;
};
export type BatchProgress = {
  attempted: number;
  requested: number;
  wins: number;
  losses: number;
  skipped: number;
};
export type SimulationDataset = {
  options: BatchOptions;
  createdAt: string;
  games: JourneySummary[];
  progress: BatchProgress;
  cancelled: boolean;
};
export type BatchMessage =
  | { type: "progress"; progress: BatchProgress }
  | { type: "complete"; dataset: SimulationDataset }
  | { type: "error"; message: string };
export function validateBatchOptions(options: BatchOptions) {
  if (
    !Number.isSafeInteger(options.count) ||
    options.count < 1 ||
    options.count > 10000
  )
    throw new Error("Choose 1–10,000 simulations.");
  if (
    !Number.isInteger(options.minPlayers) ||
    !Number.isInteger(options.maxPlayers) ||
    options.minPlayers < 2 ||
    options.maxPlayers > 6 ||
    options.minPlayers > options.maxPlayers
  )
    throw new Error(
      "Choose a player range between 2 and 6, with the minimum no greater than the maximum.",
    );
  if (
    !Number.isSafeInteger(options.seed) ||
    options.seed < 0 ||
    options.seed > 0xffffffff
  )
    throw new Error("Invalid batch seed.");
}
/** Pure, disposable analysis. Does not read or write storage or interactive game state. */
export async function runSimulationBatch(
  options: BatchOptions,
  onProgress: (progress: BatchProgress) => void = () => {},
  cancelled: () => boolean = () => false,
): Promise<SimulationDataset> {
  validateBatchOptions(options);
  const randomPlayers = seededRandom(options.seed ^ 0x51f15e);
  const dataset: SimulationDataset = {
    options: { ...options },
    createdAt: new Date().toISOString(),
    games: [],
    cancelled: false,
    progress: {
      attempted: 0,
      requested: options.count,
      wins: 0,
      losses: 0,
      skipped: 0,
    },
  };
  onProgress({ ...dataset.progress });
  let lastReport = performance.now();
  for (let index = 0; index < options.count && !cancelled(); index++) {
    const players =
      options.minPlayers +
      Math.floor(
        randomPlayers() * (options.maxPlayers - options.minPlayers + 1),
      );
    const result = simulateGame({
      seed: (options.seed + index) >>> 0,
      players,
      recordTrace: false,
    });
    dataset.progress.attempted++;
    if (result.truncated) dataset.progress.skipped++;
    else {
      const s = result.state;
      dataset.games.push({
        id: `batch-${options.seed}-${index + 1}`,
        simulated: true,
        startedAt: dataset.createdAt,
        outcome: s.status,
        distance: s.count,
        days: Math.max(0, s.turn - 1),
        survivors: s.players.filter((p) => p.alive).length,
        partial: false,
        lossReason: journeyLossCause(s),
        players: s.players.map(({ hand, supplies, ...p }) => ({
          ...p,
          hand: [],
          supplies: [],
        })),
      });
      if (s.status === "won") dataset.progress.wins++;
      else dataset.progress.losses++;
    }
    // Yield to the worker event loop so cancellation and progress remain responsive.
    if (index % 8 === 7 || performance.now() - lastReport >= 60) {
      onProgress({ ...dataset.progress });
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
      lastReport = performance.now();
    }
  }
  dataset.cancelled = cancelled() && dataset.progress.attempted < options.count;
  onProgress({ ...dataset.progress });
  return dataset;
}
