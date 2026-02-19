import { GoogleCloudVisionAdapter } from "./ocr/googleCloudVisionAdapter.js";
import { LocalTesseractAdapter } from "./ocr/localTesseractAdapter.js";
import { semanticExtractionService } from "./semanticExtractionService.js";
import type { SemanticExtractionResult } from "./semanticExtractionService.js";
import type { CompositeExtractedFields, ExpectedLabelFields, OcrAdapter, PerImageScanResult, ScanImageRole, ScannerCheck, ScannerQuickCheckResult } from "../types/scanner.js";

const GOV_WARNING_TOKEN = "GOVERNMENT WARNING";

/**
 * TTB required government warning text per 27 CFR 16.21 (normalized whitespace).
 * "GOVERNMENT WARNING" must appear in all caps.
 */
const GOV_WARNING_REQUIRED_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink " +
  "alcoholic beverages during pregnancy because of the risk of birth defects. " +
  "(2) Consumption of alcoholic beverages impairs your ability to drive a car or " +
  "operate machinery, and may cause health problems.";
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

// Canonical class type list — any case variation maps to the canonical lowercase form
const CANONICAL_CLASS_TYPES = new Map<string, string>([
  ["bourbon", "bourbon"], ["whiskey", "whiskey"], ["whisky", "whisky"],
  ["rum", "rum"], ["vodka", "vodka"], ["tequila", "tequila"], ["gin", "gin"],
  ["brandy", "brandy"], ["cognac", "cognac"], ["mezcal", "mezcal"],
  ["distilled spirits", "distilled spirits"], ["spirits", "spirits"],
  ["wine", "wine"], ["beer", "beer"], ["ale", "ale"], ["lager", "lager"],
  ["malt beverage", "malt beverage"], ["cider", "cider"]
]);

