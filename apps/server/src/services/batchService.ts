import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdir, readdir, readFile, stat } from "node:fs/promises";
import { basename, dirname, extname, join, relative } from "node:path";
import { env } from "../config/env.js";
import { complianceService } from "./complianceService.js";
import { eventStore } from "./eventStore.js";
import { realtimeEventBus } from "./realtimeEventBus.js";
import { ScannerService } from "./scannerService.js";
import { submissionImageStore } from "./submissionImageStore.js";
import type { BatchItemAttemptRecord, BatchItemInput, BatchItemRecord, BatchJobRecord } from "../types/batch.js";
import type { ExpectedLabelFields, ScanImageRole } from "../types/scanner.js";

interface BatchStatusView extends BatchJobRecord {
  processedItems: number;
  failedItems: number;
  progressPct: number;
  items: BatchItemRecord[];
}

interface BatchItemDetail {
  item: BatchItemRecord;
  attempts: BatchItemAttemptRecord[];
}

interface ArchiveBatchInput {
  archivePath: string;
  archiveFilename: string;
  mode?: "csv_bundle" | "directory_bundle";
}

interface DiscoveredItem {
  clientLabelId: string;
  regulatoryProfile: BatchItemInput["regulatoryProfile"];
  expectedBrandName?: string;
  expectedClassType?: string;
  expectedAbvText?: string;
  expectedNetContents?: string;
  expectedGovernmentWarning?: string;
  requireGovWarning?: boolean;
  frontImagePath?: string;
  backImagePath?: string;
  additionalImagePaths: string[];
}

interface ItemProcessError extends Error {
  code: string;
  retryable: boolean;
}

const MAX_RETRIES = 2;
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".heic", ".webp"]);

/**
 * Batch ingestion + per-item scanner processing for large uploads.
 * Upload requests return quickly while parsing/processing runs async.
 */
export class BatchService {
  private readonly jobs = new Map<string, BatchJobRecord>();
  private readonly items = new Map<string, BatchItemRecord[]>();
  private readonly attempts = new Map<string, BatchItemAttemptRecord[]>();
  private readonly scannerService = new ScannerService();

  async createBatch(items: BatchItemInput[], defaultRegulatoryProfile: BatchItemInput["regulatoryProfile"] = "distilled_spirits"): Promise<BatchJobRecord> {
    const app = await complianceService.createApplication(defaultRegulatoryProfile, "batch");
    const batchId = randomUUID();
    const now = new Date().toISOString();

    const record: BatchJobRecord = {
      batchId,
      applicationId: app.applicationId,
      totalItems: items.length,
      acceptedItems: 0,
      rejectedItems: 0,
      status: "batch_received",
      ingestStatus: "queued",
      discoveredItems: items.length,
      queuedItems: items.length,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      createdAt: now,
      updatedAt: now
    };

    const batchItems = items.map((item) => this.makeBatchItemRecord(item));
    this.jobs.set(batchId, record);
    this.items.set(batchId, batchItems);
    this.attempts.set(batchId, []);

    await this.persistBatchState(record, batchItems);
    this.publishBatchProgress(batchId, app.applicationId, "batch_received", batchItems, "queued");

    void this.runItemProcessing(batchId);
    return record;
  }

  async createBatchFromArchive(input: ArchiveBatchInput): Promise<BatchJobRecord> {
    const app = await complianceService.createApplication("distilled_spirits", "batch");
    const batchId = randomUUID();
    const now = new Date().toISOString();

    const archiveStats = await stat(input.archivePath).catch(() => ({ size: 0 }));
    const record: BatchJobRecord = {
      batchId,
      applicationId: app.applicationId,
      totalItems: 0,
      acceptedItems: 0,
      rejectedItems: 0,
      status: "batch_received",
      ingestStatus: "received",
      discoveredItems: 0,
      queuedItems: 0,
      processingItems: 0,
      completedItems: 0,
      failedItems: 0,
      archiveBytes: archiveStats.size,
      createdAt: now,
      updatedAt: now
    };

    this.jobs.set(batchId, record);
    this.items.set(batchId, []);
    this.attempts.set(batchId, []);

    await this.persistBatchState(record, []);
    this.publishBatchProgress(batchId, app.applicationId, "batch_received", [], "received");

    void this.runArchiveIngest(batchId, input);
    return record;
  }

