import React from "react";
import { IonProgressBar } from "@ionic/react";

interface ProgressIndicatorProps {
  progress?: number; // 0-100 (undefined for indeterminate)
  label?: string;
  showPercentage?: boolean;
  indeterminate?: boolean; // If true, show indeterminate animation
}

/**
 * Progress indicator with optional label and percentage display
 * Supports indeterminate mode for unknown progress
 */
export function ProgressIndicator({ progress, label, showPercentage = false, indeterminate = false }: ProgressIndicatorProps) {
  const clampedProgress = progress !== undefined ? Math.max(0, Math.min(100, progress)) / 100 : undefined;
  const isIndeterminate = indeterminate || progress === undefined;

  return (
    <div className="progress-indicator">
      {label && (
        <div className="progress-indicator-header">
          <span className="progress-indicator-label">{label}</span>
          {showPercentage && !isIndeterminate && progress !== undefined && (
            <span className="progress-indicator-percentage">{Math.round(progress)}%</span>
          )}
        </div>
      )}
      <IonProgressBar
        value={isIndeterminate ? undefined : clampedProgress}
        type={isIndeterminate ? "indeterminate" : "determinate"}
        className="progress-indicator-bar"
      />
    </div>
  );
}
