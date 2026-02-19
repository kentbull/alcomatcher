import React from "react";
import { IonText } from "@ionic/react";

interface CaptureGuideProps {
  phase: "front" | "back" | "additional";
  isAligned?: boolean;
  qualityScore?: number;
}

/**
 * Overlay guide to help users capture optimal label images
 * Shows alignment frame and quality feedback
 */
export function CaptureGuide({ phase, isAligned = false, qualityScore }: CaptureGuideProps) {
  const getGuidanceText = () => {
    switch (phase) {
      case "front":
        return "Center the front label in the frame";
      case "back":
        return "Center the back label in the frame";
      case "additional":
        return "Capture any additional label details";
      default:
        return "Center the label in the frame";
    }
  };

  const getQualityColor = (score: number) => {
    if (score >= 70) return "success";
    if (score >= 50) return "warning";
    return "danger";
  };

  return (
    <div className="capture-guide">
      {/* Alignment frame */}
      <div className={`capture-guide-frame ${isAligned ? "is-aligned" : ""}`}>
        <div className="capture-guide-corner capture-guide-corner--tl" />
        <div className="capture-guide-corner capture-guide-corner--tr" />
        <div className="capture-guide-corner capture-guide-corner--bl" />
        <div className="capture-guide-corner capture-guide-corner--br" />
      </div>

      {/* Guidance text */}
      <div className="capture-guide-text">
        <IonText color="light">
          <p>{getGuidanceText()}</p>
        </IonText>
      </div>

      {/* Quality indicator */}
      {qualityScore !== undefined && (
        <div className="capture-guide-quality">
          <IonText color={getQualityColor(qualityScore)}>
            <span className="capture-guide-quality-label">
              Quality: {qualityScore}%
            </span>
          </IonText>
        </div>
      )}

      {/* Tips */}
      <div className="capture-guide-tips">
        <IonText color="light">
          <ul>
            <li>Hold steady</li>
            <li>Ensure good lighting</li>
            <li>Keep label flat</li>
            <li>Avoid glare and shadows</li>
          </ul>
        </IonText>
      </div>
    </div>
  );
}
