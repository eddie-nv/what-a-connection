import type { Response } from "express";
import type { EmitFn, PipelineStage, StageEvent } from "./pipeline.types";
import { now } from "../utils/timing";

export function openSseStream(res: Response): EmitFn {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const heartbeat = setInterval(() => {
    res.write(`: keepalive\n\n`);
  }, 15_000);

  res.on("close", () => clearInterval(heartbeat));

  return (event: StageEvent) => {
    const payload = JSON.stringify(event);
    res.write(`event: ${event.stage}\n`);
    res.write(`data: ${payload}\n\n`);
  };
}

export function closeSseStream(res: Response, finalEvent: StageEvent): void {
  const payload = JSON.stringify(finalEvent);
  res.write(`event: ${finalEvent.stage}\n`);
  res.write(`data: ${payload}\n\n`);
  res.end();
}

export function buildEvent(
  stage: PipelineStage,
  status: StageEvent["status"],
  extras: Partial<Pick<StageEvent, "durationMs" | "message" | "data">> = {},
): StageEvent {
  return {
    stage,
    status,
    timestamp: now(),
    ...extras,
  };
}

export function noopEmit(): EmitFn {
  return () => undefined;
}
