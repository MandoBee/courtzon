import { z } from "zod";
import { createModuleLogger } from "../shared/utils/logger.js";

const log = createModuleLogger('env');

const isProd = process.env.NODE_ENV === 'production';

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

  JWT_SECRET: z.string().optional(),

  SESSION_SECRET: z
    .string()
    .min(32, "SESSION_SECRET must be at least 32 characters")
    .refine(
      (val) => !isProd || val !== 'dev-cookie-secret-change-in-production',
      "SESSION_SECRET must not be the default dev value in production"
    )
    .optional(),

  SUPER_ADMIN_EMAIL: z.string().email().optional(),
  SUPER_ADMIN_PASSWORD: z.string().min(8).optional(),

  STORAGE_PROVIDER: z.enum(['local', 's3', 'r2']).optional().default('local'),

  S3_ENDPOINT: z.string().optional(),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY: z.string().optional(),
  S3_SECRET_KEY: z.string().optional(),
  S3_REGION: z.string().optional(),
  S3_PUBLIC_URL: z.string().optional(),

  PAYMENT_GATEWAY_PROVIDER: z.enum(['mock', 'paymob', 'fawry']).optional().default('mock'),

  PAYMOB_API_KEY: z.string().optional(),
  PAYMOB_SECRET: z.string().optional(),
  PAYMOB_PUBLIC_KEY: z.string().optional(),
  PAYMOB_MERCHANT_ID: z.string().optional(),
  PAYMOB_HMAC_SECRET: z.string().optional(),
  PAYMOB_SANDBOX: z.string().optional().default('true'),

  WEBHOOK_BASE_URL: z.string().optional(),

  MAIL_TRANSPORT: z.string().optional(),
  MAIL_HOST: z.string().optional(),
  MAIL_PORT: z.string().optional(),
  MAIL_USER: z.string().optional(),
  MAIL_PASS: z.string().optional(),
  MAIL_FROM: z.string().optional(),

  LOG_LEVEL: z.string().optional(),
  RELAX_RATE_LIMIT: z.string().optional(),
  ENABLE_API_DOCS: z.string().optional(),
  METRICS_TOKEN: z.string().optional(),
  BACKUP_ENCRYPTION_KEY: z.string().optional(),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  log.error({ errors: parsed.error.flatten().fieldErrors }, "Invalid environment variables");
  process.exit(1);
}

if (isProd) {
  const required = ['SESSION_SECRET', 'DB_HOST', 'DB_PORT', 'DB_NAME', 'DB_USER', 'DB_PASSWORD'] as const;
  for (const key of required) {
    if (!parsed.data[key as keyof typeof parsed.data]) {
      log.error(`${key} is required in production`);
      process.exit(1);
    }
  }
  if (parsed.data.PAYMENT_GATEWAY_PROVIDER === 'mock') {
    log.error("PAYMENT_GATEWAY_PROVIDER must not be 'mock' in production");
    process.exit(1);
  }
}

export const env = parsed.data;
