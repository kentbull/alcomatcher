export type RegulatoryProfile = "distilled_spirits" | "wine" | "malt_beverage";
export type ApplicationStatus =
  | "captured"
  | "scanned"
  | "matched"
  | "approved"
  | "rejected"
  | "needs_review"
  | "batch_received"
  | "batch_processing"
  | "batch_partially_failed"
  | "batch_completed";

export interface LabelApplicationDoc {
  applicationId: string;
  documentId: string;
  regulatoryProfile: RegulatoryProfile;
  submissionType: "single" | "batch";
  createdByUserId?: string;
  assignedToUserId?: string;
  lastDecidedByUserId?: string;
  status: ApplicationStatus;
  checks: ComplianceCheck[];
  syncState: "synced" | "pending_sync" | "sync_failed";
  brandName?: string;
  classType?: string;
  updatedAt: string;
}

/** @deprecated Use LabelApplicationDoc */
export type ComplianceApplicationDoc = LabelApplicationDoc;

export type LabelApplicationStatusColor = "green" | "amber" | "red";
export function labelApplicationStatusColor(status: ApplicationStatus): LabelApplicationStatusColor {
  if (status === "matched" || status === "approved") return "green";
  if (status === "rejected" || status === "batch_partially_failed") return "red";
  return "amber";
}

export interface ComplianceCheck {
  checkId: string;
  ruleId: string;
  label: string;
  status: "pass" | "fail" | "not_evaluable";
  severity: "hard_fail" | "soft_fail" | "advisory";
  confidence: number;
  evidenceText: string;
  citationRef: string;
  failureReason?: string;
}

export interface ComplianceEvent {
  eventId: string;
  applicationId: string;
  eventType:
    | "ApplicationCreated"
    | "ScanCaptured"
    | "OCRCompleted"
    | "ChecksEvaluated"
    | "CloudFallbackRequested"
    | "DecisionComputed"
    | "ReviewerOverrideRecorded"
    | "BatchQueued"
    | "BatchItemCompleted"
    | "BatchCompleted"
    | "SyncMerged"
    | "ScannerQuickCheckRecorded"
    | "OwnershipClaimed"
    | "ImageNormalizationCompleted"
    | "OcrCompleted"
    | "ExtractionCompleted"
    | "ComplianceChecksCompleted";
  payload: Record<string, unknown>;
  createdAt: string;
}

/**
 * Minimal CRDT operation envelope for local-first sync.
 */
export interface CrdtOperation {
  opId: string;
  applicationId: string;
  actorId: string;
  sequence: number;
  payload: Record<string, unknown>;
  createdAt: string;
}
