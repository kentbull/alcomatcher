import { Router } from "express";
import { realtimeEventBus, type RealtimeEventEnvelope } from "../services/realtimeEventBus.js";

export const eventsRouter = Router();

function writeSseEvent(res: { write: (chunk: string) => void }, event: RealtimeEventEnvelope) {
  res.write(`id: ${event.eventId}\n`);
  res.write(`event: ${event.type}\n`);
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

eventsRouter.get("/api/events/stream", (req, res) => {
  const applicationId = typeof req.query.applicationId === "string" ? req.query.applicationId : undefined;
  const batchId = typeof req.query.batchId === "string" ? req.query.batchId : undefined;
  const scopeQuery = req.query.scope;
  const scope =
    scopeQuery === "mobile" || scopeQuery === "admin" || scopeQuery === "all"
      ? scopeQuery
      : undefined;

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

  const unsubscribe = realtimeEventBus.subscribe(
    {
      applicationId,
      batchId,
      scope
    },
    (event) => {
      writeSseEvent(res, event);
    }
  );

  const keepAlive = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 20000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsubscribe();
  });
});
