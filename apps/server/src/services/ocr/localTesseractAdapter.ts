import { createWorker } from "tesseract.js";
import type { OcrAdapter, OcrResult } from "../../types/scanner.js";

/**
 * Local-first OCR adapter backed by Tesseract.js.
 * This keeps OCR on our own server runtime by default.
 */
export class LocalTesseractAdapter implements OcrAdapter {
  async recognize(image: Buffer): Promise<OcrResult> {
    let workerError: Error | null = null;
    const worker = await createWorker("eng", 1, {
      errorHandler: (error) => {
        workerError = error instanceof Error ? error : new Error(String(error));
      }
    });

    try {
      const result = await worker.recognize(image);

      if (workerError) {
        throw workerError;
      }

      const confidence = Math.max(0, Math.min(1, result.data.confidence / 100));
      return {
        provider: "local_tesseract",
        text: result.data.text ?? "",
        confidence,
        usedFallback: false
      };
    } catch {
      return {
        provider: "local_tesseract",
        text: "",
        confidence: 0,
        usedFallback: false
      };
    } finally {
      await worker.terminate();
    }
  }
}
