import { useCallback, useEffect, useState } from "react";
import { Preferences } from "@capacitor/preferences";

const PENDING_CRDT_COMMITS_KEY = "alcomatcher.pending.crdt.commits";
const LAST_SYNC_TIME_KEY = "alcomatcher.last.sync.time";

interface PendingCrdtCommit {
  applicationId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

export interface SyncQueueState {
  pendingCount: number;
  pendingItems: PendingCrdtCommit[];
  lastSyncTime: string | null;
  isSyncing: boolean;
}

/**
 * Hook to monitor and manage the CRDT sync queue
 * Tracks pending operations, sync status, and last sync time
 */
export function useSyncQueue() {
  const [queueState, setQueueState] = useState<SyncQueueState>({
    pendingCount: 0,
    pendingItems: [],
    lastSyncTime: null,
    isSyncing: false
  });

  const refreshQueue = useCallback(async () => {
    try {
      const [pendingState, lastSyncState] = await Promise.all([
        Preferences.get({ key: PENDING_CRDT_COMMITS_KEY }),
        Preferences.get({ key: LAST_SYNC_TIME_KEY })
      ]);

      const pendingItems = pendingState.value
        ? JSON.parse(pendingState.value) as PendingCrdtCommit[]
        : [];

      setQueueState((prev) => ({
        ...prev,
        pendingCount: pendingItems.length,
        pendingItems,
        lastSyncTime: lastSyncState.value
      }));
    } catch (error) {
      console.error("Failed to refresh sync queue:", error);
    }
  }, []);

  const updateLastSyncTime = useCallback(async () => {
    const now = new Date().toISOString();
    await Preferences.set({ key: LAST_SYNC_TIME_KEY, value: now });
    setQueueState((prev) => ({
      ...prev,
      lastSyncTime: now
    }));
  }, []);

  const setSyncing = useCallback((syncing: boolean) => {
    setQueueState((prev) => ({
      ...prev,
      isSyncing: syncing
    }));
  }, []);

  // Refresh queue periodically
  useEffect(() => {
    void refreshQueue();
    const interval = setInterval(() => {
      void refreshQueue();
    }, 5000); // Check every 5 seconds

    return () => clearInterval(interval);
  }, [refreshQueue]);

  return {
    queueState,
    refreshQueue,
    updateLastSyncTime,
    setSyncing
  };
}
