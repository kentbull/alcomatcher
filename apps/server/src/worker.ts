import pino from "pino";
import { scannerSessionService } from "./services/scannerSessionService.js";

const logger = pino({ name: "alcomatcher-worker" });

logger.info("Worker foundation booted. Queue processors will be added in week one.");
setInterval(() => {
  const pruned = scannerSessionService.pruneStaleSessions(90 * 60 * 1000);
  logger.debug({ pruned }, "Worker heartbeat");
}, 15000);
