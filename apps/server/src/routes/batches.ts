import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { extname, join } from "node:path";
import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { env } from "../config/env.js";
import { requireManager } from "../middleware/auth.js";
import { batchService } from "../services/batchService.js";
import type { BatchItemInput } from "../types/batch.js";

const createBatchSchema = z.object({
  items: z
    .array(
      z.object({
        clientLabelId: z.string().min(1),
        imageFilename: z.string().min(1).optional(),
        regulatoryProfile: z.enum(["distilled_spirits", "wine", "malt_beverage"]).default("distilled_spirits"),
        expectedBrandName: z.string().optional(),
        expectedClassType: z.string().optional(),
        expectedAbvText: z.string().optional(),
        expectedNetContents: z.string().optional(),
        expectedGovernmentWarning: z.string().optional(),
        requireGovWarning: z.boolean().optional()
      })
    )
    .min(1)
    .max(env.BATCH_MAX_ITEMS_PER_UPLOAD)
});

const statusSchema = z.enum(["queued", "processing", "completed", "failed"]);

const uploadMemory = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 128 * 1024 * 1024
  }
});

const uploadArchive = multer({
  storage: multer.diskStorage({
    destination: async (_req, _file, cb) => {
      try {
        const dest = join(env.BATCH_UPLOAD_STAGING_ROOT, "uploads");
        await mkdir(dest, { recursive: true });
        cb(null, dest);
      } catch (error) {
        cb(error as Error, "");
      }
    },
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname) || ".zip";
      cb(null, `${Date.now()}-${randomUUID()}${ext}`);
    }
  }),
  limits: {
    fileSize: env.BATCH_UPLOAD_MAX_ARCHIVE_BYTES
  }
});

export const batchRouter = Router();

batchRouter.use("/api/batches", requireManager);

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

  if (clientLabelIdIx < 0) return [];

  return lines.slice(1).map((line) => {
    const cols = line.split(",").map((value) => value.trim());
    return {
      clientLabelId: cols[clientLabelIdIx],
      imageFilename: imageFilenameIx >= 0 ? cols[imageFilenameIx] : undefined,
      regulatoryProfile: (cols[regulatoryProfileIx] as BatchItemInput["regulatoryProfile"]) || "distilled_spirits"
    };
  });
}

batchRouter.post(
  "/api/batches/upload",
  uploadArchive.single("archive"),
  async (req, res) => {
    try {
      const archive = req.file;
      if (!archive) {
        return res.status(400).json({ error: "archive_required", detail: "Upload a .zip archive in form field 'archive'" });
      }
      if (extname(archive.originalname).toLowerCase() !== ".zip") {
        return res.status(400).json({ error: "invalid_archive_format", detail: "Only .zip archives are supported" });
      }

      const mode = req.body.mode === "directory_bundle" ? "directory_bundle" : "csv_bundle";
      const created = await batchService.createBatchFromArchive({
        archivePath: archive.path,
        archiveFilename: archive.originalname,
        mode
      });

      return res.status(202).json({
        batchId: created.batchId,
        applicationId: created.applicationId,
        status: created.status,
        ingestStatus: created.ingestStatus,
        capacityClass: env.BATCH_MAX_ITEMS_PER_UPLOAD >= 500 ? "up_to_500" : "up_to_300",
        recommendedPollMs: 1500,
        statusUrl: `/api/batches/${created.batchId}`,
        itemsUrl: `/api/batches/${created.batchId}?limit=100&offset=0`
      });
    } catch (error) {
      return res.status(500).json({
        error: "batch_upload_failed",
        detail: error instanceof Error ? error.message : "unknown_error"
      });
    }
  }
);

batchRouter.post("/api/batches", uploadMemory.fields([{ name: "archive", maxCount: 1 }, { name: "manifest", maxCount: 1 }]), async (req, res) => {
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

    if (parsedItems.length < 1 || parsedItems.length > env.BATCH_MAX_ITEMS_PER_UPLOAD) {
      return res.status(400).json({
        error: "batch_size_out_of_range",
        detail: `Batch must include between 1 and ${env.BATCH_MAX_ITEMS_PER_UPLOAD} items`
      });
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
      ingestStatus: created.ingestStatus,
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
  const parsedStatus = typeof req.query.status === "string" ? statusSchema.safeParse(req.query.status) : null;

  if (parsedStatus && !parsedStatus.success) {
    return res.status(400).json({ error: "invalid_status_filter" });
  }

  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 100;
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0;

  const batch = await batchService.getBatchStatus(req.params.batchId, limit, offset, parsedStatus?.success ? parsedStatus.data : undefined);
  if (!batch) return res.status(404).json({ error: "batch_not_found" });

  return res.json({
    batchId: batch.batchId,
    applicationId: batch.applicationId,
    status: batch.status,
    ingestStatus: batch.ingestStatus,
    totalItems: batch.totalItems,
    acceptedItems: batch.acceptedItems,
    rejectedItems: batch.rejectedItems,
    discoveredItems: batch.discoveredItems ?? batch.totalItems,
    queuedItems: batch.queuedItems,
    processingItems: batch.processingItems,
    completedItems: batch.completedItems,
    failedItems: batch.failedItems,
    processedItems: batch.processedItems,
    progressPct: batch.progressPct,
    archiveBytes: batch.archiveBytes,
    errorSummary: batch.errorSummary,
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
