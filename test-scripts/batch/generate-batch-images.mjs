#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
// 1x1 PNG pixel (valid image bytes) for offline/mock runs.
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AApMBgT9v0xQAAAAASUVORK5CYII=";

const args = parseArgs(process.argv.slice(2));
const outDir = args.outDir ?? "test-scripts/batch/out/batch-3";
const count = Number(args.count ?? 3);
const provider = args.provider ?? (OPENAI_API_KEY ? "openai" : "mock");
const model = args.model ?? "gpt-image-1";
const size = args.size ?? "1024x1024";

if (!Number.isFinite(count) || count < 1) {
  throw new Error("--count must be >= 1");
}

const items = buildItems(count);
await mkdir(outDir, { recursive: true });

const manifestRows = [];
for (const item of items) {
  const key = `${slug(item.brand)}-${slug(item.classType)}`;
  const frontName = `front-${key}.png`;
  const backName = `back-${key}.png`;
  const extraName = `extra01-${key}.png`;

  const frontPrompt = [
    `Alcohol beverage bottle front label artwork for brand "${item.brand}" and class "${item.classType}".`,
    `Include clearly legible primary label text: ${item.brand} ${item.classType}.`,
    "High contrast, realistic printed packaging, plain background, no bottle neck or hands."
  ].join(" ");

  const backPrompt = [
    `Alcohol beverage bottle back label for brand "${item.brand}" and class "${item.classType}".`,
    `Include clearly legible ABV text "${item.abvText}" and net contents "${item.netContents}".`,
    item.governmentWarning
      ? `Include this exact warning paragraph in uppercase heading style: ${item.governmentWarning}`
      : "Intentionally omit any GOVERNMENT WARNING heading.",
    "High contrast, realistic printed packaging, plain background."
  ].join(" ");

  const extraPrompt = [
    `Side/back detail label image for ${item.brand} ${item.classType}.`,
    "Include small decorative text blocks and serial-like fine print.",
    "High contrast, realistic printed packaging."
  ].join(" ");

  await generateImage({ provider, model, size, prompt: frontPrompt, outputPath: join(outDir, frontName) });
  await generateImage({ provider, model, size, prompt: backPrompt, outputPath: join(outDir, backName) });
  await generateImage({ provider, model, size, prompt: extraPrompt, outputPath: join(outDir, extraName) });

  manifestRows.push([
    item.clientLabelId,
    item.brand,
    item.classType,
    item.abvText,
    item.netContents,
    item.governmentWarning,
    "distilled_spirits"
  ]);
}

const header = [
  "client_label_id",
  "brand_name",
  "class",
  "alcohol_content",
  "net_contents",
  "government_warning",
  "regulatory_profile"
];
const csv = [header, ...manifestRows]
  .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
  .join("\n");
await writeFile(join(outDir, "manifest.csv"), csv, "utf-8");

await writeFile(
  join(outDir, "README.txt"),
  [
    `Provider: ${provider}`,
    "Zip this folder and upload via /admin/batches",
    "Expected: at least one failing item if warning omitted"
  ].join("\n"),
  "utf-8"
);

console.log(`Generated ${count} items in ${outDir} using provider=${provider}`);
console.log(`To zip: (cd ${outDir} && zip -r ../batch-${count}.zip .)`);

async function generateImage({ provider, model, size, prompt, outputPath }) {
  if (provider === "mock") {
    await writeFile(outputPath, Buffer.from(MOCK_PNG_BASE64, "base64"));
    return;
  }

  if (!OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for provider=openai");
  }

  const response = await fetch("https://api.openai.com/v1/images/generations", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENAI_API_KEY}`
    },
    body: JSON.stringify({
      model,
      prompt,
      size,
      quality: "low"
    })
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`OpenAI image generation failed (${response.status}): ${body}`);
  }

  const payload = await response.json();
  const b64 = payload?.data?.[0]?.b64_json;
  if (!b64) {
    throw new Error("OpenAI image response missing data[0].b64_json");
  }

  await writeFile(outputPath, Buffer.from(b64, "base64"));
}

function buildItems(count) {
  const examples = [
    {
      clientLabelId: "batch3-001",
      brand: "North River",
      classType: "Bourbon",
      abvText: "40% ALC/VOL",
      netContents: "750 mL",
      governmentWarning:
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
    },
    {
      clientLabelId: "batch3-002",
      brand: "Harbor Stone",
      classType: "Rye Whiskey",
      abvText: "45% ALC/VOL",
      netContents: "750 mL",
      governmentWarning:
        "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
    },
    {
      clientLabelId: "batch3-003",
      brand: "Blue Ember",
      classType: "Vodka",
      abvText: "40% ALC/VOL",
      netContents: "750 mL",
      governmentWarning: ""
    }
  ];

  const out = [];
  for (let i = 0; i < count; i += 1) {
    const base = examples[i % examples.length];
    out.push({
      ...base,
      clientLabelId: `${base.clientLabelId}-${String(i + 1).padStart(3, "0")}`
    });
  }
  return out;
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const key = argv[i];
    if (!key.startsWith("--")) continue;
    const normalized = key.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[++i] : "true";
    args[normalized] = value;
  }
  return args;
}
