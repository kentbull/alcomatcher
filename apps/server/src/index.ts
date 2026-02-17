import { randomUUID } from "node:crypto";
import cors from "cors";
import express from "express";
import pino from "pino";
import { env } from "./config/env.js";
import { applicationRouter } from "./routes/applications.js";
import { batchRouter } from "./routes/batches.js";
import { healthRouter } from "./routes/health.js";
import { scannerRouter } from "./routes/scanner.js";
import { siteRouter } from "./routes/site.js";

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
app.use(siteRouter);
app.use(healthRouter);
app.use(applicationRouter);
app.use(batchRouter);
app.use(scannerRouter);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "AlcoMatcher API listening");
});
