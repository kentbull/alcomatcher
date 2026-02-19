import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().default("postgres://alcomatcher:alcomatcher@db:5432/alcomatcher"),
  REDIS_URL: z.string().default("redis://redis:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:8100"),
  JWT_SECRET: z.string().default("dev-only-change-me"),
  JWT_EXPIRES_HOURS: z.coerce.number().default(8),
  OTP_TTL_MINUTES: z.coerce.number().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().default(5),
  OTP_RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(300),
  OTP_RATE_LIMIT_MAX: z.coerce.number().default(8),
  OTP_VERIFY_RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(300),
  OTP_VERIFY_RATE_LIMIT_MAX: z.coerce.number().default(12),
  REGISTER_RATE_LIMIT_WINDOW_SEC: z.coerce.number().default(300),
  REGISTER_RATE_LIMIT_MAX: z.coerce.number().default(5),
  EMAIL_VERIFY_TTL_MINUTES: z.coerce.number().default(30),
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  RESEND_API_KEY: z.string().optional(),
  RESEND_FROM_EMAIL: z.string().optional(),
  HISTORY_IMAGE_STORAGE_ROOT: z.string().default("/var/lib/alcomatcher/submissions"),
  HISTORY_IMAGE_RETENTION_DAYS: z.coerce.number().default(30),
  APPLE_REVIEW_OTP_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  APPLE_REVIEW_EMAIL: z.string().default("reviewer@apple.com"),
  APPLE_REVIEW_OTP: z.string().optional(),
  AUTH_DEBUG_OTP: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  GOOGLE_APPLICATION_CREDENTIALS: z.string().optional(),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  SEMANTIC_EXTRACTION_ENABLED: z
    .string()
    .optional()
    .transform((value) => value === "true"),
  AUTH_SEED_USERS: z
    .string()
    .default(
      "officer@alcomatcher.com:compliance_officer;manager@alcomatcher.com:compliance_manager;reviewer@apple.com:compliance_officer"
    )
});

export const env = envSchema.parse(process.env);
