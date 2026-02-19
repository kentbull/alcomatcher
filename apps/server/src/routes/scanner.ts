import { Router } from "express";
import multer from "multer";
import { z } from "zod";
import { complianceService } from "../services/complianceService.js";
import { ScannerService } from "../services/scannerService.js";
import { scannerSessionService } from "../services/scannerSessionService.js";
import type { ExpectedLabelFields, ScanImageRole, ScannerStageTimings } from "../types/scanner.js";

const scannerRouter = Router();
export { scannerRouter };

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("invalid_file_type"));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 12 * 1024 * 1024
  }
});

const uploadBatch = multer({
  storage: multer.memoryStorage(),
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("invalid_file_type"));
      return;
    }
    cb(null, true);
  },
  limits: {
    fileSize: 12 * 1024 * 1024,
    files: 6
  }
});

const scannerService = new ScannerService();

const uploadRoleSchema = z.enum(["front", "back", "additional"]);

function requestIdFromRequest(req: { headers: Record<string, unknown> }) {
  const value = req.headers["x-request-id"];
  return typeof value === "string" ? value : "unknown_request";
}

function parseExpected(reqBody: Record<string, unknown>): ExpectedLabelFields {
  return {
    brandName: typeof reqBody.expectedBrandName === "string" ? reqBody.expectedBrandName : undefined,
    classType: typeof reqBody.expectedClassType === "string" ? reqBody.expectedClassType : undefined,
    abvText: typeof reqBody.expectedAbvText === "string" ? reqBody.expectedAbvText : undefined,
    netContents: typeof reqBody.expectedNetContents === "string" ? reqBody.expectedNetContents : undefined,
    requireGovWarning: reqBody.requireGovWarning === "true"
  };
}

function parseStageTimings(reqBody: Record<string, unknown>): ScannerStageTimings | undefined {
  const raw = reqBody.clientMetrics;
  if (!raw || typeof raw !== "object") return undefined;

  const toNumber = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
  const metrics = raw as Record<string, unknown>;
  return {
    sessionCreateMs: toNumber(metrics.sessionCreateMs),
    frontUploadMs: toNumber(metrics.frontUploadMs),
    frontOcrMs: toNumber(metrics.frontOcrMs),
    backUploadMs: toNumber(metrics.backUploadMs),
    backOcrMs: toNumber(metrics.backOcrMs),
    additionalUploadTotalMs: toNumber(metrics.additionalUploadTotalMs),
    finalizeMs: toNumber(metrics.finalizeMs),
    decisionTotalMs: toNumber(metrics.decisionTotalMs)
  };
}

function ensureNoMulterError(error: unknown, requestId: string) {
  if (error instanceof multer.MulterError) {
    const err = new Error(error.code === "LIMIT_FILE_SIZE" ? "photo_too_large" : "upload_failed");
    (err as Error & { requestId?: string }).requestId = requestId;
    throw err;
  }
}

