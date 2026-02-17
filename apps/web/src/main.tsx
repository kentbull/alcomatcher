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
  IonLoading,
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

type Role = "front" | "back" | "additional";
type UploadState = "queued" | "uploading" | "processing" | "ready" | "failed";

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

const STATUS_LABEL: Record<UploadState, string> = {
  queued: "Queued",
  uploading: "Uploading...",
  processing: "Processing...",
  ready: "Ready",
  failed: "Failed"
};

function App() {
  const [images, setImages] = useState<LocalImage[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [applicationId, setApplicationId] = useState<string>("");
  const [sessionLoading, setSessionLoading] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<FinalizeResult | null>(null);
  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [expectedClassType, setExpectedClassType] = useState("");
  const [expectedAbvText, setExpectedAbvText] = useState("");
  const [expectedNetContents, setExpectedNetContents] = useState("");
  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? "https://alcomatcher.com", []);
  const frontReady = images.some((image) => image.role === "front" && image.uploadState === "ready");
  const backReady = images.some((image) => image.role === "back" && image.uploadState === "ready");
  const canFinalize = frontReady && backReady && !finalizing;
  const loadingMessage = sessionLoading
    ? "Starting scan session..."
    : finalizing
      ? "Finalizing composite compliance check..."
      : "";

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
      const response = await fetch(`${apiBase}/api/scanner/sessions`, { method: "POST" });
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
      setError(err instanceof Error ? err.message : "Unable to create scan session");
      return null;
    } finally {
      setSessionLoading(false);
    }
  }, [apiBase]);

  useEffect(() => {
    void createSession();
  }, [createSession]);

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
        const response = await fetch(`${apiBase}/api/scanner/sessions/${resolvedSessionId}/images`, {
          method: "POST",
          body: formData
        });
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
          uploadError: err instanceof Error ? err.message : "Upload failed"
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

  const capturePhoto = useCallback(
    async (role: Role) => {
      try {
        const photo = await Camera.getPhoto({
          quality: 80,
          resultType: CameraResultType.Base64,
          source: CameraSource.Camera
        });
        if (!photo.base64String) return;
        const binary = atob(photo.base64String);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
        const blob = new Blob([bytes], { type: photo.format ? `image/${photo.format}` : "image/jpeg" });
        const file = new File([blob], `${role}-${Date.now()}.jpg`, { type: blob.type });
        await addImage(file, role);
      } catch {
        if (role === "front") frontInputRef.current?.click();
        if (role === "back") backInputRef.current?.click();
        if (role === "additional") addInputRef.current?.click();
      }
    },
    [addImage]
  );

  const finalizeScan = useCallback(async () => {
    if (!sessionId) return;
    if (!frontReady || !backReady) {
      setError("Front and back images must be uploaded and processed first.");
      return;
    }
    setFinalizing(true);
    setError("");
    try {
      const response = await fetch(`${apiBase}/api/scanner/sessions/${sessionId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-alcomatcher-client-sync": "crdt"
        },
        body: JSON.stringify({
          expectedBrandName,
          expectedClassType,
          expectedAbvText,
          expectedNetContents,
          requireGovWarning: true
        })
      });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
      }
      setApplicationId(payload.applicationId ?? applicationId);
      setResult(payload as FinalizeResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Finalize failed");
    } finally {
      setFinalizing(false);
    }
  }, [apiBase, applicationId, backReady, expectedAbvText, expectedBrandName, expectedClassType, expectedNetContents, frontReady, sessionId]);

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

  const sortedImages = [...images].sort((a, b) => {
    const rank = (role: Role) => (role === "front" ? 0 : role === "back" ? 1 : 2);
    const roleDiff = rank(a.role) - rank(b.role);
    if (roleDiff !== 0) return roleDiff;
    return a.index - b.index;
  });

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
              <p>Capture front and back photos first. Additional photos are optional for curved/odd labels.</p>
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
              ref={frontInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (file) await addImage(file, "front");
              }}
            />
            <input
              ref={backInputRef}
              className="hidden-file"
              type="file"
              accept="image/*"
              onChange={async (event) => {
                const file = event.currentTarget.files?.[0];
                if (file) await addImage(file, "back");
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

            <IonButton expand="block" size="large" color="primary" onClick={() => void capturePhoto("front")} disabled={sessionLoading}>
              Capture Front Label
            </IonButton>
            <IonButton expand="block" size="large" color="primary" fill="outline" onClick={() => void capturePhoto("back")} disabled={sessionLoading}>
              Capture Back Label
            </IonButton>
            <IonButton
              expand="block"
              size="large"
              color="secondary"
              fill="outline"
              onClick={() => void capturePhoto("additional")}
              disabled={sessionLoading || images.length >= 6}
            >
              Add Additional Photo
            </IonButton>
            <IonButton expand="block" size="large" color="tertiary" disabled={!canFinalize} onClick={() => void finalizeScan()}>
              {finalizing ? "Finalizing..." : "Run Quick Check"}
            </IonButton>

            <div className="image-grid">
              {sortedImages.map((image) => (
                <div key={image.localId} className={`image-tile image-tile--${image.uploadState}`}>
                  <img className="preview" src={image.previewUrl} alt={`${image.role} preview`} />
                  <div className="image-badge">
                    {image.role.toUpperCase()}
                    {image.role === "additional" ? ` #${image.index + 1}` : ""}
                    {" · "}
                    {STATUS_LABEL[image.uploadState]}
                  </div>
                  {image.uploadState === "failed" ? (
                    <button className="retry-banner" type="button" onClick={() => void retryUpload(image.localId)}>
                      Upload failed. Tap to retry.
                    </button>
                  ) : null}
                </div>
              ))}
            </div>

            <div className="upload-list">
              {sortedImages.map((image) => (
                <div key={`${image.localId}-line`} className="upload-line">
                  <strong>{image.role}</strong>
                  {image.role === "additional" ? ` #${image.index + 1}` : ""}: {STATUS_LABEL[image.uploadState]}
                  {image.uploadError ? ` (${image.uploadError})` : ""}
                </div>
              ))}
            </div>

            {error ? (
              <div className="result-panel result-error">
                <strong>Check failed:</strong> {error}
              </div>
            ) : null}

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
                <div className="section-title">Composite Detected Fields</div>
                <div>Brand: {result.extracted.brandName ?? "not detected"}</div>
                <div>Class/Type: {result.extracted.classType ?? "not detected"}</div>
                <div>ABV: {result.extracted.abvText ?? "not detected"}</div>
                <div>Net Contents: {result.extracted.netContents ?? "not detected"}</div>
                <div>Gov Warning: {result.extracted.hasGovWarning ? "detected" : "not detected"}</div>
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

            <IonList inset>
              <IonItem>
                <IonLabel>Session: {sessionId || "starting..."}</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Application: {applicationId || "pending"}</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Front Ready: {frontReady ? "yes" : "no"}</IonLabel>
              </IonItem>
              <IonItem>
                <IonLabel>Back Ready: {backReady ? "yes" : "no"}</IonLabel>
              </IonItem>
            </IonList>
          </div>
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
