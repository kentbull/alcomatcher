export interface OcrResult {
  provider: "local_tesseract" | "cloud_fallback";
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

export interface ScannerQuickCheckResult {
  summary: "pass" | "fail" | "needs_review";
  extracted: {
    rawText: string;
    brandName?: string;
    classType?: string;
    abvText?: string;
    netContents?: string;
    hasGovWarning: boolean;
  };
  checks: ScannerCheck[];
  confidence: number;
  provider: OcrResult["provider"];
  usedFallback: boolean;
}
