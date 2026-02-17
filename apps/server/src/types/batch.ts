import type { RegulatoryProfile } from "./compliance.js";

export interface BatchItemInput {
  clientLabelId: string;
  imageFilename: string;
  regulatoryProfile: RegulatoryProfile;
}

export interface BatchItemRecord extends BatchItemInput {
  batchItemId: string;
  status: "queued" | "processing" | "completed" | "failed";
  errorReason?: string;
}

export interface BatchJobRecord {
  batchId: string;
  applicationId: string;
  totalItems: number;
  acceptedItems: number;
  rejectedItems: number;
  status: "batch_received" | "batch_processing" | "batch_partially_failed" | "batch_completed";
  createdAt: string;
  updatedAt: string;
}
