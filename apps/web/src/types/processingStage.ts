/**
 * Processing stage types for scanner operations
 */

export type ProcessingStageStatus = "pending" | "active" | "completed" | "error";

export interface ProcessingStage {
  id: string;
  label: string;
  status: ProcessingStageStatus;
  progress?: number; // 0-100 for active stages
  errorMessage?: string;
  estimatedDuration?: number; // milliseconds
}

export type ScannerStageId =
  | "camera_init"
  | "capturing"
  | "uploading"
  | "ocr"
  | "compliance_check";

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
  ocr: {
    id: "ocr",
    label: "Reading label text",
    estimatedDuration: 3000
  },
  compliance_check: {
    id: "compliance_check",
    label: "Checking compliance",
    estimatedDuration: 1500
  }
};
