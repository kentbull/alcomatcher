import { randomUUID } from "node:crypto";
import type { ComplianceApplicationDoc, ComplianceEvent, CrdtOperation, RegulatoryProfile } from "../types/compliance.js";
import type { ScannerQuickCheckResult } from "../types/scanner.js";
import type { ExpectedLabelFields } from "../types/scanner.js";
import { eventStore } from "./eventStore.js";
import { realtimeEventBus } from "./realtimeEventBus.js";

interface ApplicationProjection {
  applicationId: string;
  status: ComplianceApplicationDoc["status"];
  syncState: ComplianceApplicationDoc["syncState"];
  latestQuickCheck: ScannerQuickCheckResult | null;
  eventCount: number;
  lastEventAt?: string;
}

interface ComplianceReport {
  applicationId: string;
  status: ComplianceApplicationDoc["status"];
  syncState: ComplianceApplicationDoc["syncState"];
  generatedAt: string;
  latestQuickCheck: ScannerQuickCheckResult | null;
  checks: ScannerQuickCheckResult["checks"];
  extracted: ScannerQuickCheckResult["extracted"] | null;
  eventTimeline: ComplianceEvent[];
}

interface KpiSummary {
  generatedAt: string;
  windowHours: number;
  totals: {
    applications: number;
    quickChecks: number;
  };
  scanPerformance: {
    p50Ms: number;
    p95Ms: number;
    fallbackRate: number;
    avgConfidence: number;
  };
  syncHealth: {
    synced: number;
    pending_sync: number;
    sync_failed: number;
  };
  statusCounts: Record<ComplianceApplicationDoc["status"], number>;
}

interface ScannerQuickCheckEventPayload {
  summary: ScannerQuickCheckResult["summary"];
  confidence: number;
  processingMs?: number;
  provider: ScannerQuickCheckResult["provider"];
  usedFallback: boolean;
  extracted: ScannerQuickCheckResult["extracted"];
  checks: ScannerQuickCheckResult["checks"];
}

/**
 * In-memory state for fast local reads, with Postgres-backed event persistence.
 */
export class ComplianceService {
  private readonly docs = new Map<string, ComplianceApplicationDoc>();
  private readonly events = new Map<string, ComplianceEvent[]>();
  private readonly crdtOps = new Map<string, CrdtOperation[]>();

  async createApplication(regulatoryProfile: RegulatoryProfile, submissionType: "single" | "batch") {
    const applicationId = randomUUID();
    const now = new Date().toISOString();

    const doc: ComplianceApplicationDoc = {
      applicationId,
      documentId: randomUUID(),
      regulatoryProfile,
      submissionType,
      status: submissionType === "batch" ? "batch_received" : "captured",
      checks: [],
      syncState: "pending_sync",
      updatedAt: now
    };

    this.docs.set(applicationId, doc);
    await this.appendEvent(applicationId, "ApplicationCreated", {
      regulatoryProfile,
      submissionType,
      syncState: doc.syncState
    });

    await this.persistApplication(doc);
    this.publishStatusChanged(doc.applicationId, doc.status, doc.syncState, {
      reason: "application_created"
    });
    return doc;
  }

  async mergeClientSync(applicationId: string, patch: Partial<ComplianceApplicationDoc>) {
    const existing = this.docs.get(applicationId);
    if (!existing) return null;

    const merged: ComplianceApplicationDoc = {
      ...existing,
      ...patch,
      applicationId: existing.applicationId,
      documentId: existing.documentId,
      updatedAt: new Date().toISOString()
    };

    this.docs.set(applicationId, merged);
    await this.appendEvent(applicationId, "SyncMerged", {
      patchKeys: Object.keys(patch),
      syncState: merged.syncState
    });

    await this.persistApplication(merged);
    if (patch.status || patch.syncState) {
      this.publishStatusChanged(merged.applicationId, merged.status, merged.syncState, {
        reason: "sync_patch_applied",
        patchKeys: Object.keys(patch)
      });
    }
    return merged;
  }

