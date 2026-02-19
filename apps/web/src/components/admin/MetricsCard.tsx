import React from "react";
import "./MetricsCard.css";

interface MetricsCardProps {
  label: string;
  value: string | number;
  icon?: React.ReactNode;
  variant?: "default" | "success" | "warning" | "danger";
}

export const MetricsCard: React.FC<MetricsCardProps> = ({
  label,
  value,
  icon,
  variant = "default",
}) => {
  return (
    <div className={`metrics-card metrics-card--${variant}`}>
      {icon && <div className="metrics-card-icon">{icon}</div>}
      <div className="metrics-card-content">
        <div className="metrics-card-value">{value}</div>
        <div className="metrics-card-label">{label}</div>
      </div>
    </div>
  );
};
