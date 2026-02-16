import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().default(3000),
  LOG_LEVEL: z.string().default("info"),
  DATABASE_URL: z.string().default("postgres://alcomatcher:alcomatcher@db:5432/alcomatcher"),
  REDIS_URL: z.string().default("redis://redis:6379"),
  CORS_ORIGIN: z.string().default("http://localhost:8100")
});

export const env = envSchema.parse(process.env);