  async recordScannerQuickCheck(applicationId: string, result: ScannerQuickCheckResult, expected?: ExpectedLabelFields) {
    const existing = this.docs.get(applicationId);
    if (!existing) return null;

    const nextStatus: ComplianceApplicationDoc["status"] =
      result.summary === "pass" ? "matched" : result.summary === "fail" ? "rejected" : "needs_review";

    const updated: ComplianceApplicationDoc = {
      ...existing,
      status: nextStatus,
      syncState: "pending_sync",
      updatedAt: new Date().toISOString()
    };

    this.docs.set(applicationId, updated);

    await this.appendEvent(applicationId, "ScannerQuickCheckRecorded", {
      summary: result.summary,
      confidence: result.confidence,
      processingMs: result.processingMs,
      provider: result.provider,
      usedFallback: result.usedFallback,
      expected: expected ?? null,
      extracted: result.extracted,
      checks: result.checks
    });

    await this.persistApplication(updated);
    this.publishStatusChanged(updated.applicationId, updated.status, updated.syncState, {
      reason: "scanner_quick_check_recorded",
      summary: result.summary,
      confidence: result.confidence
    });
    return updated;
  }

  async listApplications() {
    try {
      const persisted = await eventStore.listApplications();
      if (persisted.length > 0) {
        for (const doc of persisted) {
          this.docs.set(doc.applicationId, doc);
        }
        return persisted;
      }
    } catch {
      // Fall back to in-memory list.
    }

    return Array.from(this.docs.values());
  }

  async getEvents(applicationId: string) {
    try {
      const persisted = await eventStore.getEvents(applicationId);
      if (persisted.length > 0) {
        this.events.set(applicationId, persisted);
        return persisted;
      }
    } catch {
      // Fall back to in-memory events.
    }

    return this.events.get(applicationId) ?? [];
  }

  async getProjection(applicationId: string): Promise<ApplicationProjection | null> {
    let doc = this.docs.get(applicationId);
    if (!doc) {
      const docs = await this.listApplications();
      doc = docs.find((entry) => entry.applicationId === applicationId);
    }
    if (!doc) return null;

    const events = await this.getEvents(applicationId);
    const latestQuickCheckEvent = [...events].reverse().find((event) => event.eventType === "ScannerQuickCheckRecorded");
    const latestQuickCheckPayload = latestQuickCheckEvent?.payload as Partial<ScannerQuickCheckEventPayload> | undefined;
    const latestQuickCheck =
      latestQuickCheckPayload?.summary &&
      latestQuickCheckPayload?.extracted &&
      latestQuickCheckPayload?.checks &&
      typeof latestQuickCheckPayload?.confidence === "number" &&
      latestQuickCheckPayload?.provider
        ? {
            summary: latestQuickCheckPayload.summary,
            extracted: latestQuickCheckPayload.extracted,
            checks: latestQuickCheckPayload.checks,
            confidence: latestQuickCheckPayload.confidence,
            processingMs: latestQuickCheckPayload.processingMs,
            provider: latestQuickCheckPayload.provider,
            usedFallback: Boolean(latestQuickCheckPayload.usedFallback)
          }
        : null;

    return {
      applicationId,
      status: doc.status,
      syncState: doc.syncState,
      latestQuickCheck,
      eventCount: events.length,
      lastEventAt: events.length > 0 ? events[events.length - 1].createdAt : undefined
    };
  }

  async getApplication(applicationId: string): Promise<ComplianceApplicationDoc | null> {
    let doc = this.docs.get(applicationId);
    if (doc) return doc;

    const all = await this.listApplications();
    doc = all.find((entry) => entry.applicationId === applicationId);
    return doc ?? null;
  }

  async listAdminQueue(status?: ComplianceApplicationDoc["status"]) {
    const applications = await this.listApplications();
    const filtered = status ? applications.filter((app) => app.status === status) : applications;

    const projections = await Promise.all(
      filtered.map(async (app) => ({
        applicationId: app.applicationId,
        status: app.status,
        syncState: app.syncState,
        updatedAt: app.updatedAt,
        projection: await this.getProjection(app.applicationId)
      }))
    );

    return projections;
  }

  async buildComplianceReport(applicationId: string): Promise<ComplianceReport | null> {
    const doc = await this.getApplication(applicationId);
    if (!doc) return null;

    const projection = await this.getProjection(applicationId);
    const timeline = await this.getEvents(applicationId);

    return {
      applicationId,
      status: doc.status,
      syncState: doc.syncState,
      generatedAt: new Date().toISOString(),
      latestQuickCheck: projection?.latestQuickCheck ?? null,
      checks: projection?.latestQuickCheck?.checks ?? [],
      extracted: projection?.latestQuickCheck?.extracted ?? null,
      eventTimeline: timeline
    };
  }

  async backfillPendingSyncToSynced() {
    const updatedCount = await eventStore.backfillPendingSyncToSynced();
    this.docs.clear();
    return {
      updatedCount,
      updatedAt: new Date().toISOString()
    };
  }

