export interface OcrResult {
  provider: "local_tesseract" | "cloud_fallback" | "google_cloud_vision";
  text: string;
  confidence: number;
  usedFallback: boolean;
}

export interface OcrAdapter {
  recognize(image: Buffer): Promise<OcrResult>;
}

export interface ScannerCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_evaluable";
  detail: string;
}

export type ScanImageRole = "front" | "back" | "additional";

export interface ExtractedFields {
  rawText: string;
  brandName?: string;
  classType?: string;
  abvText?: string;
  netContents?: string;
  hasGovWarning: boolean;
  govWarningExtracted?: string;
}

export interface ScanFieldSource {
  role: ScanImageRole;
  index: number;
  confidence: number;
  extractionMethod?: "regex" | "llm";
}

export interface CompositeExtractedFields extends ExtractedFields {
  fieldSources: {
    brandName?: ScanFieldSource;
    classType?: ScanFieldSource;
    abvText?: ScanFieldSource;
    netContents?: ScanFieldSource;
    hasGovWarning?: ScanFieldSource;
  };
  llmExtractionUsed?: boolean;
}

export interface PerImageScanResult {
  role: ScanImageRole;
  index: number;
  extracted: ExtractedFields;
  checks: ScannerCheck[];
  confidence: number;
  provider: OcrResult["provider"];
  usedFallback: boolean;
  processingMs: number;
}

export interface ScannerQuickCheckResult {
  summary: "pass" | "fail" | "needs_review";
  extracted: CompositeExtractedFields;
  composite: {
    extracted: CompositeExtractedFields;
    checks: ScannerCheck[];
  };
  images: PerImageScanResult[];
  checks: ScannerCheck[];
  confidence: number;
  provider: OcrResult["provider"];
  usedFallback: boolean;
  processingMs?: number;
  stageTimings?: ScannerStageTimings;
  telemetryQuality?: "complete" | "partial";
}

export interface ScannerStageTimings {
  sessionCreateMs?: number;
  frontUploadMs?: number;
  frontOcrMs?: number;
  backUploadMs?: number;
  backOcrMs?: number;
  additionalUploadTotalMs?: number;
  finalizeMs?: number;
  decisionTotalMs?: number;
  llmExtractionMs?: number;
}

export interface ExpectedLabelFields {
  brandName?: string;
  classType?: string;
  abvText?: string;
  netContents?: string;
  requireGovWarning?: boolean;
}
