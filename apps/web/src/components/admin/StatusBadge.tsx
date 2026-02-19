import React from "react";
import type { ApplicationStatus } from "../../types/admin";

interface StatusBadgeProps {
  status: ApplicationStatus;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status }) => {
  const variant = getStatusVariant(status);
  const label = getStatusLabel(status);

  return (
    <span className={`status-badge status-badge--${variant}`}>
      {label}
    </span>
  );
};

function getStatusVariant(status: ApplicationStatus): string {
  switch (status) {
    case "matched":
    case "approved":
      return "pass";
    case "rejected":
      return "fail";
    case "needs_review":
      return "review";
    default:
      return "default";
  }
}

function getStatusLabel(status: ApplicationStatus): string {
  return status.replace(/_/g, " ").toUpperCase();
}
