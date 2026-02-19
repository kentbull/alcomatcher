import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { App as CapApp } from "@capacitor/app";
import { Camera, CameraResultType, CameraSource } from "@capacitor/camera";
import { Capacitor } from "@capacitor/core";
import { Preferences } from "@capacitor/preferences";
import { CameraPreview } from "@capacitor-community/camera-preview";
import { setupIonicReact } from "@ionic/react";
import { IonApp, IonButton, IonContent, IonIcon, IonLoading, IonModal, IonPage, IonPopover, IonText } from "@ionic/react";
import { add, close, logInOutline, logOutOutline, paperPlaneOutline, personCircleOutline, receiptOutline, timeOutline, trashOutline } from "ionicons/icons";
import "@ionic/react/css/core.css";
import "@ionic/react/css/normalize.css";
import "@ionic/react/css/structure.css";
import "@ionic/react/css/typography.css";
import "./styles.css";
import type { ProcessingStage, ScannerStageId } from "./types/processingStage";
import { SCANNER_STAGES } from "./types/processingStage";
import { LoadingStages } from "./components/LoadingStages";
import { SyncStatus } from "./components/SyncStatus";
import { SyncQueueModal } from "./components/SyncQueueModal";
import { useOnlineStatus } from "./hooks/useOnlineStatus";
import { useSyncQueue } from "./hooks/useSyncQueue";
import { preprocessImageForOCR } from "./utils/imagePreprocessing";
import type { ScanMode, LabelGroup } from "./types/labelGroup";
import { BatchSummary } from "./components/BatchSummary";

setupIonicReact();

type Role = "front" | "back" | "additional";
type UploadState = "queued" | "uploading" | "processing" | "ready" | "failed";
type CapturePhase = "front" | "back" | "additional";
type CaptureMode = "preview" | "modal";
type UserRole = "compliance_officer" | "compliance_manager";
type AuthMode = "sign_in" | "register";

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
  stageTimings?: StageTimingSummary;
  telemetryQuality?: "complete" | "partial";
  request_id?: string;
}

