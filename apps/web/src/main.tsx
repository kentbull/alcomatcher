import React, { useMemo, useRef, useState } from "react";
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
}

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

  const [expectedBrandName, setExpectedBrandName] = useState("");
  const [expectedClassType, setExpectedClassType] = useState("");
  const [expectedAbvText, setExpectedAbvText] = useState("");
  const [expectedNetContents, setExpectedNetContents] = useState("");

  const apiBase = useMemo(() => {
    return import.meta.env.VITE_API_BASE_URL ?? "https://alcomatcher.com";
  }, []);

  const statusClass = result ? `status-${result.summary}` : "";

  const handleFileSelected = (file: File | null) => {
    if (!file) return;
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
        body: formData
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ error: `HTTP_${response.status}` }));
        throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
      }

      const payload = (await response.json()) as ScannerResponse;
      setResult(payload);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unexpected scanner error";
      setError(message);
    } finally {
      setChecking(false);
    }
  };

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
                <IonInput
                  label="Expected Brand"
                  labelPlacement="stacked"
                  value={expectedBrandName}
                  onIonInput={(e) => setExpectedBrandName(String(e.detail.value ?? ""))}
                />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Expected Class/Type"
                  labelPlacement="stacked"
                  value={expectedClassType}
                  onIonInput={(e) => setExpectedClassType(String(e.detail.value ?? ""))}
                />
              </IonItem>
              <IonItem>
                <IonInput
                  label="Expected ABV"
                  labelPlacement="stacked"
                  value={expectedAbvText}
                  onIonInput={(e) => setExpectedAbvText(String(e.detail.value ?? ""))}
                />
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
                <IonLabel>Sync: CRDT document sync after quick check</IonLabel>
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
