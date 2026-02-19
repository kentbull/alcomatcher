import React from "react";
import { IonButton, IonButtons, IonContent, IonHeader, IonIcon, IonItem, IonLabel, IonList, IonModal, IonText, IonTitle, IonToolbar } from "@ionic/react";
import { checkmarkCircle, close, refreshOutline, timeOutline } from "ionicons/icons";
import type { SyncQueueState } from "../hooks/useSyncQueue";

interface SyncQueueModalProps {
  isOpen: boolean;
  onClose: () => void;
  queueState: SyncQueueState;
  onRetrySync: () => void;
  isOnline: boolean;
}

/**
 * Modal displaying detailed sync queue information
 * Shows pending operations with retry capability
 */
export function SyncQueueModal({ isOpen, onClose, queueState, onRetrySync, isOnline }: SyncQueueModalProps) {
  const { pendingItems, lastSyncTime, isSyncing } = queueState;

  return (
    <IonModal isOpen={isOpen} onDidDismiss={onClose}>
      <IonHeader>
        <IonToolbar>
          <IonTitle>Sync Queue</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={onClose}>
              <IonIcon icon={close} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent className="ion-padding">
        {/* Connection Status */}
        <div className="sync-queue-status" style={{ marginBottom: "1rem" }}>
          <IonText color={isOnline ? "success" : "warning"}>
            <h3 style={{ margin: "0.5rem 0" }}>
              {isOnline ? "✓ Online" : "⚠ Offline"}
            </h3>
          </IonText>
          {lastSyncTime && (
            <IonText color="medium">
              <p style={{ margin: "0.25rem 0", fontSize: "0.9rem" }}>
                <IonIcon icon={timeOutline} style={{ verticalAlign: "middle", marginRight: "0.25rem" }} />
                Last sync: {new Date(lastSyncTime).toLocaleString()}
              </p>
            </IonText>
          )}
        </div>

        {/* Pending Operations */}
        {pendingItems.length > 0 ? (
          <>
            <IonText color="medium">
              <h4 style={{ marginTop: "1rem" }}>
                Pending Operations ({pendingItems.length})
              </h4>
            </IonText>
            <IonList>
              {pendingItems.map((item, index) => (
                <IonItem key={`${item.applicationId}-${index}`}>
                  <IonLabel>
                    <h3>Application {item.applicationId.slice(0, 8)}...</h3>
                    <p>
                      Created: {new Date(item.createdAt).toLocaleString()}
                    </p>
                    {item.attempts > 0 && (
                      <p style={{ color: "var(--ion-color-warning)" }}>
                        Retried {item.attempts} time{item.attempts > 1 ? "s" : ""}
                      </p>
                    )}
                  </IonLabel>
                </IonItem>
              ))}
            </IonList>

            {/* Retry Button */}
            {isOnline && (
              <IonButton
                expand="block"
                onClick={onRetrySync}
                disabled={isSyncing}
                style={{ marginTop: "1rem" }}
              >
                <IonIcon icon={refreshOutline} slot="start" />
                {isSyncing ? "Syncing..." : "Retry Sync Now"}
              </IonButton>
            )}

            {!isOnline && (
              <IonText color="medium">
                <p style={{ textAlign: "center", marginTop: "1rem" }}>
                  Connect to the internet to sync pending operations
                </p>
              </IonText>
            )}
          </>
        ) : (
          <div style={{ textAlign: "center", padding: "2rem" }}>
            <IonIcon
              icon={checkmarkCircle}
              color="success"
              style={{ fontSize: "4rem" }}
            />
            <IonText color="success">
              <h3>All Synced</h3>
            </IonText>
            <IonText color="medium">
              <p>No pending operations</p>
            </IonText>
          </div>
        )}
      </IonContent>
    </IonModal>
  );
}
