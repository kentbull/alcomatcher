import React, { useState } from "react";
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonText } from "@ionic/react";
import { alertCircleOutline, checkmarkCircle, imageOutline, warningOutline } from "ionicons/icons";
import type { LabelGroup } from "../types/labelGroup";

interface LocalImage {
  localId: string;
  role: "front" | "back" | "additional";
  uploadState: string;
}

interface BatchSummaryProps {
  groups: LabelGroup[];
  totalImages: number;
  images: LocalImage[]; // Add images array to check roles
  onSendBatch: () => void;
  onCancel: () => void;
  isSending: boolean;
}

/**
 * Summary view for batch scan before sending
 * Shows all label groups with detailed completion requirements
 */
export function BatchSummary({ groups, totalImages, images, onSendBatch, onCancel, isSending }: BatchSummaryProps) {
  const [showOverride, setShowOverride] = useState(false);

  // Check if each group has required images
  const groupDetails = groups.map((group) => {
    const groupImages = images.filter((img) => group.imageIds.includes(img.localId));
    const hasFront = groupImages.some((img) => img.role === "front");
    const hasBack = groupImages.some((img) => img.role === "back");
    const additionalCount = groupImages.filter((img) => img.role === "additional").length;
    const isComplete = hasFront && hasBack;

    return {
      ...group,
      hasFront,
      hasBack,
      additionalCount,
      isComplete,
      totalImages: groupImages.length
    };
  });

  const completedGroups = groupDetails.filter((g) => g.isComplete).length;
  const readyToSend = completedGroups === groups.length && groups.length > 0;
  const hasIncomplete = completedGroups < groups.length;

  return (
    <div className="batch-summary">
      <div className="batch-summary-header">
        <h2>Review Batch Submission</h2>
        <p>Each label requires front and back images</p>
      </div>

      <div className="batch-summary-stats">
        <div className="batch-stat">
          <div className="batch-stat-value">{groups.length}</div>
          <div className="batch-stat-label">Label{groups.length !== 1 ? "s" : ""}</div>
        </div>
        <div className="batch-stat">
          <div className="batch-stat-value">{totalImages}</div>
          <div className="batch-stat-label">Total Images</div>
        </div>
        <div className="batch-stat">
          <div className={`batch-stat-value ${readyToSend ? "complete" : "incomplete"}`}>
            {completedGroups}/{groups.length}
          </div>
          <div className="batch-stat-label">Complete</div>
        </div>
      </div>

      <div className="batch-summary-groups">
        {groupDetails.map((group, index) => (
          <div key={group.id} className={`batch-group-card ${group.isComplete ? "complete" : "incomplete"}`}>
            <div className="batch-group-header">
              <div className="batch-group-title">
                <IonIcon icon={group.isComplete ? checkmarkCircle : alertCircleOutline} />
                <h3>Label {index + 1}</h3>
              </div>
              <div className={`batch-group-badge ${group.isComplete ? "complete" : "incomplete"}`}>
                {group.isComplete ? "Complete" : "Incomplete"}
              </div>
            </div>

            <div className="batch-group-requirements">
              <div className={`requirement-item ${group.hasFront ? "met" : "missing"}`}>
                <IonIcon icon={group.hasFront ? checkmarkCircle : alertCircleOutline} />
                <span>Front Image</span>
                {!group.hasFront && <span className="requirement-status">Required</span>}
              </div>
              <div className={`requirement-item ${group.hasBack ? "met" : "missing"}`}>
                <IonIcon icon={group.hasBack ? checkmarkCircle : alertCircleOutline} />
                <span>Back Image</span>
                {!group.hasBack && <span className="requirement-status">Required</span>}
              </div>
              {group.additionalCount > 0 && (
                <div className="requirement-item met">
                  <IonIcon icon={imageOutline} />
                  <span>{group.additionalCount} Additional Image{group.additionalCount !== 1 ? "s" : ""}</span>
                </div>
              )}
            </div>

            {!group.isComplete && (
              <div className="batch-group-warning">
                <IonIcon icon={warningOutline} />
                <span>Missing required images</span>
              </div>
            )}
          </div>
        ))}
      </div>

      {hasIncomplete && !showOverride && (
        <div className="batch-incomplete-notice">
          <IonIcon icon={warningOutline} />
          <div>
            <strong>Some labels are incomplete</strong>
            <p>Complete all labels or use override to submit anyway</p>
          </div>
        </div>
      )}

      <div className="batch-summary-actions">
        <IonButton
          className="batch-action-button secondary"
          onClick={onCancel}
          disabled={isSending}
        >
          Cancel
        </IonButton>

        {readyToSend ? (
          <IonButton
            className="batch-action-button primary"
            onClick={onSendBatch}
            disabled={isSending}
          >
            {isSending ? "Sending..." : `Send ${groups.length} Label${groups.length !== 1 ? "s" : ""}`}
          </IonButton>
        ) : showOverride ? (
          <IonButton
            className="batch-action-button warning"
            onClick={onSendBatch}
            disabled={isSending}
          >
            <IonIcon icon={warningOutline} slot="start" />
            {isSending ? "Sending..." : "Force Submit"}
          </IonButton>
        ) : (
          <IonButton
            className="batch-action-button override"
            onClick={() => setShowOverride(true)}
            disabled={isSending}
          >
            Submit Anyway
          </IonButton>
        )}
      </div>
    </div>
  );
}
