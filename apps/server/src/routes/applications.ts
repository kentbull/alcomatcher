import { Router } from "express";
import { z } from "zod";
import { requireAuth, requireManager } from "../middleware/auth.js";
import { complianceService } from "../services/complianceService.js";
import { submissionImageStore } from "../services/submissionImageStore.js";

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
const syncStateSchema = z.enum(["synced", "pending_sync", "sync_failed"]);

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

applicationRouter.use("/api/admin", requireManager);
applicationRouter.use("/api/applications", requireAuth);
applicationRouter.use("/api/history", requireAuth);

applicationRouter.post("/api/applications", async (req, res) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const created = await complianceService.createApplication(parsed.data.regulatoryProfile, parsed.data.submissionType, req.authUser?.userId);
  return res.status(201).json(created);
});

applicationRouter.post("/api/applications/:applicationId/sync", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

  const parsed = syncSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.flatten() });

  const merged = await complianceService.mergeClientSync(req.params.applicationId, parsed.data.patch);
  if (!merged) return res.status(404).json({ error: "application_not_found" });

  return res.json(merged);
});

applicationRouter.post("/api/applications/:applicationId/claim-owner", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });

  const outcome = await complianceService.claimApplicationOwnerForActor(req.params.applicationId, actor.userId);
  if (outcome === "application_not_found") return res.status(404).json({ error: "application_not_found" });
  if (outcome === "already_owned_by_other") return res.status(409).json({ error: "already_owned_by_other" });
  return res.json({ status: outcome });
});

applicationRouter.post("/api/applications/:applicationId/crdt-ops", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

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
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

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
  if (!_req.authUser) return res.status(401).json({ error: "auth_required" });
  return res.json({
    applications: await complianceService.listApplicationsForActor({
      userId: _req.authUser.userId,
      role: _req.authUser.role
    })
  });
});

applicationRouter.get("/api/applications/:applicationId/events", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });
  return res.json({ events: await complianceService.getEvents(req.params.applicationId) });
});

applicationRouter.get("/api/applications/:applicationId/projection", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

  const projection = await complianceService.getProjection(req.params.applicationId);
  if (!projection) return res.status(404).json({ error: "application_not_found" });

  return res.json({ projection });
});

applicationRouter.get("/api/applications/:applicationId/report", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

  const report = await complianceService.buildComplianceReport(req.params.applicationId);
  if (!report) return res.status(404).json({ error: "application_not_found" });

  return res.json({ report });
});

applicationRouter.get("/api/history", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 20;
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 20;
  const cursor = typeof req.query.cursor === "string" ? req.query.cursor : undefined;
  const status = typeof req.query.status === "string" ? queueStatusSchema.safeParse(req.query.status) : null;
  const syncState = typeof req.query.syncState === "string" ? syncStateSchema.safeParse(req.query.syncState) : null;
  const createdByUserId = typeof req.query.createdByUserId === "string" ? req.query.createdByUserId : undefined;

  if (status && !status.success) return res.status(400).json({ error: "invalid_status_filter" });
  if (syncState && !syncState.success) return res.status(400).json({ error: "invalid_sync_state_filter" });

  const history = await complianceService.listHistoryForActor(
    { userId: actor.userId, role: actor.role },
    {
      limit,
      cursor,
      status: status?.success ? status.data : undefined,
      syncState: syncState?.success ? syncState.data : undefined,
      createdByUserId: actor.role === "compliance_manager" ? createdByUserId : undefined
    }
  );
  return res.json(history);
});

applicationRouter.get("/api/history/:applicationId", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

  const app = await complianceService.getApplication(req.params.applicationId);
  if (!app) return res.status(404).json({ error: "application_not_found" });
  const report = await complianceService.buildComplianceReport(req.params.applicationId);
  if (!report) return res.status(404).json({ error: "application_not_found" });
  const images = await submissionImageStore.listImages(req.params.applicationId);
  const ownerUserId = await complianceService.getApplicationOwner(req.params.applicationId);

  return res.json({
    application: {
      applicationId: app.applicationId,
      status: app.status,
      syncState: app.syncState,
      updatedAt: app.updatedAt,
      createdByUserId: ownerUserId
    },
    report,
    images: images.map((image) => ({
      imageId: image.imageId,
      role: image.role,
      index: image.imageIndex,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      createdAt: image.createdAt,
      thumbUrl: `/api/history/${req.params.applicationId}/images/${image.imageId}?variant=thumb`,
      fullUrl: `/api/history/${req.params.applicationId}/images/${image.imageId}?variant=full`
    }))
  });
});

applicationRouter.get("/api/history/:applicationId/images/:imageId", async (req, res) => {
  const actor = req.authUser;
  if (!actor) return res.status(401).json({ error: "auth_required" });
  const canAccess = await complianceService.canActorAccessApplication(req.params.applicationId, {
    userId: actor.userId,
    role: actor.role
  });
  if (!canAccess) return res.status(403).json({ error: "forbidden_application_access" });

  const variant = req.query.variant === "thumb" ? "thumb" : "full";
  const image = await submissionImageStore.loadImage(req.params.applicationId, req.params.imageId, variant);
  if (!image) return res.status(404).json({ error: "image_not_found" });
  res.setHeader("Cache-Control", "private, max-age=600");
  res.setHeader("Content-Type", image.mimeType || "image/jpeg");
  return res.status(200).send(image.data);
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
  const scopeParam = typeof _req.query.scope === "string" ? _req.query.scope : "terminal_only";
  const scope = scopeParam === "all" ? "all" : "terminal_only";
  const result = await complianceService.backfillPendingSyncToSynced(scope);
  return res.json({
    status: "ok",
    ...result
  });
});

applicationRouter.post("/api/admin/backfill/ownership", async (_req, res) => {
  const result = await complianceService.backfillMissingOwnershipClaims();
  return res.json({
    status: "ok",
    ...result
  });
});
