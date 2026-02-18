import pino from "pino";
import { authService } from "./services/authService.js";
import { scannerSessionService } from "./services/scannerSessionService.js";
import { submissionImageStore } from "./services/submissionImageStore.js";

const logger = pino({ name: "alcomatcher-worker" });

logger.info("Worker foundation booted. Queue processors will be added in week one.");
setInterval(() => {
  void authService
    .dispatchPendingOtpEmails(20)
    .then((otpDispatch) => {
      if (otpDispatch.processed > 0) {
        logger.debug({ otpDispatch }, "Worker OTP heartbeat");
      }
    })
    .catch((error) => {
      logger.warn({ err: error }, "Worker OTP heartbeat failure");
    });
}, 2000);

setInterval(() => {
  const pruned = scannerSessionService.pruneStaleSessions(90 * 60 * 1000);
  void Promise.all([
    submissionImageStore.pruneExpired(),
    authService.dispatchPendingVerificationEmails(10),
    authService.pruneExpiredVerificationChallenges().then((deleted) => ({ deletedVerificationChallenges: deleted }))
  ])
    .then(([historyPrune, verificationDispatch, verificationPrune]) => {
      logger.debug({ prunedSessions: pruned, ...historyPrune, verificationDispatch, ...verificationPrune }, "Worker heartbeat");
    })
    .catch((error) => {
      logger.warn({ err: error }, "Worker heartbeat failure");
    });
}, 15000);
