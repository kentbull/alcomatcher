import { randomUUID } from "node:crypto";
import type { ComplianceApplicationDoc, ComplianceEvent, CrdtOperation, RegulatoryProfile } from "../types/compliance.js";
import type { ScannerQuickCheckResult } from "../types/scanner.js";
import type { ExpectedLabelFields } from "../types/scanner.js";
import { eventStore } from "./eventStore.js";

interface ApplicationProjection {
  applicationId: string;
  status: ComplianceApplicationDoc["status"];
  syncState: ComplianceApplicationDoc["syncState"];
  latestQuickCheck: ScannerQuickCheckResult | null;
  eventCount: number;
  lastEventAt?: string;
}

interface ScannerQuickCheckEventPayload {
  summary: ScannerQuickCheckResult["summary"];
  confidence: number;
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
      provider: result.provider,
      usedFallback: result.usedFallback,
      expected: expected ?? null,
      extracted: result.extracted,
      checks: result.checks
    });

    await this.persistApplication(updated);
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

  async appendCrdtOps(applicationId: string, actorId: string, ops: Array<{ sequence: number; payload: Record<string, unknown> }>) {
    if (!this.docs.has(applicationId)) return null;

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
      // Keep local state even if persistence is temporarily unavailable.
    }

    await this.appendEvent(applicationId, "SyncMerged", {
      opCount: stampedOps.length,
      actorId
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
}

export const complianceService = new ComplianceService();
