import React from "react";
import type { ComplianceCheck } from "../../types/admin";
import "./ComplianceChecksTable.css";

interface ComplianceChecksTableProps {
  checks: ComplianceCheck[];
}

export const ComplianceChecksTable: React.FC<ComplianceChecksTableProps> = ({ checks }) => {
  if (checks.length === 0) {
    return (
      <div className="compliance-checks-empty">
        <p>No compliance checks have been performed yet.</p>
      </div>
    );
  }

  return (
    <div className="compliance-checks-wrapper">
      <table className="admin-table compliance-checks-table">
        <thead>
          <tr>
            <th>Check</th>
            <th>Status</th>
            <th>Evidence</th>
            <th>Rule Reference</th>
          </tr>
        </thead>
        <tbody>
          {checks.map((check) => (
            <tr key={check.id}>
              <td className="check-label">{check.label}</td>
              <td>
                <span className={`check-status check-status--${check.status}`}>
                  {getStatusIcon(check.status)} {formatStatus(check.status)}
                </span>
              </td>
              <td className="check-evidence">
                {check.evidence ? (
                  <span className="evidence-text" title={check.evidence}>
                    {truncate(check.evidence, 50)}
                  </span>
                ) : (
                  <span className="text-muted">—</span>
                )}
              </td>
              <td className="check-rule">
                {check.ruleReference || <span className="text-muted">—</span>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

function getStatusIcon(status: string): string {
  switch (status) {
    case "pass":
      return "✓";
    case "fail":
      return "✗";
    case "not_evaluable":
      return "⚠";
    default:
      return "•";
  }
}

function formatStatus(status: string): string {
  switch (status) {
    case "pass":
      return "Pass";
    case "fail":
      return "Fail";
    case "not_evaluable":
      return "Review";
    default:
      return status;
  }
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}