scannerRouter.post(
  "/api/scanner/quick-check",
  uploadBatch.fields([
    { name: "frontPhoto", maxCount: 1 },
    { name: "backPhoto", maxCount: 1 },
    { name: "additionalPhotos", maxCount: 4 }
  ]),
  async (req, res) => {
    const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });
    try {
      const files = req.files as Record<string, Express.Multer.File[]> | undefined;
      const front = files?.frontPhoto?.[0];
      const back = files?.backPhoto?.[0];
      const additional = files?.additionalPhotos ?? [];
      if (!front) return res.status(400).json({ error: "front_photo_required", request_id: requestId });
      if (!back) return res.status(400).json({ error: "back_photo_required", request_id: requestId });
      if (additional.length > 4) return res.status(400).json({ error: "too_many_additional_photos", request_id: requestId });

      const expected = parseExpected(req.body as Record<string, unknown>);
      const startedAt = Date.now();
      const result = await scannerService.quickCheckMultiImage(
        [
          { role: "front", index: 0, image: front.buffer },
          { role: "back", index: 0, image: back.buffer },
          ...additional.map((file, index) => ({ role: "additional" as const, index, image: file.buffer }))
        ],
        expected
      );
      const resultWithTiming = {
        ...result,
        processingMs: Date.now() - startedAt
      };

      let applicationId = typeof req.body.applicationId === "string" ? req.body.applicationId : undefined;
      const actor = req.authUser;
      if (applicationId && actor) {
        const canAccess = await complianceService.canActorAccessApplication(applicationId, {
          userId: actor.userId,
          role: actor.role
        });
        if (!canAccess) {
          return res.status(403).json({ error: "forbidden_application_access", request_id: requestId });
        }
      }
      if (!applicationId) {
        const created = await complianceService.createApplication("distilled_spirits", "single", actor?.userId);
        applicationId = created.applicationId;
      }

      await complianceService.recordScannerQuickCheck(applicationId, resultWithTiming, expected);
      const expectsClientCrdtSync = req.headers["x-alcomatcher-client-sync"] === "crdt";
      await complianceService.mergeClientSync(applicationId, {
        syncState: expectsClientCrdtSync ? "pending_sync" : "synced"
      });

      return res.json({
        applicationId,
        ...resultWithTiming,
        request_id: requestId
      });
    } catch (error) {
      ensureNoMulterError(error, requestId);
      if (error instanceof Error && error.message === "invalid_file_type") {
        return res.status(400).json({
          error: "invalid_file_type",
          detail: "Only image uploads are supported",
          request_id: requestId
        });
      }
      if (error instanceof Error && error.message === "photo_too_large") {
        return res.status(400).json({
          error: "photo_too_large",
          detail: "Image exceeds 12MB upload limit",
          request_id: requestId
        });
      }

      return res.status(500).json({
        error: "scanner_quick_check_failed",
        detail: error instanceof Error ? error.message : "unknown_error",
        request_id: requestId
      });
    }
  }
);

scannerRouter.post("/api/scanner/sessions", async (_req, res) => {
  const session = await scannerSessionService.createSession(_req.authUser?.userId);
  return res.status(201).json({
    sessionId: session.sessionId,
    applicationId: session.applicationId,
    status: session.status,
    expiresAt: session.expiresAt
  });
});

scannerRouter.get("/api/scanner/sessions/:sessionId", (req, res) => {
  const session = scannerSessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "scan_session_not_found" });
  if (session.ownerUserId && req.authUser?.role !== "compliance_manager" && req.authUser?.userId !== session.ownerUserId) {
    return res.status(403).json({ error: "forbidden_session_access" });
  }
  if (session.ownerUserId && !req.authUser) return res.status(401).json({ error: "auth_required" });
  return res.json(session);
});

scannerRouter.post("/api/scanner/sessions/:sessionId/images", uploadSingle.single("image"), async (req, res) => {
  const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });
  try {
    if (!req.file) {
      return res.status(400).json({ error: "image_required", request_id: requestId });
    }
    const roleResult = uploadRoleSchema.safeParse(req.body.role);
    if (!roleResult.success) {
      return res.status(400).json({ error: "invalid_role", request_id: requestId });
    }
    const session = scannerSessionService.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });
    if (session.ownerUserId && req.authUser?.role !== "compliance_manager" && req.authUser?.userId !== session.ownerUserId) {
      return res.status(403).json({ error: "forbidden_session_access", request_id: requestId });
    }
    if (session.ownerUserId && !req.authUser) return res.status(401).json({ error: "auth_required", request_id: requestId });

    const role = roleResult.data as ScanImageRole;
    const indexRaw = typeof req.body.index === "string" ? Number(req.body.index) : undefined;
    const index = Number.isFinite(indexRaw) && indexRaw !== undefined && indexRaw >= 0 ? indexRaw : undefined;

    const image = await scannerSessionService.uploadImage(req.params.sessionId, {
      role,
      index,
      image: req.file.buffer,
      mimeType: req.file.mimetype
    });
    if (!image) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });
    return res.status(202).json({
      sessionId: req.params.sessionId,
      image
    });
  } catch (error) {
    ensureNoMulterError(error, requestId);
    if (error instanceof Error && error.message === "too_many_images") {
      return res.status(400).json({ error: "too_many_images", detail: "Maximum 6 total images", request_id: requestId });
    }
    return res.status(500).json({
      error: "scan_image_upload_failed",
      detail: error instanceof Error ? error.message : "unknown_error",
      request_id: requestId
    });
  }
});

