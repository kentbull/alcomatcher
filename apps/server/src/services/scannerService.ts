import { CloudFallbackAdapter } from "./ocr/cloudFallbackAdapter.js";
import { LocalTesseractAdapter } from "./ocr/localTesseractAdapter.js";
import type { CompositeExtractedFields, ExpectedLabelFields, OcrAdapter, PerImageScanResult, ScanImageRole, ScannerCheck, ScannerQuickCheckResult } from "../types/scanner.js";

const GOV_WARNING_TOKEN = "GOVERNMENT WARNING";
const OVERRIDE_DELTA = 0.12;

interface ScanInputImage {
  role: ScanImageRole;
  index: number;
  image: Buffer;
}

interface ScanFieldCandidate {
  value: string | boolean | undefined;
  role: ScanImageRole;
  index: number;
  confidence: number;
}

export class ScannerService {
  constructor(
    private readonly localOcr: OcrAdapter = new LocalTesseractAdapter(),
    private readonly cloudFallback: OcrAdapter = new CloudFallbackAdapter()
  ) {}

  async quickCheck(image: Buffer, expected?: ExpectedLabelFields): Promise<ScannerQuickCheckResult> {
    return this.quickCheckMultiImage(
      [
        {
          role: "front",
          index: 0,
          image
        }
      ],
      expected
    );
  }

  async quickCheckMultiImage(images: ScanInputImage[], expected?: ExpectedLabelFields): Promise<ScannerQuickCheckResult> {
    const perImage = await Promise.all(images.map((item) => this.analyzeImage(item.role, item.index, item.image)));
    const compositeExtracted = this.composeExtracted(perImage);
    const compositeChecks = this.buildCompositeChecks(compositeExtracted, expected);
    const failCount = compositeChecks.filter((check) => check.status === "fail").length;
    const notEvaluableCount = compositeChecks.filter((check) => check.status === "not_evaluable").length;
    const summary: ScannerQuickCheckResult["summary"] = failCount > 0 ? "fail" : notEvaluableCount > 0 ? "needs_review" : "pass";

    return {
      summary,
      extracted: compositeExtracted,
      composite: {
        extracted: compositeExtracted,
        checks: compositeChecks
      },
      images: perImage,
      checks: compositeChecks,
      confidence: average(perImage.map((entry) => entry.confidence)),
      provider: perImage.find((entry) => entry.usedFallback)?.provider ?? perImage[0]?.provider ?? "local_tesseract",
      usedFallback: perImage.some((entry) => entry.usedFallback),
      processingMs: perImage.reduce((sum, entry) => sum + entry.processingMs, 0)
    };
  }

  async analyzeImage(role: ScanImageRole, index: number, image: Buffer): Promise<PerImageScanResult> {
    const startedAt = Date.now();
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
    const checks = this.buildRoleChecks(role, extracted);
    return {
      role,
      index,
      extracted,
      checks,
      confidence,
      provider,
      usedFallback,
      processingMs: Date.now() - startedAt
    };
  }

  private composeExtracted(images: PerImageScanResult[]): CompositeExtractedFields {
    const fronts = images.filter((img) => img.role === "front");
    const backs = images.filter((img) => img.role === "back");
    const additionals = images.filter((img) => img.role === "additional");

    const brandCandidate = this.pickFieldCandidate({
      primary: fronts,
      additional: additionals,
      getValue: (img) => img.extracted.brandName
    });
    const classTypeCandidate = this.pickFieldCandidate({
      primary: fronts,
      additional: additionals,
      getValue: (img) => img.extracted.classType
    });
    const abvCandidate = this.pickFieldCandidate({
      primary: backs,
      additional: additionals,
      getValue: (img) => img.extracted.abvText
    });
    const netCandidate = this.pickFieldCandidate({
      primary: backs,
      additional: additionals,
      getValue: (img) => img.extracted.netContents
    });

    const govWarningPrimary = backs.find((img) => img.extracted.hasGovWarning);
    const govWarningAdditional = additionals.find((img) => img.extracted.hasGovWarning);
    const govWarningSource = govWarningPrimary
      ? { role: govWarningPrimary.role, index: govWarningPrimary.index, confidence: govWarningPrimary.confidence }
      : govWarningAdditional
        ? { role: govWarningAdditional.role, index: govWarningAdditional.index, confidence: govWarningAdditional.confidence }
        : undefined;

    return {
      rawText: images.map((img) => `[${img.role}#${img.index}]\n${img.extracted.rawText}`).join("\n\n"),
      brandName: toStringValue(brandCandidate?.value),
      classType: toStringValue(classTypeCandidate?.value),
      abvText: toStringValue(abvCandidate?.value),
      netContents: toStringValue(netCandidate?.value),
      hasGovWarning: Boolean(govWarningPrimary || govWarningAdditional),
      fieldSources: {
        brandName: brandCandidate && typeof brandCandidate.value === "string" ? sourceFromCandidate(brandCandidate) : undefined,
        classType: classTypeCandidate && typeof classTypeCandidate.value === "string" ? sourceFromCandidate(classTypeCandidate) : undefined,
        abvText: abvCandidate && typeof abvCandidate.value === "string" ? sourceFromCandidate(abvCandidate) : undefined,
        netContents: netCandidate && typeof netCandidate.value === "string" ? sourceFromCandidate(netCandidate) : undefined,
        hasGovWarning: govWarningSource
      }
    };
  }

