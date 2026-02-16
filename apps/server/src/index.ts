import cors from "cors";
import express from "express";
import pino from "pino";
import { env } from "./config/env.js";
import { applicationRouter } from "./routes/applications.js";
import { batchRouter } from "./routes/batches.js";
import { healthRouter } from "./routes/health.js";

const logger = pino({ level: env.LOG_LEVEL });
const app = express();

app.use(cors({ origin: env.CORS_ORIGIN }));
app.use(express.json());
app.use(healthRouter);
app.use(applicationRouter);
app.use(batchRouter);

app.listen(env.PORT, () => {
  logger.info({ port: env.PORT }, "AlcoMatcher API listening");
});
