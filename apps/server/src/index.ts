import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import cors from "cors";
import express from "express";
import pino from "pino";
import { env } from "./config/env.js";
import { attachAuthUser } from "./middleware/auth.js";
import { applicationRouter } from "./routes/applications.js";
import { authRouter } from "./routes/auth.js";
import { batchRouter } from "./routes/batches.js";
import { eventsRouter } from "./routes/events.js";
import { healthRouter } from "./routes/health.js";
import { scannerRouter } from "./routes/scanner.js";
import { siteRouter } from "./routes/site.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const webDistPath = join(__dirname, "../../web/dist");

const logger = pino({ level: env.LOG_LEVEL });
const app = express();

const allowedOrigins = new Set([
  env.CORS_ORIGIN,
  "http://localhost:8100",
  "http://localhost:5173",
  "capacitor://localhost",
  "ionic://localhost"
]);

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.has(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("cors_not_allowed"));
    }
  })
);
app.use((req, res, next) => {
  const requestId = req.header("x-request-id") || randomUUID();
  res.setHeader("x-request-id", requestId);
  req.headers["x-request-id"] = requestId;
  next();
});
app.use(express.json());
app.use(attachAuthUser);

// Serve static files from web build
app.use(express.static(webDistPath));

app.use(siteRouter);
app.use(healthRouter);
app.use(authRouter);
app.use(eventsRouter);
app.use(applicationRouter);
app.use(batchRouter);
app.use(scannerRouter);

// Serve index.html for client-side routing (catch-all for non-API routes)
app.get("*", (req, res, next) => {
  // Skip API routes
  if (req.path.startsWith("/api/")) {
    return next();
  }
  // Serve admin.html for /admin routes
  if (req.path.startsWith("/admin")) {
    return res.sendFile(join(webDistPath, "admin.html"));
  }
  // Serve index.html for all other routes
  res.sendFile(join(webDistPath, "index.html"));
});

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "AlcoMatcher API listening");
});
