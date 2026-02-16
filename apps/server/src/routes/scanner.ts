import { Router } from "express";
import multer from "multer";
import { ScannerService } from "../services/scannerService.js";

const upload = multer({
  storage: multer.memoryStorage(),
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
    return res.status(500).json({
      error: "scanner_quick_check_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});
