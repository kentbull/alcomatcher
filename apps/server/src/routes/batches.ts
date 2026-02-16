import { randomUUID } from "node:crypto";
import { Router } from "express";
import { z } from "zod";

const createBatchSchema = z.object({
  items: z
    .array(
      z.object({
        clientLabelId: z.string().min(1),
        imageFilename: z.string().min(1),
        regulatoryProfile: z.enum(["distilled_spirits", "wine", "malt_beverage"]).default("distilled_spirits")
      })
    )
    .min(1)
    .max(300)
});

export const batchRouter = Router();

/**
 * Creates a batch job contract for week-one queue processing.
 * Persistence and async processing are added in the next implementation slice.
 */
batchRouter.post("/api/batches", (req, res) => {
  const parsed = createBatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const batchId = randomUUID();
  const totalItems = parsed.data.items.length;

  return res.status(202).json({
    batchId,
    totalItems,
    acceptedItems: totalItems,
    rejectedItems: 0,
    statusUrl: `/api/batches/${batchId}`
  });
});

batchRouter.get("/api/batches/:batchId", (req, res) => {
  return res.json({
    batchId: req.params.batchId,
    status: "batch_processing",
    totalItems: 0,
    processedItems: 0,
    failedItems: 0
  });
});
