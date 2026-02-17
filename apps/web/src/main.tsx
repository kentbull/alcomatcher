import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { setupIonicReact } from "@ionic/react";
import { IonApp, IonButton, IonContent, IonIcon, IonLoading, IonModal, IonPage, IonText } from "@ionic/react";
import { add, close, paperPlaneOutline, receiptOutline } from "ionicons/icons";
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "./styles.css";

setupIonicReact();

type Role = "front" | "back" | "additional";
type UploadState = "queued" | "uploading" | "processing" | "ready" | "failed";
type CapturePhase = "front" | "back" | "additional";
type CaptureMode = "preview" | "modal";

interface ScannerCheck {
  id: string;
  label: string;
  status: "pass" | "fail" | "not_evaluable";
  detail: string;
}

interface FinalizeResult {
  applicationId: string;
  summary: "pass" | "fail" | "needs_review";
  extracted: {
    rawText: string;
    brandName?: string;
    classType?: string;
    abvText?: string;
    netContents?: string;
    hasGovWarning: boolean;
    fieldSources?: Record<string, { role: string; index: number; confidence: number }>;
  };
  checks: ScannerCheck[];
  confidence: number;
  provider: string;
  usedFallback: boolean;
  processingMs?: number;
  request_id?: string;
}

interface LocalImage {
  localId: string;
  role: Role;
  index: number;
  file: File;
  previewUrl: string;
  uploadState: UploadState;
  uploadError?: string;
  retryCount: number;
  imageId?: string;
}

interface ScanProgressEvent {
  type: "scan.progress";
  applicationId?: string;
  data?: {
    sessionId?: string;
    imageId?: string;
    role?: Role;
    index?: number;
    stage?: string;
    status?: "in_progress" | "completed" | "failed";
    uploadState?: UploadState;
    errorCode?: string;
    errorMessage?: string;
  };
}

interface ScannerCaptureAdapter {
  mode: CaptureMode;
  startPreview?: () => Promise<void>;
  stopPreview?: () => Promise<void>;
  captureFrame: (role: Role) => Promise<File>;
}

const STATUS_LABEL: Record<UploadState, string> = {
  queued: "Queued",
  uploading: "Uploading",
  processing: "Processing",
  ready: "Ready",
  failed: "Failed"
};

function roleLabel(role: Role, index: number) {
  if (role === "front") return "FRONT";
  if (role === "back") return "BACK";
  return `ADD ${index + 1}`;
}

function roleRank(role: Role) {
  if (role === "front") return 0;
  if (role === "back") return 1;
  return 2;
}

function base64ToFile(base64Payload: string, fileName: string, mimeType = "image/jpeg") {
  const raw = base64Payload.includes(",") ? base64Payload.split(",").pop() ?? "" : base64Payload;
  const binary = atob(raw);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  const blob = new Blob([bytes], { type: mimeType });
  return new File([blob], fileName, { type: mimeType });
}

async function fetchWithRetry(input: string, init: RequestInit, retries = 1, retryDelayMs = 420) {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fetch(input, init);
    } catch (error) {
      lastError = error;
      if (attempt >= retries) break;
      await new Promise((resolve) => window.setTimeout(resolve, retryDelayMs));
    }
  }
  throw lastError;
}

function formatNetworkError(error: unknown, operation: string) {
  const message = error instanceof Error ? error.message : String(error ?? "unknown_error");
  const lowered = message.toLowerCase();
  if (lowered.includes("load failed") || lowered.includes("network") || lowered.includes("failed to fetch")) {
    return `${operation} failed: unable to reach alcomatcher.com. Check network connectivity and retry.`;
  }
  return `${operation} failed: ${message}`;
}

