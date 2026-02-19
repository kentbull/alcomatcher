/**
 * Types for multi-label batch scanning
 */

export type LabelGroupStatus = "capturing" | "complete" | "pending";

export interface LabelGroup {
  id: string;
  imageIds: string[]; // LocalImage localIds
  status: LabelGroupStatus;
  createdAt: string;
  name?: string; // Optional user-provided name
}

export type ScanMode = "single" | "batch";

/**
 * Batch scan summary for review before sending
 */
export interface BatchSummary {
  groups: LabelGroup[];
  totalImages: number;
  readyToSend: boolean;
}
