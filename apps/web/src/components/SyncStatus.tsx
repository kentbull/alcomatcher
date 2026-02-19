import React from "react";
import { IonBadge, IonIcon, IonText } from "@ionic/react";
import { cloudDoneOutline, cloudOfflineOutline, cloudUploadOutline, syncOutline } from "ionicons/icons";
import type { SyncQueueState } from "../hooks/useSyncQueue";

interface SyncStatusProps {
  isOnline: boolean;
  queueState: SyncQueueState;
  onTap?: () => void;
}

/**
 * Compact sync status indicator showing connection and sync queue state
 * Displays as a small badge that can be tapped to show queue details
 */
export function SyncStatus({ isOnline, queueState, onTap }: SyncStatusProps) {
  const { pendingCount, isSyncing, lastSyncTime } = queueState;

  // Determine icon and color based on state
  let icon = cloudDoneOutline;
  let color = "success";
  let label = "Synced";

  if (!isOnline) {
    icon = cloudOfflineOutline;
    color = "warning";
    label = "Offline";
  } else if (isSyncing) {
    icon = syncOutline;
    color = "primary";
    label = "Syncing";
  } else if (pendingCount > 0) {
    icon = cloudUploadOutline;
    color = "warning";
    label = `${pendingCount} pending`;
  }

  // Format last sync time
  const lastSyncDisplay = lastSyncTime
    ? formatRelativeTime(new Date(lastSyncTime))
    : "Never";

  return (
    <div
      className="sync-status"
      onClick={onTap}
      style={{ cursor: onTap ? "pointer" : "default" }}
    >
      <div className="sync-status-indicator">
        <IonIcon
          icon={icon}
          color={color}
          className={isSyncing ? "sync-status-spinning" : ""}
        />
        {pendingCount > 0 && (
          <IonBadge color={color} className="sync-status-badge">
            {pendingCount}
          </IonBadge>
        )}
      </div>
      <div className="sync-status-text">
        <IonText color={color}>
          <span className="sync-status-label">{label}</span>
        </IonText>
        {lastSyncTime && !isSyncing && (
          <IonText color="medium">
            <span className="sync-status-time">{lastSyncDisplay}</span>
          </IonText>
        )}
      </div>
    </div>
  );
}

/**
 * Format a timestamp as relative time (e.g., "2m ago", "1h ago")
 */
function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return "Just now";
  } else if (diffMinutes < 60) {
    return `${diffMinutes}m ago`;
  } else if (diffHours < 24) {
    return `${diffHours}h ago`;
  } else if (diffDays < 7) {
    return `${diffDays}d ago`;
  } else {
    return date.toLocaleDateString();
  }
}