scannerRouter.post("/api/scanner/sessions/:sessionId/images/:imageId/assess-quality", async (req, res) => {
  const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });
  const session = scannerSessionService.getSession(req.params.sessionId);
  if (!session) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });
  const quality = await scannerSessionService.assessImageQuality(req.params.sessionId, req.params.imageId);
  if (!quality) return res.status(404).json({ error: "image_not_found", request_id: requestId });
  return res.json({ imageId: req.params.imageId, ...quality, request_id: requestId });
});

scannerRouter.post("/api/scanner/sessions/:sessionId/images/:imageId/reshoot", uploadSingle.single("image"), async (req, res) => {
  const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });
  try {
    if (!req.file) return res.status(400).json({ error: "image_required", request_id: requestId });
    const roleResult = uploadRoleSchema.safeParse(req.body.role);
    if (!roleResult.success) return res.status(400).json({ error: "invalid_role", request_id: requestId });
    const session = scannerSessionService.getSession(req.params.sessionId);
    if (!session) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });

    const role = roleResult.data as ScanImageRole;
    const newImage = await scannerSessionService.reshootImage(req.params.sessionId, req.params.imageId, {
      role,
      image: req.file.buffer,
      mimeType: req.file.mimetype
    });
    if (!newImage) return res.status(404).json({ error: "image_not_found", request_id: requestId });
    return res.status(202).json({ sessionId: req.params.sessionId, image: newImage, request_id: requestId });
  } catch (error) {
    ensureNoMulterError(error, requestId);
    return res.status(500).json({
      error: "reshoot_failed",
      detail: error instanceof Error ? error.message : "unknown_error",
      request_id: requestId
    });
  }
});

scannerRouter.post("/api/scanner/sessions/:sessionId/finalize", async (req, res) => {
    const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });
    try {
      const session = scannerSessionService.getSession(req.params.sessionId);
      if (!session) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });
      if (session.ownerUserId && req.authUser?.role !== "compliance_manager" && req.authUser?.userId !== session.ownerUserId) {
        return res.status(403).json({ error: "forbidden_session_access", request_id: requestId });
      }
      if (session.ownerUserId && !req.authUser) return res.status(401).json({ error: "auth_required", request_id: requestId });

      const expected = parseExpected(req.body as Record<string, unknown>);
      const stageTimings = parseStageTimings(req.body as Record<string, unknown>);
      const clientSyncMode = req.headers["x-alcomatcher-client-sync"] === "crdt" ? "crdt" : "direct";
      const finalized = await scannerSessionService.finalizeSession(
        req.params.sessionId,
        expected,
        clientSyncMode,
        stageTimings,
        req.authUser?.userId
      );
    if (!finalized) return res.status(404).json({ error: "scan_session_not_found", request_id: requestId });
    return res.json({
      sessionId: finalized.session.sessionId,
      applicationId: finalized.session.applicationId,
      status: finalized.session.status,
      ...finalized.result,
      request_id: requestId
    });
  } catch (error) {
    if (error instanceof Error && error.message === "required_images_not_ready") {
      return res.status(400).json({
        error: "required_images_not_ready",
        detail: "Front and back images must be uploaded and processed before finalize",
        request_id: requestId
      });
    }
    return res.status(500).json({
      error: "scan_finalize_failed",
      detail: error instanceof Error ? error.message : "unknown_error",
      request_id: requestId
    });
  }
});