interface StageTimingSummary {
  sessionCreateMs?: number;
  frontUploadMs?: number;
  frontOcrMs?: number;
  backUploadMs?: number;
  backOcrMs?: number;
  additionalUploadTotalMs?: number;
  finalizeMs?: number;
  decisionTotalMs?: number;
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

interface UploadResponsePayload {
  error?: string;
  detail?: string;
  image?: {
    imageId?: string;
    uploadState?: UploadState;
    retryCount?: number;
  };
  request_id?: string;
}

interface ScannerCaptureAdapter {
  mode: CaptureMode;
  startPreview?: () => Promise<void>;
  stopPreview?: () => Promise<void>;
  captureFrame: (role: Role) => Promise<File>;
}

interface MobileAuthUser {
  userId: string;
  email: string;
  role: UserRole;
  initials: string;
}

interface PendingCrdtCommit {
  applicationId: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempts: number;
}

interface HistoryItem {
  applicationId: string;
  status: string;
  syncState: "synced" | "pending_sync" | "sync_failed";
  updatedAt: string;
  summary: "pass" | "fail" | "needs_review" | null;
  confidence: number | null;
  imageCount: number;
}

interface HistoryDetail {
  application: {
    applicationId: string;
    status: string;
    syncState: "synced" | "pending_sync" | "sync_failed";
    updatedAt: string;
    createdByUserId: string | null;
  };
  report: {
    checks: Array<{
      checkId: string;
      label: string;
      status: "pass" | "fail" | "not_evaluable";
      evidenceText: string;
      failureReason?: string;
    }>;
    latestQuickCheck?: {
      summary: "pass" | "fail" | "needs_review";
      confidence: number;
    } | null;
  };
  images: Array<{
    imageId: string;
    role: Role;
    index: number;
    thumbUrl: string;
    fullUrl: string;
    thumbSrc?: string;
  }>;
}

interface PreviewLifecycleState {
  isStarting: boolean;
  isStopping: boolean;
  isStarted: boolean;
  instanceToken: number;
}

const AUTH_TOKEN_KEY = "alcomatcher.auth.token";
const AUTH_USER_KEY = "alcomatcher.auth.user";
const PENDING_CLAIM_IDS_KEY = "alcomatcher.pending.claim.ids";
const PENDING_CRDT_COMMITS_KEY = "alcomatcher.pending.crdt.commits";
const CRDT_SEQUENCE_MAP_KEY = "alcomatcher.crdt.sequence.map";

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

function initialsFromEmail(email: string) {
  const local = (email.split("@")[0] ?? "").trim();
  const words = local.split(/[._\-]+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ""}${words[1][0] ?? ""}`.toUpperCase();
  }
  return local.slice(0, 2).toUpperCase() || "U";
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

function parseJsonValue<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function previewDebug(event: string, details: Record<string, unknown> = {}) {
  if (import.meta.env.PROD) return;
  console.debug(`[preview] ${event}`, details);
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
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("sign_in");
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authError, setAuthError] = useState("");
  const [authInfo, setAuthInfo] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authCode, setAuthCode] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [authUser, setAuthUser] = useState<MobileAuthUser | null>(null);
  const [authRestoreComplete, setAuthRestoreComplete] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyItems, setHistoryItems] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState("");
  const [historyDetail, setHistoryDetail] = useState<HistoryDetail | null>(null);
  const [historyDetailOpen, setHistoryDetailOpen] = useState(false);
  const [historyDetailLoading, setHistoryDetailLoading] = useState(false);
  const [deleteAccountOpen, setDeleteAccountOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteInfo, setDeleteInfo] = useState("");
  const [deleteOtpCode, setDeleteOtpCode] = useState("");
  const [deleteConfirmationText, setDeleteConfirmationText] = useState("");
  const [processingStages, setProcessingStages] = useState<ProcessingStage[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number>(0);
  const [syncQueueOpen, setSyncQueueOpen] = useState(false);
  const [scanMode, setScanMode] = useState<ScanMode>("single");
  const [labelGroups, setLabelGroups] = useState<LabelGroup[]>([]);
  const [currentGroupId, setCurrentGroupId] = useState<string | null>(null);
  const [batchSummaryOpen, setBatchSummaryOpen] = useState(false);

  // Offline/sync monitoring
  const isOnline = useOnlineStatus();
  const { queueState, refreshQueue, updateLastSyncTime, setSyncing } = useSyncQueue();

  const frontInputRef = useRef<HTMLInputElement | null>(null);
  const backInputRef = useRef<HTMLInputElement | null>(null);
  const addInputRef = useRef<HTMLInputElement | null>(null);
  const expansionTimerRef = useRef<number | null>(null);
  const createSessionRef = useRef<() => Promise<{ sessionId: string; applicationId: string } | null>>(async () => null);
  const previewLifecycleRef = useRef<PreviewLifecycleState>({
    isStarting: false,
    isStopping: false,
    isStarted: false,
    instanceToken: 0
  });
  const stageClockRef = useRef<{
    sessionCreateStartedAt?: number;
    sessionCreateEndedAt?: number;
    firstCaptureStartedAt?: number;
    uploadStartedAt: Record<string, number>;
    uploadEndedAt: Record<string, number>;
    ocrStartedAt: Record<string, number>;
    ocrEndedAt: Record<string, number>;
    finalizeStartedAt?: number;
    finalizeEndedAt?: number;
  }>({
    uploadStartedAt: {},
    uploadEndedAt: {},
    ocrStartedAt: {},
    ocrEndedAt: {}
  });

  const apiBase = useMemo(() => import.meta.env.VITE_API_BASE_URL ?? "https://alcomatcher.com", []);
  const isNativeIos = useMemo(() => Capacitor.isNativePlatform() && Capacitor.getPlatform() === "ios", []);
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

  const apiFetch = useCallback(
    (input: string, init: RequestInit = {}, retries = 1, retryDelayMs = 420) => {
      const headers = new Headers(init.headers ?? {});
      if (authToken && !headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${authToken}`);
      }
      return fetchWithRetry(input, { ...init, headers }, retries, retryDelayMs);
    },
    [authToken]
  );

  const addPendingClaimApplication = useCallback(async (applicationId: string) => {
    if (!applicationId || authToken) return;
    const state = await Preferences.get({ key: PENDING_CLAIM_IDS_KEY });
    const current = parseJsonValue<string[]>(state.value, []);
    if (current.includes(applicationId)) return;
    await Preferences.set({ key: PENDING_CLAIM_IDS_KEY, value: JSON.stringify([...current, applicationId].slice(-80)) });
  }, [authToken]);

  const claimPendingApplications = useCallback(async (token: string) => {
    const state = await Preferences.get({ key: PENDING_CLAIM_IDS_KEY });
    const current = parseJsonValue<string[]>(state.value, []);
    if (current.length === 0) return;
    const keep: string[] = [];
    for (const applicationId of current) {
      try {
        const response = await fetch(`${apiBase}/api/applications/${applicationId}/claim-owner`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` }
        });
        if (!response.ok && response.status !== 409) keep.push(applicationId);
      } catch {
        keep.push(applicationId);
      }
    }
    if (keep.length > 0) {
      await Preferences.set({ key: PENDING_CLAIM_IDS_KEY, value: JSON.stringify(keep) });
    } else {
      await Preferences.remove({ key: PENDING_CLAIM_IDS_KEY });
    }
  }, [apiBase]);

  const queuePendingCrdtCommit = useCallback(async (applicationId: string, payload: Record<string, unknown>) => {
    if (!applicationId) return;
    const state = await Preferences.get({ key: PENDING_CRDT_COMMITS_KEY });
    const current = parseJsonValue<PendingCrdtCommit[]>(state.value, []);
    const deduped = current.filter((entry) => entry.applicationId !== applicationId);
    deduped.push({
      applicationId,
      payload,
      createdAt: new Date().toISOString(),
      attempts: 0
    });
    await Preferences.set({ key: PENDING_CRDT_COMMITS_KEY, value: JSON.stringify(deduped.slice(-200)) });
  }, []);

  const flushPendingCrdtCommits = useCallback(async (token: string, actorUserId: string) => {
    if (!token || !actorUserId) return;
    setSyncing(true);
    try {
      const [pendingState, sequenceState] = await Promise.all([
        Preferences.get({ key: PENDING_CRDT_COMMITS_KEY }),
        Preferences.get({ key: CRDT_SEQUENCE_MAP_KEY })
      ]);
      const pending = parseJsonValue<PendingCrdtCommit[]>(pendingState.value, []);
      if (pending.length === 0) {
        await updateLastSyncTime();
        return;
      }
      const sequenceMap = parseJsonValue<Record<string, number>>(sequenceState.value, {});
      const keep: PendingCrdtCommit[] = [];

    for (const entry of pending) {
      const sequenceKey = `${entry.applicationId}:${actorUserId}`;
      const nextSequence = (sequenceMap[sequenceKey] ?? 0) + 1;
      try {
        const response = await fetch(`${apiBase}/api/applications/${entry.applicationId}/crdt-ops`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            actorId: actorUserId,
            ops: [{ sequence: nextSequence, payload: entry.payload }]
          })
        });
        if (response.ok) {
          sequenceMap[sequenceKey] = nextSequence;
          continue;
        }
        keep.push({
          ...entry,
          attempts: entry.attempts + 1
        });
      } catch {
        keep.push({
          ...entry,
          attempts: entry.attempts + 1
        });
      }
    }

      await Preferences.set({ key: CRDT_SEQUENCE_MAP_KEY, value: JSON.stringify(sequenceMap) });
      if (keep.length > 0) {
        await Preferences.set({ key: PENDING_CRDT_COMMITS_KEY, value: JSON.stringify(keep.slice(-200)) });
      } else {
        await Preferences.remove({ key: PENDING_CRDT_COMMITS_KEY });
      }
      await updateLastSyncTime();
      await refreshQueue();
    } finally {
      setSyncing(false);
    }
  }, [apiBase, refreshQueue, setSyncing, updateLastSyncTime]);

  const loadHistory = useCallback(async () => {
    if (!authToken) {
      setHistoryItems([]);
      setHistoryError("");
      return;
    }
    setHistoryLoading(true);
    setHistoryError("");
    try {
      const response = await apiFetch(`${apiBase}/api/history?limit=30`, { method: "GET" }, 1, 400);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 404) {
          // Older server build without history routes, treat as empty state.
          setHistoryItems([]);
          setHistoryError("");
          return;
        }
        if (response.status === 401) throw new Error("Sign in to view history.");
        if (response.status === 403) throw new Error("You do not have access to this history.");
        throw new Error("Unable to load history. Please retry.");
      }
      const items = Array.isArray(payload?.items) ? payload.items : [];
      setHistoryItems(items as HistoryItem[]);
      setHistoryError("");
    } catch (err) {
      setHistoryError(formatNetworkError(err, "Load history"));
    } finally {
      setHistoryLoading(false);
    }
  }, [apiBase, apiFetch, authToken]);

  const openHistoryDetail = useCallback(async (applicationId: string) => {
    if (!authToken) return;
    setHistoryDetailLoading(true);
    setHistoryDetail(null);
    setHistoryDetailOpen(true);
    try {
      const response = await apiFetch(`${apiBase}/api/history/${applicationId}`, { method: "GET" }, 1, 400);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "history_detail_failed");
      const detail = payload as HistoryDetail;
      const hydratedImages = await Promise.all(
        (detail.images ?? []).map(async (image) => {
          try {
            const thumbResponse = await apiFetch(`${apiBase}${image.thumbUrl}`, { method: "GET" }, 1, 300);
            if (!thumbResponse.ok) return image;
            const blob = await thumbResponse.blob();
            return {
              ...image,
              thumbSrc: URL.createObjectURL(blob)
            };
          } catch {
            return image;
          }
        })
      );
      setHistoryDetail({
        ...detail,
        images: hydratedImages
      });
    } catch (err) {
      setHistoryError(formatNetworkError(err, "Load history detail"));
    } finally {
      setHistoryDetailLoading(false);
    }
  }, [apiBase, apiFetch, authToken]);

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

  useEffect(() => {
    let cancelled = false;
    const restoreAuth = async () => {
      const [tokenState, userState] = await Promise.all([Preferences.get({ key: AUTH_TOKEN_KEY }), Preferences.get({ key: AUTH_USER_KEY })]);
      const token = tokenState.value ?? "";
      if (!token) {
        if (!cancelled) setAuthRestoreComplete(true);
        return;
      }

      try {
        const response = await fetch(`${apiBase}/api/auth/me`, {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        if (!response.ok) throw new Error("token_invalid");
        const payload = await response.json();
        const user = payload?.user;
        if (!user || typeof user.email !== "string" || typeof user.userId !== "string") throw new Error("invalid_user");
        const role: UserRole = user.role === "compliance_manager" ? "compliance_manager" : "compliance_officer";
        if (cancelled) return;
        const nextUser: MobileAuthUser = {
          userId: user.userId,
          email: user.email,
          role,
          initials: initialsFromEmail(user.email)
        };
        setAuthToken(token);
        setAuthUser(nextUser);
        await claimPendingApplications(token);
        await flushPendingCrdtCommits(token, nextUser.userId);
        if (historyOpen) await loadHistory();
      } catch {
        if (cancelled) return;
        setAuthToken("");
        setAuthUser(null);
        await Promise.all([Preferences.remove({ key: AUTH_TOKEN_KEY }), Preferences.remove({ key: AUTH_USER_KEY })]);
        const remembered = userState.value;
        if (remembered) setAuthInfo("Session expired. Sign in again.");
      } finally {
        if (!cancelled) setAuthRestoreComplete(true);
      }
    };
    void restoreAuth();
    return () => {
      cancelled = true;
    };
  }, [apiBase, claimPendingApplications, flushPendingCrdtCommits, historyOpen, loadHistory]);

  useEffect(() => {
    if (!authUser) setAccountMenuOpen(false);
  }, [authUser]);

  // Auto-sync when coming back online
  useEffect(() => {
    if (isOnline && authToken && authUser && queueState.pendingCount > 0) {
      void flushPendingCrdtCommits(authToken, authUser.userId);
    }
  }, [isOnline, authToken, authUser, queueState.pendingCount, flushPendingCrdtCommits]);

  useEffect(() => {
    const listenerPromise = CapApp.addListener("appUrlOpen", (event) => {
      try {
        const url = new URL(event.url);
        // alcomatcher://verify?email=...
        if (url.protocol === "alcomatcher:" && url.host === "verify") {
          const email = url.searchParams.get("email") ?? "";
          if (email) {
            setAuthEmail(email);
            setAuthMode("register");
            setAuthInfo("Email verified! Enter your OTP to complete sign-in.");
            setAuthModalOpen(true);
          }
        }
      } catch {
        // malformed URL — ignore
      }
    });
    return () => {
      void listenerPromise.then((h) => h.remove());
    };
  }, []); // no deps — setters are stable

  useEffect(() => {
    if (!historyOpen || !authToken) return;
    void loadHistory();
  }, [authToken, historyOpen, loadHistory]);

  useEffect(() => {
    return () => {
      for (const image of historyDetail?.images ?? []) {
        if (image.thumbSrc?.startsWith("blob:")) URL.revokeObjectURL(image.thumbSrc);
      }
    };
  }, [historyDetail]);

  const roleStageKey = useCallback((role: Role, index: number) => `${role}:${index}`, []);

  const buildClientMetrics = useCallback((): { metrics: StageTimingSummary; quality: "complete" | "partial" } => {
    const clock = stageClockRef.current;
    const duration = (start?: number, end?: number) => (typeof start === "number" && typeof end === "number" ? Math.max(0, end - start) : undefined);
    const frontKey = roleStageKey("front", 0);
    const backKey = roleStageKey("back", 0);
    const additionalKeys = Object.keys(clock.uploadStartedAt).filter((key) => key.startsWith("additional:"));

    const additionalUploadTotalMs = additionalKeys.reduce((sum, key) => {
      const ms = duration(clock.uploadStartedAt[key], clock.uploadEndedAt[key]);
      return sum + (ms ?? 0);
    }, 0);

    const metrics: StageTimingSummary = {
      sessionCreateMs: duration(clock.sessionCreateStartedAt, clock.sessionCreateEndedAt),
      frontUploadMs: duration(clock.uploadStartedAt[frontKey], clock.uploadEndedAt[frontKey]),
      frontOcrMs: duration(clock.ocrStartedAt[frontKey], clock.ocrEndedAt[frontKey]),
      backUploadMs: duration(clock.uploadStartedAt[backKey], clock.uploadEndedAt[backKey]),
      backOcrMs: duration(clock.ocrStartedAt[backKey], clock.ocrEndedAt[backKey]),
      additionalUploadTotalMs: additionalUploadTotalMs > 0 ? additionalUploadTotalMs : undefined,
      finalizeMs: duration(clock.finalizeStartedAt, clock.finalizeEndedAt),
      decisionTotalMs: duration(clock.firstCaptureStartedAt, clock.finalizeEndedAt)
    };

    const required = [metrics.sessionCreateMs, metrics.frontUploadMs, metrics.frontOcrMs, metrics.backUploadMs, metrics.backOcrMs, metrics.finalizeMs, metrics.decisionTotalMs];
    const quality = required.every((value) => typeof value === "number") ? "complete" : "partial";
    return { metrics, quality };
  }, [roleStageKey]);

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

    try {
      // Use enhanced preprocessing for better OCR
      const processed = await preprocessImageForOCR(file, {
        maxWidth: 2400,
        maxHeight: 3200,
        quality: 0.88,
        enhanceContrast: true,
        autoRotate: true
      });

      // Fallback to original if preprocessing fails
      return processed;
    } catch (error) {
      console.warn("Image preprocessing failed, using original:", error);

      // Fallback to basic compression
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
    }
  }, []);

  const createSession = useCallback(async (): Promise<{ sessionId: string; applicationId: string } | null> => {
    setSessionLoading(true);
    setError("");
    stageClockRef.current.sessionCreateStartedAt = Date.now();
    try {
      const response = await apiFetch(`${apiBase}/api/scanner/sessions`, { method: "POST" }, 1);
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error("Server is on an older API version. /api/scanner/sessions is not deployed yet.");
        }
        throw new Error(`Session creation failed (HTTP ${response.status}).`);
      }
      const payload = await response.json();
      setSessionId(payload.sessionId);
      setApplicationId(payload.applicationId);
      await addPendingClaimApplication(String(payload.applicationId ?? ""));
      stageClockRef.current.sessionCreateEndedAt = Date.now();
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
  }, [addPendingClaimApplication, apiBase, apiFetch]);

  useEffect(() => {
    createSessionRef.current = createSession;
  }, [createSession]);

  const requestOtp = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const response = await fetch(`${apiBase}/api/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "otp_request_failed");
      }
      if (typeof payload?.debugCode === "string" && payload.debugCode.length > 0) {
        setAuthCode(payload.debugCode);
        setAuthInfo(`OTP requested. Dev code auto-filled.`);
      } else if (payload?.status === "queued") {
        setAuthInfo("OTP request accepted. Delivery is retrying in the background; check email shortly.");
      } else if (payload?.status === "sent") {
        setAuthInfo("OTP sent. Check your email and enter the code.");
      } else {
        setAuthInfo("OTP requested. Check your channel and enter the code.");
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "otp_request_failed");
      if (message.includes("email_not_verified")) {
        setAuthError("Email not verified. Open the verification email link, then request OTP again.");
      } else if (message.includes("rate_limited")) {
        setAuthError("Too many OTP attempts. Please wait a moment and retry.");
      } else if (message.includes("otp_delivery_unavailable")) {
        setAuthError("OTP email could not be delivered right now. Please retry in a few seconds.");
      } else {
        setAuthError(formatNetworkError(err, "Request OTP"));
      }
    } finally {
      setAuthBusy(false);
    }
  }, [apiBase, authEmail]);

  const requestRegistration = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const response = await fetch(`${apiBase}/api/auth/register/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authEmail.trim(), mobile: Capacitor.isNativePlatform() })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "registration_request_failed");
      }
      setAuthInfo("Verification link sent. Check your email. After verifying, return and request OTP.");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "registration_request_failed");
      if (message.includes("rate_limited")) {
        setAuthError("Too many registration attempts. Please wait a moment and retry.");
      } else {
        setAuthError(formatNetworkError(err, "Create account"));
      }
    } finally {
      setAuthBusy(false);
    }
  }, [apiBase, authEmail]);

  const verifyOtp = useCallback(async () => {
    setAuthBusy(true);
    setAuthError("");
    setAuthInfo("");
    try {
      const response = await fetch(`${apiBase}/api/auth/otp/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: authEmail.trim(),
          code: authCode.trim()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "otp_verify_failed");
      }
      const token = typeof payload?.token === "string" ? payload.token : "";
      const user = payload?.user as { userId?: string; email?: string; role?: string } | undefined;
      if (!token || !user?.userId || !user?.email) throw new Error("invalid_auth_response");
      const role: UserRole = user.role === "compliance_manager" ? "compliance_manager" : "compliance_officer";
      const nextUser: MobileAuthUser = {
        userId: user.userId,
        email: user.email,
        role,
        initials: initialsFromEmail(user.email)
      };
      setAuthToken(token);
      setAuthUser(nextUser);
      await Promise.all([
        Preferences.set({ key: AUTH_TOKEN_KEY, value: token }),
        Preferences.set({ key: AUTH_USER_KEY, value: JSON.stringify(nextUser) })
      ]);
      await claimPendingApplications(token);
      await flushPendingCrdtCommits(token, nextUser.userId);
      if (historyOpen) await loadHistory();
      setAuthModalOpen(false);
      setAuthCode("");
      setAuthInfo("Signed in.");
      setAccountMenuOpen(false);
    } catch (err) {
      setAuthError(formatNetworkError(err, "Verify OTP"));
    } finally {
      setAuthBusy(false);
    }
  }, [apiBase, authCode, authEmail, claimPendingApplications, flushPendingCrdtCommits, historyOpen, loadHistory]);

  const logout = useCallback(async () => {
    setAccountMenuOpen(false);
    try {
      if (authToken) {
        await fetch(`${apiBase}/api/auth/logout`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken}`
          }
        });
      }
    } catch {
      // Ignore logout network errors.
    } finally {
      setAuthToken("");
      setAuthUser(null);
      setAccountMenuOpen(false);
      await Promise.all([Preferences.remove({ key: AUTH_TOKEN_KEY }), Preferences.remove({ key: AUTH_USER_KEY })]);
    }
  }, [apiBase, authToken]);

  const requestDeleteOtp = useCallback(async () => {
    if (!authUser?.email) return;
    setDeleteBusy(true);
    setDeleteError("");
    setDeleteInfo("");
    try {
      const response = await fetch(`${apiBase}/api/auth/otp/request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: authUser.email })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof payload?.error === "string" ? payload.error : "otp_request_failed");
      setDeleteInfo(payload?.status === "queued" ? "OTP queued. Delivery retry is in progress." : "OTP sent. Enter it to confirm deletion.");
      if (typeof payload?.debugCode === "string" && payload.debugCode.length > 0) {
        setDeleteOtpCode(payload.debugCode);
      }
    } catch (err) {
      setDeleteError(formatNetworkError(err, "Request delete OTP"));
    } finally {
      setDeleteBusy(false);
    }
  }, [apiBase, authUser?.email]);

  const deleteAccount = useCallback(async () => {
    if (!authUser) return;
    setDeleteBusy(true);
    setDeleteError("");
    setDeleteInfo("");
    try {
      const response = await fetch(`${apiBase}/api/auth/account/delete`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`
        },
        body: JSON.stringify({
          otpCode: deleteOtpCode.trim(),
          confirmationText: deleteConfirmationText.trim()
        })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(typeof payload?.error === "string" ? payload.error : "account_delete_failed");
      }
      setDeleteInfo("Account deleted.");
      setDeleteAccountOpen(false);
      setAccountMenuOpen(false);
      setAuthToken("");
      setAuthUser(null);
      setDeleteOtpCode("");
      setDeleteConfirmationText("");
      await Promise.all([Preferences.remove({ key: AUTH_TOKEN_KEY }), Preferences.remove({ key: AUTH_USER_KEY })]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err ?? "account_delete_failed");
      if (message.includes("last_manager_cannot_delete")) {
        setDeleteError("You are the last active manager. Promote another manager before deleting this account.");
      } else if (message.includes("invalid_confirmation")) {
        setDeleteError('Type DELETE exactly to confirm account deletion.');
      } else if (message.includes("otp_invalid_or_expired")) {
        setDeleteError("OTP is invalid or expired. Request a new one.");
      } else {
        setDeleteError(formatNetworkError(err, "Delete account"));
      }
    } finally {
      setDeleteBusy(false);
    }
  }, [apiBase, authToken, authUser, deleteConfirmationText, deleteOtpCode]);

  const openAdminQueue = useCallback(() => {
    setAccountMenuOpen(false);
    window.location.assign(`${apiBase}/admin/queue`);
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
          height: window.screen.height,
          enableHighResolution: true,
          enableZoom: false,
          lockAndroidOrientation: true
        });
      },
      stopPreview: async () => {
        const started = await CameraPreview.isCameraStarted().catch(() => ({ value: false }));
        if (!started?.value) return;
        await CameraPreview.stop();
      },
      captureFrame: async (role: Role) => {
        // Capture with high quality for OCR
        const result = await CameraPreview.capture({ quality: 95 });
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

  const startPreviewGuarded = useCallback(async (reason: string) => {
    const lifecycle = previewLifecycleRef.current;
    if (lifecycle.isStarted || lifecycle.isStarting) {
      previewDebug("start_ignored", { reason, isStarted: lifecycle.isStarted, isStarting: lifecycle.isStarting });
      return;
    }
    lifecycle.isStarting = true;
    const token = lifecycle.instanceToken + 1;
    lifecycle.instanceToken = token;
    previewDebug("start_attempt", { reason, token });
    try {
      await previewAdapter.startPreview?.();
      if (previewLifecycleRef.current.instanceToken !== token) {
        previewDebug("start_stale", { reason, token });
        return;
      }
      lifecycle.isStarted = true;
      previewDebug("start_ok", { reason, token });
    } finally {
      if (previewLifecycleRef.current.instanceToken === token) {
        lifecycle.isStarting = false;
      }
    }
  }, [previewAdapter]);

  const stopPreviewGuarded = useCallback(async (reason: string) => {
    const lifecycle = previewLifecycleRef.current;
    if (!lifecycle.isStarted || lifecycle.isStopping) {
      previewDebug("stop_ignored", { reason, isStarted: lifecycle.isStarted, isStopping: lifecycle.isStopping });
      return;
    }
    lifecycle.isStopping = true;
    const token = lifecycle.instanceToken + 1;
    lifecycle.instanceToken = token;
    previewDebug("stop_attempt", { reason, token });
    try {
      await previewAdapter.stopPreview?.();
      if (previewLifecycleRef.current.instanceToken !== token) {
        previewDebug("stop_stale", { reason, token });
        return;
      }
      lifecycle.isStarted = false;
      previewDebug("stop_ok", { reason, token });
    } finally {
      if (previewLifecycleRef.current.instanceToken === token) {
        lifecycle.isStopping = false;
      }
    }
  }, [previewAdapter]);

  useEffect(() => {
    if (!authRestoreComplete || sessionId) return;
    void createSessionRef.current();
  }, [authRestoreComplete, sessionId]);

  useEffect(() => {
    let disposed = false;
    const startPreview = async () => {
      if (!Capacitor.isNativePlatform()) {
        setCaptureMode("modal");
        setPreviewReady(false);
        return;
      }

      try {
        await startPreviewGuarded("mount");
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
      void stopPreviewGuarded("unmount");
    };
  }, [startPreviewGuarded, stopPreviewGuarded]);

  // Processing stages management
  const initProcessingStages = useCallback((stageIds: ScannerStageId[]) => {
    const stages: ProcessingStage[] = stageIds.map((id, index) => ({
      ...SCANNER_STAGES[id],
      status: index === 0 ? "active" : "pending"
    }));
    setProcessingStages(stages);
  }, []);

  const updateStage = useCallback((stageId: string, updates: Partial<ProcessingStage>) => {
    setProcessingStages((current) =>
      current.map((stage) => (stage.id === stageId ? { ...stage, ...updates } : stage))
    );
  }, []);

  const completeStage = useCallback((stageId: string) => {
    setProcessingStages((current) => {
      const stageIndex = current.findIndex((s) => s.id === stageId);
      if (stageIndex === -1) return current;

      return current.map((stage, index) => {
        if (stage.id === stageId) {
          return { ...stage, status: "completed" as const, progress: 100 };
        }
        if (index === stageIndex + 1) {
          return { ...stage, status: "active" as const };
        }
        return stage;
      });
    });
  }, []);

  // Batch mode label group management
  const createNewGroup = useCallback(() => {
    const group: LabelGroup = {
      id: crypto.randomUUID(),
      imageIds: [],
      status: "capturing",
      createdAt: new Date().toISOString()
    };
    setLabelGroups((prev) => [...prev, group]);
    setCurrentGroupId(group.id);
    return group;
  }, []);

  const completeCurrentGroup = useCallback(() => {
    if (!currentGroupId) return;
    setLabelGroups((prev) =>
      prev.map((g) => (g.id === currentGroupId ? { ...g, status: "complete" as const } : g))
    );
  }, [currentGroupId]);

  const addImageToCurrentGroup = useCallback((imageId: string) => {
    if (!currentGroupId) return;
    setLabelGroups((prev) =>
      prev.map((g) =>
        g.id === currentGroupId ? { ...g, imageIds: [...g.imageIds, imageId] } : g
      )
    );
  }, [currentGroupId]);

  const updateImageState = useCallback((localId: string, patch: Partial<LocalImage>) => {
    setImages((current) => current.map((image) => (image.localId === localId ? { ...image, ...patch } : image)));
  }, []);

  const addImage = useCallback(
    async (file: File, role: Role, existingLocalId?: string, existingIndex?: number) => {
      const compressed = await compressImage(file);
      const additionalIndex = images.filter((entry) => entry.role === "additional").length;
      const nextIndex = role === "additional" ? existingIndex ?? additionalIndex : 0;
      const roleKey = roleStageKey(role, nextIndex);
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
      if (!stageClockRef.current.firstCaptureStartedAt) {
        stageClockRef.current.firstCaptureStartedAt = Date.now();
      }
      stageClockRef.current.uploadStartedAt[roleKey] = Date.now();

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
        let response = await apiFetch(
          `${apiBase}/api/scanner/sessions/${resolvedSessionId}/images`,
          {
            method: "POST",
            body: formData
          },
          2,
          550
        );
        let payload: UploadResponsePayload = await response.json();
        if (!response.ok && response.status === 404 && payload.error === "scan_session_not_found") {
          const created = await createSession();
          resolvedSessionId = created?.sessionId ?? "";
          if (!resolvedSessionId) {
            throw new Error("Unable to recover scan session. Check network and retry.");
          }
          response = await apiFetch(
            `${apiBase}/api/scanner/sessions/${resolvedSessionId}/images`,
            {
              method: "POST",
              body: formData
            },
            1,
            500
          );
          payload = await response.json();
        }
        if (!response.ok) {
          throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
        }
        stageClockRef.current.uploadEndedAt[roleKey] = Date.now();
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
    [apiBase, apiFetch, compressImage, createSession, images, roleStageKey, sessionId, updateImageState]
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
    if (!sessionId) {
      const created = await createSession();
      if (!created?.sessionId) return;
    }
    if (!frontReady || !backReady) {
      setError("Front and back images must be uploaded and processed before running quick check.");
      return;
    }
    setFinalizing(true);
    setError("");
    initProcessingStages(["ocr", "compliance_check"]);
    stageClockRef.current.finalizeStartedAt = Date.now();
    try {
      let resolvedSessionId = sessionId;
      if (!resolvedSessionId) {
        const created = await createSession();
        resolvedSessionId = created?.sessionId ?? "";
      }
      if (!resolvedSessionId) {
        throw new Error("Unable to start scan session. Check network and retry.");
      }
      const telemetry = buildClientMetrics();
      updateStage("ocr", { progress: 50 });
      let response = await apiFetch(`${apiBase}/api/scanner/sessions/${resolvedSessionId}/finalize`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-alcomatcher-client-sync": "crdt"
        },
        body: JSON.stringify({
          requireGovWarning: true,
          clientMetrics: telemetry.metrics
        })
      }, 2, 650);
      completeStage("ocr");
      let payload = await response.json();
      if (!response.ok && response.status === 404 && payload.error === "scan_session_not_found") {
        const created = await createSession();
        resolvedSessionId = created?.sessionId ?? "";
        if (!resolvedSessionId) {
          throw new Error("Scan session expired and could not be recovered.");
        }
        throw new Error("Scan session refreshed. Please capture front and back again.");
      }
      if (!response.ok) {
        throw new Error(payload.detail ?? payload.error ?? `HTTP_${response.status}`);
      }
      completeStage("compliance_check");
      stageClockRef.current.finalizeEndedAt = Date.now();
      const finalizedApplicationId = String(payload.applicationId ?? applicationId ?? "");
      setApplicationId(finalizedApplicationId);
      setResult(payload as FinalizeResult);
      setReportVisible(true);
      setProcessingStages([]);
      if (finalizedApplicationId) {
        await queuePendingCrdtCommit(finalizedApplicationId, {
          kind: "scanner_finalize_commit",
          applicationId: finalizedApplicationId,
          sessionId: resolvedSessionId,
          summary: payload.summary,
          confidence: payload.confidence,
          telemetryQuality: payload.telemetryQuality ?? "partial",
          committedAt: new Date().toISOString()
        });
      }
      if (authToken && authUser) {
        await claimPendingApplications(authToken);
        await flushPendingCrdtCommits(authToken, authUser.userId);
        if (historyOpen) await loadHistory();
      }
    } catch (err) {
      const currentStageId = processingStages.find((s) => s.status === "active")?.id;
      if (currentStageId) {
        updateStage(currentStageId, {
          status: "error",
          errorMessage: formatNetworkError(err, "Send/Finalize")
        });
      }
      setError(formatNetworkError(err, "Send/Finalize"));
    } finally {
      setFinalizing(false);
    }
  }, [
    apiBase,
    apiFetch,
    applicationId,
    authToken,
    authUser,
    backReady,
    buildClientMetrics,
    claimPendingApplications,
    completeStage,
    createSession,
    flushPendingCrdtCommits,
    frontReady,
    historyOpen,
    initProcessingStages,
    loadHistory,
    processingStages,
    queuePendingCrdtCommit,
    sessionId,
    updateStage
  ]);

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
    let stream: EventSource | null = null;
    let disposed = false;
    const onProgress = (event: MessageEvent) => {
      try {
        const payload = JSON.parse(event.data) as ScanProgressEvent;
        if (payload.type !== "scan.progress") return;
        const role = payload.data?.role;
        const index = payload.data?.index ?? 0;
        if (!role) return;
        const roleKey = roleStageKey(role, index);
        if (payload.data?.stage === "image_upload_started") {
          stageClockRef.current.uploadStartedAt[roleKey] = Date.now();
        }
        if (payload.data?.stage === "image_upload_completed") {
          stageClockRef.current.uploadEndedAt[roleKey] = Date.now();
          stageClockRef.current.ocrStartedAt[roleKey] = Date.now();
        }
        if (payload.data?.stage === "ocr_completed") {
          stageClockRef.current.ocrEndedAt[roleKey] = Date.now();
        }
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

    const connect = async () => {
      let streamUrl = `${apiBase}/api/events/stream?scope=mobile&applicationId=${encodeURIComponent(applicationId)}`;
      if (authToken) {
        try {
          const ticketResponse = await apiFetch(`${apiBase}/api/events/stream-auth-ticket`, { method: "GET" }, 1, 350);
          if (ticketResponse.ok) {
            const ticketPayload = await ticketResponse.json();
            const ticket = typeof ticketPayload?.ticket === "string" ? ticketPayload.ticket : "";
            if (ticket) {
              streamUrl += `&ticket=${encodeURIComponent(ticket)}`;
            }
          }
        } catch {
          // Fall back to anonymous stream URL if ticket fetch fails.
        }
      }
      if (disposed) return;
      stream = new EventSource(streamUrl);
      stream.addEventListener("scan.progress", onProgress as EventListener);
    };
    void connect();

    return () => {
      disposed = true;
      stream?.close();
    };
  }, [apiBase, apiFetch, applicationId, authToken, roleStageKey]);

  const scanButtonLabel = captureBusy ? "Capturing..." : "Scan Another";

  return (
    <IonApp>
      <IonPage>
        <IonContent className="scanner-content" fullscreen scrollY={false}>
          <div className={`scanner-shell ${captureMode === "preview" && previewReady ? "scanner-live" : ""}`}>
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
                <div className="hero-topbar">
                  <div className="crest-chip">
                    <img src="/alcomatcher-crest.svg" alt="AlcoMatcher crest" />
                    <span>AlcoMatcher</span>
                  </div>
                  {!authUser ? (
                    <button
                      type="button"
                      className="auth-login-btn"
                      onClick={() => {
                        setAuthMode("sign_in");
                        setAuthModalOpen(true);
                        setAuthError("");
                        setAuthInfo("");
                      }}
                    >
                      <IonIcon icon={logInOutline} />
                      <span>Log In</span>
                    </button>
                  ) : (
                    <div className="auth-avatar-wrap">
                      <button
                        id="account-avatar-trigger"
                        type="button"
                        className={`auth-avatar auth-role-${authUser.role}`}
                        onClick={() => setAccountMenuOpen((current) => !current)}
                        aria-label="Account"
                      >
                        {authUser.initials}
                      </button>
                    </div>
                  )}
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
                {authInfo ? <p className="preview-warning">{authInfo}</p> : null}
              </IonText>

              {/* Sync Status Indicator */}
              <SyncStatus
                isOnline={isOnline}
                queueState={queueState}
                onTap={() => setSyncQueueOpen(true)}
              />

              {/* Scan Mode Toggle */}
              {!result && (
                <div className="scan-mode-toggle">
                  <IonButton
                    fill={scanMode === "single" ? "solid" : "outline"}
                    size="small"
                    onClick={() => {
                      setScanMode("single");
                      setLabelGroups([]);
                      setCurrentGroupId(null);
                    }}
                  >
                    Single Label
                  </IonButton>
                  <IonButton
                    fill={scanMode === "batch" ? "solid" : "outline"}
                    size="small"
                    onClick={() => {
                      setScanMode("batch");
                      if (labelGroups.length === 0) {
                        createNewGroup();
                      }
                    }}
                  >
                    Batch Mode
                  </IonButton>
                </div>
              )}

              {/* Batch mode info */}
              {scanMode === "batch" && labelGroups.length > 0 && (
                <IonText color="medium">
                  <p style={{ fontSize: "0.85rem", textAlign: "center", margin: "0.5rem 0" }}>
                    Label {labelGroups.length} • {images.length} image{images.length !== 1 ? "s" : ""} total
                  </p>
                </IonText>
              )}

              {isNativeIos ? null : (
                <>
                  <div className="step-row" role="status" aria-live="polite">
                    <span className={`step-pill ${capturePhase === "front" ? "is-active" : frontReady ? "is-done" : ""}`}>Front</span>
                    <span className={`step-pill ${capturePhase === "back" ? "is-active" : backReady ? "is-done" : ""}`}>Back</span>
                    <span className={`step-pill ${capturePhase === "additional" ? "is-active" : ""}`}>Additional</span>
                  </div>
                  <div className="lens-frame">
                    <div className="lens-reticle" />
                  </div>
                </>
              )}
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
              {/* Empty left spacer for centering */}
              <span />

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
                onClick={() => {
                  if (scanMode === "batch" && labelGroups.length > 0) {
                    setBatchSummaryOpen(true);
                  } else {
                    void finalizeScan();
                  }
                }}
                disabled={!canFinalize || captureBusy}
              >
                <IonIcon icon={paperPlaneOutline} />
                <span>
                  {finalizing
                    ? "Sending..."
                    : scanMode === "batch"
                      ? "Review"
                      : "Send"}
                </span>
              </IonButton>

              {/* Report button positioned separately if results exist */}
              {result ? (
                <IonButton
                  className="report-button"
                  fill="clear"
                  size="default"
                  onClick={() => setReportVisible(true)}
                  style={{ gridColumn: '1', justifySelf: 'start' }}
                >
                  <IonIcon icon={receiptOutline} slot="start" />
                  Report
                </IonButton>
              ) : (
                <span />
              )}
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
          <IonPopover
            isOpen={accountMenuOpen}
            trigger="account-avatar-trigger"
            triggerAction="click"
            onDidDismiss={() => setAccountMenuOpen(false)}
            className="account-popover"
            alignment="end"
            side="bottom"
          >
            <div className="account-popover-content">
              {authUser ? (
                <div className="account-row">
                  <IonIcon icon={personCircleOutline} />
                  <div>
                    <strong>{authUser.email}</strong>
                    <span>{authUser.role === "compliance_manager" ? "Compliance Manager" : "Compliance Officer"}</span>
                  </div>
                </div>
              ) : null}
              {authUser?.role === "compliance_manager" ? (
                <button type="button" className="account-action" onClick={openAdminQueue}>
                  Open Admin Queue
                </button>
              ) : null}
              <button
                type="button"
                className="account-action"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setHistoryOpen(true);
                }}
              >
                <IonIcon icon={timeOutline} />
                <span>History</span>
              </button>
              <button type="button" className="account-action logout" onClick={() => void logout()}>
                <IonIcon icon={logOutOutline} />
                <span>Log Out</span>
              </button>
              <button
                type="button"
                className="account-action delete"
                onClick={() => {
                  setAccountMenuOpen(false);
                  setDeleteError("");
                  setDeleteInfo("");
                  setDeleteOtpCode("");
                  setDeleteConfirmationText("");
                  setDeleteAccountOpen(true);
                }}
              >
                <IonIcon icon={trashOutline} />
                <span>Delete Account</span>
              </button>
            </div>
          </IonPopover>
          <IonModal isOpen={historyOpen} onDidDismiss={() => setHistoryOpen(false)} className="history-modal">
            <div className="history-overlay">
              <div className="report-header">
                <strong>Submission History</strong>
                <button type="button" className="report-close" onClick={() => setHistoryOpen(false)} aria-label="Close history">
                  <IonIcon icon={close} />
                </button>
              </div>
              <div className="history-actions">
                <button type="button" className="account-action" onClick={() => void loadHistory()} disabled={historyLoading}>
                  {historyLoading ? "Refreshing..." : "Refresh"}
                </button>
              </div>
              {historyError ? <p className="auth-error">{historyError}</p> : null}
              {!historyLoading && historyItems.length === 0 ? <p className="auth-info">No saved submissions yet.</p> : null}
              <div className="history-list">
                {historyItems.map((item) => (
                  <button key={item.applicationId} type="button" className="history-item" onClick={() => void openHistoryDetail(item.applicationId)}>
                    <div className="history-item-top">
                      <strong>{item.summary ? item.summary.toUpperCase() : item.status.toUpperCase()}</strong>
                      <span className={`sync-badge sync-${item.syncState}`}>{item.syncState}</span>
                    </div>
                    <div className="history-item-meta">
                      <span>{new Date(item.updatedAt).toLocaleString()}</span>
                      <span>{item.imageCount} image(s)</span>
                      <span>{typeof item.confidence === "number" ? `${Math.round(item.confidence * 100)}% confidence` : "No confidence"}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </IonModal>
          <IonModal isOpen={historyDetailOpen} onDidDismiss={() => setHistoryDetailOpen(false)} className="history-modal">
            <div className="history-overlay">
              <div className="report-header">
                <strong>Submission Detail</strong>
                <button type="button" className="report-close" onClick={() => setHistoryDetailOpen(false)} aria-label="Close history detail">
                  <IonIcon icon={close} />
                </button>
              </div>
              {historyDetailLoading ? <p className="auth-info">Loading history detail...</p> : null}
              {historyDetail ? (
                <div className="history-detail">
                  <div className="history-item-top">
                    <strong>{historyDetail.application.status.toUpperCase()}</strong>
                    <span className={`sync-badge sync-${historyDetail.application.syncState}`}>{historyDetail.application.syncState}</span>
                  </div>
                  <p className="auth-info">{new Date(historyDetail.application.updatedAt).toLocaleString()}</p>
                  <div className="history-images">
                    {historyDetail.images.map((image) => (
                      <div key={image.imageId} className="history-image-link">
                        <img src={image.thumbSrc ?? `${apiBase}${image.thumbUrl}`} alt={`${image.role} ${image.index}`} />
                        <span>{image.role} {image.index + 1}</span>
                      </div>
                    ))}
                  </div>
                  <div className="history-checks">
                    {(historyDetail.report.checks ?? []).map((check) => (
                      <div key={check.checkId} className={`history-check check-${check.status}`}>
                        <strong>{check.label}</strong>
                        <p>{check.evidenceText || check.failureReason || "No details provided."}</p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </IonModal>
          <IonModal isOpen={authModalOpen} onDidDismiss={() => setAuthModalOpen(false)} backdropDismiss={!authBusy} className="auth-modal">
            <div className="auth-overlay">
              <div className="auth-header">
                <strong>{authMode === "register" ? "Create Account" : "Sign In"}</strong>
                <button type="button" className="report-close" disabled={authBusy} onClick={() => setAuthModalOpen(false)} aria-label="Close sign in">
                  <IonIcon icon={close} />
                </button>
              </div>
              <label htmlFor="auth-email">Email</label>
              <input
                id="auth-email"
                className="auth-input"
                type="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.currentTarget.value)}
                disabled={authBusy}
                autoCapitalize="none"
                autoComplete="email"
                placeholder="you@example.com"
              />
              {authMode === "register" ? (
                <>
                  <IonButton className="auth-btn verify" onClick={() => void requestRegistration()} disabled={authBusy || !authEmail.trim()}>
                    Send Verification Link
                  </IonButton>
                  <IonButton className="auth-btn" fill="outline" onClick={() => setAuthMode("sign_in")} disabled={authBusy}>
                    Back to Sign In
                  </IonButton>
                </>
              ) : (
                <>
                  <IonButton className="auth-btn" onClick={() => void requestOtp()} disabled={authBusy || !authEmail.trim()}>
                    Request OTP
                  </IonButton>
                  <IonButton className="auth-btn" fill="outline" onClick={() => setAuthMode("register")} disabled={authBusy}>
                    Create Account
                  </IonButton>
                  <label htmlFor="auth-code">One-Time Code</label>
                  <input
                    id="auth-code"
                    className="auth-input"
                    type="text"
                    value={authCode}
                    onChange={(event) => setAuthCode(event.currentTarget.value)}
                    disabled={authBusy}
                    autoComplete="one-time-code"
                    inputMode="numeric"
                  />
                  <IonButton className="auth-btn verify" onClick={() => void verifyOtp()} disabled={authBusy || !authEmail.trim() || !authCode.trim()}>
                    Verify & Sign In
                  </IonButton>
                </>
              )}
              {authError ? <p className="auth-error">{authError}</p> : null}
              {authInfo ? <p className="auth-info">{authInfo}</p> : null}
            </div>
          </IonModal>
          <IonModal isOpen={deleteAccountOpen} onDidDismiss={() => setDeleteAccountOpen(false)} backdropDismiss={!deleteBusy} className="auth-modal">
            <div className="auth-overlay">
              <div className="auth-header">
                <strong>Delete Account</strong>
                <button type="button" className="report-close" disabled={deleteBusy} onClick={() => setDeleteAccountOpen(false)} aria-label="Close delete account">
                  <IonIcon icon={close} />
                </button>
              </div>
              <p className="auth-info">This permanently deletes your account, saved scans, history, and associated data.</p>
              <IonButton className="auth-btn" onClick={() => void requestDeleteOtp()} disabled={deleteBusy || !authUser?.email}>
                Request OTP
              </IonButton>
              <label htmlFor="delete-otp-code">OTP Code</label>
              <input
                id="delete-otp-code"
                className="auth-input"
                type="text"
                value={deleteOtpCode}
                onChange={(event) => setDeleteOtpCode(event.currentTarget.value)}
                disabled={deleteBusy}
                autoComplete="one-time-code"
                inputMode="numeric"
                placeholder="Enter OTP"
              />
              <label htmlFor="delete-confirm-text">Type DELETE to confirm</label>
              <input
                id="delete-confirm-text"
                className="auth-input"
                type="text"
                value={deleteConfirmationText}
                onChange={(event) => setDeleteConfirmationText(event.currentTarget.value)}
                disabled={deleteBusy}
                placeholder="DELETE"
              />
              <IonButton className="auth-btn danger" onClick={() => void deleteAccount()} disabled={deleteBusy || !deleteOtpCode.trim() || !deleteConfirmationText.trim()}>
                Delete My Account
              </IonButton>
              {deleteError ? <p className="auth-error">{deleteError}</p> : null}
              {deleteInfo ? <p className="auth-info">{deleteInfo}</p> : null}
            </div>
          </IonModal>
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
                  <div>
                    <strong>Decision Time:</strong> {Math.round(result.stageTimings?.decisionTotalMs ?? result.processingMs ?? 0)} ms
                  </div>
                  <div>
                    <strong>Telemetry Quality:</strong> {(result.telemetryQuality ?? "partial").toUpperCase()}
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

      {/* Processing stages modal */}
      <IonModal
        isOpen={processingStages.length > 0}
        backdropDismiss={false}
        className="processing-stages-modal"
      >
        <IonContent className="ion-padding">
          <div style={{ padding: "1rem" }}>
            <h2 style={{ color: "var(--foam)", marginBottom: "1rem" }}>Processing Label</h2>
            <LoadingStages
              stages={processingStages}
              onRetry={(stageId) => {
                // Reset failed stage and retry
                updateStage(stageId, { status: "active", errorMessage: undefined });
                void finalizeScan();
              }}
            />
          </div>
        </IonContent>
      </IonModal>

      {/* Batch Summary Modal */}
      <IonModal isOpen={batchSummaryOpen} onDidDismiss={() => setBatchSummaryOpen(false)}>
        <IonContent>
          <BatchSummary
            groups={labelGroups}
            totalImages={images.length}
            onSendBatch={() => {
              // In full implementation, this would send all groups
              setBatchSummaryOpen(false);
              void finalizeScan();
            }}
            onCancel={() => setBatchSummaryOpen(false)}
            isSending={finalizing}
          />
        </IonContent>
      </IonModal>

      {/* Sync Queue Modal */}
      <SyncQueueModal
        isOpen={syncQueueOpen}
        onClose={() => setSyncQueueOpen(false)}
        queueState={queueState}
        onRetrySync={() => {
          if (authToken && authUser) {
            void flushPendingCrdtCommits(authToken, authUser.userId);
          }
        }}
        isOnline={isOnline}
      />

      {/* Simple loading indicator for session init */}
      <IonLoading
        isOpen={sessionLoading && processingStages.length === 0}
        message={loadingMessage}
      />
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
