#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";

const outDir = process.argv[2] ?? "test-scripts/batch/out/sample-2";

const items = [
  {
    id: "sample-pass-001",
    brand: "North River",
    classType: "Bourbon",
    abv: "40% ALC/VOL",
    net: "750 mL",
    warning:
      "GOVERNMENT WARNING: (1) According to the Surgeon General, women should not drink alcoholic beverages during pregnancy because of the risk of birth defects. (2) Consumption of alcoholic beverages impairs your ability to drive a car or operate machinery, and may cause health problems."
  },
  {
    id: "sample-fail-001",
    brand: "Blue Ember",
    classType: "Vodka",
    abv: "40% ALC/VOL",
    net: "750 mL",
    warning: ""
  }
];

const slug = (v) => v.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");

await mkdir(outDir, { recursive: true });

const csvHeader = ["client_label_id", "brand_name", "class", "alcohol_content", "net_contents", "government_warning", "regulatory_profile"];
const csvRows = items.map((item) => [
  item.id,
  item.brand,
  item.classType,
  item.abv,
  item.net,
  item.warning,
  "distilled_spirits"
]);

const csv = [csvHeader, ...csvRows]
  .map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","))
  .join("\n");

await writeFile(join(outDir, "manifest.csv"), csv, "utf-8");

const checklist = items
  .map((item) => {
    const key = `${slug(item.brand)}-${slug(item.classType)}`;
    return [
      `${item.id}:`,
      `  front-${key}.jpg`,
      `  back-${key}.jpg`,
      `  extra01-${key}.jpg (optional)`
    ].join("\n");
  })
  .join("\n\n");

await writeFile(
  join(outDir, "README.txt"),
  [
    "Place generated/sourced images in this folder with these names:",
    "",
    checklist,
    "",
    "Then zip this directory and upload via /admin/batches."
  ].join("\n"),
  "utf-8"
);

console.log(`Scaffold written to: ${outDir}`);
