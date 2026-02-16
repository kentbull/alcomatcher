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

export interface ComplianceApplicationDoc {
  applicationId: string;
  documentId: string;
  regulatoryProfile: RegulatoryProfile;
  submissionType: "single" | "batch";
  status: ApplicationStatus;
  checks: ComplianceCheck[];
  syncState: "synced" | "pending_sync" | "sync_failed";
  updatedAt: string;
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
    | "ScannerQuickCheckRecorded";
  payload: Record<string, unknown>;
  createdAt: string;
}