function App() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [sessionLoading, setSessionLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);
  const [captureMode, setCaptureMode] = useState<CaptureMode>("modal");
  const [previewReady, setPreviewReady] = useState(false);
  const [previewError, setPreviewError] = useState("");
  const [capturePhase, setCapturePhase] = useState<CapturePhase>("front");
  const [stackExpanded, setStackExpanded] = useState(false);
  const [reportVisible, setReportVisible] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FinalizeResult | null>(null);

  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const expansionTimerRef = useRef<number | null>(null);

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? "https://alcomatcher.com", []);
  const frontReady = images.some((image) => image.role === "front" && image.uploadState === "ready");
  const backReady = images.some((image) => image.role === "back" && image.uploadState === "ready");
  const canFinalize = frontReady && backReady && !finalizing;
  const loadingMessage = sessionLoading
    ? "Starting scan session..."
    : finalizing
      ? "Running compliance checks..."
      : captureBusy
        ? "Capturing image..."
        : "";

  useEffect(() => {
    const splash = document.getElementById("boot-splash");
    document.body.classList.add("app-ready");
    if (!splash) return;
    const hideTimer = window.setTimeout(() => splash.classList.add("is-hidden"), 120);
    const removeTimer = window.setTimeout(() => splash.remove(), 460);
    return () => {
      window.clearTimeout(hideTimer);
      window.clearTimeout(removeTimer);
    };
  }, []);

  const sortedImages = [...images].sort((a, b) => {
    const roleDiff = roleRank(a.role) - roleRank(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.index - b.index;
  });

  const activePrompt =
    capturePhase === "front"
      ? "Scan the front label"
      : capturePhase === "back"
        ? "Now scan the back label"
        : "Scan additional details or tap Done";

  const compressImage = useCallback(async (file: File): Promise<File> => {
    if (!file.type.startsWith("image/")) return file;
    const imageBitmap = await createImageBitmap(file).catch(() => null);
    if (!imageBitmap) return file;

    const maxSide = 2200;
    const scale = Math.min(1, maxSide / Math.max(imageBitmap.width, imageBitmap.height));
    const width = Math.max(1, Math.round(imageBitmap.width * scale));
    const height = Math.max(1, Math.round(imageBitmap.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) return file;

    context.drawImage(imageBitmap, 0, 0, width, height);
    const blob = await new Promise<Blob | null>((resolve) => {
      canvas.toBlob((nextBlob) => resolve(nextBlob), "image/jpeg", 0.78);
    });
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, ".jpg"), { type: "image/jpeg" });
  }, []);

  const createSession = useCallback(async (): Promise<{ sessionId: string; applicationId: string } | null> => {
    setSessionLoading(true);
    setError("");
    try {
      const response = await fetchWithRetry(`${apiBase}/api/scanner/sessions`, { method: "POST" }, 1);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Server is on an older API version. /api/scanner/sessions is not deployed yet.");
        }
        throw new Error(`Session creation failed (HTTP ${response.status}).`);
      }
      const payload = await response.json();
      setSessionId(payload.sessionId);
      setApplicationId(payload.applicationId);
      return {
        sessionId: String(payload.sessionId ?? ""),
        applicationId: String(payload.applicationId ?? "")
      };
    } catch (err) {
      setError(formatNetworkError(err, "Create session"));
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [apiBase]);

  const modalAdapter = useMemo<ScannerCaptureAdapter>(
    () => ({
      mode: "modal",
      captureFrame: async (role: Role) => {
        const photo = await Camera.getPhoto({
          quality: 80,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera
        });
        if (!photo.base64String) throw new Error("capture_cancelled");
        const mimeType = photo.format ? `image/${photo.format}` : "image/jpeg";
        return base64ToFile(photo.base64String, `${role}-${Date.now()}.jpg`, mimeType);
      }
    }),
    []
  );

  const previewAdapter = useMemo<ScannerCaptureAdapter>(
    () => ({
      mode: "preview",
      startPreview: async () => {
        const alreadyStarted = await CameraPreview.isCameraStarted().catch(() => ({ value: false }));
        if (alreadyStarted?.value) return;
        await CameraPreview.start({
          position: "rear",
          toBack: true,
          disableAudio: true,
          x: 0,
          y: 0,
          width: window.screen.width,
          height: window.screen.height
        });
      },
      stopPreview: async () => {
        const started = await CameraPreview.isCameraStarted().catch(() => ({ value: false }));
        if (!started?.value) return;
        await CameraPreview.stop();
      },
      captureFrame: async (role: Role) => {
        const result = await CameraPreview.capture({ quality: 88 });
        if (!result?.value) throw new Error("capture_empty");
        return base64ToFile(result.value, `${role}-${Date.now()}.jpg`, "image/jpeg");
      }
    }),
    []
  );

  const captureAdapter = useMemo<ScannerCaptureAdapter>(
    () => (captureMode === "preview" ? previewAdapter : modalAdapter),
    [captureMode, modalAdapter, previewAdapter]
  );

  useEffect(() => {
    void createSession();

    let disposed = false;
    const startPreview = async () => {
      if (!Capacitor.isNativePlatform()) {
        setCaptureMode("modal");
        setPreviewReady(false);
        return;
      }

      try {
        await previewAdapter.startPreview?.();
        if (disposed) return;
        setCaptureMode("preview");
        setPreviewReady(true);
        setPreviewError("");
      } catch (err) {
        if (disposed) return;
        setCaptureMode("modal");
        setPreviewReady(false);
        setPreviewError(err instanceof Error ? err.message : "Camera preview unavailable");
      }
    };

    void startPreview();

    return () => {
      disposed = true;
      if (expansionTimerRef.current !== null) window.clearTimeout(expansionTimerRef.current);
      void previewAdapter.stopPreview?.();
    };
  }, [createSession, previewAdapter]);

  const updateImageState = useCallback((localId: string, patch: Partial<LocalImage>) => {
    setImages((current) => current.map((image) => (image.localId === localId ? { ...image, ...patch } : image)));
  }, []);

  const addImage = useCallback(
    async (file: File, role: Role, existingLocalId?: string, existingIndex?: number) => {
      const compressed = await compressImage(file);
      const additionalIndex = images.filter((entry) => entry.role === "additional").length;
      const nextIndex = role === "additional" ? existingIndex ?? additionalIndex : 0;
      const localId = existingLocalId ?? crypto.randomUUID();
      const previewUrl = existingLocalId ? "" : URL.createObjectURL(compressed);

      if (!existingLocalId) {
        setImages((current) => [
          ...current.filter((entry) => {
            const shouldKeep = !(entry.role === role && role !== "additional");
            if (!shouldKeep) URL.revokeObjectURL(entry.previewUrl);
            return shouldKeep;
          }),
          {
            localId,
            role,
            index: nextIndex,
            file: compressed,
            previewUrl,
            uploadState: "queued",
            retryCount: 0
          }
        ]);
      }
      updateImageState(localId, { uploadState: "uploading", uploadError: undefined });
      setError("");

      try {
        let resolvedSessionId = sessionId;
        if (!resolvedSessionId) {
          const created = await createSession();
          resolvedSessionId = created?.sessionId ?? "";
        }
        if (!resolvedSessionId) {
          throw new Error("Unable to start scan session. Check network and retry.");
        }
        const formData = new FormData();
        formData.append("image", compressed);
        formData.append("role", role);
        formData.append("index", String(nextIndex));
        const response = await fetchWithRetry(`${apiBase}/api/scanner/sessions/${resolvedSessionId}/images`, {
          method: "POST",
          body: formData
        }, 1);
        const payload = await response.json();
        if (!response.ok) {
          throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
        }
        updateImageState(localId, {
          uploadState: payload.image?.uploadState ?? "ready",
          uploadError: undefined,
          retryCount: payload.image?.retryCount ?? 0,
          imageId: payload.image?.imageId
        });
      } catch (err) {
        updateImageState(localId, {
          uploadState: "failed",
          uploadError: formatNetworkError(err, "Image upload")
        });
      }
    },
    [apiBase, compressImage, createSession, images, sessionId, updateImageState]
  );

  const retryUpload = useCallback(
    async (localId: string) => {
      const image = images.find((entry) => entry.localId === localId);
      if (!image) return;
      updateImageState(localId, { retryCount: image.retryCount + 1 });
      await addImage(image.file, image.role, localId, image.index);
    },
    [addImage, images, updateImageState]
  );

  const nextRoleAfter = useCallback((role: Role): CapturePhase => (role === "front" ? "back" : "additional"), []);

  const captureSingle = useCallback(
    async (role: Role): Promise<"captured" | "cancelled"> => {
      setCaptureBusy(true);
      try {
        const file = await captureAdapter.captureFrame(role);
        await addImage(file, role);
        setCapturePhase(nextRoleAfter(role));
        return "captured";
      } catch (err) {
        const message = err instanceof Error ? err.message : "capture_failed";
        if (message === "capture_cancelled" || message.toLowerCase().includes("cancel")) {
          return "cancelled";
        }
        if (captureMode === "modal") {
          if (role === "front") frontInputRef.current?.click();
          if (role === "back") backInputRef.current?.click();
          if (role === "additional") addInputRef.current?.click();
          return "cancelled";
        }
        setError(`Capture failed for ${role}. ${message}`);
        return "cancelled";
      } finally {
        setCaptureBusy(false);
      }
    },
    [addImage, captureAdapter, captureMode, nextRoleAfter]
  );

  const captureNext = useCallback(async () => {
    setResult(null);
    setError("");
    if (!sessionId) {
      const created = await createSession();
      if (!created?.sessionId) return;
    }
    const outcome = await captureSingle(capturePhase);
    if (outcome === "cancelled" && capturePhase !== "additional") {
      setError(`Capture canceled for ${capturePhase}. Tap to continue.`);
    }
  }, [capturePhase, captureSingle, createSession, sessionId]);

  const finalizeScan = useCallback(async () => {
    if (!sessionId) return;
    if (!frontReady || !backReady) {
      setError("Front and back images must be uploaded and processed before running quick check.");
      return;
    }
    setFinalizing(true);
    setError("");
    try {
      const response = await fetchWithRetry(`${apiBase}/api/scanner/sessions/${sessionId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-alcomatcher-client-sync": "crdt"
        },
        body: JSON.stringify({
          requireGovWarning: true
        })
      }, 1);
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
      }
      setApplicationId(payload.applicationId ?? applicationId);
      setResult(payload as FinalizeResult);
      setReportVisible(true);
    } catch (err) {
      setError(formatNetworkError(err, "Send/Finalize"));
    } finally {
      setFinalizing(false);
    }
  }, [apiBase, applicationId, backReady, frontReady, sessionId]);

  const spreadStack = useCallback(
    (index: number) => {
      if (index === 0 || sortedImages.length < 2) return;
      setStackExpanded(true);
      if (expansionTimerRef.current !== null) window.clearTimeout(expansionTimerRef.current);
      expansionTimerRef.current = window.setTimeout(() => {
        setStackExpanded(false);
        expansionTimerRef.current = null;
      }, 1800);
    },
    [sortedImages.length]
  );

  useEffect(() => {
    if (typeof EventSource === "undefined" || !applicationId) return;
    const stream = new EventSource(`${apiBase}/api/events/stream?scope=mobile&applicationId=${encodeURIComponent(applicationId)}`);
    const onProgress = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as ScanProgressEvent;
        if (payload.type !== "scan.progress") return;
        const role = payload.data?.role;
        const index = payload.data?.index ?? 0;
        if (!role) return;
        setImages((current) =>
          current.map((image) => {
            if (image.role !== role || image.index !== index) return image;
            if (payload.data?.status === "failed") {
              return {
                ...image,
                uploadState: "failed",
                uploadError: payload.data?.errorMessage ?? payload.data?.errorCode ?? "Upload failed"
              };
            }
            if (payload.data?.stage === "image_upload_started") return { ...image, uploadState: "uploading" };
            if (payload.data?.stage === "image_upload_completed") return { ...image, uploadState: "processing" };
            if (payload.data?.stage === "image_checks_completed") return { ...image, uploadState: "ready" };
            return image;
          })
        );
      } catch {
        // Ignore malformed SSE payloads.
      }
    };
    stream.addEventListener("scan.progress", onProgress as EventListener);
    return () => {
      stream.close();
    };
  }, [apiBase, applicationId]);

  const scanButtonLabel = captureBusy ? "Capturing..." : "Scan Another";

  return (
    <IonApp>
      <IonPage>
        <IonContent className="scanner-content" fullscreen scrollY={false}>
          <div className="scanner-shell">
            {captureMode === "preview" && !previewReady ? (
              <div className="scanner-warmup" role="status" aria-live="polite">
                <div className="scanner-warmup-card">
                  <div className="scanner-warmup-spinner" aria-hidden="true" />
                  <strong>Starting camera scanner</strong>
                  <span>Loading secure live preview...</span>
                </div>
              </div>
            ) : null}
            <section className="scanner-hero">
              <IonText>
                <div className="crest-chip">
                  <img src="/alcomatcher-crest.svg" alt="AlcoMatcher crest" />
                  <span>AlcoMatcher</span>
                </div>
                <h1>{activePrompt}</h1>
                <p>
                  {captureMode === "preview"
                    ? previewReady
                      ? "Live camera is ready. Tap scan and move fast through labels."
                      : "Starting live camera preview..."
                    : "Fallback camera mode active."
                  }
                </p>
                {previewError ? <p className="preview-warning">Preview fallback: {previewError}</p> : null}
              </IonText>
              <div className="step-row" role="status" aria-live="polite">
                <span className={`step-pill ${capturePhase === "front" ? "is-active" : frontReady ? "is-done" : ""}`}>Front</span>
                <span className={`step-pill ${capturePhase === "back" ? "is-active" : backReady ? "is-done" : ""}`}>Back</span>
                <span className={`step-pill ${capturePhase === "additional" ? "is-active" : ""}`}>Additional</span>
              </div>
              <div className="lens-frame">
                <div className="lens-reticle" />
              </div>
            </section>

            <input
              ref={frontInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                await addImage(file, "front");
                setCapturePhase("back");
              }}
            />
            <input
              ref={backInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (!file) return;
                await addImage(file, "back");
                setCapturePhase("additional");
              }}
            />
            <input
              ref={addInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              multiple
              onChange={async (event) => {
                const files = Array.from(event.currentTarget.files ?? []);
                for (const file of files) {
                  await addImage(file, "additional");
                }
              }}
            />

            <div className="scanner-actions">
              {result ? (
                <IonButton
                  className="report-button"
                  fill="clear"
                  size="default"
                  onClick={() => setReportVisible(true)}
                >
                  <IonIcon icon={receiptOutline} slot="start" />
                  Report
                </IonButton>
              ) : (
                <span />
              )}

              <IonButton
                className="fab-plus"
                fill="clear"
                onClick={() => void captureNext()}
                disabled={sessionLoading || finalizing || captureBusy}
              >
                <div className="fab-plus-inner">
                  <IonIcon icon={add} />
                </div>
                <span>{scanButtonLabel}</span>
              </IonButton>

              <IonButton
                className="fab-send"
                fill="clear"
                onClick={() => void finalizeScan()}
                disabled={!canFinalize || captureBusy}
              >
                <IonIcon icon={paperPlaneOutline} />
                <span>{finalizing ? "Sending..." : "Send"}</span>
              </IonButton>
            </div>

            <section className="scan-card-dock">
              <div className={`scan-card-stack ${stackExpanded ? "is-expanded" : ""}`}>
                {sortedImages.map((image, index) => {
                  const spread = stackExpanded ? 72 : 26;
                  const style = {
                    transform: `translateX(${index * spread}px) rotate(${index * 1.8}deg)`,
                    zIndex: String(500 - index)
                  };
                  return (
                    <article
                      key={image.localId}
                      className={`scan-card image-tile--${image.uploadState}`}
                      style={style}
                      onClick={() => spreadStack(index)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") spreadStack(index);
                      }}
                    >
                      <img className="scan-card-image" src={image.previewUrl} alt={`${image.role} preview`} />
                      <div className="scan-card-meta">
                        <span>{roleLabel(image.role, image.index)}</span>
                        <span>{STATUS_LABEL[image.uploadState]}</span>
                      </div>
                      {image.uploadState === "failed" ? (
                        <button className="retry-banner" type="button" onClick={() => void retryUpload(image.localId)}>
                          Upload failed. Tap to retry.
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>
            </section>

            {error ? (
              <div className="result-panel result-error">
                <strong>Scanner error:</strong> {error}
              </div>
            ) : null}

          </div>
          <IonModal
            isOpen={reportVisible && Boolean(result)}
            onDidDismiss={() => setReportVisible(false)}
            backdropDismiss
            className="report-modal"
          >
            <div className="report-overlay">
              <div className="report-header">
                <strong>Compliance Report</strong>
                <button type="button" className="report-close" onClick={() => setReportVisible(false)} aria-label="Close report">
                  <IonIcon icon={close} />
                </button>
              </div>
              {result ? (
                <div className={`result-panel status-${result.summary}`}>
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
                    <strong>Composite Time:</strong> {Math.round(result.processingMs ?? 0)} ms
                  </div>
                  <div className="section-title">Composite Checks</div>
                  <ul>
                    {result.checks.map((check) => (
                      <li key={check.id}>
                        <strong>{check.label}:</strong> {check.status.toUpperCase()} - {check.detail}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </IonModal>
        </IonContent>
      </IonPage>
      <IonLoading isOpen={sessionLoading || finalizing} message={loadingMessage} />
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