  private pickFieldCandidate(args: {
    primary: PerImageScanResult[];
    additional: PerImageScanResult[];
    getValue: (image: PerImageScanResult) => string | undefined;
  }): ScanFieldCandidate | undefined {
    const primaryBest = bestStringCandidate(args.primary, args.getValue);
    const additionalBest = bestStringCandidate(args.additional, args.getValue);
    if (!primaryBest) return additionalBest;
    if (!additionalBest) return primaryBest;
    if (additionalBest.confidence >= primaryBest.confidence + OVERRIDE_DELTA) return additionalBest;
    return primaryBest;
  }

  private extractFields(rawText: string) {
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

  private buildRoleChecks(role: ScanImageRole, extracted: CompositeExtractedFields | PerImageScanResult["extracted"]) {
    const checks: ScannerCheck[] = [];
    if (role === "front") {
      checks.push({
        id: "front_brand_detected",
        label: "Front Brand Detection",
        status: extracted.brandName ? "pass" : "not_evaluable",
        detail: extracted.brandName ? `Detected: ${extracted.brandName}` : "Brand name not detected on front image"
      });
      checks.push({
        id: "front_class_detected",
        label: "Front Class/Type Detection",
        status: extracted.classType ? "pass" : "not_evaluable",
        detail: extracted.classType ? `Detected: ${extracted.classType}` : "Class/type not detected on front image"
      });
      return checks;
    }

    if (role === "back") {
      checks.push({
        id: "back_warning_detected",
        label: "Back Gov Warning Detection",
        status: extracted.hasGovWarning ? "pass" : "not_evaluable",
        detail: extracted.hasGovWarning ? "Government warning detected on back image" : "Warning not detected on back image"
      });
      checks.push({
        id: "back_abv_detected",
        label: "Back ABV Detection",
        status: extracted.abvText ? "pass" : "not_evaluable",
        detail: extracted.abvText ? `Detected: ${extracted.abvText}` : "ABV not detected on back image"
      });
      checks.push({
        id: "back_net_detected",
        label: "Back Net Contents Detection",
        status: extracted.netContents ? "pass" : "not_evaluable",
        detail: extracted.netContents ? `Detected: ${extracted.netContents}` : "Net contents not detected on back image"
      });
      return checks;
    }

    checks.push({
      id: "additional_text_detected",
      label: "Additional Image Text",
      status: extracted.rawText.trim().length > 0 ? "pass" : "not_evaluable",
      detail: extracted.rawText.trim().length > 0 ? "Additional text extracted" : "No useful text detected on additional image"
    });
    return checks;
  }

  private buildCompositeChecks(extracted: CompositeExtractedFields, expected?: ExpectedLabelFields): ScannerCheck[] {
    const checks: ScannerCheck[] = [
      {
        id: "brand_name_detected",
        label: "Brand Name",
        status: extracted.brandName ? "pass" : "not_evaluable",
        detail: extracted.brandName ? `Detected: ${extracted.brandName}` : "Could not confidently detect brand name"
      },
      {
        id: "class_type_detected",
        label: "Class / Type",
        status: extracted.classType ? "pass" : "not_evaluable",
        detail: extracted.classType ? `Detected: ${extracted.classType}` : "Could not confidently detect class/type"
      },
      {
        id: "abv_detected",
        label: "Alcohol Content",
        status: extracted.abvText ? "pass" : "not_evaluable",
        detail: extracted.abvText ? `Detected: ${extracted.abvText}` : "No ABV text detected"
      },
      {
        id: "net_contents_detected",
        label: "Net Contents",
        status: extracted.netContents ? "pass" : "not_evaluable",
        detail: extracted.netContents ? `Detected: ${extracted.netContents}` : "No net contents detected"
      },
      {
        id: "government_warning_present",
        label: "Government Warning",
        status: extracted.hasGovWarning ? "pass" : "fail",
        detail: extracted.hasGovWarning ? "Detected GOVERNMENT WARNING token" : "Missing GOVERNMENT WARNING token"
      }
    ];

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
        detail: extracted.hasGovWarning ? "Government warning required and detected" : "Government warning required but not detected"
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

function bestStringCandidate(
  images: PerImageScanResult[],
  getValue: (image: PerImageScanResult) => string | undefined
): ScanFieldCandidate | undefined {
  const valid = images
    .map((img) => ({ img, value: getValue(img) }))
    .filter((entry) => Boolean(entry.value && entry.value.trim()));
  if (valid.length === 0) return undefined;

  const selected = valid.reduce((best, current) => (current.img.confidence > best.img.confidence ? current : best), valid[0]);
  return {
    value: selected.value,
    role: selected.img.role,
    index: selected.img.index,
    confidence: selected.img.confidence
  };
}

function sourceFromCandidate(candidate: ScanFieldCandidate) {
  return {
    role: candidate.role,
    index: candidate.index,
    confidence: candidate.confidence
  };
}

function toStringValue(value: string | boolean | undefined) {
  return typeof value === "string" ? value : undefined;
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}
