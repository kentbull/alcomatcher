import { randomUUID } from "node:crypto";
import { complianceService } from "./complianceService.js";
import { realtimeEventBus } from "./realtimeEventBus.js";
import { ScannerService } from "./scannerService.js";
import type { ExpectedLabelFields, PerImageScanResult, ScanImageRole, ScannerQuickCheckResult, ScannerStageTimings } from "../types/scanner.js";

export type ScanSessionStatus = "draft_scan_started" | "collecting_images" | "ready_to_finalize" | "finalized" | "pruned";
export type ScanImageUploadState = "queued" | "uploading" | "processing" | "ready" | "failed";

interface ScanSessionImage {
  imageId: string;
  role: ScanImageRole;
  index: number;
  uploadState: ScanImageUploadState;
  originalMimeType: string;
  originalBytes: number;
  normalizedMimeType: string;
  normalizedBytes: number;
  normalizedImage: Buffer;
  retryCount: number;
  uploadErrorCode?: string;
  uploadErrorMessage?: string;
  uploadedAt?: string;
  result?: PerImageScanResult;
}

interface ScanSession {
  sessionId: string;
  applicationId: string;
  status: ScanSessionStatus;
  createdAt: string;
  updatedAt: string;
  expiresAt: string;
  images: ScanSessionImage[];
  finalizedResult?: ScannerQuickCheckResult;
}

export class ScannerSessionService {
  private readonly scannerService = new ScannerService();
  private readonly sessions = new Map<string, ScanSession>();