  async getKpiSummary(windowHours = 24): Promise<KpiSummary> {
    const applications = await this.listApplications();
    const syncHealth = await eventStore.getSyncStateCounts();
    const statusCounts = await eventStore.getStatusCounts();
    const quickChecks = await eventStore.listRecentQuickCheckMetrics(windowHours);

    const processingValues = quickChecks.map((item) => item.processingMs).filter((value): value is number => typeof value === "number");
    const fallbackCount = quickChecks.filter((item) => item.usedFallback).length;
    const confidenceSum = quickChecks.reduce((sum, item) => sum + item.confidence, 0);

    return {
      generatedAt: new Date().toISOString(),
      windowHours,
      totals: {
        applications: applications.length,
        quickChecks: quickChecks.length
      },
      scanPerformance: {
        p50Ms: percentile(processingValues, 50),
        p95Ms: percentile(processingValues, 95),
        fallbackRate: quickChecks.length > 0 ? fallbackCount / quickChecks.length : 0,
        avgConfidence: quickChecks.length > 0 ? confidenceSum / quickChecks.length : 0
      },
      syncHealth,
      statusCounts
    };
  }

  async appendCrdtOps(applicationId: string, actorId: string, ops: Array<{ sequence: number; payload: Record<string, unknown> }>) {
    const existingDoc = await this.getApplication(applicationId);
    if (!existingDoc) return null;

    const stampedOps: CrdtOperation[] = ops.map((op) => ({
      opId: randomUUID(),
      applicationId,
      actorId,
      sequence: op.sequence,
      payload: op.payload,
      createdAt: new Date().toISOString()
    }));

    const existing = this.crdtOps.get(applicationId) ?? [];
    existing.push(...stampedOps);
    existing.sort((a, b) => a.sequence - b.sequence);
    this.crdtOps.set(applicationId, existing);

    try {
      await eventStore.appendCrdtOps(applicationId, stampedOps);
    } catch {
      await this.mergeClientSync(applicationId, { syncState: "sync_failed" });
      throw new Error("crdt_persist_failed");
    }

    await this.appendEvent(applicationId, "SyncMerged", {
      opCount: stampedOps.length,
      actorId
    });

    await this.mergeClientSync(applicationId, { syncState: "synced" });
    realtimeEventBus.publish({
      type: "sync.ack",
      applicationId,
      scope: "all",
      data: {
        actorId,
        opCount: stampedOps.length,
        syncState: "synced"
      }
    });

    return stampedOps;
  }

  async listCrdtOps(applicationId: string, afterSequence = 0) {
    if (!this.docs.has(applicationId)) return null;

    try {
      const persisted = await eventStore.listCrdtOps(applicationId, afterSequence);
      if (persisted.length > 0) {
        const local = this.crdtOps.get(applicationId) ?? [];
        const knownOpIds = new Set(local.map((op) => op.opId));
        const merged = [...local, ...persisted.filter((op) => !knownOpIds.has(op.opId))];
        merged.sort((a, b) => a.sequence - b.sequence);
        this.crdtOps.set(applicationId, merged);
      }
    } catch {
      // Fall back to in-memory state.
    }

    const current = this.crdtOps.get(applicationId) ?? [];
    return current.filter((op) => op.sequence > afterSequence);
  }

  private async appendEvent(applicationId: string, eventType: ComplianceEvent["eventType"], payload: Record<string, unknown>) {
    const event: ComplianceEvent = {
      eventId: randomUUID(),
      applicationId,
      eventType,
      payload,
      createdAt: new Date().toISOString()
    };

    const current = this.events.get(applicationId) ?? [];
    current.push(event);
    this.events.set(applicationId, current);

    try {
      await eventStore.appendEvent(event);
    } catch {
      // Keep local state even if persistence is temporarily unavailable.
    }
  }

  private async persistApplication(doc: ComplianceApplicationDoc) {
    try {
      await eventStore.upsertApplication(doc);
    } catch {
      // Non-blocking persistence fallback.
    }
  }

  private publishStatusChanged(
    applicationId: string,
    status: ComplianceApplicationDoc["status"],
    syncState: ComplianceApplicationDoc["syncState"],
    context?: Record<string, unknown>
  ) {
    realtimeEventBus.publish({
      type: "application.status_changed",
      applicationId,
      scope: "all",
      data: {
        status,
        syncState,
        ...(context ?? {})
      }
    });
  }
}

export const complianceService = new ComplianceService();

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[rank];
}
