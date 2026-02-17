import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { setupIonicReact } from "@ionic/react";
import {
  IonApp,
  IonButton,
  IonContent,
  IonHeader,
  IonInput,
  IonItem,
  IonLabel,
  IonList,
  IonPage,
  IonText,
  IonTitle,
  IonToolbar
} from "@ionic/react";
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "./styles.css";

setupIonicReact();

interface ScannerCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_evaluable";
  detail: string;
}

interface ScannerResponse {
  applicationId: string;
  summary: "pass" | "fail" | "needs_review";
  extracted: {
    rawText: string;
    brandName?: string;
    classType?: string;
    abvText?: string;
    netContents?: string;
    hasGovWarning: boolean;
  };
  checks: ScannerCheck[];
  confidence: number;
  provider: string;
  usedFallback: boolean;
  request_id?: string;
}

interface ScannerErrorPayload {
  error?: string;
  detail?: string;
  request_id?: string;
}

interface QueuedCrdtOp {
  applicationId: string;
  actorId: string;
  sequence: number;
  payload: Record<string, unknown>;
}

interface RealtimeEvent {
  eventId: string;
  type: "sync.ack" | "application.status_changed" | "batch.progress";
  applicationId?: string;
  batchId?: string;
  data?: {
    syncState?: "pending_sync" | "synced" | "sync_failed";
    [key: string]: unknown;
  };
}

const CRDT_QUEUE_KEY = "alcomatcher_crdt_queue_v1";
const CRDT_ACTOR_KEY = "alcomatcher_crdt_actor_v1";
const CRDT_SEQUENCE_PREFIX = "alcomatcher_crdt_seq_";

function base64ToBlob(base64Data: string, mimeType = "image/jpeg") {
  const byteString = atob(base64Data);
  const byteArray = new Uint8Array(byteString.length);
  for (let i = 0; i < byteString.length; i += 1) {
    byteArray[i] = byteString.charCodeAt(i);
  }
  return new Blob([byteArray], { type: mimeType });
}

