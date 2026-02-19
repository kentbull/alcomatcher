import { useEffect, useState } from "react";

/**
 * Hook to monitor online/offline connection status
 * Returns true when online, false when offline
 */
export function useOnlineStatus(): boolean {
  const [isOnline, setIsOnline] = useState(() => {
    // Check if we're in a browser environment
    if (typeof navigator !== "undefined" && typeof navigator.onLine === "boolean") {
      return navigator.onLine;
    }
    return true; // Default to online
  });

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  return isOnline;
}
