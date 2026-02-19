/**
 * Processing stage types for scanner operations
 */

export type ProcessingStageStatus = "pending" | "active" | "completed" | "error";

export interface ComplianceCheckStatus {
  id: string;
  label: string;
  status: "pending" | "checking" | "pass" | "fail" | "needs_review";
}

export interface ProcessingStage {
  id: string;
  label: string;
  status: ProcessingStageStatus;
  progress?: number; // 0-100 for active stages
  substage?: string; // Current sub-operation description
  errorMessage?: string;
  estimatedDuration?: number; // milliseconds
  checks?: ComplianceCheckStatus[]; // For compliance_check stage
}

export type ScannerStageId =
  | "camera_init"
  | "capturing"
  | "uploading"
  | "upload"
  | "ocr"
  | "compliance_check"
  | "finalize";

/**
 * Predefined scanner processing stages
 */
export const SCANNER_STAGES: Record<ScannerStageId, Omit<ProcessingStage, "status" | "progress">> = {
  camera_init: {
    id: "camera_init",
    label: "Initializing camera",
    estimatedDuration: 1000
  },
  capturing: {
    id: "capturing",
    label: "Capturing image",
    estimatedDuration: 500
  },
  uploading: {
    id: "uploading",
    label: "Uploading images",
    estimatedDuration: 2000
  },
  upload: {
    id: "upload",
    label: "Uploading images",
    estimatedDuration: 2000
  },
  ocr: {
    id: "ocr",
    label: "Reading label text",
    estimatedDuration: 3000
  },
  compliance_check: {
    id: "compliance_check",
    label: "Checking compliance",
    estimatedDuration: 1500
  },
  finalize: {
    id: "finalize",
    label: "Finalizing results",
    estimatedDuration: 500
  }
};
