import type { EmitFn, PipelineStage } from "../../orchestrator/pipeline.types";
import { buildEvent } from "../../orchestrator/events";

export type ScraperEmitter = {
  readonly started: (stage: PipelineStage, data?: unknown) => void;
  readonly completed: (stage: PipelineStage, durationMs?: number, data?: unknown) => void;
  readonly failed: (stage: PipelineStage, error: string, data?: unknown) => void;
  readonly partial: (stage: PipelineStage, message: string, data?: unknown) => void;
};

export function createEmitter(emit?: EmitFn): ScraperEmitter {
  const safeEmit: EmitFn = emit ?? (() => undefined);
  return {
    started: (stage, data) => safeEmit(buildEvent(stage, "started", { data })),
    completed: (stage, durationMs, data) =>
      safeEmit(buildEvent(stage, "completed", { durationMs, data })),
    failed: (stage, error, data) => safeEmit(buildEvent(stage, "failed", { message: error, data })),
    partial: (stage, message, data) => safeEmit(buildEvent(stage, "partial", { message, data })),
  };
}
