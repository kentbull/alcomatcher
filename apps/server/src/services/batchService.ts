import { randomUUID } from "node:crypto";
import { complianceService } from "./complianceService.js";
import { eventStore } from "./eventStore.js";
import type { BatchItemInput, BatchItemRecord, BatchJobRecord } from "../types/batch.js";
import type { RegulatoryProfile } from "../types/compliance.js";

interface BatchStatusView extends BatchJobRecord {
  processedItems: number;
  failedItems: number;
  items: BatchItemRecord[];
}

/**
 * Batch ingestion foundation for week-one queue and status workflows.
 */
export class BatchService {
  private readonly jobs = new Map<string, BatchJobRecord>();
  private readonly items = new Map<string, BatchItemRecord[]>();

  async createBatch(items: BatchItemInput[], defaultRegulatoryProfile: RegulatoryProfile = "distilled_spirits"): Promise<BatchJobRecord> {
    const profile = items[0]?.regulatoryProfile ?? defaultRegulatoryProfile;
    const app = await complianceService.createApplication(profile, "batch");

    const batchId = randomUUID();
    const now = new Date().toISOString();
    const record: BatchJobRecord = {
      batchId,
      applicationId: app.applicationId,
      totalItems: items.length,
      acceptedItems: items.length,
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
      status: "queued"
    }));

    this.jobs.set(batchId, record);
    this.items.set(batchId, batchItems);

    await this.persistBatchState(record, batchItems);
    await this.transitionBatch(batchId, "batch_processing");
    await this.markAllComplete(batchId);

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
  }

  private async markAllComplete(batchId: string) {
    const job = this.jobs.get(batchId);
    const batchItems = this.items.get(batchId);
    if (!job || !batchItems) return;

    const completed = batchItems.map((item) => ({
      ...item,
      status: "completed" as const
    }));
    this.items.set(batchId, completed);

    const doneJob: BatchJobRecord = {
      ...job,
      status: "batch_completed",
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(batchId, doneJob);

    await complianceService.mergeClientSync(doneJob.applicationId, {
      status: "batch_completed"
    });
    await this.persistBatchState(doneJob, completed);
  }

  private async persistBatchState(job: BatchJobRecord, items: BatchItemRecord[]) {
    try {
      await eventStore.upsertBatchJob(job);
      await eventStore.upsertBatchItems(job.batchId, items);
    } catch {
      // Keep local state if persistence is temporarily unavailable.
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
}

export const batchService = new BatchService();
