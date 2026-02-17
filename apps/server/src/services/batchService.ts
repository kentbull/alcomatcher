import { randomUUID } from "node:crypto";
import { complianceService } from "./complianceService.js";
import { eventStore } from "./eventStore.js";
import { realtimeEventBus } from "./realtimeEventBus.js";
import type { BatchItemAttemptRecord, BatchItemInput, BatchItemRecord, BatchJobRecord } from "../types/batch.js";
import type { RegulatoryProfile } from "../types/compliance.js";

interface BatchStatusView extends BatchJobRecord {
  processedItems: number;
  failedItems: number;
  items: BatchItemRecord[];
}

interface BatchItemDetail {
  item: BatchItemRecord;
  attempts: BatchItemAttemptRecord[];
}

const MAX_RETRIES = 2;

/**
 * Batch ingestion + resilient per-item processing foundation.
 * Uses deterministic simulated processing in v1 to harden queue/retry/error workflows.
 */
export class BatchService {
  private readonly jobs = new Map<string, BatchJobRecord>();
  private readonly items = new Map<string, BatchItemRecord[]>();
  private readonly attempts = new Map<string, BatchItemAttemptRecord[]>();

  async createBatch(items: BatchItemInput[], defaultRegulatoryProfile: RegulatoryProfile = "distilled_spirits"): Promise<BatchJobRecord> {
    const profile = items[0]?.regulatoryProfile ?? defaultRegulatoryProfile;
    const app = await complianceService.createApplication(profile, "batch");

    const batchId = randomUUID();
    const now = new Date().toISOString();
    const record: BatchJobRecord = {
      batchId,
      applicationId: app.applicationId,
      totalItems: items.length,
      acceptedItems: 0,
      rejectedItems: 0,
      status: "batch_received",
      createdAt: now,
      updatedAt: now
    };

    const batchItems: BatchItemRecord[] = items.map((item) => ({
      batchItemId: randomUUID(),
      clientLabelId: item.clientLabelId,
      imageFilename: item.imageFilename,
      regulatoryProfile: item.regulatoryProfile,
      status: "queued",
      retryCount: 0
    }));

    this.jobs.set(batchId, record);
    this.items.set(batchId, batchItems);
    this.attempts.set(batchId, []);

    await this.persistBatchState(record, batchItems);
    this.publishBatchProgress(batchId, app.applicationId, "batch_received", batchItems);

    await this.transitionBatch(batchId, "batch_processing");
    await this.processBatchItems(batchId);

    return this.jobs.get(batchId) ?? record;
  }

  async getBatchStatus(batchId: string, limit = 100, offset = 0): Promise<BatchStatusView | null> {
    await this.hydrateBatch(batchId);
    const job = this.jobs.get(batchId);
    if (!job) return null;

    const batchItems = this.items.get(batchId) ?? [];
    const window = batchItems.slice(offset, offset + limit);
    const failedItems = batchItems.filter((item) => item.status === "failed").length;
    const processedItems = batchItems.filter((item) => item.status === "completed" || item.status === "failed").length;

    return {
      ...job,
      failedItems,
      processedItems,
      items: window
    };
  }

  async listBatchJobs(limit = 100) {
    const jobs = await eventStore.listBatchJobs(limit);
    for (const job of jobs) {
      this.jobs.set(job.batchId, job);
    }
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

  private async processBatchItems(batchId: string) {
    const job = this.jobs.get(batchId);
    const batchItems = this.items.get(batchId);
    if (!job || !batchItems) return;

    const updatedItems: BatchItemRecord[] = [];
    const attempts = this.attempts.get(batchId) ?? [];

    for (const item of batchItems) {
      const processingItem: BatchItemRecord = { ...item, status: "processing" };
      updatedItems.push(processingItem);
      this.items.set(batchId, [...updatedItems, ...batchItems.slice(updatedItems.length)]);
      await this.persistBatchState(job, this.items.get(batchId) ?? batchItems);

      const result = await this.processItemWithRetry(processingItem);
      updatedItems[updatedItems.length - 1] = result.item;
      attempts.push(...result.attempts);
      this.attempts.set(batchId, attempts);
      await this.persistAttempts(result.attempts);
      this.items.set(batchId, [...updatedItems, ...batchItems.slice(updatedItems.length)]);
      this.publishBatchProgress(batchId, job.applicationId, "batch_processing", this.items.get(batchId) ?? updatedItems);
    }

    const failedItems = updatedItems.filter((item) => item.status === "failed").length;
    const completedItems = updatedItems.filter((item) => item.status === "completed").length;
    const finalStatus: BatchJobRecord["status"] = failedItems > 0 ? "batch_partially_failed" : "batch_completed";
    const nextJob: BatchJobRecord = {
      ...job,
      acceptedItems: completedItems,
      rejectedItems: failedItems,
      status: finalStatus,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(batchId, nextJob);
    this.items.set(batchId, updatedItems);

    await complianceService.mergeClientSync(nextJob.applicationId, {
      status: finalStatus
    });
    await this.persistBatchState(nextJob, updatedItems);
    this.publishBatchProgress(batchId, nextJob.applicationId, finalStatus, updatedItems);
  }

  private async processItemWithRetry(item: BatchItemRecord): Promise<{ item: BatchItemRecord; attempts: BatchItemAttemptRecord[] }> {
    const attempts: BatchItemAttemptRecord[] = [];
    let retryCount = 0;

    for (let attemptNo = 1; attemptNo <= MAX_RETRIES + 1; attemptNo += 1) {
      const evalResult = evaluateItemAttempt(item.imageFilename, attemptNo);
      if (evalResult.success) {
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
            lastErrorCode: undefined,
            errorReason: undefined
          },
          attempts
        };
      }

      const errorMessage = `${evalResult.code}: ${evalResult.reason}`;
      attempts.push({
        attemptId: randomUUID(),
        batchItemId: item.batchItemId,
        attemptNo,
        outcome: "failed",
        errorCode: evalResult.code,
        errorReason: evalResult.reason,
        createdAt: new Date().toISOString()
      });

      retryCount += 1;
      if (!evalResult.retryable || attemptNo > MAX_RETRIES) {
        return {
          item: {
            ...item,
            status: "failed",
            retryCount,
            lastErrorCode: evalResult.code,
            errorReason: errorMessage
          },
          attempts
        };
      }
    }

    return {
      item: {
        ...item,
        status: "failed",
        retryCount,
        lastErrorCode: "unknown_failure",
        errorReason: "unknown_failure: exhausted retries"
      },
      attempts
    };
  }

