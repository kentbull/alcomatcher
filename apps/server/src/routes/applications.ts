import { Router } from "express";
import { z } from "zod";
import { ComplianceService } from "../services/complianceService.js";

const createSchema = z.object({
  regulatoryProfile: z.enum(["distilled_spirits", "wine", "malt_beverage"]).default("distilled_spirits"),
  submissionType: z.enum(["single", "batch"]).default("single")
});

const syncSchema = z.object({
  patch: z.object({
    status: z
      .enum([
        "captured",
        "scanned",
        "matched",
        "approved",
        "rejected",
        "needs_review",
        "batch_received",
        "batch_processing",
        "batch_partially_failed",
        "batch_completed"
      ])
      .optional(),
    syncState: z.enum(["synced", "pending_sync", "sync_failed"]).optional()
  })
});

export const applicationRouter = Router();
const complianceService = new ComplianceService();

applicationRouter.post("/api/applications", (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = complianceService.createApplication(parsed.data.regulatoryProfile, parsed.data.submissionType);
  return res.status(201).json(created);
});

applicationRouter.post("/api/applications/:applicationId/sync", (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const merged = complianceService.mergeClientSync(req.params.applicationId, parsed.data.patch);
  if (!merged) return res.status(404).json({ error: "application_not_found" });

  return res.json(merged);
});

applicationRouter.get("/api/applications", (_req, res) => {
  return res.json({ applications: complianceService.listApplications() });
});

applicationRouter.get("/api/applications/:applicationId/events", (req, res) => {
  return res.json({ events: complianceService.getEvents(req.params.applicationId) });
});
