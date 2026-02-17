import type { ApplicationStatus, ComplianceApplicationDoc, ComplianceEvent } from "../types/compliance.js";
import type { ScannerQuickCheckResult } from "../types/scanner.js";

interface ScannerQuickCheckEventPayload {
  summary: ScannerQuickCheckResult["summary"];
  confidence: number;
  processingMs?: number;
  provider: ScannerQuickCheckResult["provider"];
  usedFallback: boolean;
  extracted: ScannerQuickCheckResult["extracted"];
  composite?: ScannerQuickCheckResult["composite"];
  images?: ScannerQuickCheckResult["images"];
  checks: ScannerQuickCheckResult["checks"];
  stageTimings?: ScannerQuickCheckResult["stageTimings"];
  telemetryQuality?: ScannerQuickCheckResult["telemetryQuality"];
}

export interface ApplicationProjection {
  applicationId: string;
  status: ComplianceApplicationDoc["status"];
  syncState: ComplianceApplicationDoc["syncState"];
  latestQuickCheck: ScannerQuickCheckResult | null;
  eventCount: number;
  lastEventAt?: string;
}

export function projectApplication(
  applicationId: string,
  events: ComplianceEvent[],
  fallbackDoc?: Pick<ComplianceApplicationDoc, "status" | "syncState">,
  defaultStatus: ApplicationStatus = "captured"
): ApplicationProjection {
  let status: ComplianceApplicationDoc["status"] = fallbackDoc?.status ?? defaultStatus;
  let syncState: ComplianceApplicationDoc["syncState"] = fallbackDoc?.syncState ?? "pending_sync";
  let latestQuickCheck: ScannerQuickCheckResult | null = null;

  for (const event of events) {
    const next = reduceEvent(event, status, syncState);
    status = next.status;
    syncState = next.syncState;
    if (event.eventType === "ScannerQuickCheckRecorded") {
      const parsed = parseScannerQuickCheckPayload(event.payload);
      if (parsed) latestQuickCheck = parsed;
    }
  }

  return {
    applicationId,
    status,
    syncState,
    latestQuickCheck,
    eventCount: events.length,
    lastEventAt: events.length > 0 ? events[events.length - 1].createdAt : undefined
  };
}

function reduceEvent(
  event: ComplianceEvent,
  currentStatus: ComplianceApplicationDoc["status"],
  currentSyncState: ComplianceApplicationDoc["syncState"]
): Pick<ApplicationProjection, "status" | "syncState"> {
  const payload = event.payload as Record<string, unknown>;

  switch (event.eventType) {
    case "ApplicationCreated": {
      const submissionType = payload.submissionType;
      const nextStatus: ComplianceApplicationDoc["status"] = submissionType === "batch" ? "batch_received" : "captured";
      return {
        status: nextStatus,
        syncState: asSyncState(payload.syncState) ?? currentSyncState
      };
    }
    case "ScanCaptured":
      return { status: "scanned", syncState: currentSyncState };
    case "DecisionComputed": {
      const nextStatus = asStatus(payload.status);
      return {
        status: nextStatus ?? currentStatus,
        syncState: currentSyncState
      };
    }
    case "ReviewerOverrideRecorded": {
      const nextStatus = asStatus(payload.status);
      return {
        status: nextStatus ?? currentStatus,
        syncState: currentSyncState
      };
    }
    case "BatchQueued":
      return { status: "batch_processing", syncState: currentSyncState };
    case "BatchCompleted": {
      const nextStatus = asStatus(payload.status);
      return {
        status: nextStatus ?? currentStatus,
        syncState: currentSyncState
      };
    }
    case "ScannerQuickCheckRecorded": {
      const summary = payload.summary;
      return {
        status: summaryToStatus(summary),
        syncState: "pending_sync"
      };
    }
    case "SyncMerged": {
      const nextSyncState = asSyncState(payload.syncState);
      return {
        status: currentStatus,
        syncState: nextSyncState ?? currentSyncState
      };
    }
    default:
      return {
        status: currentStatus,
        syncState: currentSyncState
      };
  }
}

function parseScannerQuickCheckPayload(payload: Record<string, unknown>): ScannerQuickCheckResult | null {
  const candidate = payload as Partial<ScannerQuickCheckEventPayload>;

  if (
    !candidate.summary ||
    !candidate.extracted ||
    !candidate.checks ||
    typeof candidate.confidence !== "number" ||
    !candidate.provider
  ) {
    return null;
  }

  return {
    summary: candidate.summary,
    extracted: candidate.extracted,
    composite: candidate.composite ?? {
      extracted: candidate.extracted,
      checks: candidate.checks
    },
    images: candidate.images ?? [],
    checks: candidate.checks,
    confidence: candidate.confidence,
    processingMs: candidate.processingMs,
    provider: candidate.provider,
    usedFallback: Boolean(candidate.usedFallback),
    stageTimings: candidate.stageTimings,
    telemetryQuality: candidate.telemetryQuality
  };
}

function summaryToStatus(summary: unknown): ComplianceApplicationDoc["status"] {
  if (summary === "pass") return "matched";
  if (summary === "fail") return "rejected";
  return "needs_review";
}

function asSyncState(value: unknown): ComplianceApplicationDoc["syncState"] | null {
  if (value === "synced" || value === "pending_sync" || value === "sync_failed") return value;
  return null;
}

function asStatus(value: unknown): ComplianceApplicationDoc["status"] | null {
  if (
    value === "captured" ||
    value === "scanned" ||
    value === "matched" ||
    value === "approved" ||
    value === "rejected" ||
    value === "needs_review" ||
    value === "batch_received" ||
    value === "batch_processing" ||
    value === "batch_partially_failed" ||
    value === "batch_completed"
  ) {
    return value;
  }
  return null;
}
