import pino from "pino";

const logger = pino({ name: "alcomatcher-worker" });

logger.info("Worker foundation booted. Queue processors will be added in week one.");
setInterval(() => {
  logger.debug("Worker heartbeat");
}, 15000);
