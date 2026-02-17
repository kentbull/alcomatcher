import { Router } from "express";
import { z } from "zod";
import { complianceService } from "../services/complianceService.js";

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

const queueStatusSchema = z.enum([
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
]);

const appendCrdtOpsSchema = z.object({
  actorId: z.string().min(1),
  ops: z
    .array(
      z.object({
        sequence: z.number().int().nonnegative(),
        payload: z.record(z.unknown())
      })
    )
    .min(1)
    .max(500)
});

export const applicationRouter = Router();

applicationRouter.post("/api/applications", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await complianceService.createApplication(parsed.data.regulatoryProfile, parsed.data.submissionType);
  return res.status(201).json(created);
});

applicationRouter.post("/api/applications/:applicationId/sync", async (req, res) => {
  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const merged = await complianceService.mergeClientSync(req.params.applicationId, parsed.data.patch);
  if (!merged) return res.status(404).json({ error: "application_not_found" });

  return res.json(merged);
});

applicationRouter.post("/api/applications/:applicationId/crdt-ops", async (req, res) => {
  const parsed = appendCrdtOpsSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  try {
    const appended = await complianceService.appendCrdtOps(req.params.applicationId, parsed.data.actorId, parsed.data.ops);
    if (!appended) return res.status(404).json({ error: "application_not_found" });

    return res.status(202).json({ appendedCount: appended.length, ops: appended, syncState: "synced" });
  } catch (error) {
    return res.status(500).json({
      error: "crdt_sync_failed",
      detail: error instanceof Error ? error.message : "unknown_error"
    });
  }
});

applicationRouter.get("/api/applications/:applicationId/crdt-ops", async (req, res) => {
  const afterSequenceRaw = typeof req.query.afterSequence === "string" ? Number(req.query.afterSequence) : 0;
  const afterSequence = Number.isFinite(afterSequenceRaw) && afterSequenceRaw >= 0 ? afterSequenceRaw : 0;

  const ops = await complianceService.listCrdtOps(req.params.applicationId, afterSequence);
  if (!ops) return res.status(404).json({ error: "application_not_found" });

  return res.json({
    applicationId: req.params.applicationId,
    afterSequence,
    ops
  });
});

applicationRouter.get("/api/applications", async (_req, res) => {
  return res.json({ applications: await complianceService.listApplications() });
});

applicationRouter.get("/api/applications/:applicationId/events", async (req, res) => {
  return res.json({ events: await complianceService.getEvents(req.params.applicationId) });
});

applicationRouter.get("/api/applications/:applicationId/projection", async (req, res) => {
  const projection = await complianceService.getProjection(req.params.applicationId);
  if (!projection) return res.status(404).json({ error: "application_not_found" });

  return res.json({ projection });
});

applicationRouter.get("/api/applications/:applicationId/report", async (req, res) => {
  const report = await complianceService.buildComplianceReport(req.params.applicationId);
  if (!report) return res.status(404).json({ error: "application_not_found" });

  return res.json({ report });
});

applicationRouter.get("/api/admin/queue", async (req, res) => {
  const statusQuery = typeof req.query.status === "string" ? req.query.status : undefined;
  const parsedStatus = statusQuery ? queueStatusSchema.safeParse(statusQuery) : null;
  if (statusQuery && (!parsedStatus || !parsedStatus.success)) {
    return res.status(400).json({ error: "invalid_status_filter" });
  }

  const queue = await complianceService.listAdminQueue(parsedStatus?.success ? parsedStatus.data : undefined);
  return res.json({ queue });
});

applicationRouter.get("/api/admin/kpis", async (req, res) => {
  const windowHoursRaw = typeof req.query.windowHours === "string" ? Number(req.query.windowHours) : 24;
  const windowHours = Number.isFinite(windowHoursRaw) && windowHoursRaw > 0 ? Math.min(windowHoursRaw, 24 * 14) : 24;
  const kpis = await complianceService.getKpiSummary(windowHours);
  return res.json({ kpis });
});

applicationRouter.post("/api/admin/backfill/sync-state", async (_req, res) => {
  const result = await complianceService.backfillPendingSyncToSynced();
  return res.json({
    status: "ok",
    ...result
  });
});
