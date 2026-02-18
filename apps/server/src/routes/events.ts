import { Router } from "express";
import { authService } from "../services/authService.js";
import { complianceService } from "../services/complianceService.js";
import { realtimeEventBus, type RealtimeEventEnvelope } from "../services/realtimeEventBus.js";

export const eventsRouter = Router();

function writeSseEvent(res: { write: (chunk: string) => void }, event: RealtimeEventEnvelope) {
  res.write(`id: ${event.eventId}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

eventsRouter.get("/api/events/stream", async (req, res) => {
  const ticket = typeof req.query.ticket === "string" ? req.query.ticket : undefined;
  const authUser = req.authUser ?? (ticket ? (await authService.verifySseTicket(ticket)) ?? undefined : undefined);
  const applicationId = typeof req.query.applicationId === "string" ? req.query.applicationId : undefined;
  const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
  const scopeQuery = req.query.scope;
  const scope =
    scopeQuery === "mobile" || scopeQuery === "admin" || scopeQuery === "all"
      ? scopeQuery
      : undefined;

  if ((scope === "admin" || scope === "all") && authUser?.role !== "compliance_manager") {
    return res.status(403).json({ error: "forbidden_role" });
  }
  if (!authUser && scope === "admin") {
    return res.status(401).json({ error: "auth_required" });
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  writeSseEvent(res, {
    eventId: "connected",
    type: "application.status_changed",
    timestamp: new Date().toISOString(),
    scope: "all",
    data: {
      status: "connected"
    }
  });

  const handler = (event: RealtimeEventEnvelope) => {
    if (authUser && authUser.role === "compliance_officer" && event.applicationId) {
      void complianceService
        .canActorAccessApplication(event.applicationId, { userId: authUser.userId, role: authUser.role })
        .then((allowed) => {
          if (allowed) writeSseEvent(res, event);
        });
      return;
    }
    writeSseEvent(res, event);
  };

  const unsubscribe = realtimeEventBus.subscribe(
    {
      applicationId,
      batchId,
      scope
    },
    handler
  );

  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
