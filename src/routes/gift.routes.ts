import { Router, type Request, type Response } from "express";
import { z } from "zod";
import type { PipelineInput } from "../orchestrator/pipeline.types";
import { runPipeline } from "../orchestrator/pipeline";
import { openSseStream, closeSseStream, buildEvent } from "../orchestrator/events";

const SenderSchema = z.object({
  name: z.string().min(1).max(200),
  role: z.string().max(200).optional(),
  company: z.string().max(200).optional(),
  reasonForConnecting: z.string().min(1).max(2000),
  discussionTopic: z.string().min(1).max(2000),
});

const PipelineInputSchema = z.object({
  prospectUrl: z
    .string()
    .url()
    .max(2048)
    .refine((u) => /^https?:\/\//i.test(u), {
      message: "prospectUrl must use http or https",
    }),
  prospectName: z.string().max(200).optional(),
  sender: SenderSchema,
  forceRefresh: z.boolean().optional(),
});

export const giftRouter: Router = Router();

giftRouter.post("/research", async (req: Request, res: Response) => {
  const parsed = PipelineInputSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid input", issues: parsed.error.issues });
    return;
  }
  const input: PipelineInput = parsed.data;

  let clientGone = false;
  res.on("close", () => {
    clientGone = true;
  });

  const emit = openSseStream(res);

  try {
    const output = await runPipeline(input, emit);
    if (!clientGone) {
      closeSseStream(res, buildEvent("complete", "completed", { data: output }));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (!clientGone) {
      closeSseStream(res, buildEvent("error", "failed", { message }));
    }
  }
});