  async getBatchStatus(batchId: string, limit = 100, offset = 0, status?: BatchItemRecord["status"]): Promise<BatchStatusView | null> {
    await this.hydrateBatch(batchId);
    const job = this.jobs.get(batchId);
    if (!job) return null;

    const allItems = this.items.get(batchId) ?? [];
    const filtered = status ? allItems.filter((item) => item.status === status) : allItems;
    const window = filtered.slice(offset, offset + limit);

    return {
      ...job,
      processedItems: (job.completedItems ?? 0) + (job.failedItems ?? 0),
      failedItems: job.failedItems ?? 0,
      progressPct: calcProgress(job),
      items: window
    };
  }

  async listBatchJobs(limit = 100) {
    const jobs = await eventStore.listBatchJobs(limit);
    for (const job of jobs) this.jobs.set(job.batchId, job);
    return jobs;
  }

  async getBatchItemDetail(batchId: string, batchItemId: string): Promise<BatchItemDetail | null> {
    await this.hydrateBatch(batchId);
    const items = this.items.get(batchId) ?? [];
    const item = items.find((entry) => entry.batchItemId === batchItemId);
    if (!item) return null;

    const persistedAttempts = await eventStore.listBatchItemAttempts(batchItemId).catch(() => []);
    const memoryAttempts = (this.attempts.get(batchId) ?? []).filter((attempt) => attempt.batchItemId === batchItemId);
    const mergedAttempts = mergeAttempts(memoryAttempts, persistedAttempts);

    return {
      item,
      attempts: mergedAttempts
    };
  }

  private async runArchiveIngest(batchId: string, input: ArchiveBatchInput) {
    const job = this.jobs.get(batchId);
    if (!job) return;

    try {
      await this.transitionBatch(batchId, "batch_processing", "parsing");

      const extractRoot = join(env.BATCH_UPLOAD_STAGING_ROOT, batchId, "extracted");
      await mkdir(extractRoot, { recursive: true });
      await extractZipToDirectory(input.archivePath, extractRoot);

      const discovered = await this.discoverBatchItems(extractRoot, input.mode);
      if (discovered.length < 1) {
        throw createItemProcessError("batch_parse_failed", "No valid label items discovered in archive", false);
      }
      if (discovered.length > env.BATCH_MAX_ITEMS_PER_UPLOAD) {
        throw createItemProcessError(
          "batch_size_out_of_range",
          `Batch has ${discovered.length} items; max is ${env.BATCH_MAX_ITEMS_PER_UPLOAD}`,
          false
        );
      }

      const batchItems = discovered.map((item) => this.makeBatchItemRecord({
        clientLabelId: item.clientLabelId,
        imageFilename: basename(item.frontImagePath ?? item.backImagePath ?? item.additionalImagePaths[0] ?? "unknown"),
        regulatoryProfile: item.regulatoryProfile,
        expectedBrandName: item.expectedBrandName,
        expectedClassType: item.expectedClassType,
        expectedAbvText: item.expectedAbvText,
        expectedNetContents: item.expectedNetContents,
        expectedGovernmentWarning: item.expectedGovernmentWarning,
        requireGovWarning: item.requireGovWarning,
        frontImagePath: item.frontImagePath,
        backImagePath: item.backImagePath,
        additionalImagePaths: item.additionalImagePaths
      }));

      this.items.set(batchId, batchItems);
      const updatedJob: BatchJobRecord = {
        ...job,
        totalItems: batchItems.length,
        discoveredItems: batchItems.length,
        queuedItems: batchItems.length,
        ingestStatus: "queued",
        updatedAt: new Date().toISOString()
      };
      this.jobs.set(batchId, updatedJob);

      await this.persistBatchState(updatedJob, batchItems);
      this.publishBatchProgress(batchId, updatedJob.applicationId, updatedJob.status, batchItems, "queued");

      await this.runItemProcessing(batchId);
    } catch (error) {
      const failedJob: BatchJobRecord = {
        ...job,
        status: "batch_partially_failed",
        ingestStatus: "failed",
        errorSummary: error instanceof Error ? error.message : "unknown_error",
        updatedAt: new Date().toISOString()
      };
      this.jobs.set(batchId, failedJob);
      await this.persistBatchState(failedJob, this.items.get(batchId) ?? []);
      this.publishBatchProgress(batchId, failedJob.applicationId, failedJob.status, this.items.get(batchId) ?? [], "failed");
      await complianceService.mergeClientSync(failedJob.applicationId, { status: failedJob.status });
    }
  }

