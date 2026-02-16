import { randomUUID } from "node:crypto";
import type { ComplianceApplicationDoc, ComplianceEvent, RegulatoryProfile } from "../types/compliance.js";

/**
 * In-memory starter service to define event-sourcing and CRDT-sync contracts.
 * Replace with persistent command/query stores in the next iteration.
 */
export class ComplianceService {
  private readonly docs = new Map<string, ComplianceApplicationDoc>();
  private readonly events = new Map<string, ComplianceEvent[]>();

  createApplication(regulatoryProfile: RegulatoryProfile, submissionType: "single" | "batch") {
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
    this.appendEvent(applicationId, "ApplicationCreated", {
      regulatoryProfile,
      submissionType,
      syncState: doc.syncState
    });

    return doc;
  }

  mergeClientSync(applicationId: string, patch: Partial<ComplianceApplicationDoc>) {
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
    this.appendEvent(applicationId, "SyncMerged", {
      patchKeys: Object.keys(patch),
      syncState: merged.syncState
    });

    return merged;
  }

  listApplications() {
    return Array.from(this.docs.values());
  }

  getEvents(applicationId: string) {
    return this.events.get(applicationId) ?? [];
  }

  private appendEvent(applicationId: string, eventType: ComplianceEvent["eventType"], payload: Record<string, unknown>) {
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
  }
}
