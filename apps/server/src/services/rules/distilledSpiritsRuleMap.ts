export interface DistilledSpiritsRuleMeta {
  checkId: string;
  ruleId: string;
  severity: "hard_fail" | "soft_fail" | "advisory";
  citationRef: string;
  label?: string;
}

const RULES: Record<string, DistilledSpiritsRuleMeta> = {
  brand_name_detected: {
    checkId: "brand_name_detected",
    ruleId: "27-cfr-5.63-brand-name",
    severity: "soft_fail",
    citationRef: "27 CFR 5.63",
    label: "Brand Name"
  },
  class_type_detected: {
    checkId: "class_type_detected",
    ruleId: "27-cfr-5.63-class-type",
    severity: "soft_fail",
    citationRef: "27 CFR 5.63",
    label: "Class / Type"
  },
  abv_detected: {
    checkId: "abv_detected",
    ruleId: "27-cfr-5.65-abv",
    severity: "soft_fail",
    citationRef: "27 CFR 5.65",
    label: "Alcohol Content"
  },
  net_contents_detected: {
    checkId: "net_contents_detected",
    ruleId: "27-cfr-5.56-net-contents",
    severity: "soft_fail",
    citationRef: "27 CFR 5.56",
    label: "Net Contents"
  },
  government_warning_present: {
    checkId: "government_warning_present",
    ruleId: "27-cfr-16-warning",
    severity: "hard_fail",
    citationRef: "27 CFR Part 16",
    label: "Government Warning"
  },
  brand_name_match: {
    checkId: "brand_name_match",
    ruleId: "expected-brand-match",
    severity: "advisory",
    citationRef: "Internal expected label cross-check",
    label: "Brand Name Match"
  },
  class_type_match: {
    checkId: "class_type_match",
    ruleId: "expected-class-type-match",
    severity: "advisory",
    citationRef: "Internal expected label cross-check",
    label: "Class / Type Match"
  },
  abv_match: {
    checkId: "abv_match",
    ruleId: "expected-abv-match",
    severity: "advisory",
    citationRef: "Internal expected label cross-check",
    label: "ABV Match"
  },
  net_contents_match: {
    checkId: "net_contents_match",
    ruleId: "expected-net-contents-match",
    severity: "advisory",
    citationRef: "Internal expected label cross-check",
    label: "Net Contents Match"
  },
  government_warning_required_match: {
    checkId: "government_warning_required_match",
    ruleId: "expected-government-warning-match",
    severity: "hard_fail",
    citationRef: "Internal expected label cross-check",
    label: "Government Warning Requirement"
  }
};

export function getDistilledSpiritsRuleMeta(checkId: string): DistilledSpiritsRuleMeta {
  return (
    RULES[checkId] ?? {
      checkId,
      ruleId: `derived-${checkId}`,
      severity: "advisory",
      citationRef: "Derived from scanner quick check"
    }
  );
}
