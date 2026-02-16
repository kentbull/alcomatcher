import type { OcrAdapter, OcrResult } from "../../types/scanner.js";

/**
 * Placeholder cloud fallback adapter contract.
 * Wired for future cloud OCR integration when local confidence is too low.
 */
export class CloudFallbackAdapter implements OcrAdapter {
  async recognize(_image: Buffer): Promise<OcrResult> {
    return {
      provider: "cloud_fallback",
      text: "",
      confidence: 0,
      usedFallback: true
    };
  }
}
