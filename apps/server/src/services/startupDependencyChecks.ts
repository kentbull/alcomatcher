import { env } from "../config/env.js";
import type pino from "pino";

/**
 * Fail fast on missing runtime dependencies that are required for active API paths.
 */
export async function runStartupDependencyChecks(logger: pino.Logger): Promise<void> {
  await assertModule("yauzl", logger, "Batch ZIP upload parsing");
  if (!env.RESEND_API_KEY || !env.RESEND_FROM_EMAIL) {
    logger.warn(
      {
        resendApiKeyConfigured: Boolean(env.RESEND_API_KEY),
        resendFromEmailConfigured: Boolean(env.RESEND_FROM_EMAIL)
      },
      "Email provider not configured; registration verification and OTP send endpoints will return service-unavailable errors"
    );
  }
}

async function assertModule(moduleName: string, logger: pino.Logger, feature: string): Promise<void> {
  try {
    await import(moduleName);
    logger.info({ moduleName, feature }, "Startup dependency check passed");
  } catch (error) {
    logger.fatal(
      {
        moduleName,
        feature,
        err: error
      },
      "Startup dependency check failed"
    );
    throw new Error(`missing_runtime_dependency:${moduleName}`);
  }
}
