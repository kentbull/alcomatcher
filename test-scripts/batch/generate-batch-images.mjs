#!/usr/bin/env node
import { execFile } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import { dirname, join, resolve } from "node:path";

const execFileAsync = promisify(execFile);
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const GOV_WARNING_TEXT =
  "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems.";

// 1x1 PNG pixel (valid image bytes) for offline/mock runs.
const MOCK_PNG_BASE64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AApMBgT9v0xQAAAAASUVORK5CYII=";

const args = parseArgs(process.argv.slice(2));
const outDir = args.outDir ?? "test-scripts/batch/out/batch-3";
const count = Number(args.count ?? 3);
const failRate = Number(args.failRate ?? 0.25);
const seed = Number(args.seed ?? 42);
const provider = args.provider ?? (OPENAI_API_KEY ? "openai" : "mock");
const model = args.model ?? "gpt-image-1";
const size = args.size ?? "1024x1024";
const quality = args.quality ?? "low";
const zipOutput = args.zip === "true" || args.zip === "1";
const zipPath = args.zipPath ?? `${outDir}.zip`;

if (!Number.isFinite(count) || count < 1) {
  throw new Error("--count must be >= 1");
}
if (failRate < 0 || failRate > 1) {
  throw new Error("--failRate must be in [0,1]");
}

const items = buildItems({ count, failRate, seed });
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
    "Photorealistic label print texture, no bottle neck or hands, neutral studio background."
  ].join(" ");

  const backPrompt = [
    `Alcohol beverage bottle back label for brand "${item.brand}" and class "${item.classType}".`,
    `Include clearly legible ABV text "${item.abvText}" and net contents "${item.netContents}".`,
    item.governmentWarning
      ? `Include this exact warning paragraph in uppercase heading style: ${item.governmentWarning}`
      : "Intentionally omit any GOVERNMENT WARNING heading.",
    "Photorealistic label print texture, neutral studio background."
  ].join(" ");

  const extraPrompt = [
    `Side/back detail label image for ${item.brand} ${item.classType}.`,
    "Include small decorative text blocks and serial-like fine print.",
    "Photorealistic label print texture, neutral studio background."
  ].join(" ");

  await generateImage({ provider, model, size, quality, prompt: frontPrompt, outputPath: join(outDir, frontName) });
  await generateImage({ provider, model, size, quality, prompt: backPrompt, outputPath: join(outDir, backName) });
  await generateImage({ provider, model, size, quality, prompt: extraPrompt, outputPath: join(outDir, extraName) });

  manifestRows.push([
    item.clientLabelId,
    item.brand,
    item.classType,
    item.abvText,
    item.netContents,
    item.governmentWarning,
    "distilled_spirits",
    item.expectPass ? "pass" : "fail",
    item.failureMode ?? ""
  ]);
}

const header = [
  "client_label_id",
  "brand_name",
  "class",
  "alcohol_content",
  "net_contents",
  "government_warning",
  "regulatory_profile",
  "expected_outcome",
  "failure_mode"
];
const csv = [header, ...manifestRows]
  .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
  .join("\n");
await writeFile(join(outDir, "manifest.csv"), csv, "utf-8");

const passCount = items.filter((i) => i.expectPass).length;
const failCount = items.length - passCount;

await writeFile(
  join(outDir, "README.txt"),
  [
    `Provider: ${provider}`,
    `Model: ${model} quality=${quality} size=${size}`,
    `Items: ${items.length} pass=${passCount} fail=${failCount}`,
    "Zip this folder and upload via /admin/batches"
  ].join("\n"),
  "utf-8"
);

if (zipOutput) {
  await zipDirectory(outDir, zipPath);
}

console.log(`Generated ${count} items in ${outDir} using provider=${provider}`);
console.log(`Pass=${passCount} Fail=${failCount} failRate=${failRate}`);
if (zipOutput) {
  console.log(`Zip created: ${zipPath}`);
} else {
  console.log(`To zip: (cd ${outDir} && zip -r ../batch-${count}.zip .)`);
}

async function generateImage({ provider, model, size, quality, prompt, outputPath }) {
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
      quality
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

async function zipDirectory(directory, destinationZip) {
  const resolvedZip = resolve(destinationZip);
  await mkdir(dirname(resolvedZip), { recursive: true });
  const args = ["-rq", resolvedZip, "."];
  await execFileAsync("zip", args, { cwd: directory });
}

function buildItems({ count, failRate, seed }) {
  const brands = [
    "North River",
    "Harbor Stone",
    "Blue Ember",
    "Granite Peak",
    "Amber Trail",
    "Cinder Oak",
    "Copper Hollow",
    "Iron Pine",
    "Moss Ridge",
    "Canyon Drift"
  ];
  const classes = ["Bourbon", "Rye Whiskey", "Vodka", "Rum", "Gin", "Tequila"];
  const failureModes = [
    "missing_government_warning",
    "abv_mismatch",
    "net_contents_missing",
    "brand_class_mismatch",
    "low_confidence_image"
  ];

  const rand = lcg(seed);
  const failTarget = Math.round(count * failRate);
  const failIndexes = new Set(sampleIndexes(count, failTarget, rand));

  const items = [];
  for (let i = 0; i < count; i += 1) {
    const brand = brands[Math.floor(rand() * brands.length)];
    const classType = classes[Math.floor(rand() * classes.length)];
    const expectPass = !failIndexes.has(i);
    const failureMode = expectPass ? undefined : failureModes[i % failureModes.length];

    let abvText = `${[35, 40, 45, 50][Math.floor(rand() * 4)]}% ALC/VOL`;
    let netContents = ["750 mL", "1 L", "700 mL"][Math.floor(rand() * 3)];
    let governmentWarning = GOV_WARNING_TEXT;

    if (failureMode === "missing_government_warning") governmentWarning = "";
    if (failureMode === "abv_mismatch") abvText = "12% ALC/VOL";
    if (failureMode === "net_contents_missing") netContents = "";
    if (failureMode === "brand_class_mismatch") {
      // Keep manifest brand/class as-is; image prompt includes this, but this tag allows downstream failure assertions.
    }
    if (failureMode === "low_confidence_image") {
      // Marked in manifest; can be used for downstream checks.
    }

    items.push({
      clientLabelId: `batch-${String(i + 1).padStart(4, "0")}`,
      brand,
      classType,
      abvText,
      netContents,
      governmentWarning,
      expectPass,
      failureMode
    });
  }

  return items;
}

function sampleIndexes(total, picks, rand) {
  const arr = Array.from({ length: total }, (_, i) => i);
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, picks);
}

function slug(value) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

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

function lcg(seed) {
  let state = seed >>> 0;
  return () => {
    state = (1664525 * state + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}
