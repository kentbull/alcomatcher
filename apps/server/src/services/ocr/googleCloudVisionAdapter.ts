import { GoogleAuth } from "google-auth-library";
import { access } from "node:fs/promises";
import type { OcrAdapter, OcrResult } from "../../types/scanner.js";

/**
 * Google Cloud Vision OCR adapter using service account authentication.
 * Authenticates via GOOGLE_APPLICATION_CREDENTIALS env var pointing to a
 * service account JSON key file. Free tier: 1,000 DOCUMENT_TEXT_DETECTION
 * requests/month.
 *
 * Docs: https://cloud.google.com/vision/docs/ocr
 */
export class GoogleCloudVisionAdapter implements OcrAdapter {
  private readonly auth: GoogleAuth;

  constructor() {
    this.auth = new GoogleAuth({
      scopes: ["https://www.googleapis.com/auth/cloud-platform"]
    });
  }

  async recognize(image: Buffer): Promise<OcrResult> {
    const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
    if (!credentialsPath) {
      return {
        provider: "google_cloud_vision",
        text: "",
        confidence: 0,
        usedFallback: true
      };
    }

    const hasUsableCredentials = await access(credentialsPath).then(() => true).catch(() => false);
    if (!hasUsableCredentials) {
      return {
        provider: "google_cloud_vision",
        text: "",
        confidence: 0,
        usedFallback: true
      };
    }

    const client = await this.auth.getClient();
    const token = await client.getAccessToken();
    if (!token.token) {
      throw new Error("Google Cloud Vision: failed to obtain access token");
    }

    const base64Image = image.toString("base64");
    const requestBody = {
      requests: [
        {
          image: { content: base64Image },
          features: [{ type: "DOCUMENT_TEXT_DETECTION" }]
        }
      ]
    };

    const response = await fetch("https://vision.googleapis.com/v1/images:annotate", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token.token}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      throw new Error(`Google Cloud Vision API error: HTTP ${response.status}`);
    }

    const data = await response.json() as {
      responses?: Array<{
        fullTextAnnotation?: { text?: string };
        textAnnotations?: Array<{ description?: string }>;
        error?: { message?: string };
      }>;
    };

    const result = data.responses?.[0];
    if (result?.error) {
      throw new Error(`Google Cloud Vision API error: ${result.error.message ?? "unknown"}`);
    }

    const text = result?.fullTextAnnotation?.text ?? result?.textAnnotations?.[0]?.description ?? "";

    return {
      provider: "google_cloud_vision",
      text,
      confidence: text.trim().length > 0 ? 0.85 : 0,
      usedFallback: true
    };
  }
}
