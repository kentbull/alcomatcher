import { CloudFallbackAdapter } from "./ocr/cloudFallbackAdapter.js";
import { LocalTesseractAdapter } from "./ocr/localTesseractAdapter.js";
import type { OcrAdapter } from "../types/scanner.js";
import type { ScannerCheck, ScannerQuickCheckResult } from "../types/scanner.js";
import type { ExpectedLabelFields } from "../types/scanner.js";

const GOV_WARNING_TOKEN = "GOVERNMENT WARNING";

interface ExtractedFields {
  rawText: string;
  brandName?: string;
  classType?: string;
  abvText?: string;
  netContents?: string;
  hasGovWarning: boolean;
}

export class ScannerService {
  constructor(
    private readonly localOcr: OcrAdapter = new LocalTesseractAdapter(),
    private readonly cloudFallback: OcrAdapter = new CloudFallbackAdapter()
  ) {}

  async quickCheck(image: Buffer, expected?: ExpectedLabelFields): Promise<ScannerQuickCheckResult> {
    const local = await this.localOcr.recognize(image);

    let text = local.text;
    let confidence = local.confidence;
    let provider = local.provider;
    let usedFallback = false;

    if (local.confidence < 0.45 || !local.text.trim()) {
      const fallback = await this.cloudFallback.recognize(image);
      if (fallback.text.trim()) {
        text = fallback.text;
        confidence = Math.max(local.confidence, fallback.confidence);
      }
      provider = fallback.provider;
      usedFallback = true;
    }

    const extracted = this.extractFields(text);
    const checks = this.buildChecks(extracted, expected);
    const failCount = checks.filter((c) => c.status === "fail").length;
    const notEvaluableCount = checks.filter((c) => c.status === "not_evaluable").length;

    const summary: ScannerQuickCheckResult["summary"] =
      failCount > 0 ? "fail" : notEvaluableCount > 0 ? "needs_review" : "pass";

    return {
      summary,
      extracted,
      checks,
      confidence,
      provider,
      usedFallback
    };
  }

  private extractFields(rawText: string): ExtractedFields {
    const normalized = rawText.replace(/\r/g, "\n");

    const abvMatch = normalized.match(/\b\d{1,2}(?:\.\d{1,2})?\s*%\s*(?:alc\.?\/?vol\.?|alcohol by volume)?/i);
    const netMatch = normalized.match(/\b(\d{2,4})\s*(ml|mL|L|l|fl\.?\s?oz\.?|oz)\b/i);

    const lines = normalized
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean);

    const brandName = lines.find((line) => /^[A-Z0-9\s'&.-]{4,}$/.test(line) && line.length <= 42);

    const classType = lines.find((line) =>
      /(bourbon|whiskey|whisky|rum|vodka|tequila|gin|brandy|distilled|spirits|wine|beer|ale|lager)/i.test(line)
    );

    return {
      rawText,
      brandName,
      classType,
      abvText: abvMatch?.[0],
      netContents: netMatch ? `${netMatch[1]} ${netMatch[2]}` : undefined,
      hasGovWarning: normalized.toUpperCase().includes(GOV_WARNING_TOKEN)
    };
  }

  private buildChecks(extracted: ExtractedFields, expected?: ExpectedLabelFields): ScannerCheck[] {
    const checks: ScannerCheck[] = [];

    checks.push({
      id: "brand_name_detected",
      label: "Brand Name",
      status: extracted.brandName ? "pass" : "not_evaluable",
      detail: extracted.brandName ? `Detected: ${extracted.brandName}` : "Could not confidently detect brand name"
    });

    checks.push({
      id: "class_type_detected",
      label: "Class / Type",
      status: extracted.classType ? "pass" : "not_evaluable",
      detail: extracted.classType ? `Detected: ${extracted.classType}` : "Could not confidently detect class/type"
    });

    checks.push({
      id: "abv_detected",
      label: "Alcohol Content",
      status: extracted.abvText ? "pass" : "not_evaluable",
      detail: extracted.abvText ? `Detected: ${extracted.abvText}` : "No ABV text detected"
    });

    checks.push({
      id: "net_contents_detected",
      label: "Net Contents",
      status: extracted.netContents ? "pass" : "not_evaluable",
      detail: extracted.netContents ? `Detected: ${extracted.netContents}` : "No net contents detected"
    });

    checks.push({
      id: "government_warning_present",
      label: "Government Warning",
      status: extracted.hasGovWarning ? "pass" : "fail",
      detail: extracted.hasGovWarning
        ? "Detected GOVERNMENT WARNING statement token"
        : "Missing GOVERNMENT WARNING token in extracted text"
    });

    if (expected?.brandName) {
      const matches = this.normalized(extracted.brandName) === this.normalized(expected.brandName);
      checks.push({
        id: "brand_name_match",
        label: "Brand Name Match",
        status: extracted.brandName ? (matches ? "pass" : "fail") : "not_evaluable",
        detail: extracted.brandName
          ? `Expected: ${expected.brandName}; Extracted: ${extracted.brandName}`
          : `Expected: ${expected.brandName}; Extracted brand not detected`
      });
    }

    if (expected?.classType) {
      const matches = this.normalized(extracted.classType) === this.normalized(expected.classType);
      checks.push({
        id: "class_type_match",
        label: "Class / Type Match",
        status: extracted.classType ? (matches ? "pass" : "fail") : "not_evaluable",
        detail: extracted.classType
          ? `Expected: ${expected.classType}; Extracted: ${extracted.classType}`
          : `Expected: ${expected.classType}; Extracted class/type not detected`
      });
    }

    if (expected?.abvText) {
      const expectedAbv = this.extractAbvNumber(expected.abvText);
      const extractedAbv = this.extractAbvNumber(extracted.abvText);
      const matches = expectedAbv !== null && extractedAbv !== null && expectedAbv === extractedAbv;
      checks.push({
        id: "abv_match",
        label: "ABV Match",
        status: extractedAbv !== null ? (matches ? "pass" : "fail") : "not_evaluable",
        detail:
          extractedAbv !== null
            ? `Expected ABV: ${expectedAbv}% ; Extracted ABV: ${extractedAbv}%`
            : `Expected ABV: ${expectedAbv ?? "unknown"}%; Extracted ABV not detected`
      });
    }

    if (expected?.netContents) {
      const matches = this.normalized(extracted.netContents) === this.normalized(expected.netContents);
      checks.push({
        id: "net_contents_match",
        label: "Net Contents Match",
        status: extracted.netContents ? (matches ? "pass" : "fail") : "not_evaluable",
        detail: extracted.netContents
          ? `Expected: ${expected.netContents}; Extracted: ${extracted.netContents}`
          : `Expected: ${expected.netContents}; Extracted net contents not detected`
      });
    }

    if (expected?.requireGovWarning) {
      checks.push({
        id: "government_warning_required_match",
        label: "Government Warning Requirement",
        status: extracted.hasGovWarning ? "pass" : "fail",
        detail: extracted.hasGovWarning
          ? "Government warning required and detected"
          : "Government warning required but not detected"
      });
    }

    return checks;
  }

  private normalized(value?: string): string {
    return (value ?? "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");
  }

  private extractAbvNumber(value?: string): number | null {
    if (!value) return null;
    const match = value.match(/(\d{1,2}(?:\.\d{1,2})?)\s*%/);
    if (!match) return null;
    return Number(match[1]);
  }
}