  private async runItemProcessing(batchId: string) {
    const job = this.jobs.get(batchId);
    const batchItems = this.items.get(batchId);
    if (!job || !batchItems || batchItems.length === 0) return;

    await this.transitionBatch(batchId, "batch_processing", "processing");

    const attemptsForBatch = this.attempts.get(batchId) ?? [];
    this.attempts.set(batchId, attemptsForBatch);

    const concurrency = Math.max(1, env.BATCH_ITEM_PROCESS_CONCURRENCY);
    await runWithConcurrency(batchItems, concurrency, async (item, index) => {
      const processingItem = { ...item, status: "processing" as const, updatedAt: new Date().toISOString() };
      batchItems[index] = processingItem;
      this.items.set(batchId, [...batchItems]);
      await this.persistBatchState(this.recalculateJob(job, batchItems), batchItems);
      this.publishBatchProgress(batchId, job.applicationId, "batch_processing", batchItems, "processing");

      const result = await this.processItemWithRetry(processingItem);
      batchItems[index] = result.item;
      attemptsForBatch.push(...result.attempts);

      await this.persistAttempts(result.attempts);
      const nextJob = this.recalculateJob(job, batchItems);
      this.jobs.set(batchId, nextJob);
      this.items.set(batchId, [...batchItems]);
      await this.persistBatchState(nextJob, batchItems);
      this.publishBatchProgress(batchId, nextJob.applicationId, nextJob.status, batchItems, nextJob.ingestStatus);
    });

    const finalJob = this.recalculateJob(job, batchItems);
    const failedItems = finalJob.failedItems ?? 0;
    const nextStatus: BatchJobRecord["status"] = failedItems > 0 ? "batch_partially_failed" : "batch_completed";
    const ingestStatus: BatchJobRecord["ingestStatus"] = failedItems > 0 ? "partially_failed" : "completed";

    const completedJob: BatchJobRecord = {
      ...finalJob,
      status: nextStatus,
      ingestStatus,
      updatedAt: new Date().toISOString()
    };

    this.jobs.set(batchId, completedJob);
    this.items.set(batchId, [...batchItems]);

    await complianceService.mergeClientSync(completedJob.applicationId, { status: completedJob.status });
    await this.persistBatchState(completedJob, batchItems);
    this.publishBatchProgress(batchId, completedJob.applicationId, completedJob.status, batchItems, completedJob.ingestStatus);
  }

  private recalculateJob(job: BatchJobRecord, items: BatchItemRecord[]): BatchJobRecord {
    const completed = items.filter((item) => item.status === "completed").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const processing = items.filter((item) => item.status === "processing").length;
    const queued = items.filter((item) => item.status === "queued").length;

    const status: BatchJobRecord["status"] = failed > 0 && completed + failed === items.length
      ? "batch_partially_failed"
      : "batch_processing";

    return {
      ...job,
      totalItems: items.length,
      acceptedItems: completed,
      rejectedItems: failed,
      discoveredItems: items.length,
      queuedItems: queued,
      processingItems: processing,
      completedItems: completed,
      failedItems: failed,
      status,
      updatedAt: new Date().toISOString()
    };
  }

  private async processItemWithRetry(item: BatchItemRecord): Promise<{ item: BatchItemRecord; attempts: BatchItemAttemptRecord[] }> {
    const attempts: BatchItemAttemptRecord[] = [];
    let retryCount = item.retryCount;

    for (let attemptNo = 1; attemptNo <= MAX_RETRIES + 1; attemptNo += 1) {
      try {
        const applicationId = await this.processItemAttempt(item);
        attempts.push({
          attemptId: randomUUID(),
          batchItemId: item.batchItemId,
          attemptNo,
          outcome: "success",
          createdAt: new Date().toISOString()
        });

        return {
          item: {
            ...item,
            status: "completed",
            retryCount,
            applicationId,
            lastErrorCode: undefined,
            errorReason: undefined,
            updatedAt: new Date().toISOString()
          },
          attempts
        };
      } catch (error) {
        const normalized = normalizeProcessError(error);
        attempts.push({
          attemptId: randomUUID(),
          batchItemId: item.batchItemId,
          attemptNo,
          outcome: "failed",
          errorCode: normalized.code,
          errorReason: normalized.message,
          createdAt: new Date().toISOString()
        });
        retryCount += 1;

        if (!normalized.retryable || attemptNo > MAX_RETRIES) {
          return {
            item: {
              ...item,
              status: "failed",
              retryCount,
              lastErrorCode: normalized.code,
              errorReason: normalized.message,
              updatedAt: new Date().toISOString()
            },
            attempts
          };
        }
      }
    }

    return {
      item: {
        ...item,
        status: "failed",
        retryCount,
        lastErrorCode: "unknown_failure",
        errorReason: "unknown_failure: exhausted retries",
        updatedAt: new Date().toISOString()
      },
      attempts
    };
  }

