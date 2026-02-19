import React from "react";
import { IonProgressBar } from "@ionic/react";

interface ProgressIndicatorProps {
  progress: number; // 0-100
  label?: string;
  showPercentage?: boolean;
}

/**
 * Progress indicator with optional label and percentage display
 */
export function ProgressIndicator({ progress, label, showPercentage = false }: ProgressIndicatorProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress)) / 100;

  return (
    <div className="progress-indicator">
      {label && (
        <div className="progress-indicator-header">
          <span className="progress-indicator-label">{label}</span>
          {showPercentage && (
            <span className="progress-indicator-percentage">{Math.round(progress)}%</span>
          )}
        </div>
      )}
      <IonProgressBar value={clampedProgress} className="progress-indicator-bar" />
    </div>
  );
}
