import {
  runSimulationBatch,
  type BatchOptions,
  type BatchMessage,
} from "./SimulationBatch";
let cancelled = false;
let running = false;
const send = (message: BatchMessage) => self.postMessage(message);
self.onmessage = async (
  event: MessageEvent<
    { type: "start"; options: BatchOptions } | { type: "cancel" }
  >,
) => {
  if (event.data.type === "cancel") {
    cancelled = true;
    return;
  }
  if (event.data.type !== "start" || running) return;
  running = true;
  cancelled = false;
  try {
    const dataset = await runSimulationBatch(
      event.data.options,
      (progress) => send({ type: "progress", progress }),
      () => cancelled,
    );
    send({ type: "complete", dataset });
  } catch (error) {
    send({
      type: "error",
      message:
        error instanceof Error ? error.message : "The batch could not finish.",
    });
  } finally {
    running = false;
  }
};