  private async processItemAttempt(item: BatchItemRecord): Promise<string> {
    const frontPath = item.frontImagePath;
    const backPath = item.backImagePath;
    if (!frontPath || !backPath) {
      throw createItemProcessError("missing_required_images", "Each item requires front and back label images", false);
    }

    const front = await readFile(frontPath).catch(() => {
      throw createItemProcessError("image_read_failed", `Failed reading front image at ${frontPath}`, false);
    });
    const back = await readFile(backPath).catch(() => {
      throw createItemProcessError("image_read_failed", `Failed reading back image at ${backPath}`, false);
    });

    const additionalPaths = item.additionalImagePaths ?? [];
    const additional = await Promise.all(
      additionalPaths.map(async (path) => ({ path, buffer: await readFile(path) }))
    ).catch(() => {
      throw createItemProcessError("image_read_failed", "Failed reading one or more additional images", false);
    });

    const app = await complianceService.createApplication(item.regulatoryProfile, "batch");

    await submissionImageStore.saveImage({
      imageId: randomUUID(),
      applicationId: app.applicationId,
      role: "front",
      imageIndex: 0,
      image: front,
      mimeType: mimeFromPath(frontPath)
    });
    await submissionImageStore.saveImage({
      imageId: randomUUID(),
      applicationId: app.applicationId,
      role: "back",
      imageIndex: 0,
      image: back,
      mimeType: mimeFromPath(backPath)
    });

    for (let i = 0; i < additional.length; i += 1) {
      await submissionImageStore.saveImage({
        imageId: randomUUID(),
        applicationId: app.applicationId,
        role: "additional",
        imageIndex: i,
        image: additional[i].buffer,
        mimeType: mimeFromPath(additional[i].path)
      });
    }

    const images: Array<{ role: ScanImageRole; index: number; image: Buffer }> = [
      { role: "front", index: 0, image: front },
      { role: "back", index: 0, image: back },
      ...additional.map((img, index) => ({ role: "additional" as const, index, image: img.buffer }))
    ];

    const expected: ExpectedLabelFields = {
      brandName: item.expectedBrandName,
      classType: item.expectedClassType,
      abvText: item.expectedAbvText,
      netContents: item.expectedNetContents,
      requireGovWarning: item.requireGovWarning ?? true
    };

    const quickCheck = await this.scannerService.quickCheckMultiImage(images, expected);
    const recorded = await complianceService.recordScannerQuickCheck(app.applicationId, quickCheck, expected);
    if (!recorded) {
      throw createItemProcessError("application_update_failed", "Failed to store scanner result", true);
    }

    return app.applicationId;
  }

