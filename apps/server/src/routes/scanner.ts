import { Router } from "express";
import multer from "multer";
import { ScannerService } from "../services/scannerService.js";
import { complianceService } from "../services/complianceService.js";
import type { ExpectedLabelFields } from "../types/scanner.js";

const upload = multer({
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

const scannerService = new ScannerService();

export const scannerRouter = Router();

function requestIdFromRequest(req: { headers: Record<string, unknown> }) {
  const value = req.headers["x-request-id"];
  return typeof value === "string" ? value : "unknown_request";
}

scannerRouter.post("/api/scanner/quick-check", upload.single("photo"), async (req, res) => {
  const requestId = requestIdFromRequest(req as { headers: Record<string, unknown> });

  try {
    if (!req.file) {
      return res.status(400).json({ error: "photo_required", request_id: requestId });
    }

    const expected: ExpectedLabelFields = {
      brandName: typeof req.body.expectedBrandName === "string" ? req.body.expectedBrandName : undefined,
      classType: typeof req.body.expectedClassType === "string" ? req.body.expectedClassType : undefined,
      abvText: typeof req.body.expectedAbvText === "string" ? req.body.expectedAbvText : undefined,
      netContents: typeof req.body.expectedNetContents === "string" ? req.body.expectedNetContents : undefined,
      requireGovWarning: req.body.requireGovWarning === "true"
    };

    const hasExpectedFields = Object.values(expected).some((value) => value !== undefined && value !== "");

    const result = await scannerService.quickCheck(req.file.buffer, hasExpectedFields ? expected : undefined);

    let applicationId = typeof req.body.applicationId === "string" ? req.body.applicationId : undefined;
    if (!applicationId) {
      const created = await complianceService.createApplication("distilled_spirits", "single");
      applicationId = created.applicationId;
    }

    await complianceService.recordScannerQuickCheck(applicationId, result, hasExpectedFields ? expected : undefined);
    await complianceService.mergeClientSync(applicationId, {
      syncState: "pending_sync"
    });

    return res.json({ applicationId, ...result, request_id: requestId });
  } catch (error) {
    if (error instanceof multer.MulterError) {
      const errorCode = error.code === "LIMIT_FILE_SIZE" ? "photo_too_large" : "upload_failed";
      return res.status(400).json({
        error: errorCode,
        detail: errorCode === "photo_too_large" ? "Image exceeds 12MB upload limit" : error.code,
        request_id: requestId
      });
    }

    if (error instanceof Error && error.message === "invalid_file_type") {
      return res.status(400).json({
        error: "invalid_file_type",
        detail: "Only image uploads are supported",
        request_id: requestId
      });
    }

    return res.status(500).json({
      error: "scanner_quick_check_failed",
      detail: error instanceof Error ? error.message : "unknown_error",
      request_id: requestId
    });
  }
});
