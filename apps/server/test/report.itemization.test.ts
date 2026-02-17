import test from "node:test";
import assert from "node:assert/strict";
import { normalizeScannerChecks } from "../src/services/complianceCheckService.js";

test("normalizeScannerChecks provides complete required metadata", () => {
  const normalized = normalizeScannerChecks(
    [
      { id: "government_warning_present", label: "Government Warning", status: "fail", detail: "Missing GOVERNMENT WARNING token" },
      { id: "brand_name_detected", label: "Brand Name", status: "pass", detail: "Detected: ACME" },
      { id: "unknown_check", label: "Unknown", status: "not_evaluable", detail: "No signal" }
    ],
    "distilled_spirits",
    0.81
  );

  assert.equal(normalized.length, 3);

  for (const check of normalized) {
    assert.ok(check.checkId);
    assert.ok(check.ruleId);
    assert.ok(check.label);
    assert.ok(check.severity);
    assert.equal(typeof check.confidence, "number");
    assert.ok(check.evidenceText.length > 0);
    assert.ok(check.citationRef.length > 0);
  }

  const failed = normalized.find((entry) => entry.checkId === "government_warning_present");
  assert.ok(failed);
  assert.equal(failed?.severity, "hard_fail");
  assert.ok(failed?.failureReason?.includes("Missing"));

  const passed = normalized.find((entry) => entry.checkId === "brand_name_detected");
  assert.ok(passed);
  assert.equal(passed?.severity, "advisory");
  assert.equal(passed?.failureReason, undefined);
});
