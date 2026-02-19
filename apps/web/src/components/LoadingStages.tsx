import React from "react";
import { IonButton, IonIcon, IonText } from "@ionic/react";
import { checkmarkCircle, closeCircle, ellipse, refresh } from "ionicons/icons";
import type { ProcessingStage } from "../types/processingStage";
import { ProgressIndicator } from "./ProgressIndicator";

interface LoadingStagesProps {
  stages: ProcessingStage[];
  onRetry?: (stageId: string) => void;
}

/**
 * Displays a list of processing stages with their current status
 * Supports retry for failed stages
 */
export function LoadingStages({ stages, onRetry }: LoadingStagesProps) {
  return (
    <div className="loading-stages">
      {stages.map((stage, index) => (
        <div
          key={stage.id}
          className={`loading-stage loading-stage--${stage.status}`}
        >
          <div className="loading-stage-icon">
            {stage.status === "completed" && (
              <IonIcon icon={checkmarkCircle} color="success" />
            )}
            {stage.status === "error" && (
              <IonIcon icon={closeCircle} color="danger" />
            )}
            {stage.status === "active" && (
              <div className="loading-stage-spinner">
                <IonIcon icon={ellipse} className="spinner-pulse" />
              </div>
            )}
            {stage.status === "pending" && (
              <IonIcon icon={ellipse} color="medium" />
            )}
          </div>

          <div className="loading-stage-content">
            <div className="loading-stage-header">
              <IonText color={stage.status === "error" ? "danger" : undefined}>
                <span className="loading-stage-label">{stage.label}</span>
              </IonText>
              {stage.status === "active" && stage.estimatedDuration && (
                <span className="loading-stage-estimate">
                  ~{Math.round(stage.estimatedDuration / 1000)}s
                </span>
              )}
            </div>

            {stage.status === "active" && stage.progress !== undefined && (
              <ProgressIndicator progress={stage.progress} />
            )}

            {stage.status === "error" && (
              <div className="loading-stage-error">
                <IonText color="danger">
                  <p className="loading-stage-error-message">
                    {stage.errorMessage || "An error occurred"}
                  </p>
                </IonText>
                {onRetry && (
                  <IonButton
                    size="small"
                    fill="clear"
                    color="danger"
                    onClick={() => onRetry(stage.id)}
                  >
                    <IonIcon icon={refresh} slot="start" />
                    Retry
                  </IonButton>
                )}
              </div>
            )}
          </div>

          {/* Connector line to next stage */}
          {index < stages.length - 1 && (
            <div className="loading-stage-connector" />
          )}
        </div>
      ))}
    </div>
  );
}