export class ScannerService {
  constructor(
    private readonly localOcr: OcrAdapter = new LocalTesseractAdapter(),
    private readonly cloudFallback: OcrAdapter = new GoogleCloudVisionAdapter()
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
    const semanticResult = await semanticExtractionService.extract(compositeExtracted.rawText);
    const finalExtracted = this.mergeWithSemanticResult(compositeExtracted, semanticResult);
    const compositeChecks = this.buildCompositeChecks(finalExtracted, expected);
    const failCount = compositeChecks.filter((check) => check.status === "fail").length;
    const notEvaluableCount = compositeChecks.filter((check) => check.status === "not_evaluable").length;
    const summary: ScannerQuickCheckResult["summary"] = failCount > 0 ? "fail" : notEvaluableCount > 0 ? "needs_review" : "pass";

    return {
      summary,
      extracted: finalExtracted,
      composite: {
        extracted: finalExtracted,
        checks: compositeChecks
      },
      images: perImage,
      checks: compositeChecks,
      confidence: average(perImage.map((entry) => entry.confidence)),
      provider: perImage.find((entry) => entry.usedFallback)?.provider ?? perImage[0]?.provider ?? "local_tesseract",
      usedFallback: perImage.some((entry) => entry.usedFallback),
      processingMs: perImage.reduce((sum, entry) => sum + entry.processingMs, 0) + semanticResult.llmExtractionMs,
      stageTimings: semanticResult.usedLlm ? { llmExtractionMs: semanticResult.llmExtractionMs } : undefined
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

  private mergeWithSemanticResult(
    composite: CompositeExtractedFields,
    semantic: SemanticExtractionResult
  ): CompositeExtractedFields {
    if (!semantic.usedLlm || Object.keys(semantic.fields).length === 0) return composite;
    const f = semantic.fields;
    const LLM_CONF = 0.92;
    const fieldSources = { ...composite.fieldSources };

    const markLlm = (field: keyof typeof fieldSources, fallbackRole: "front" | "back") => {
      fieldSources[field] = {
        ...(composite.fieldSources[field] ?? { role: fallbackRole, index: 0, confidence: LLM_CONF }),
        confidence: LLM_CONF,
        extractionMethod: "llm" as const,
      };
    };

    const brandName   = f.brandName   != null ? (markLlm("brandName",   "front"), f.brandName)   : composite.brandName;
    const classType   = f.classType   != null ? (markLlm("classType",   "front"), f.classType)   : composite.classType;
    const abvText     = f.abvText     != null ? (markLlm("abvText",     "back"),  f.abvText)     : composite.abvText;
    const netContents = f.netContents != null ? (markLlm("netContents", "back"),  f.netContents) : composite.netContents;
    const hasGovWarning = f.hasGovWarning !== undefined
      ? (markLlm("hasGovWarning", "back"), composite.hasGovWarning || f.hasGovWarning)
      : composite.hasGovWarning;
    const govWarningExtracted = f.govWarningExtracted != null ? f.govWarningExtracted : composite.govWarningExtracted;

    return {
      ...composite,
      brandName, classType, abvText, netContents, hasGovWarning,
      govWarningExtracted, fieldSources, llmExtractionUsed: true,
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

    // Extract government warning text: capture from "GOVERNMENT WARNING" token to end of sentence pair
    const govWarningIndex = normalized.toUpperCase().indexOf(GOV_WARNING_TOKEN);
    let govWarningExtracted: string | undefined;
    if (govWarningIndex !== -1) {
      // Grab up to 600 chars from the token, normalize whitespace
      const raw = normalized.slice(govWarningIndex, govWarningIndex + 600);
      govWarningExtracted = raw.replace(/\s+/g, " ").trim();
    }

    return {
      rawText,
      brandName,
      classType,
      abvText: abvMatch?.[0],
      netContents: netMatch ? `${netMatch[1]} ${netMatch[2]}` : undefined,
      hasGovWarning: govWarningIndex !== -1,
      govWarningExtracted
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
      },
      {
        id: "gov_warning_capitalization",
        label: "Government Warning Capitalization",
        status: extracted.govWarningExtracted
          ? (extracted.govWarningExtracted.startsWith("GOVERNMENT WARNING") ? "pass" : "fail")
          : "not_evaluable",
        detail: extracted.govWarningExtracted
          ? (extracted.govWarningExtracted.startsWith("GOVERNMENT WARNING")
            ? "\"GOVERNMENT WARNING\" detected in all caps as required"
            : `TTB requires "GOVERNMENT WARNING" in all caps. Extracted: "${extracted.govWarningExtracted.slice(0, 60)}..."`)
          : "Government warning text not detected"
      },
      {
        id: "gov_warning_text_exact",
        label: "Government Warning Text (Exact)",
        status: (() => {
          if (!extracted.govWarningExtracted) return "not_evaluable";
          const normalized = extracted.govWarningExtracted.replace(/\s+/g, " ").trim();
          const required = GOV_WARNING_REQUIRED_TEXT.replace(/\s+/g, " ").trim();
          // Check if extracted text contains the required text (allows for some OCR noise around it)
          const extractedNorm = normalized.replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").toLowerCase();
          const requiredNorm = required.replace(/[^a-z0-9 ]/gi, " ").replace(/\s+/g, " ").toLowerCase();
          return extractedNorm.includes(requiredNorm.slice(0, 120)) ? "pass" : "fail";
        })(),
        detail: extracted.govWarningExtracted
          ? `Extracted: "${extracted.govWarningExtracted.slice(0, 80)}..."`
          : "Government warning text not detected — required per 27 CFR 16.21"
      }
    ];

    if (expected?.brandName) {
      const normExtracted = this.normalized(extracted.brandName);
      const normExpected = this.normalized(expected.brandName);
      const matches = normExtracted === normExpected || levenshtein(normExtracted, normExpected) <= 2;
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
      const normExtracted = canonicalClassType(extracted.classType);
      const normExpected = canonicalClassType(expected.classType);
      const matches = normExtracted !== null && normExpected !== null && normExtracted === normExpected;
      const fallbackMatches = this.normalized(extracted.classType) === this.normalized(expected.classType);
      checks.push({
        id: "class_type_match",
        label: "Class / Type Match",
        status: extracted.classType ? (matches || fallbackMatches ? "pass" : "fail") : "not_evaluable",
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

/**
 * Returns canonical lowercase class type if it matches any known class, otherwise null.
 */
function canonicalClassType(value?: string): string | null {
  if (!value) return null;
  const normalized = value.toLowerCase().replace(/[^a-z ]/g, "").trim();
  for (const [key, canonical] of CANONICAL_CLASS_TYPES) {
    if (normalized === key || normalized.includes(key)) return canonical;
  }
  return null;
}

/**
 * Levenshtein distance between two strings (iterative, O(n*m)).
 */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}