  private async discoverBatchItems(extractRoot: string, mode?: "csv_bundle" | "directory_bundle"): Promise<DiscoveredItem[]> {
    if (mode === "directory_bundle") {
      return discoverDirectoryBundle(extractRoot);
    }

    const files = await listFilesRecursive(extractRoot);
    const csvFile = files.find((file) => extname(file).toLowerCase() === ".csv");
    if (!csvFile) {
      return discoverDirectoryBundle(extractRoot);
    }

    const rows = parseCsv(await readFile(csvFile, "utf-8"));
    if (rows.length === 0) {
      throw createItemProcessError("manifest_parse_failed", "CSV manifest is empty", false);
    }

    const imageFiles = files.filter((file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()));
    const imageMap = buildImageMap(imageFiles);

    const discovered: DiscoveredItem[] = [];
    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const brand = stringOrUndefined(row.brand_name ?? row.brand ?? row.expected_brand_name);
      const classType = stringOrUndefined(row.class ?? row.class_type ?? row.expected_class_type);
      if (!brand || !classType) continue;

      const key = imageKey(brand, classType);
      const images = imageMap.get(key) ?? { front: undefined, back: undefined, additional: [] };
      discovered.push({
        clientLabelId: stringOrUndefined(row.client_label_id) ?? `row-${i + 1}`,
        regulatoryProfile: normalizeRegulatoryProfile(row.regulatory_profile),
        expectedBrandName: brand,
        expectedClassType: classType,
        expectedAbvText: stringOrUndefined(row.alcohol_content ?? row.expected_abv_text ?? row.abv_text),
        expectedNetContents: stringOrUndefined(row.net_contents ?? row.expected_net_contents),
        expectedGovernmentWarning: stringOrUndefined(row.government_warning ?? row.expected_warning_text),
        requireGovWarning: true,
        frontImagePath: images.front,
        backImagePath: images.back,
        additionalImagePaths: images.additional
      });
    }

    return discovered;
  }

  private makeBatchItemRecord(item: BatchItemInput): BatchItemRecord {
    return {
      batchItemId: randomUUID(),
      clientLabelId: item.clientLabelId,
      imageFilename: item.imageFilename,
      regulatoryProfile: item.regulatoryProfile,
      expectedBrandName: item.expectedBrandName,
      expectedClassType: item.expectedClassType,
      expectedAbvText: item.expectedAbvText,
      expectedNetContents: item.expectedNetContents,
      expectedGovernmentWarning: item.expectedGovernmentWarning,
      requireGovWarning: item.requireGovWarning,
      frontImagePath: item.frontImagePath,
      backImagePath: item.backImagePath,
      additionalImagePaths: item.additionalImagePaths,
      status: "queued",
      retryCount: 0,
      updatedAt: new Date().toISOString()
    };
  }

  private async transitionBatch(batchId: string, status: BatchJobRecord["status"], ingestStatus: BatchJobRecord["ingestStatus"]) {
    const job = this.jobs.get(batchId);
    if (!job) return;

    const next: BatchJobRecord = {
      ...job,
      status,
      ingestStatus,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(batchId, next);

    await complianceService.mergeClientSync(next.applicationId, { status });
    await this.persistBatchState(next, this.items.get(batchId) ?? []);
    this.publishBatchProgress(next.batchId, next.applicationId, status, this.items.get(batchId) ?? [], ingestStatus);
  }

  private async persistBatchState(job: BatchJobRecord, items: BatchItemRecord[]) {
    try {
      await eventStore.upsertBatchJob(job);
      await eventStore.upsertBatchItems(job.batchId, items);
    } catch {
      // Keep local state if persistence is temporarily unavailable.
    }
  }

  private async persistAttempts(attempts: BatchItemAttemptRecord[]) {
    for (const attempt of attempts) {
      try {
        await eventStore.appendBatchItemAttempt(attempt);
      } catch {
        // Non-blocking.
      }
    }
  }

  private async hydrateBatch(batchId: string) {
    if (this.jobs.has(batchId)) return;

    try {
      const persistedJob = await eventStore.getBatchJob(batchId);
      if (persistedJob) {
        this.jobs.set(batchId, persistedJob);
        const persistedItems = await eventStore.listBatchItems(batchId, 5000, 0);
        this.items.set(batchId, persistedItems);
      }
    } catch {
      // Fall back to in-memory only.
    }
  }

  private publishBatchProgress(
    batchId: string,
    applicationId: string,
    status: BatchJobRecord["status"],
    items: BatchItemRecord[],
    ingestStatus?: BatchJobRecord["ingestStatus"]
  ) {
    const completed = items.filter((item) => item.status === "completed").length;
    const failed = items.filter((item) => item.status === "failed").length;
    const processing = items.filter((item) => item.status === "processing").length;
    const queued = items.filter((item) => item.status === "queued").length;

    realtimeEventBus.publish({
      type: "batch.progress",
      batchId,
      applicationId,
      scope: "all",
      data: {
        status,
        ingestStatus: ingestStatus ?? "processing",
        totalItems: items.length,
        discoveredItems: items.length,
        queuedItems: queued,
        processingItems: processing,
        processedItems: completed + failed,
        completedItems: completed,
        failedItems: failed,
        progressPct: items.length > 0 ? Math.round(((completed + failed) / items.length) * 100) : 0
      }
    });
  }
}

