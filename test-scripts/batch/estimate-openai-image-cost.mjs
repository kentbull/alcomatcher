#!/usr/bin/env node

const args = parseArgs(process.argv.slice(2));
const items = Number(args.items ?? 3);
const imagesPerItem = Number(args.imagesPerItem ?? 3);
const model = args.model ?? "gpt-image-1";
const quality = args.quality ?? "low";

if (!Number.isFinite(items) || items < 1) throw new Error("--items must be >= 1");
if (!Number.isFinite(imagesPerItem) || imagesPerItem < 1) throw new Error("--imagesPerItem must be >= 1");

// Update these from official pricing page if it changes.
const PRICING_USD_PER_IMAGE = {
  "gpt-image-1": {
    low: 0.011,
    medium: 0.042,
    high: 0.167
  },
  "gpt-image-1-mini": {
    low: 0.005,
    medium: 0.011,
    high: 0.036
  }
};

const modelPricing = PRICING_USD_PER_IMAGE[model];
if (!modelPricing) {
  throw new Error(`Unknown model: ${model}. Supported: ${Object.keys(PRICING_USD_PER_IMAGE).join(", ")}`);
}
if (typeof modelPricing[quality] !== "number") {
  throw new Error(`Unknown quality: ${quality}. Supported: ${Object.keys(modelPricing).join(", ")}`);
}

const pricePerImage = modelPricing[quality];
const totalImages = items * imagesPerItem;
const estimatedCost = totalImages * pricePerImage;

console.log(JSON.stringify({
  model,
  quality,
  items,
  imagesPerItem,
  totalImages,
  pricePerImageUsd: round(pricePerImage),
  estimatedCostUsd: round(estimatedCost)
}, null, 2));

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const normalized = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    out[normalized] = value;
  }
  return out;
}

function round(value) {
  return Number(value.toFixed(4));
}
