import { z } from "zod";
import { createModuleLogger } from "../shared/utils/logger.js";

const log = createModuleLogger('env');

const envSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),

  PORT: z.coerce.number().int().positive().default(3000),

  REDIS_HOST: z.string().min(1),

  REDIS_PORT: z.coerce.number().int().positive(),

  REDIS_PASSWORD: z.string().optional(),

  REDIS_DB: z.coerce.number().int().min(0).default(0),

  DB_HOST: z.string().min(1),

  DB_PORT: z.coerce.number().int().positive(),

  DB_USER: z.string().min(1),

  DB_PASSWORD: z.string(),

  DB_NAME: z.string().min(1),

  APP_URL: z.string().optional().default('http://localhost:5173'),

  CORS_ORIGINS: z.string().optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).optional().default('local'),

  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  log.error({ errors: parsed.error.flatten().fieldErrors }, "Invalid environment variables");
  process.exit(1);
}

export const env = parsed.data;
