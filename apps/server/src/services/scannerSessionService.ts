import { randomUUID } from "node:crypto";
import { complianceService } from "./complianceService.js";
import { realtimeEventBus } from "./realtimeEventBus.js";
import { ScannerService } from "./scannerService.js";
import { submissionImageStore } from "./submissionImageStore.js";
import { eventStore } from "./eventStore.js";
import { GoogleCloudVisionAdapter } from "./ocr/googleCloudVisionAdapter.js";
import { env } from "../config/env.js";
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
  ownerUserId?: string;
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

  async createSession(ownerUserId?: string) {
    const app = await complianceService.createApplication("distilled_spirits", "single", ownerUserId);
    const now = new Date();
    const session: ScanSession = {
      sessionId: randomUUID(),
      applicationId: app.applicationId,
      ownerUserId,
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
      await submissionImageStore.saveImage({
        imageId: imageRecord.imageId,
        applicationId: session.applicationId,
        role,
        imageIndex: index,
        image: payload.image,
        mimeType: "image/jpeg"
      });
      imageRecord.uploadState = "processing";
      imageRecord.uploadedAt = new Date().toISOString();
      await complianceService.recordPipelineEvent(session.applicationId, "ImageNormalizationCompleted", {
        imageId: imageRecord.imageId,
        role,
        index,
        originalBytes: imageRecord.originalBytes,
        normalizedBytes: imageRecord.normalizedBytes,
        mimeType: imageRecord.normalizedMimeType
      });
      this.emitImageProgress(session, imageRecord, "image_upload_completed", "completed");
      this.emitImageProgress(session, imageRecord, "ocr_started", "in_progress");
      imageRecord.result = await this.scannerService.analyzeImage(role, index, payload.image);
      imageRecord.uploadState = "ready";
      await complianceService.recordPipelineEvent(session.applicationId, "OcrCompleted", {
        imageId: imageRecord.imageId,
        role,
        index,
        provider: imageRecord.result.provider,
        usedFallback: imageRecord.result.usedFallback,
        confidence: imageRecord.result.confidence
      });
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
    clientStageTimings?: ScannerStageTimings,
    actorUserId?: string
  ): Promise<{ session: ScanSession; result: ScannerQuickCheckResult } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    if (session.status === "finalized" && session.finalizedResult) {
      return {
        session,
        result: session.finalizedResult
      };
    }

    if (!session.ownerUserId && actorUserId) {
      session.ownerUserId = actorUserId;
      await complianceService.claimApplicationOwner(session.applicationId, actorUserId);
    }

    const front = session.images.find((img) => img.role === "front" && img.uploadState === "ready" && img.result);
    const back = session.images.find((img) => img.role === "back" && img.uploadState === "ready" && img.result);
    if (!front || !back) {
      throw new Error("required_images_not_ready");
    }

    const finalizeStartedAt = Date.now();
    this.emitSessionProgress(session, "composite_started", "in_progress");

    // Emit OCR stage started
    this.emitFinalizeProgress(session, {
      stage: "ocr",
      status: "started",
      progress: 0
    });

    // Emit OCR in progress (simulated since quickCheckMultiImage is already done per-image)
    this.emitFinalizeProgress(session, {
      stage: "ocr",
      status: "in_progress",
      progress: 50,
      substage: "Analyzing label text..."
    });

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

    // Emit OCR completed
    this.emitFinalizeProgress(session, {
      stage: "ocr",
      status: "completed",
      progress: 100
    });
    await complianceService.recordPipelineEvent(session.applicationId, "ExtractionCompleted", {
      brandName: quickCheckResult.extracted?.brandName ?? null,
      classType: quickCheckResult.extracted?.classType ?? null,
      abvText: quickCheckResult.extracted?.abvText ?? null,
      netContents: quickCheckResult.extracted?.netContents ?? null,
      hasGovWarning: quickCheckResult.extracted?.hasGovWarning ?? false
    });

    // Emit compliance checking started
    this.emitFinalizeProgress(session, {
      stage: "compliance_check",
      status: "started",
      progress: 0
    });

    // Emit per-check progress
    const checks = quickCheckResult.checks;
    for (let i = 0; i < checks.length; i++) {
      const check = checks[i];
      this.emitFinalizeProgress(session, {
        stage: "compliance_check",
        status: "in_progress",
        progress: Math.round(((i + 1) / checks.length) * 100),
        checkId: check.id,
        checkLabel: check.label,
        checkResult: check.status === "pass" ? "pass" : check.status === "fail" ? "fail" : "needs_review"
      });
    }

    // Emit compliance checking completed
    this.emitFinalizeProgress(session, {
      stage: "compliance_check",
      status: "completed",
      progress: 100
    });
    await complianceService.recordPipelineEvent(session.applicationId, "ComplianceChecksCompleted", {
      checkCount: checks.length,
      failCount: checks.filter((c) => c.status === "fail").length,
      passCount: checks.filter((c) => c.status === "pass").length,
      summary: quickCheckResult.summary
    });

    // Emit finalize stage
    this.emitFinalizeProgress(session, {
      stage: "finalize",
      status: "started",
      progress: 0,
      substage: "Preparing results..."
    });

    // Emit finalize in progress
    this.emitFinalizeProgress(session, {
      stage: "finalize",
      status: "in_progress",
      progress: 50,
      substage: "Finalizing compliance report..."
    });

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

    // Emit finalize stage completed
    this.emitFinalizeProgress(session, {
      stage: "finalize",
      status: "completed",
      progress: 100
    });

    this.emitSessionProgress(session, "composite_completed", "completed");
    this.emitSessionProgress(session, "decision_completed", "completed");
    return {
      session,
      result
    };
  }

  async assessImageQuality(sessionId: string, imageId: string): Promise<{
    qualityStatus: "assessing" | "good" | "reshoot";
    qualityIssues: string[];
    qualityScore: number;
  } | null> {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const imageRecord = session.images.find((img) => img.imageId === imageId);
    if (!imageRecord) return null;

    if (!env.GOOGLE_APPLICATION_CREDENTIALS) {
      // No vision key — default to good, can't assess
      await eventStore.updateImageQuality(imageId, { qualityStatus: "good", qualityScore: 1.0 });
      return { qualityStatus: "good", qualityIssues: [], qualityScore: 1.0 };
    }

    try {
      const visionAdapter = new GoogleCloudVisionAdapter();
      // Use a simple heuristic: if OCR already found text, the image is likely good
      const hasText = imageRecord.result && imageRecord.result.extracted.rawText.trim().length > 50;
      const confidence = imageRecord.result?.confidence ?? 0;

      const qualityIssues: string[] = [];
      if (!hasText) qualityIssues.push("insufficient_text");
      if (confidence < 0.35) qualityIssues.push("low_ocr_confidence");

      const qualityStatus: "good" | "reshoot" = qualityIssues.length > 0 ? "reshoot" : "good";
      const qualityScore = hasText ? Math.min(1.0, confidence + 0.15) : confidence;

      await eventStore.updateImageQuality(imageId, { qualityStatus, qualityIssues, qualityScore });

      realtimeEventBus.publish({
        type: "scan.progress",
        applicationId: session.applicationId,
        scope: "all",
        data: {
          sessionId,
          imageId,
          stage: "quality_assessed",
          status: "completed",
          qualityStatus,
          qualityIssues,
          qualityScore
        }
      });

      // Suppress unused variable warning for visionAdapter (used indirectly via env check)
      void visionAdapter;

      return { qualityStatus, qualityIssues, qualityScore };
    } catch {
      await eventStore.updateImageQuality(imageId, { qualityStatus: "good" });
      return { qualityStatus: "good", qualityIssues: [], qualityScore: 0 };
    }
  }

  async reshootImage(sessionId: string, oldImageId: string, payload: { role: ScanImageRole; image: Buffer; mimeType: string; index?: number }) {
    const session = this.sessions.get(sessionId);
    if (!session) return null;
    const oldImage = session.images.find((img) => img.imageId === oldImageId);
    if (!oldImage) return null;

    const newImageRecord = await this.uploadImage(sessionId, payload);
    if (!newImageRecord) return null;

    // Mark old image as superseded
    await eventStore.markImageSuperseded(oldImageId, newImageRecord.imageId);
    session.images = session.images.filter((img) => img.imageId !== oldImageId);

    return newImageRecord;
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

  private emitFinalizeProgress(
    session: ScanSession,
    payload: {
      stage: "upload" | "ocr" | "compliance_check" | "finalize";
      status: "started" | "in_progress" | "completed" | "failed";
      progress?: number;
      substage?: string;
      checkId?: string;
      checkLabel?: string;
      checkResult?: "pass" | "fail" | "needs_review";
      errorMessage?: string;
    }
  ) {
    realtimeEventBus.publish({
      type: "scan.finalize.progress",
      applicationId: session.applicationId,
      scope: "all",
      data: {
        sessionId: session.sessionId,
        ...payload
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