function calcProgress(job: BatchJobRecord): number {
  const total = job.totalItems || 0;
  if (total < 1) return 0;
  const processed = (job.completedItems ?? 0) + (job.failedItems ?? 0);
  return Math.round((processed / total) * 100);
}

async function runWithConcurrency<T>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<void>) {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (true) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) break;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}

function createItemProcessError(code: string, message: string, retryable: boolean): ItemProcessError {
  const err = new Error(message) as ItemProcessError;
  err.code = code;
  err.retryable = retryable;
  return err;
}

function normalizeProcessError(error: unknown): ItemProcessError {
  if (typeof error === "object" && error && "code" in error && "retryable" in error) {
    return error as ItemProcessError;
  }
  const fallback = new Error(error instanceof Error ? error.message : "unknown_error") as ItemProcessError;
  fallback.code = "processing_failed";
  fallback.retryable = true;
  return fallback;
}

function normalizeRegulatoryProfile(input: string | undefined): BatchItemInput["regulatoryProfile"] {
  if (input === "wine" || input === "malt_beverage") return input;
  return "distilled_spirits";
}

async function listFilesRecursive(root: string): Promise<string[]> {
  const out: string[] = [];
  const entries = await readdir(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith("__MACOSX") || entry.name.startsWith(".")) continue;
    const fullPath = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...await listFilesRecursive(fullPath));
      continue;
    }
    out.push(fullPath);
  }
  return out;
}

async function extractZipToDirectory(archivePath: string, destinationRoot: string): Promise<void> {
  await mkdir(destinationRoot, { recursive: true });

  const yauzlMod = await import("yauzl");
  const yauzl = yauzlMod as unknown as {
    open: (
      path: string,
      options: { lazyEntries: boolean; decodeStrings: boolean; autoClose: boolean },
      cb: (err: Error | null, zip: any) => void
    ) => void;
  };

  await new Promise<void>((resolve, reject) => {
    yauzl.open(archivePath, { lazyEntries: true, decodeStrings: true, autoClose: true }, (error, zipFile) => {
      if (error || !zipFile) {
        reject(error ?? new Error("zip_open_failed"));
        return;
      }

      zipFile.readEntry();
      zipFile.on("entry", async (entry: any) => {
        try {
          const relativeName = sanitizeEntryName(entry.fileName);
          if (!relativeName) {
            zipFile.readEntry();
            return;
          }

          if (relativeName.endsWith("/")) {
            await mkdir(join(destinationRoot, relativeName), { recursive: true });
            zipFile.readEntry();
            return;
          }

          const outPath = join(destinationRoot, relativeName);
          await mkdir(dirname(outPath), { recursive: true });

          zipFile.openReadStream(entry, (streamError: Error | null, readStream: any) => {
            if (streamError || !readStream) {
              reject(streamError ?? new Error("zip_stream_open_failed"));
              return;
            }
            const outStream = createWriteStream(outPath);
            readStream.on("error", reject);
            outStream.on("error", reject);
            outStream.on("finish", () => {
              zipFile.readEntry();
            });
            readStream.pipe(outStream);
          });
        } catch (err) {
          reject(err);
        }
      });

      zipFile.on("end", resolve);
      zipFile.on("error", reject);
    });
  });
}

function sanitizeEntryName(name: string): string {
  const trimmed = name.replace(/\\/g, "/");
  const normalized = trimmed.split("/").filter(Boolean);
  if (normalized.some((part) => part === "..")) return "";
  return normalized.join("/");
}

function buildImageMap(files: string[]): Map<string, { front?: string; back?: string; additional: string[] }> {
  const map = new Map<string, { front?: string; back?: string; additional: string[] }>();
  for (const file of files) {
    const parsed = parseImageDescriptor(file);
    if (!parsed) continue;

    const next = map.get(parsed.key) ?? { additional: [] };
    if (parsed.role === "front") next.front = file;
    else if (parsed.role === "back") next.back = file;
    else next.additional.push(file);
    map.set(parsed.key, next);
  }
  return map;
}

