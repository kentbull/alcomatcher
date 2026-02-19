export type ApplicationStatus =
  | "created"
  | "processing"
  | "matched"
  | "needs_review"
  | "approved"
  | "rejected";

export type SyncState =
  | "pending"
  | "synced"
  | "sync_failed";

export interface KPIMetrics {
  totalProcessed: number;
  approvedThisWeek: number;
  rejectedThisWeek: number;
  needsReview: number;
  avgConfidence: number;
  avgOcrLatency: number;
}

export interface ApplicationQueueItem {
  applicationId: string;
  status: ApplicationStatus;
  syncState: SyncState;
  confidence: number;
  brandName?: string;
  updatedAt: string;
  createdByUserId?: string;
  regulatoryProfile?: string;
}

export interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface QueueResponse {
  items: ApplicationQueueItem[];
  pagination: PaginationInfo;
}

export interface PaginationMetadata {
  totalCount: number;
  limit: number;
  offset: number;
  hasMore: boolean;
}

export interface ComplianceCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_evaluable";
  detail: string;
  evidence?: string;
  ruleReference?: string;
}

export interface SubmissionImage {
  imageId: string;
  role: "front" | "back" | "additional";
  imageIndex: number;
  qualityStatus?: "good" | "reshoot";
  qualityIssues?: string[];
  ocrProvider?: string;
  ocrConfidence?: number;
  thumbnailUrl?: string;
  fullUrl?: string;
}

export interface ApplicationDetail {
  applicationId: string;
  status: ApplicationStatus;
  syncState: SyncState;
  confidence: number;
  brandName?: string;
  classType?: string;
  abvText?: string;
  netContents?: string;
  regulatoryProfile?: string;
  createdByUserId?: string;
  lastDecidedByUserId?: string;
  createdAt: string;
  updatedAt: string;
  images: SubmissionImage[];
  checks: ComplianceCheck[];
}

export interface ComplianceEvent {
  eventId: string;
  applicationId: string;
  eventType: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export interface ApprovalRequest {
  notes?: string;
  reviewedBy: string;
}

export interface RejectionRequest {
  reason: string;
  notes?: string;
  reviewedBy: string;
}

export interface RescanRequest {
  reason: "poor_quality" | "manual_review" | "ocr_error";
}

export interface ApprovalResponse {
  applicationId: string;
  status: "approved" | "rejected";
  updatedAt: string;
  reviewedBy: string;
  reason?: string;
}

export interface RescanResponse {
  imageId: string;
  status: "queued_for_rescan" | "rescan_completed";
  queuedAt?: string;
  confidence?: number;
  provider?: string;
}
