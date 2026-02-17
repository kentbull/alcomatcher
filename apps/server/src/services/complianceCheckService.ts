import type { ComplianceCheck, RegulatoryProfile } from "../types/compliance.js";
import type { ScannerQuickCheckResult } from "../types/scanner.js";
import { getDistilledSpiritsRuleMeta } from "./rules/distilledSpiritsRuleMap.js";

export function normalizeScannerChecks(
  checks: ScannerQuickCheckResult["checks"],
  regulatoryProfile: RegulatoryProfile,
  defaultConfidence: number
): ComplianceCheck[] {
  return checks.map((check) => {
    const meta = getRuleMeta(regulatoryProfile, check.id);
    const failureReason = check.status === "fail" ? check.detail : undefined;

    return {
      checkId: check.id,
      ruleId: meta.ruleId,
      label: meta.label ?? check.label,
      status: check.status,
      severity: statusAdjustedSeverity(meta.severity, check.status),
      confidence: normalizedConfidence(defaultConfidence, check.status),
      evidenceText: check.detail,
      citationRef: meta.citationRef,
      failureReason
    };
  });
}

function getRuleMeta(regulatoryProfile: RegulatoryProfile, checkId: string) {
  switch (regulatoryProfile) {
    case "distilled_spirits":
      return getDistilledSpiritsRuleMeta(checkId);
    case "wine":
    case "malt_beverage":
      // Temporary fallback while profile-specific maps are added.
      return getDistilledSpiritsRuleMeta(checkId);
    default:
      return getDistilledSpiritsRuleMeta(checkId);
  }
}

function statusAdjustedSeverity(
  severity: ComplianceCheck["severity"],
  status: ComplianceCheck["status"]
): ComplianceCheck["severity"] {
  if (status === "pass") return "advisory";
  if (status === "not_evaluable" && severity === "hard_fail") return "soft_fail";
  return severity;
}

function normalizedConfidence(baseConfidence: number, status: ComplianceCheck["status"]): number {
  const base = Number.isFinite(baseConfidence) ? Math.max(0, Math.min(1, baseConfidence)) : 0;
  if (status === "pass") return base;
  if (status === "not_evaluable") return Math.max(0.2, Math.min(0.7, base * 0.75));
  return Math.max(0.1, Math.min(0.6, base * 0.6));
}