function parseImageDescriptor(filePath: string): { key: string; role: "front" | "back" | "additional" } | null {
  const ext = extname(filePath).toLowerCase();
  if (!IMAGE_EXTENSIONS.has(ext)) return null;

  const stem = basename(filePath, ext);
  const match = stem.match(/^(front|back|extra\d+)-(.+)-(.+)$/i);
  if (!match) return null;

  const roleRaw = match[1].toLowerCase();
  const brand = match[2];
  const classType = match[3];
  const role: "front" | "back" | "additional" = roleRaw === "front" ? "front" : roleRaw === "back" ? "back" : "additional";
  return { key: imageKey(brand, classType), role };
}

function imageKey(brand: string, classType: string): string {
  return `${slugify(brand)}-${slugify(classType)}`;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function parseCsv(csv: string): Array<Record<string, string>> {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = parseCsvLine(lines[0]).map((h) => h.trim().toLowerCase());
  const rows: Array<Record<string, string>> = [];

  for (let i = 1; i < lines.length; i += 1) {
    const cols = parseCsvLine(lines[i]);
    const row: Record<string, string> = {};
    headers.forEach((header, index) => {
      row[header] = (cols[index] ?? "").trim();
    });
    rows.push(row);
  }
  return rows;
}

function parseCsvLine(line: string): string[] {
  const out: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (ch === "," && !inQuotes) {
      out.push(current);
      current = "";
      continue;
    }

    current += ch;
  }
  out.push(current);
  return out;
}

async function discoverDirectoryBundle(root: string): Promise<DiscoveredItem[]> {
  const files = await listFilesRecursive(root);
  const labelFiles = files.filter((file) => basename(file).toLowerCase() === "label.txt");
  const discovered: DiscoveredItem[] = [];

  for (const labelFile of labelFiles) {
    const dir = dirname(labelFile);
    const manifest = parseLabelManifest(await readFile(labelFile, "utf-8"));
    const dirEntries = await readdir(dir, { withFileTypes: true });
    const images = dirEntries
      .filter((entry) => entry.isFile())
      .map((entry) => join(dir, entry.name))
      .filter((file) => IMAGE_EXTENSIONS.has(extname(file).toLowerCase()));

    const mapped = { front: undefined as string | undefined, back: undefined as string | undefined, additional: [] as string[] };
    for (const file of images) {
      const stem = basename(file, extname(file)).toLowerCase();
      if (stem.startsWith("front-")) mapped.front = file;
      else if (stem.startsWith("back-")) mapped.back = file;
      else if (stem.startsWith("extra")) mapped.additional.push(file);
    }

    discovered.push({
      clientLabelId: manifest.client_label_id ?? (relative(root, dir) || randomUUID()),
      regulatoryProfile: normalizeRegulatoryProfile(manifest.regulatory_profile),
      expectedBrandName: manifest.brand_name,
      expectedClassType: manifest.class,
      expectedAbvText: manifest.alcohol_content,
      expectedNetContents: manifest.net_contents,
      expectedGovernmentWarning: manifest.government_warning,
      requireGovWarning: true,
      frontImagePath: mapped.front,
      backImagePath: mapped.back,
      additionalImagePaths: mapped.additional
    });
  }

  return discovered;
}

function parseLabelManifest(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const ix = line.indexOf(":");
    if (ix < 0) continue;
    const key = line.slice(0, ix).trim().toLowerCase();
    const value = line.slice(ix + 1).trim();
    if (!key) continue;
    out[key] = value;
  }
  return out;
}

function stringOrUndefined(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function mimeFromPath(path: string): string {
  const ext = extname(path).toLowerCase();
  switch (ext) {
    case ".png":
      return "image/png";
    case ".heic":
      return "image/heic";
    case ".webp":
      return "image/webp";
    default:
      return "image/jpeg";
  }
}

function mergeAttempts(memory: BatchItemAttemptRecord[], persisted: BatchItemAttemptRecord[]) {
  const byId = new Map<string, BatchItemAttemptRecord>();
  for (const attempt of persisted) byId.set(attempt.attemptId, attempt);
  for (const attempt of memory) byId.set(attempt.attemptId, attempt);
  return Array.from(byId.values()).sort((a, b) => a.attemptNo - b.attemptNo);
}

export const batchService = new BatchService();
