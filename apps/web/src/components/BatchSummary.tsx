import React from "react";
import { IonButton, IonCard, IonCardContent, IonCardHeader, IonCardTitle, IonIcon, IonText } from "@ionic/react";
import { checkmarkCircle, images } from "ionicons/icons";
import type { LabelGroup } from "../types/labelGroup";

interface BatchSummaryProps {
  groups: LabelGroup[];
  totalImages: number;
  onSendBatch: () => void;
  onCancel: () => void;
  isSending: boolean;
}

/**
 * Summary view for batch scan before sending
 * Shows all label groups and image counts
 */
export function BatchSummary({ groups, totalImages, onSendBatch, onCancel, isSending }: BatchSummaryProps) {
  const completedGroups = groups.filter((g) => g.status === "complete").length;
  const readyToSend = completedGroups === groups.length && groups.length > 0;

  return (
    <div className="batch-summary">
      <IonCard>
        <IonCardHeader>
          <IonCardTitle>Batch Scan Summary</IonCardTitle>
        </IonCardHeader>
        <IonCardContent>
          <div className="batch-summary-stats">
            <div className="batch-stat">
              <IonText color="primary">
                <h2>{groups.length}</h2>
              </IonText>
              <IonText color="medium">
                <p>Label{groups.length !== 1 ? "s" : ""}</p>
              </IonText>
            </div>
            <div className="batch-stat">
              <IonText color="primary">
                <h2>{totalImages}</h2>
              </IonText>
              <IonText color="medium">
                <p>Image{totalImages !== 1 ? "s" : ""}</p>
              </IonText>
            </div>
            <div className="batch-stat">
              <IonText color={readyToSend ? "success" : "warning"}>
                <h2>{completedGroups}</h2>
              </IonText>
              <IonText color="medium">
                <p>Complete</p>
              </IonText>
            </div>
          </div>

          <div className="batch-summary-groups">
            {groups.map((group, index) => (
              <div key={group.id} className="batch-summary-group">
                <div className="batch-summary-group-icon">
                  {group.status === "complete" ? (
                    <IonIcon icon={checkmarkCircle} color="success" />
                  ) : (
                    <IonIcon icon={images} color="medium" />
                  )}
                </div>
                <div className="batch-summary-group-info">
                  <IonText>
                    <h4>Label {index + 1}</h4>
                  </IonText>
                  <IonText color="medium">
                    <p>{group.imageIds.length} image{group.imageIds.length !== 1 ? "s" : ""}</p>
                  </IonText>
                </div>
                <div className="batch-summary-group-status">
                  <IonText color={group.status === "complete" ? "success" : "medium"}>
                    <span>{group.status === "complete" ? "Ready" : "In Progress"}</span>
                  </IonText>
                </div>
              </div>
            ))}
          </div>

          {!readyToSend && (
            <IonText color="warning">
              <p style={{ textAlign: "center", marginTop: "1rem" }}>
                Complete all labels before sending
              </p>
            </IonText>
          )}

          <div className="batch-summary-actions">
            <IonButton expand="block" onClick={onCancel} fill="outline" disabled={isSending}>
              Cancel
            </IonButton>
            <IonButton
              expand="block"
              onClick={onSendBatch}
              disabled={!readyToSend || isSending}
              color="primary"
            >
              {isSending ? "Sending..." : `Send ${groups.length} Label${groups.length !== 1 ? "s" : ""}`}
            </IonButton>
          </div>
        </IonCardContent>
      </IonCard>
    </div>
  );
}
