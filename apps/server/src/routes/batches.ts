import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { batchService } from "../services/batchService.js";
import type { BatchItemInput } from "../types/batch.js";

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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 80 * 1024 * 1024
  }
});

export const batchRouter = Router();

function parseCsvManifest(csvBuffer: Buffer): BatchItemInput[] {
  const lines = csvBuffer
    .toString("utf-8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];
  const headers = lines[0].split(",").map((h) => h.trim());
  const indexOf = (name: string) => headers.findIndex((header) => header === name);

  const clientLabelIdIx = indexOf("client_label_id");
  const imageFilenameIx = indexOf("image_filename");
  const regulatoryProfileIx = indexOf("regulatory_profile");

  if (clientLabelIdIx < 0 || imageFilenameIx < 0) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((value) => value.trim());
    return {
      clientLabelId: cols[clientLabelIdIx],
      imageFilename: cols[imageFilenameIx],
      regulatoryProfile: (cols[regulatoryProfileIx] as BatchItemInput["regulatoryProfile"]) || "distilled_spirits"
    };
  });
}

batchRouter.post("/api/batches", upload.fields([{ name: "archive", maxCount: 1 }, { name: "manifest", maxCount: 1 }]), async (req, res) => {
  try {
    let parsedItems: BatchItemInput[] = [];
    const files = req.files as Record<string, Express.Multer.File[]> | undefined;
    const manifestFile = files?.manifest?.[0];

    if (manifestFile) {
      parsedItems = parseCsvManifest(manifestFile.buffer);
    } else if (typeof req.body.items === "string") {
      const raw = JSON.parse(req.body.items);
      const parsed = createBatchSchema.safeParse({ items: raw });
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      parsedItems = parsed.data.items;
    } else {
      const parsed = createBatchSchema.safeParse(req.body);
      if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });
      parsedItems = parsed.data.items;
    }

    if (parsedItems.length < 1 || parsedItems.length > 300) {
      return res.status(400).json({ error: "batch_size_out_of_range", detail: "Batch must include between 1 and 300 items" });
    }

    const validated = createBatchSchema.safeParse({ items: parsedItems });
    if (!validated.success) return res.status(400).json({ error: validated.error.flatten() });

    const created = await batchService.createBatch(validated.data.items);

    return res.status(202).json({
      batchId: created.batchId,
      applicationId: created.applicationId,
      totalItems: created.totalItems,
      acceptedItems: created.acceptedItems,
      rejectedItems: created.rejectedItems,
      status: created.status,
      statusUrl: `/api/batches/${created.batchId}`
    });
  } catch (error) {
    return res.status(500).json({
      error: "batch_create_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

batchRouter.get("/api/batches/:batchId", async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 300) : 100;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const batch = await batchService.getBatchStatus(req.params.batchId, limit, offset);
  if (!batch) return res.status(404).json({ error: "batch_not_found" });

  return res.json({
    batchId: batch.batchId,
    applicationId: batch.applicationId,
    status: batch.status,
    totalItems: batch.totalItems,
    acceptedItems: batch.acceptedItems,
    rejectedItems: batch.rejectedItems,
    processedItems: batch.processedItems,
    failedItems: batch.failedItems,
    items: batch.items,
    createdAt: batch.createdAt,
    updatedAt: batch.updatedAt
  });
});

batchRouter.get("/api/batches", async (req, res) => {
  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 100;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
  const jobs = await batchService.listBatchJobs(limit);
  return res.json({ batches: jobs });
});

batchRouter.get("/api/batches/:batchId/items/:batchItemId", async (req, res) => {
  const detail = await batchService.getBatchItemDetail(req.params.batchId, req.params.batchItemId);
  if (!detail) return res.status(404).json({ error: "batch_item_not_found" });
  return res.json(detail);
});
