import type pino from "pino";

/**
 * Fail fast on missing runtime dependencies that are required for active API paths.
 */
export async function runStartupDependencyChecks(logger: pino.Logger): Promise<void> {
  await assertModule("yauzl", logger, "Batch ZIP upload parsing");
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
