import { randomUUID } from "node:crypto";
import type { LabelApplicationDoc, ComplianceCheck, ComplianceEvent, CrdtOperation, RegulatoryProfile } from "../types/compliance.js";
import { labelApplicationStatusColor } from "../types/compliance.js";
/** @deprecated Use LabelApplicationDoc */
type ComplianceApplicationDoc = LabelApplicationDoc;
import type { ScannerQuickCheckResult } from "../types/scanner.js";
import type { ExpectedLabelFields } from "../types/scanner.js";
import { eventStore } from "./eventStore.js";
import { realtimeEventBus } from "./realtimeEventBus.js";
import { normalizeScannerChecks } from "./complianceCheckService.js";
import { mergeCrdtOperations } from "./crdtMergeService.js";
import type { ApplicationProjection } from "./projectionService.js";
import { projectApplication } from "./projectionService.js";

interface ComplianceReport {
  applicationId: string;
  status: ComplianceApplicationDoc["status"];
  syncState: ComplianceApplicationDoc["syncState"];
  generatedAt: string;
  latestQuickCheck: ScannerQuickCheckResult | null;
  checks: ComplianceCheck[];
  rawChecks: ScannerQuickCheckResult["checks"];
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
  scanStagePerformance: {
    decisionTotalMs: { p50Ms: number; p95Ms: number };
    sessionCreateMs: { p50Ms: number; p95Ms: number };
    frontUploadMs: { p50Ms: number; p95Ms: number };
    frontOcrMs: { p50Ms: number; p95Ms: number };
    backUploadMs: { p50Ms: number; p95Ms: number };
    backOcrMs: { p50Ms: number; p95Ms: number };
    finalizeMs: { p50Ms: number; p95Ms: number };
  };
  telemetryQuality: {
    complete: number;
    partial: number;
  };
  syncHealth: {
    synced: number;
    pending_sync: number;
    sync_failed: number;
  };
  statusCounts: Record<ComplianceApplicationDoc["status"], number>;
}

type HistoryActor = { userId: string; role: "compliance_officer" | "compliance_manager" };

interface HistoryListItem {
  applicationId: string;
  labelApplicationNumber: string;
  brandName: string | null;
  classType: string | null;
  status: LabelApplicationDoc["status"];
  statusColor: import("../types/compliance.js").LabelApplicationStatusColor;
  syncState: LabelApplicationDoc["syncState"];
  updatedAt: string;
  createdByUserId: string | null;
  summary: ScannerQuickCheckResult["summary"] | null;
  confidence: number | null;
  imageCount: number;
}

/**
 * In-memory state for fast local reads, with Postgres-backed event persistence.
 */
export class ComplianceService {
  private readonly docs = new Map<string, ComplianceApplicationDoc>();
  private readonly events = new Map<string, ComplianceEvent[]>();
  private readonly crdtOps = new Map<string, CrdtOperation[]>();

  async createApplication(regulatoryProfile: RegulatoryProfile, submissionType: "single" | "batch", actorUserId?: string) {
    const applicationId = randomUUID();
    const now = new Date().toISOString();

    const doc: ComplianceApplicationDoc = {
      applicationId,
      documentId: randomUUID(),
      regulatoryProfile,
      submissionType,
      createdByUserId: actorUserId,
      assignedToUserId: actorUserId,
      status: submissionType === "batch" ? "batch_received" : "captured",
      checks: [],
      syncState: "pending_sync",
      updatedAt: now
    };

    // Persist the application row before writing FK-backed events.
    await this.persistApplication(doc);
    await this.appendEvent(applicationId, "ApplicationCreated", {
      regulatoryProfile,
      submissionType,
      actorUserId: actorUserId ?? null,
      syncState: doc.syncState
    });
    if (actorUserId) {
      await this.appendEvent(applicationId, "OwnershipClaimed", {
        ownerUserId: actorUserId,
        reason: "application_created_with_authenticated_actor"
      });
    }
    const created = await this.refreshDocFromEvents(doc, { preserveChecks: true });

    this.publishStatusChanged(applicationId, created.status, created.syncState, {
      reason: "application_created"
    });
    return created;
  }

