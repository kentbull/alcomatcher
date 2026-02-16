import Tesseract from "tesseract.js";
import type { OcrAdapter, OcrResult } from "../../types/scanner.js";

/**
 * Local-first OCR adapter backed by Tesseract.js.
 * This keeps OCR on our own server runtime by default.
 */
export class LocalTesseractAdapter implements OcrAdapter {
  async recognize(image: Buffer): Promise<OcrResult> {
    const start = Date.now();
    const result = await Tesseract.recognize(image, "eng");
    const elapsedMs = Date.now() - start;

    const confidence = Math.max(0, Math.min(1, result.data.confidence / 100));

    return {
      provider: "local_tesseract",
      text: result.data.text ?? "",
      confidence,
      usedFallback: false
    };
  }
}
