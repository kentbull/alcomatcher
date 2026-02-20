import type { RegulatoryProfile } from "./compliance.js";

export interface BatchItemInput {
  clientLabelId: string;
  imageFilename?: string;
  regulatoryProfile: RegulatoryProfile;
  expectedBrandName?: string;
  expectedClassType?: string;
  expectedAbvText?: string;
  expectedNetContents?: string;
  expectedGovernmentWarning?: string;
  requireGovWarning?: boolean;
  frontImagePath?: string;
  backImagePath?: string;
  additionalImagePaths?: string[];
}

export interface BatchItemRecord extends BatchItemInput {
  batchItemId: string;
  status: "queued" | "processing" | "completed" | "failed";
  errorReason?: string;
  lastErrorCode?: string;
  retryCount: number;
  applicationId?: string;
  updatedAt?: string;
}

export interface BatchJobRecord {
  batchId: string;
  applicationId: string;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  status: "batch_received" | "batch_processing" | "batch_partially_failed" | "batch_completed";
  ingestStatus?: "received" | "parsing" | "queued" | "processing" | "completed" | "partially_failed" | "failed";
  discoveredItems?: number;
  queuedItems?: number;
  processingItems?: number;
  completedItems?: number;
  failedItems?: number;
  archiveBytes?: number;
  errorSummary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface BatchItemAttemptRecord {
  attemptId: string;
  batchItemId: string;
  attemptNo: number;
  outcome: "success" | "failed";
  errorCode?: string;
  errorReason?: string;
  createdAt: string;
}