  async mergeClientSync(applicationId: string, patch: Partial<ComplianceApplicationDoc>) {
    const existing = this.docs.get(applicationId);
    if (!existing) return null;

    const mergedInput: ComplianceApplicationDoc = {
      ...existing,
      ...patch,
      applicationId: existing.applicationId,
      documentId: existing.documentId,
      updatedAt: new Date().toISOString()
    };
    await this.appendEvent(applicationId, "SyncMerged", {
      patchKeys: Object.keys(patch),
      syncState: mergedInput.syncState
    });
    const merged = await this.refreshDocFromEvents(mergedInput, { preserveChecks: true });
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

    const nextStatus: LabelApplicationDoc["status"] =
      result.summary === "pass" ? "matched" : result.summary === "fail" ? "rejected" : "needs_review";

    const brandName = result.extracted?.brandName ?? existing.brandName;
    const classType = result.extracted?.classType ?? existing.classType;

    const normalizedChecks = normalizeScannerChecks(result.checks, existing.regulatoryProfile, result.confidence);
    const updatedInput: LabelApplicationDoc = {
      ...existing,
      status: nextStatus,
      checks: normalizedChecks,
      syncState: "pending_sync",
      brandName,
      classType,
      updatedAt: new Date().toISOString()
    };

    await this.appendEvent(applicationId, "ScannerQuickCheckRecorded", {
      summary: result.summary,
      confidence: result.confidence,
      processingMs: result.processingMs,
      stageTimings: result.stageTimings,
      telemetryQuality: result.telemetryQuality ?? "partial",
      provider: result.provider,
      usedFallback: result.usedFallback,
      expected: expected ?? null,
      extracted: result.extracted,
      composite: result.composite,
      images: result.images,
      checks: result.checks
    });
    const updated = await this.refreshDocFromEvents(updatedInput);
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

  async listApplicationsForActor(actor: { userId: string; role: "compliance_officer" | "compliance_manager" }) {
    const applications = await this.listApplications();
    if (actor.role === "compliance_manager") return applications;

    const accessible: ComplianceApplicationDoc[] = [];
    for (const app of applications) {
      const hasAccess = await this.canActorAccessApplication(app.applicationId, actor);
      if (hasAccess) accessible.push(app);
    }
    return accessible;
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
    return projectApplication(applicationId, events, doc, doc.status);
  }

  async canActorAccessApplication(
    applicationId: string,
    actor: { userId: string; role: "compliance_officer" | "compliance_manager" }
  ): Promise<boolean> {
    if (actor.role === "compliance_manager") return true;
    const ownerUserId = await this.getApplicationOwnerUserId(applicationId);
    if (!ownerUserId) return false;
    return ownerUserId === actor.userId;
  }

  async claimApplicationOwner(applicationId: string, ownerUserId: string): Promise<void> {
    const existingOwner = await this.getApplicationOwnerUserId(applicationId);
    if (existingOwner) return;

    await this.appendEvent(applicationId, "OwnershipClaimed", {
      ownerUserId
    });
  }

  async claimApplicationOwnerForActor(
    applicationId: string,
    ownerUserId: string
  ): Promise<"claimed" | "already_owned_by_you" | "already_owned_by_other" | "application_not_found"> {
    const app = await this.getApplication(applicationId);
    if (!app) return "application_not_found";

    const existingOwner = await this.getApplicationOwnerUserId(applicationId);
    if (!existingOwner) {
      await this.appendEvent(applicationId, "OwnershipClaimed", { ownerUserId });
      return "claimed";
    }
    if (existingOwner === ownerUserId) return "already_owned_by_you";
    return "already_owned_by_other";
  }

  async getApplicationOwner(applicationId: string): Promise<string | null> {
    return this.getApplicationOwnerUserId(applicationId);
  }

  async getApplication(applicationId: string): Promise<ComplianceApplicationDoc | null> {
    let doc = this.docs.get(applicationId);
    if (doc) return doc;

    try {
      const persisted = await eventStore.getApplicationById(applicationId);
      if (persisted) {
        this.docs.set(applicationId, persisted);
        return persisted;
      }
    } catch {
      // Fall through to existing list-based lookup.
    }

    const all = await this.listApplications();
    doc = all.find((entry) => entry.applicationId === applicationId);
    return doc ?? null;
  }

  async listAdminQueue(
    status?: ComplianceApplicationDoc["status"],
    limit?: number,
    offset?: number
  ): Promise<{ items: any[]; totalCount: number }> {
    // Fetch all applications
    const applications = await this.listApplications();

    // Filter by status if provided; exclude phantom "captured" records by default
    const filtered = status
      ? applications.filter((app) => app.status === status)
      : applications.filter((app) => app.status !== "captured");

    const totalCount = filtered.length;

    // Apply pagination if limit provided
    const paginated = limit !== undefined
      ? filtered.slice(offset || 0, (offset || 0) + limit)
      : filtered;

    // Enrich with projections
    const queueItems = await Promise.all(
      paginated.map(async (app) => {
        const projection = await this.getProjection(app.applicationId);
        const latestQuickCheck = projection?.latestQuickCheck;
        const extracted = latestQuickCheck?.extracted;

        return {
          applicationId: app.applicationId,
          status: projection?.status ?? app.status,
          syncState: app.syncState,
          confidence: latestQuickCheck?.confidence ?? 0,
          brandName: extracted?.brandName,
          updatedAt: app.updatedAt,
          createdByUserId: app.createdByUserId,
          regulatoryProfile: app.regulatoryProfile,
        };
      })
    );

    return { items: queueItems, totalCount };
  }

  async listHistoryForActor(
    actor: HistoryActor,
    options?: {
      limit?: number;
      status?: ComplianceApplicationDoc["status"];
      syncState?: ComplianceApplicationDoc["syncState"];
      cursor?: string;
      createdByUserId?: string;
    }
  ): Promise<{ items: HistoryListItem[]; nextCursor: string | null }> {
    const all = await this.listApplicationsForActor(actor);
    const withProjection = await Promise.all(
      all.map(async (app) => {
        const projection = await this.getProjection(app.applicationId);
        const ownerUserId = await this.getApplicationOwnerUserId(app.applicationId);
        const status = projection?.status ?? app.status;
        return {
          applicationId: app.applicationId,
          labelApplicationNumber: app.applicationId.slice(0, 8).toUpperCase(),
          brandName: app.brandName ?? null,
          classType: app.classType ?? null,
          status,
          statusColor: labelApplicationStatusColor(status),
          syncState: app.syncState,
          updatedAt: app.updatedAt,
          createdByUserId: ownerUserId,
          summary: projection?.latestQuickCheck?.summary ?? null,
          confidence: typeof projection?.latestQuickCheck?.confidence === "number" ? projection.latestQuickCheck.confidence : null,
          imageCount: projection?.latestQuickCheck?.images?.length ?? 0
        } satisfies HistoryListItem;
      })
    );

    const filtered = withProjection
      .filter((item) => (options?.status ? item.status === options.status : true))
      .filter((item) => (options?.syncState ? item.syncState === options.syncState : true))
      .filter((item) => (actor.role === "compliance_manager" && options?.createdByUserId ? item.createdByUserId === options.createdByUserId : true))
      .sort((a, b) => {
        const dateDiff = new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
        if (dateDiff !== 0) return dateDiff;
        return a.applicationId.localeCompare(b.applicationId);
      });

    let startIndex = 0;
    if (options?.cursor) {
      const [cursorUpdatedAt, cursorApplicationId] = options.cursor.split("|");
      const index = filtered.findIndex((item) => item.updatedAt === cursorUpdatedAt && item.applicationId === cursorApplicationId);
      if (index >= 0) startIndex = index + 1;
    }

    const limit = Math.max(1, Math.min(options?.limit ?? 20, 100));
    const items = filtered.slice(startIndex, startIndex + limit);
    const tail = filtered[startIndex + limit];
    const nextCursor = tail ? `${tail.updatedAt}|${tail.applicationId}` : null;
    return { items, nextCursor };
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
      checks: normalizeScannerChecks(
        projection?.latestQuickCheck?.checks ?? [],
        doc.regulatoryProfile,
        projection?.latestQuickCheck?.confidence ?? 0
      ),
      rawChecks: projection?.latestQuickCheck?.checks ?? [],
      extracted: projection?.latestQuickCheck?.extracted ?? null,
      eventTimeline: timeline
    };
  }