  private async transitionBatch(batchId: string, status: BatchJobRecord["status"]) {
    const job = this.jobs.get(batchId);
    if (!job) return;

    const next: BatchJobRecord = {
      ...job,
      status,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(batchId, next);

    await complianceService.mergeClientSync(next.applicationId, {
      status
    });
    await this.persistBatchState(next, this.items.get(batchId) ?? []);
    this.publishBatchProgress(next.batchId, next.applicationId, status, this.items.get(batchId) ?? []);
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
        // Non-blocking for v1 local reliability simulation.
      }
    }
  }

  private async hydrateBatch(batchId: string) {
    if (this.jobs.has(batchId)) return;

    try {
      const persistedJob = await eventStore.getBatchJob(batchId);
      if (persistedJob) {
        this.jobs.set(batchId, persistedJob);
        const persistedItems = await eventStore.listBatchItems(batchId, 1000, 0);
        this.items.set(batchId, persistedItems);
      }
    } catch {
      // Fall back to in-memory only.
    }
  }

  private publishBatchProgress(batchId: string, applicationId: string, status: BatchJobRecord["status"], items: BatchItemRecord[]) {
    const failedItems = items.filter((item) => item.status === "failed").length;
    const processedItems = items.filter((item) => item.status === "completed" || item.status === "failed").length;

    realtimeEventBus.publish({
      type: "batch.progress",
      batchId,
      applicationId,
      scope: "all",
      data: {
        status,
        totalItems: items.length,
        processedItems,
        failedItems
      }
    });
  }
}

function evaluateItemAttempt(imageFilename: string, attemptNo: number): {
  success: boolean;
  retryable: boolean;
  code?: string;
  reason?: string;
} {
  const lower = imageFilename.toLowerCase();

  if (!/\.(jpe?g|png|heic|webp)$/i.test(lower)) {
    return {
      success: false,
      retryable: false,
      code: "unsupported_file_type",
      reason: "Image filename must end with .jpg/.jpeg/.png/.heic/.webp"
    };
  }

  if (lower.includes("corrupt") || lower.includes("decodefail")) {
    return {
      success: false,
      retryable: false,
      code: "decode_failed",
      reason: "Could not decode image bytes for OCR preprocessing"
    };
  }

  if (lower.includes("retry") && attemptNo === 1) {
    return {
      success: false,
      retryable: true,
      code: "ocr_timeout",
      reason: "OCR worker timed out on first attempt"
    };
  }

  if (lower.includes("blur") && attemptNo <= 2) {
    return {
      success: false,
      retryable: attemptNo <= 2,
      code: "low_confidence",
      reason: "Image appears blurred; confidence below threshold"
    };
  }

  return {
    success: true,
    retryable: false
  };
}

function mergeAttempts(memory: BatchItemAttemptRecord[], persisted: BatchItemAttemptRecord[]) {
  const byId = new Map<string, BatchItemAttemptRecord>();
  for (const attempt of [...memory, ...persisted]) {
    byId.set(attempt.attemptId, attempt);
  }
  return Array.from(byId.values()).sort((a, b) => a.attemptNo - b.attemptNo);
}

export const batchService = new BatchService();
