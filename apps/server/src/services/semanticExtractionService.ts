import Anthropic from "@anthropic-ai/sdk";
import pino from "pino";
import { env } from "../config/env.js";

const logger = pino({ name: "semantic-extraction" });

const SYSTEM_PROMPT = `You are an expert alcohol beverage label compliance analyst trained on TTB (Alcohol and Tobacco Tax and Trade Bureau) label requirements under 27 CFR Parts 5, 7, and 16.

Your task is to extract structured fields from raw OCR text scraped from alcohol beverage label images. The text may contain noise, OCR artifacts, and line breaks that do not correspond to natural sentence boundaries.

You must return ONLY a valid JSON object — no markdown fences, no explanation, no trailing text.`;

function buildUserPrompt(compositeRawText: string): string {
  const truncated = compositeRawText.slice(0, 6000);
  return `Extract structured fields from the following OCR text from an alcohol beverage label.

Field definitions:
- brandName: The primary brand name as it would appear on the TTB COLA. This is a distinctive proper name (e.g., "FOSTER'S", "JACK DANIEL'S", "BUDWEISER") — NOT a marketing slogan, tagline, or descriptive phrase. Slogans describe an attribute or advertising message (e.g., "CELEBRATED WORLDWIDE", "THE WORLD'S FINEST"). When text above or around the brand name appears to be a slogan, skip it and choose the shortest distinctive proper name.
- classType: The spirit/beverage class (e.g., "LAGER", "VODKA", "BOURBON WHISKEY")
- abvText: Alcohol by volume text as it appears (e.g., "5% ALC/VOL")
- netContents: Net contents as it appears (e.g., "355 mL", "12 FL OZ")
- hasGovWarning: true if a government health warning is present anywhere on the label
- govWarningExtracted: The full government warning text if present, null otherwise

Example — Foster's can OCR text:
"CELEBRATED WORLDWIDE\nFOSTER'S LAGER\n5% ALC/VOL\n355 mL\nGOVERNMENT WARNING..."
Output: {"brandName":"FOSTER'S","classType":"LAGER","abvText":"5% ALC/VOL","netContents":"355 mL","hasGovWarning":true,"govWarningExtracted":"GOVERNMENT WARNING..."}

Set fields to null when not identifiable with confidence.

OCR TEXT:
${truncated}

Respond with ONLY a JSON object matching this schema: {"brandName":"string|null","classType":"string|null","abvText":"string|null","netContents":"string|null","hasGovWarning":boolean,"govWarningExtracted":"string|null"}`;
}

export interface SemanticExtractionFields {
  brandName?: string | null;
  classType?: string | null;
  abvText?: string | null;
  netContents?: string | null;
  hasGovWarning?: boolean;
  govWarningExtracted?: string | null;
}

export interface SemanticExtractionResult {
  fields: SemanticExtractionFields;
  usedLlm: boolean;
  llmExtractionMs: number;
}

function parseLlmResponse(text: string): SemanticExtractionFields {
  try {
    const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    if (typeof parsed !== "object" || parsed === null) return {};
    const p = parsed as Record<string, unknown>;
    return {
      brandName: typeof p.brandName === "string" ? p.brandName : p.brandName === null ? null : undefined,
      classType: typeof p.classType === "string" ? p.classType : p.classType === null ? null : undefined,
      abvText: typeof p.abvText === "string" ? p.abvText : p.abvText === null ? null : undefined,
      netContents: typeof p.netContents === "string" ? p.netContents : p.netContents === null ? null : undefined,
      hasGovWarning: typeof p.hasGovWarning === "boolean" ? p.hasGovWarning : undefined,
      govWarningExtracted: typeof p.govWarningExtracted === "string" ? p.govWarningExtracted : p.govWarningExtracted === null ? null : undefined,
    };
  } catch {
    return {};
  }
}

export class SemanticExtractionService {
  private readonly client: Anthropic | null;
  private readonly model: string;
  private readonly enabled: boolean;

  constructor() {
    this.model = env.ANTHROPIC_MODEL;
    this.enabled = Boolean(env.SEMANTIC_EXTRACTION_ENABLED && env.ANTHROPIC_API_KEY);
    this.client = env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })
      : null;
  }

  async extract(compositeRawText: string): Promise<SemanticExtractionResult> {
    if (!this.enabled || !this.client) {
      return { fields: {}, usedLlm: false, llmExtractionMs: 0 };
    }
    const startedAt = Date.now();
    try {
      const response = await this.client.messages.create({
        model: this.model,
        max_tokens: 512,
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content: buildUserPrompt(compositeRawText) }],
      });
      const content = response.content[0];
      if (content.type !== "text") {
        return { fields: {}, usedLlm: false, llmExtractionMs: Date.now() - startedAt };
      }
      return { fields: parseLlmResponse(content.text), usedLlm: true, llmExtractionMs: Date.now() - startedAt };
    } catch (error) {
      logger.error({ err: error }, "[SemanticExtraction] LLM call failed, falling back to regex");
      return { fields: {}, usedLlm: false, llmExtractionMs: Date.now() - startedAt };
    }
  }
}

export const semanticExtractionService = new SemanticExtractionService();
