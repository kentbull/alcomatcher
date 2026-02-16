import { Router } from "express";
import multer from "multer";
import { ScannerService } from "../services/scannerService.js";

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

scannerRouter.post("/api/scanner/quick-check", upload.single("photo"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: "photo_required" });
    }

    const result = await scannerService.quickCheck(req.file.buffer);
    return res.json(result);
  } catch (error) {
    if (error instanceof multer.MulterError) {
      return res.status(400).json({
        error: "upload_failed",
        detail: error.code
      });
    }

    if (error instanceof Error && error.message === "invalid_file_type") {
      return res.status(400).json({
        error: "invalid_file_type",
        detail: "Only image uploads are supported"
      });
    }

    return res.status(500).json({
      error: "scanner_quick_check_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