function App() {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<ScannerResponse | null>(null);
  const [error, setError] = useState<string>("");
  const [serverSyncState, setServerSyncState] = useState<"unknown" | "pending_sync" | "synced" | "sync_failed">("unknown");

  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [expectedClassType, setExpectedClassType] = useState("");
  const [expectedAbvText, setExpectedAbvText] = useState("");
  const [expectedNetContents, setExpectedNetContents] = useState("");
  const [syncPendingCount, setSyncPendingCount] = useState(0);
  const [syncState, setSyncState] = useState<"idle" | "syncing" | "offline" | "retrying" | "failed">("idle");
  const syncRetryTimeoutRef = useRef<number | null>(null);
  const syncRetryAttemptRef = useRef(0);

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? "https://alcomatcher.com", []);
  const statusClass = result ? `status-${result.summary}` : "";

  const getStoredQueue = useCallback((): QueuedCrdtOp[] => {
    const raw = localStorage.getItem(CRDT_QUEUE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as QueuedCrdtOp[];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, []);

  const persistQueue = useCallback((queue: QueuedCrdtOp[]) => {
    localStorage.setItem(CRDT_QUEUE_KEY, JSON.stringify(queue));
    setSyncPendingCount(queue.length);
  }, []);

  const getActorId = useCallback(() => {
    const existing = localStorage.getItem(CRDT_ACTOR_KEY);
    if (existing) return existing;
    const actorId = `actor-${crypto.randomUUID()}`;
    localStorage.setItem(CRDT_ACTOR_KEY, actorId);
    return actorId;
  }, []);

  const nextSequenceForApplication = useCallback((applicationId: string) => {
    const key = `${CRDT_SEQUENCE_PREFIX}${applicationId}`;
    const current = Number(localStorage.getItem(key) ?? "0");
    const next = Number.isFinite(current) && current >= 0 ? current + 1 : 1;
    localStorage.setItem(key, String(next));
    return next;
  }, []);

  const flushCrdtQueue = useCallback(async () => {
    const queue = getStoredQueue();
    if (queue.length === 0) {
      setSyncState("idle");
      syncRetryAttemptRef.current = 0;
      return;
    }

    if (!navigator.onLine) {
      setSyncState("offline");
      return;
    }

    setSyncState("syncing");
    const grouped = new Map<string, QueuedCrdtOp[]>();
    for (const op of queue) {
      const group = grouped.get(op.applicationId) ?? [];
      group.push(op);
      grouped.set(op.applicationId, group);
    }

    const failures = new Set<string>();
    for (const [applicationId, ops] of grouped.entries()) {
      const actorId = ops[0]?.actorId ?? getActorId();
      const payloadOps = ops.map((op) => ({ sequence: op.sequence, payload: op.payload }));
      try {
        const response = await fetch(`${apiBase}/api/applications/${applicationId}/crdt-ops`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ actorId, ops: payloadOps })
        });
        if (!response.ok) {
          failures.add(applicationId);
          setServerSyncState("sync_failed");
        }
      } catch {
        failures.add(applicationId);
        setServerSyncState("sync_failed");
      }
    }

    if (failures.size === 0) {
      persistQueue([]);
      setSyncState("idle");
      syncRetryAttemptRef.current = 0;
      return;
    }

    const remaining = queue.filter((op) => failures.has(op.applicationId));
    persistQueue(remaining);
    setSyncState("failed");
    if (syncRetryTimeoutRef.current === null) {
      syncRetryAttemptRef.current += 1;
      const delayMs = Math.min(1000 * 2 ** syncRetryAttemptRef.current, 30000);
      setSyncState("retrying");
      syncRetryTimeoutRef.current = window.setTimeout(() => {
        syncRetryTimeoutRef.current = null;
        void flushCrdtQueue();
      }, delayMs);
    }
  }, [apiBase, getActorId, getStoredQueue, persistQueue]);

  const enqueueCrdtSync = useCallback(
    (scan: ScannerResponse) => {
      const actorId = getActorId();
      const sequence = nextSequenceForApplication(scan.applicationId);
      const op: QueuedCrdtOp = {
        applicationId: scan.applicationId,
        actorId,
        sequence,
        payload: {
          opType: "quick_check_recorded",
          summary: scan.summary,
          confidence: scan.confidence,
          provider: scan.provider,
          usedFallback: scan.usedFallback,
          createdAt: new Date().toISOString()
        }
      };
      const queue = getStoredQueue();
      queue.push(op);
      persistQueue(queue);
      setServerSyncState("pending_sync");
      void flushCrdtQueue();
    },
    [flushCrdtQueue, getActorId, getStoredQueue, nextSequenceForApplication, persistQueue]
  );

  const mapScannerError = (payload: ScannerErrorPayload, statusCode: number) => {
    if (payload.error === "photo_too_large" || statusCode === 413) return "Image is too large. Please use a photo under 12MB.";
    if (payload.error === "photo_required") return "Select or capture a label image first.";
    if (payload.detail) return payload.request_id ? `${payload.detail} (ref: ${payload.request_id})` : payload.detail;
    if (payload.error) return payload.request_id ? `${payload.error} (ref: ${payload.request_id})` : payload.error;
    return `HTTP_${statusCode}`;
  };

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
    if (file.size > 12 * 1024 * 1024) {
      setError("Image is too large. Please use a photo under 12MB.");
      setSelectedFile(null);
      setPreviewUrl("");
      setResult(null);
      return;
    }
    setSelectedFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setError("");
  };

  const openFilePicker = () => {
    fileInputRef.current?.click();
  };

  const capturePhoto = async () => {
    try {
      const photo = await Camera.getPhoto({
        quality: 80,
        resultType: CameraResultType.Base64,
        source: CameraSource.Camera
      });
      if (!photo.base64String) return;

      const blob = base64ToBlob(photo.base64String, photo.format ? `image/${photo.format}` : "image/jpeg");
      const file = new File([blob], `scan-${Date.now()}.jpg`, { type: blob.type });
      handleFileSelected(file);
    } catch {
      openFilePicker();
    }
  };

  const runQuickCheck = async () => {
    if (!selectedFile) {
      setError("Select or capture a label image first.");
      return;
    }

    setChecking(true);
    setError("");
    try {
      const formData = new FormData();
      formData.append("photo", selectedFile);
      formData.append("requireGovWarning", "true");
      if (expectedBrandName.trim()) formData.append("expectedBrandName", expectedBrandName.trim());
      if (expectedClassType.trim()) formData.append("expectedClassType", expectedClassType.trim());
      if (expectedAbvText.trim()) formData.append("expectedAbvText", expectedAbvText.trim());
      if (expectedNetContents.trim()) formData.append("expectedNetContents", expectedNetContents.trim());

      const response = await fetch(`${apiBase}/api/scanner/quick-check`, {
        method: "POST",
        headers: {
          "x-alcomatcher-client-sync": "crdt"
        },
        body: formData
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as ScannerErrorPayload;
        throw new Error(mapScannerError(payload, response.status));
      }

      const payload = (await response.json()) as ScannerResponse;
      setResult(payload);
      enqueueCrdtSync(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected scanner error");
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    setSyncPendingCount(getStoredQueue().length);
    const onOnline = () => {
      void flushCrdtQueue();
    };
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("online", onOnline);
      if (syncRetryTimeoutRef.current !== null) {
        window.clearTimeout(syncRetryTimeoutRef.current);
      }
    };
  }, [flushCrdtQueue, getStoredQueue]);

  useEffect(() => {
    if (typeof EventSource === "undefined") return;

    const applicationId = result?.applicationId;
    const streamUrl = applicationId
      ? `${apiBase}/api/events/stream?scope=mobile&applicationId=${encodeURIComponent(applicationId)}`
      : `${apiBase}/api/events/stream?scope=mobile`;

    const stream = new EventSource(streamUrl);
    const handle = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as RealtimeEvent;
        if (applicationId && payload.applicationId && payload.applicationId !== applicationId) return;
        if (payload.data?.syncState) setServerSyncState(payload.data.syncState);
        if (payload.type === "sync.ack") setSyncState("idle");
      } catch {
        // Ignore malformed payloads.
      }
    };

    stream.addEventListener("sync.ack", handle as EventListener);
    stream.addEventListener("application.status_changed", handle as EventListener);
    stream.onerror = () => {
      setSyncState((current) => (current === "syncing" ? "retrying" : current));
    };

    return () => {
      stream.close();
    };
  }, [apiBase, result?.applicationId]);

  return (
    <IonApp>
      <IonPage>
        <IonHeader>
          <IonToolbar>
            <IonTitle>AlcoMatcher Scanner</IonTitle>
          </IonToolbar>
        </IonHeader>
        <IonContent className="scanner-content">
          <div className="scanner-panel">
            <IonText>
              <h1>Scan Label Now</h1>
              <p>No login required. Fast compliance checks for field use.</p>
            </IonText>

            <IonList inset>
              <IonItem>
                <IonInput label="Expected Brand" labelPlacement="stacked" value={expectedBrandName} onIonInput={(e) => setExpectedBrandName(String(e.detail.value ?? ""))} />
              </IonItem>
              <IonItem>
                <IonInput label="Expected Class/Type" labelPlacement="stacked" value={expectedClassType} onIonInput={(e) => setExpectedClassType(String(e.detail.value ?? ""))} />
              </IonItem>
              <IonItem>
                <IonInput label="Expected ABV" labelPlacement="stacked" value={expectedAbvText} onIonInput={(e) => setExpectedAbvText(String(e.detail.value ?? ""))} />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Expected Net Contents"
                  labelPlacement="stacked"
                  value={expectedNetContents}
                  onIonInput={(e) => setExpectedNetContents(String(e.detail.value ?? ""))}
                />
              </IonItem>
            </IonList>

            <input
              ref={fileInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0] ?? null;
                handleFileSelected(file);
              }}
            />

            <IonButton expand="block" size="large" color="primary" onClick={capturePhoto}>
              Capture Label Photo
            </IonButton>
            <IonButton expand="block" size="large" fill="outline" onClick={openFilePicker}>
              Import Label Photo
            </IonButton>
            <IonButton expand="block" size="large" color="tertiary" onClick={runQuickCheck} disabled={checking}>
              {checking ? "Checking..." : "Run Quick Check"}
            </IonButton>

            {previewUrl ? <img className="preview" src={previewUrl} alt="Label preview" /> : null}

            {error ? (
              <div className="result-panel result-error">
                <strong>Check failed:</strong> {error}
              </div>
            ) : null}

            {result ? (
              <div className={`result-panel ${statusClass}`}>
                <div>
                  <strong>Summary:</strong> {result.summary.toUpperCase()}
                </div>
                <div>
                  <strong>Application:</strong> {result.applicationId}
                </div>
                <div>
                  <strong>Confidence:</strong> {Math.round(result.confidence * 100)}%
                </div>
                <div>
                  <strong>Provider:</strong> {result.provider} {result.usedFallback ? "(fallback)" : ""}
                </div>
                <div className="section-title">Detected Fields</div>
                <div>Brand: {result.extracted.brandName ?? "not detected"}</div>
                <div>Class/Type: {result.extracted.classType ?? "not detected"}</div>
                <div>ABV: {result.extracted.abvText ?? "not detected"}</div>
                <div>Net Contents: {result.extracted.netContents ?? "not detected"}</div>
                <div>Gov Warning: {result.extracted.hasGovWarning ? "detected" : "not detected"}</div>
                <div className="section-title">Checks</div>
                <ul>
                  {result.checks.map((check) => (
                    <li key={check.id}>
                      <strong>{check.label}:</strong> {check.status.toUpperCase()} - {check.detail}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}

            <IonList inset>
              <IonItem>
                <IonLabel>Result Time Target: {"<= 5s"}</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Mode: Hybrid (Offline First)</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Sync Queue: CRDT document sync after quick check</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>
                  Transport Sync: {syncState} {syncPendingCount > 0 ? `(${syncPendingCount} pending)` : "(0 pending)"}
                </IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Server Sync: {serverSyncState}</IonLabel>
              </IonItem>
            </IonList>
          </div>
        </IonContent>
      </IonPage>
    </IonApp>
  );
}

const root = document.getElementById("root");
if (!root) throw new Error("Root element not found");
createRoot(root).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