  async createSession() {
    const app = await complianceService.createApplication("distilled_spirits", "single");
    const now = new Date();
    const session: ScanSession = {
      sessionId: randomUUID(),
      applicationId: app.applicationId,
      status: "draft_scan_started",
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + 90 * 60 * 1000).toISOString(),
      images: []
    };
    this.sessions.set(session.sessionId, session);
    realtimeEventBus.publish({
      type: "scan.progress",
      applicationId: session.applicationId,
      scope: "all",
      data: {
        sessionId: session.sessionId,
        stage: "session_created",
        status: "completed"
      }
    });
    return session;
  }

  getSession(sessionId: string) {
    return this.sessions.get(sessionId) ?? null;
  }

  async uploadImage(sessionId: string, payload: { role: ScanImageRole; image: Buffer; mimeType: string; index?: number }) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    const role = payload.role;
    const index = role === "additional" ? payload.index ?? session.images.filter((img) => img.role === "additional").length : 0;
    if (session.images.length >= 6) {
      throw new Error("too_many_images");
    }
    if (role !== "additional") {
      const existing = session.images.find((img) => img.role === role);
      if (existing) {
        existing.retryCount += 1;
        existing.uploadState = "uploading";
      }
    }

    const imageRecord: ScanSessionImage = {
      imageId: randomUUID(),
      role,
      index,
      uploadState: "uploading",
      originalMimeType: payload.mimeType,
      originalBytes: payload.image.byteLength,
      normalizedMimeType: "image/jpeg",
      normalizedBytes: payload.image.byteLength,
      normalizedImage: payload.image,
      retryCount: 0
    };

    if (role === "additional") {
      session.images.push(imageRecord);
    } else {
      session.images = [...session.images.filter((img) => img.role !== role), imageRecord];
    }
    session.status = "collecting_images";
    session.updatedAt = new Date().toISOString();
    this.emitImageProgress(session, imageRecord, "image_upload_started", "in_progress");

    try {
      imageRecord.uploadState = "processing";
      imageRecord.uploadedAt = new Date().toISOString();
      this.emitImageProgress(session, imageRecord, "image_upload_completed", "completed");
      this.emitImageProgress(session, imageRecord, "ocr_started", "in_progress");
      imageRecord.result = await this.scannerService.analyzeImage(role, index, payload.image);
      imageRecord.uploadState = "ready";
      this.emitImageProgress(session, imageRecord, "ocr_completed", "completed");
      this.emitImageProgress(session, imageRecord, "image_checks_completed", "completed");
    } catch (error) {
      imageRecord.uploadState = "failed";
      imageRecord.uploadErrorCode = "upload_processing_failed";
      imageRecord.uploadErrorMessage = error instanceof Error ? error.message : "unknown_error";
      this.emitImageProgress(session, imageRecord, "ocr_completed", "failed");
    }

    if (this.hasRequiredReadyImages(session)) {
      session.status = "ready_to_finalize";
    }
    session.updatedAt = new Date().toISOString();
    return imageRecord;
  }

  async finalizeSession(
    sessionId: string,
    expected: ExpectedLabelFields | undefined,
    clientSyncMode: "crdt" | "direct",
    clientStageTimings?: ScannerStageTimings
  ): Promise<{ session: ScanSession; result: ScannerQuickCheckResult } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status === "finalized" && session.finalizedResult) {
      return {
        session,
        result: session.finalizedResult
      };
    }

    const front = session.images.find((img) => img.role === "front" && img.uploadState === "ready" && img.result);
    const back = session.images.find((img) => img.role === "back" && img.uploadState === "ready" && img.result);
    if (!front || !back) {
      throw new Error("required_images_not_ready");
    }

    const finalizeStartedAt = Date.now();
    this.emitSessionProgress(session, "composite_started", "in_progress");
    const quickCheckResult = await this.scannerService.quickCheckMultiImage(
      session.images
        .filter((img) => img.uploadState === "ready")
        .map((img) => ({
          role: img.role,
          index: img.index,
          image: img.normalizedImage
        }))
      ,
      expected
    );

    const serverStageTimings = buildServerStageTimings(session, quickCheckResult, Date.now() - finalizeStartedAt);
    const combinedStageTimings: ScannerStageTimings = {
      ...serverStageTimings,
      ...(clientStageTimings ?? {})
    };
    const requiredClientFields = ["sessionCreateMs", "frontUploadMs", "frontOcrMs", "backUploadMs", "backOcrMs", "finalizeMs", "decisionTotalMs"];
    const telemetryQuality = requiredClientFields.every(
      (field) => typeof (clientStageTimings as Record<string, unknown> | undefined)?.[field] === "number"
    )
      ? "complete"
      : "partial";

    const result: ScannerQuickCheckResult = {
      ...quickCheckResult,
      stageTimings: combinedStageTimings,
      telemetryQuality
    };

    await complianceService.recordScannerQuickCheck(session.applicationId, result, expected);
    await complianceService.mergeClientSync(session.applicationId, {
      syncState: clientSyncMode === "crdt" ? "pending_sync" : "synced"
    });

    session.status = "finalized";
    session.finalizedResult = result;
    session.updatedAt = new Date().toISOString();
    this.emitSessionProgress(session, "composite_completed", "completed");
    this.emitSessionProgress(session, "decision_completed", "completed");
    return {
      session,
      result
    };
  }

  pruneStaleSessions(cutoffMs = 90 * 60 * 1000) {
    const now = Date.now();
    let pruned = 0;
    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.status === "finalized") continue;
      if (now - new Date(session.updatedAt).getTime() < cutoffMs) continue;
      this.sessions.delete(sessionId);
      pruned += 1;
      realtimeEventBus.publish({
        type: "scan.progress",
        applicationId: session.applicationId,
        scope: "all",
        data: {
          sessionId,
          stage: "session_pruned",
          status: "completed"
        }
      });
    }
    return pruned;
  }

  private hasRequiredReadyImages(session: ScanSession) {
    const frontReady = session.images.some((img) => img.role === "front" && img.uploadState === "ready");
    const backReady = session.images.some((img) => img.role === "back" && img.uploadState === "ready");
    return frontReady && backReady;
  }

  private emitImageProgress(
    session: ScanSession,
    image: ScanSessionImage,
    stage: string,
    status: "in_progress" | "completed" | "failed"
  ) {
    realtimeEventBus.publish({
      type: "scan.progress",
      applicationId: session.applicationId,
      scope: "all",
      data: {
        sessionId: session.sessionId,
        imageId: image.imageId,
        role: image.role,
        index: image.index,
        stage,
        status,
        uploadState: image.uploadState,
        errorCode: image.uploadErrorCode,
        errorMessage: image.uploadErrorMessage
      }
    });
  }

  private emitSessionProgress(session: ScanSession, stage: string, status: "in_progress" | "completed" | "failed") {
    realtimeEventBus.publish({
      type: "scan.progress",
      applicationId: session.applicationId,
      scope: "all",
      data: {
        sessionId: session.sessionId,
        stage,
        status
      }
    });
  }
}

export const scannerSessionService = new ScannerSessionService();

function buildServerStageTimings(session: ScanSession, result: ScannerQuickCheckResult, finalizeMs: number): ScannerStageTimings {
  const front = session.images.find((img) => img.role === "front" && img.result);
  const back = session.images.find((img) => img.role === "back" && img.result);
  const additional = session.images.filter((img) => img.role === "additional" && img.result);

  return {
    frontOcrMs: front?.result?.processingMs,
    backOcrMs: back?.result?.processingMs,
    additionalUploadTotalMs: additional.reduce((sum, img) => sum + (img.result?.processingMs ?? 0), 0),
    finalizeMs,
    decisionTotalMs: result.processingMs
  };
}