  async backfillPendingSyncToSynced(scope: "terminal_only" | "all" = "terminal_only") {
    const updatedCount = await eventStore.backfillPendingSyncToSynced(scope);
    this.docs.clear();
    return {
      scope,
      updatedCount,
      updatedAt: new Date().toISOString()
    };
  }

  async backfillMissingOwnershipClaims() {
    const applications = await this.listApplications();
    let updatedCount = 0;
    for (const application of applications) {
      const events = await this.getEvents(application.applicationId);
      const hasClaim = events.some((event) => event.eventType === "OwnershipClaimed");
      if (hasClaim) continue;

      const created = events.find((event) => event.eventType === "ApplicationCreated");
      const actorUserId = created?.payload?.actorUserId;
      if (typeof actorUserId !== "string" || actorUserId.length === 0) continue;

      await this.appendEvent(application.applicationId, "OwnershipClaimed", {
        ownerUserId: actorUserId,
        reason: "backfill_from_application_created_actor"
      });
      const doc = await this.getApplication(application.applicationId);
      if (doc) {
        await this.refreshDocFromEvents(doc, { preserveChecks: true });
      }
      updatedCount += 1;
    }

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
    const collect = (pick: (item: Awaited<ReturnType<typeof eventStore.listRecentQuickCheckMetrics>>[number]) => number | undefined) =>
      quickChecks.map((item) => pick(item)).filter((value): value is number => typeof value === "number");
    const decisionTotalValues = collect((item) => item.stageTimings?.decisionTotalMs);
    const sessionCreateValues = collect((item) => item.stageTimings?.sessionCreateMs);
    const frontUploadValues = collect((item) => item.stageTimings?.frontUploadMs);
    const frontOcrValues = collect((item) => item.stageTimings?.frontOcrMs);
    const backUploadValues = collect((item) => item.stageTimings?.backUploadMs);
    const backOcrValues = collect((item) => item.stageTimings?.backOcrMs);
    const finalizeValues = collect((item) => item.stageTimings?.finalizeMs);
    const telemetryComplete = quickChecks.filter((item) => item.telemetryQuality === "complete").length;
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
      scanStagePerformance: {
        decisionTotalMs: { p50Ms: percentile(decisionTotalValues, 50), p95Ms: percentile(decisionTotalValues, 95) },
        sessionCreateMs: { p50Ms: percentile(sessionCreateValues, 50), p95Ms: percentile(sessionCreateValues, 95) },
        frontUploadMs: { p50Ms: percentile(frontUploadValues, 50), p95Ms: percentile(frontUploadValues, 95) },
        frontOcrMs: { p50Ms: percentile(frontOcrValues, 50), p95Ms: percentile(frontOcrValues, 95) },
        backUploadMs: { p50Ms: percentile(backUploadValues, 50), p95Ms: percentile(backUploadValues, 95) },
        backOcrMs: { p50Ms: percentile(backOcrValues, 50), p95Ms: percentile(backOcrValues, 95) },
        finalizeMs: { p50Ms: percentile(finalizeValues, 50), p95Ms: percentile(finalizeValues, 95) }
      },
      telemetryQuality: {
        complete: telemetryComplete,
        partial: Math.max(0, quickChecks.length - telemetryComplete)
      },
      syncHealth,
      statusCounts
    };
  }

  async recordPipelineEvent(
    applicationId: string,
    eventType: "ImageNormalizationCompleted" | "OcrCompleted" | "ExtractionCompleted" | "ComplianceChecksCompleted",
    payload: Record<string, unknown>
  ) {
    await this.appendEvent(applicationId, eventType, payload);
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
    const mergedOps = mergeCrdtOperations(existing, stampedOps);
    this.crdtOps.set(applicationId, mergedOps);

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
        const merged = mergeCrdtOperations(local, persisted);
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

  private async getApplicationOwnerUserId(applicationId: string): Promise<string | null> {
    const events = await this.getEvents(applicationId);
    let owner: string | null = null;
    for (const event of events) {
      if (event.eventType === "ApplicationCreated") {
        const fromCreate = event.payload?.actorUserId;
        if (typeof fromCreate === "string" && fromCreate.length > 0) owner = fromCreate;
      }
      if (event.eventType === "OwnershipClaimed") {
        const claimed = event.payload?.ownerUserId;
        if (typeof claimed === "string" && claimed.length > 0) owner = claimed;
      }
    }
    return owner;
  }

  private async refreshDocFromEvents(doc: LabelApplicationDoc, options?: { preserveChecks?: boolean }) {
    const events = await this.getEvents(doc.applicationId);
    const projection = projectApplication(doc.applicationId, events, doc, doc.status);

    const nextDoc: LabelApplicationDoc = {
      ...doc,
      status: projection.status,
      syncState: projection.syncState,
      checks:
        options?.preserveChecks && doc.checks.length > 0
          ? doc.checks
          : projection.latestQuickCheck
            ? normalizeScannerChecks(projection.latestQuickCheck.checks, doc.regulatoryProfile, projection.latestQuickCheck.confidence)
            : doc.checks,
      // Preserve brand/class through event replay — only set if not already on doc
      brandName: doc.brandName,
      classType: doc.classType,
      updatedAt: new Date().toISOString()
    };

    this.docs.set(nextDoc.applicationId, nextDoc);
    await this.persistApplication(nextDoc);
    return nextDoc;
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
        statusColor: labelApplicationStatusColor(status),
        ...(context ?? {})
      }
    });
  }

  async approveApplication(
    applicationId: string,
    reviewedBy: string,
    notes?: string
  ): Promise<{ success: boolean }> {
    const app = await this.getApplication(applicationId);
    if (!app) {
      throw new Error("application_not_found");
    }

    // Record reviewer override event
    await this.appendEvent(applicationId, "ReviewerOverrideRecorded", {
      decision: "approved",
      status: "approved",
      reviewedBy,
      notes: notes || "",
      previousStatus: app.status
    });

    // Update application with new status
    const updated: ComplianceApplicationDoc = {
      ...app,
      status: "approved",
      updatedAt: new Date().toISOString()
    };
    await this.refreshDocFromEvents(updated, { preserveChecks: true });

    // Emit real-time event
    this.publishStatusChanged(applicationId, "approved", app.syncState, {
      reviewedBy,
      decision: "approved"
    });

    return { success: true };
  }

  async rejectApplication(
    applicationId: string,
    reviewedBy: string,
    reason: string,
    notes?: string
  ): Promise<{ success: boolean }> {
    const app = await this.getApplication(applicationId);
    if (!app) {
      throw new Error("application_not_found");
    }

    // Record reviewer override event
    await this.appendEvent(applicationId, "ReviewerOverrideRecorded", {
      decision: "rejected",
      status: "rejected",
      reviewedBy,
      reason,
      notes: notes || "",
      previousStatus: app.status
    });

    // Update application with new status
    const updated: ComplianceApplicationDoc = {
      ...app,
      status: "rejected",
      updatedAt: new Date().toISOString()
    };
    await this.refreshDocFromEvents(updated, { preserveChecks: true });

    // Emit real-time event
    this.publishStatusChanged(applicationId, "rejected", app.syncState, {
      reviewedBy,
      decision: "rejected",
      reason
    });

    return { success: true };
  }
}

export const complianceService = new ComplianceService();

function percentile(values: number[], pct: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil((pct / 100) * sorted.length) - 1));
  return sorted[rank];
}
