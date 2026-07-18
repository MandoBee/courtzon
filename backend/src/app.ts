import Fastify from "fastify";
import cors from "@fastify/cors";
import cookie from "@fastify/cookie";
import multipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import rateLimit from "@fastify/rate-limit";
import helmet from "@fastify/helmet";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { bookingRoutes } from "./modules/booking/presentation/booking.routes.js";
import { marketplaceRoutes } from "./modules/marketplace/presentation/marketplace.routes.js";
import { activitiesRoutes } from "./modules/activities/presentation/activities.routes.js";
import { communityRoutes } from "./modules/community/presentation/community.routes.js";
import { authRoutes } from "./modules/auth/presentation/auth.routes.js";
import { organisationRoutes } from "./modules/organisations/presentation/organisation.routes.js";
import { rbacRoutes } from "./modules/rbac/presentation/rbac.routes.js";
import { approvalRoutes } from "./modules/approvals/presentation/approval.routes.js";
import { walletRoutes } from "./modules/wallet/presentation/wallet.routes.js";
import { paymentRoutes } from "./modules/payment/presentation/payment.routes.js";
import { settlementRoutes } from "./modules/settlement/presentation/settlement.routes.js";
import { uploadRoutes } from "./modules/upload/presentation/upload.routes.js";
import { cmsRoutes } from "./modules/cms/presentation/cms.routes.js";
import { translationsRoutes } from "./modules/translations/presentation/translations.routes.js";
import { countriesRoutes } from "./modules/countries/presentation/countries.routes.js";
import { provincesRoutes } from "./modules/provinces/presentation/provinces.routes.js";
import { citiesRoutes } from "./modules/cities/presentation/cities.routes.js";
import { currenciesRoutes } from "./modules/currencies/presentation/currencies.routes.js";
import { languagesRoutes } from "./modules/languages/presentation/languages.routes.js";
import { reportsRoutes } from "./modules/reports/presentation/reports.routes.js";
import { transactionRoutes } from "./modules/financial/presentation/transaction.routes.js";
import { adminCategoryRoutes } from "./modules/marketplace/presentation/admin-categories.routes.js";
import { adminBrandRoutes } from "./modules/marketplace/presentation/admin-brand.routes.js";
import { adminTagRoutes } from "./modules/marketplace/presentation/admin-tag.routes.js";
import { auditLogRoutes } from "./modules/audit-log/index.js";
import { sidebarLayoutRoutes } from "./modules/sidebar-layout/presentation/sidebar-layout.routes.js";
import { securityRoutes } from "./modules/security/index.js";
import { amenitiesRoutes } from "./modules/amenities/presentation/amenities.routes.js";
import { banksRoutes } from "./modules/banks/presentation/banks.routes.js";
import { publicFeatureFlagsRoutes } from "./modules/rbac/presentation/feature-flags.routes.js";
import { notificationRoutes } from "./modules/notifications/presentation/notification.routes.js";
import { financialAdminRoutes } from "./modules/financial/presentation/financial-admin.routes.js";
import { couponRoutes } from "./modules/coupon/presentation/coupon.routes.js";
import { appearanceRoutes, designTokenRoutes, publicThemeRoutes } from "./modules/design-tokens/presentation/design-token.routes.js";
import { appSettingsRoutes } from "./modules/app-settings/presentation/app-settings.routes.js";
import { geoRoutes } from "./modules/geo/presentation/geo.routes.js";
import { matchRoutes } from "./modules/match/presentation/match.routes.js";
import { schedulingRoutes } from "./modules/scheduling/presentation/scheduling.routes.js";
import { createPool, getPool } from "./database/mysql.js";
import type mysql from "mysql2/promise";
import { AppError } from "./shared/errors/app-error.js";
import { formatZodErrorDetails, isZodError } from "./shared/validation/zod-error.util.js";
import { getHealth, healthDatabase, healthRedis, healthStorage } from "./infrastructure/health/health.service.js";
import { registerMetrics } from "./infrastructure/metrics/metrics.js";
import { createMaintenanceMiddleware } from "./shared/middleware/maintenance.middleware.js";
import { authMiddleware, initAuthMiddleware } from "./shared/middleware/auth.middleware.js";
import { initRouteGuard } from "./shared/middleware/route-guard.js";
import { appSettingsRepository } from "./modules/app-settings/infrastructure/repositories/app-settings.repository.js";
import { rbacRepository } from "./modules/rbac/infrastructure/repositories/rbac.repository.js";
import { createFeatureFlagMiddleware } from "./shared/middleware/feature-flag.middleware.js";

const isDev = process.env.NODE_ENV !== 'production';

const appUrl = process.env.APP_URL || '';
const corsOrigins = process.env.CORS_ORIGINS ? process.env.CORS_ORIGINS.split(',').map(s => s.trim()) : [];
export const ALLOWED_ORIGINS = [
  'https://courtzon.com',
  'https://www.courtzon.com',
  'https://admin.courtzon.com',
  'https://media.courtzon.com',
  'https://courtzon.cloud',
  'https://www.courtzon.cloud',
  'https://admin.courtzon.cloud',
  'http://localhost:5173',
  'http://localhost:5174',
  'http://127.0.0.1:5173',
  'http://127.0.0.1:5174',
  ...(appUrl ? [appUrl] : []),
  ...corsOrigins,
];

export const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || (isDev ? 'debug' : 'info'),
    ...(isDev && {
      transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss Z' } },
    }),
  },
  requestIdHeader: 'x-request-id',
  genReqId: () => randomUUID(),
  bodyLimit: 10 * 1024 * 1024, // 10MB
  trustProxy: true,
});

await app.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com", "blob:"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "data:", "https://fonts.gstatic.com", "https://fonts.googleapis.com", "https://cdn.jsdelivr.net"],
      connectSrc: ["'self'", ...ALLOWED_ORIGINS, "https://*.checkout.paymob.com"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      manifestSrc: ["'self'", "blob:"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: [],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
  xFrameOptions: { action: 'deny' },
  xXssProtection: false,
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
});

app.addHook('onRequest', async (_request, reply) => {
  reply.header('Permissions-Policy', 'payment=(self "https://accept.paymob.com" "https://accept.paymobsandbox.com" "https://accept.paymobsolutions.com" "https://*.checkout.paymob.com" "https://pay.google.com" "https://checkout.google.com")');
});

// Structured production logging — enrich every request log with IDs
app.addHook('onResponse', async (request, reply) => {
  if (process.env.NODE_ENV === 'production') {
    request.log.info({
      requestId: request.id,
      userId: (request as any).userId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      responseTime: reply.elapsedTime,
    }, 'request completed');
  }
});

const isDockerLocal = process.env.RELAX_RATE_LIMIT === 'true';

if (!isDev && !isDockerLocal) {
  app.addHook('onRequest', async (request, reply) => {
    const proto = request.headers['x-forwarded-proto'];
    if (proto && proto !== 'https') {
      return reply.redirect(`https://${request.hostname}${request.url}`);
    }
  });
}

const relaxRateLimit = isDev || process.env.RELAX_RATE_LIMIT === 'true';

await app.register(rateLimit, {
  max: relaxRateLimit ? 2000 : 100,
  timeWindow: '1 minute',
  keyGenerator: (request) => request.ip,
});

await app.register(cookie, {
  secret: process.env.SESSION_SECRET || (isDev ? 'dev-cookie-secret-change-in-production' : (() => { throw new Error('SESSION_SECRET is required in production'); })()),
});

await app.register(cors, {
  origin: (origin, cb) => {
    if (!origin || ALLOWED_ORIGINS.includes(origin)) {
      cb(null, true);
    } else if (isDev || isDockerLocal) {
      cb(null, true);
    } else {
      cb(new Error('Not allowed by CORS'), false);
    }
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Device-Fingerprint', 'X-Request-Id'],
});

createPool();

type RowData = mysql.RowDataPacket[];
const pool = getPool();

initAuthMiddleware({
  resolveUser: async (request) => {
    const { getSessionToken } = await import('./shared/utils/auth-cookies.js');
    const { hashToken } = await import('./shared/utils/token.js');
    const sessionToken = getSessionToken(request);
    if (!sessionToken) return null;
    const sessionTokenHash = hashToken(sessionToken);
    const [rows] = await pool.execute<RowData>(
      `SELECT user_id FROM user_sessions
       WHERE session_token_hash = ? AND is_revoked = FALSE AND expires_at > NOW()
       LIMIT 1`,
      [sessionTokenHash],
    );
    return rows.length ? Number(rows[0].user_id) : null;
  },
  checkRole: async (userId, roles) => {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT r.slug FROM user_roles ur
       JOIN roles r ON r.id = ur.role_id
       WHERE ur.user_id = ? AND ur.is_active = TRUE
         AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
         AND r.deleted_at IS NULL`,
      [userId],
    );
    const userRoles = rows.map((r: any) => r.slug);
    return roles.some((role) => userRoles.includes(role));
  },
  checkPermission: async (userId, permissions) => {
    const [rows] = await pool.execute<RowData>(
      `SELECT DISTINCT p.permission_key FROM user_roles ur
       JOIN role_permissions rp ON rp.role_id = ur.role_id
       JOIN permissions p ON p.id = rp.permission_id
       JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND (ur.expires_at IS NULL OR ur.expires_at > NOW())
          AND r.deleted_at IS NULL`,
      [userId],
    );
    const userPermissions = rows.map((r: any) => r.permission_key);
    return permissions.some((perm) => userPermissions.includes(perm));
  },
  checkOrgApproved: async (userId) => {
    const [orgRows] = await pool.execute<RowData>(
      `SELECT o.is_verified, o.is_active
       FROM organisations o
       JOIN organisation_types ot ON ot.id = o.org_type_id
       WHERE o.owner_id = ? AND ot.slug IN ('seller', 'player')
       ORDER BY o.created_at DESC LIMIT 1`,
      [userId],
    );
    if (orgRows.length && orgRows[0].is_active && orgRows[0].is_verified) return true;
    const [scopedRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND ur.is_active = TRUE
       LIMIT 1`,
      [userId],
    );
    return scopedRows.length > 0;
  },
});

initRouteGuard({
  checkOrgAccess: async (userId, orgId) => {
    const [rows] = await pool.execute<RowData>(
      `SELECT 1 FROM organisations WHERE id = ? AND (owner_id = ? OR ? IN (
        SELECT user_id FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND r.slug IN ('super_admin', 'super-admin', 'admin')
      )) LIMIT 1`,
      [orgId, userId, userId, userId],
    );
    if (rows.length) return true;
    const [orgRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_role_scopes urs
       JOIN user_roles ur ON ur.id = urs.user_role_id
       WHERE ur.user_id = ? AND urs.scope_type = 'organisation' AND urs.scope_id = ? AND ur.is_active = TRUE
       LIMIT 1`,
      [userId, orgId],
    );
    return orgRows.length > 0;
  },
  checkOrgManage: async (userId, orgId) => {
    const [ownerRows] = await pool.execute<RowData>(
      `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
      [orgId, userId],
    );
    if (ownerRows.length) return true;
    const [adminRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND r.slug IN ('super_admin', 'super-admin') LIMIT 1`,
      [userId],
    );
    if (adminRows.length) return true;
    const [mgrRows] = await pool.execute<RowData>(
      `SELECT 1
         FROM user_role_scopes urs
         JOIN user_roles ur ON ur.id = urs.user_role_id
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND urs.scope_type = 'organisation' AND urs.scope_id = ?
          AND p.permission_key = 'org.staff.manage'
        LIMIT 1`,
      [userId, orgId],
    );
    return mgrRows.length > 0;
  },
  checkOrgPermission: async (userId, orgId, permissionKey) => {
    const [ownerRows] = await pool.execute<RowData>(
      `SELECT 1 FROM organisations WHERE id = ? AND owner_id = ? LIMIT 1`,
      [orgId, userId],
    );
    if (ownerRows.length) return true;
    const [adminRows] = await pool.execute<RowData>(
      `SELECT 1 FROM user_roles ur JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND r.slug IN ('super_admin', 'super-admin') LIMIT 1`,
      [userId],
    );
    if (adminRows.length) return true;
    const [permRows] = await pool.execute<RowData>(
      `SELECT 1
         FROM user_role_scopes urs
         JOIN user_roles ur ON ur.id = urs.user_role_id
         JOIN role_permissions rp ON rp.role_id = ur.role_id
         JOIN permissions p ON p.id = rp.permission_id
        WHERE ur.user_id = ? AND ur.is_active = TRUE
          AND urs.scope_type = 'organisation' AND urs.scope_id = ?
          AND p.permission_key = ?
        LIMIT 1`,
      [userId, orgId, permissionKey],
    );
    return permRows.length > 0;
  },
});

const maintenanceMiddleware = createMaintenanceMiddleware(() => appSettingsRepository.listPublic());
const requireFeatureFlag = createFeatureFlagMiddleware((key) => rbacRepository.isFeatureEnabled(key));

// Global authentication — all routes are protected unless explicitly listed in authMiddleware's PUBLIC_PREFIXES
app.addHook('preHandler', authMiddleware);

app.addHook('onRequest', maintenanceMiddleware);

await app.register(multipart, {
  limits: {
    fileSize: 6 * 1024 * 1024,
    files: 6,
    fieldSize: 64 * 1024,
  },
});

await app.register(fastifyStatic, {
  root: join(import.meta.dirname, '..', 'uploads'),
  prefix: '/uploads/',
  decorateReply: false,
});

// OpenAPI / Swagger docs. Exposed in dev by default; in production only when
// ENABLE_API_DOCS=true (avoids leaking the full API surface). Registered before
// the route plugins so @fastify/swagger's dynamic mode captures every route.
const enableApiDocs = isDev || process.env.ENABLE_API_DOCS === 'true';
if (enableApiDocs) {
  await app.register(swagger, {
    openapi: {
      info: {
        title: 'CourtZon-V2 API',
        description:
          'Multi-tenant sports facility platform API. Auth uses HttpOnly session cookies set on POST /auth/login (also accepts Authorization: Bearer for API clients).',
        version: '1.0.0',
      },
      servers: [{ url: '/', description: 'Current host' }],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            description: 'Opaque session token returned by POST /auth/login.',
          },
        },
      },
      security: [{ bearerAuth: [] }],
    },
  });
  await app.register(swaggerUi, {
    routePrefix: '/docs',
    uiConfig: { docExpansion: 'list', deepLinking: true, tryItOutEnabled: true },
  });
  app.get('/openapi.json', async (_request, reply) => {
    return reply.send(app.swagger());
  });
  // Relax the strict global CSP only for the Swagger UI assets (it needs inline
  // script/style). Runs after helmet's onRequest hook so it overrides the header.
  app.addHook('onRequest', async (request, reply) => {
    if (request.url.startsWith('/docs')) {
      reply.header(
        'Content-Security-Policy',
        "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data:;"
      );
    }
  });
}

app.get("/health", async (_request, reply) => {
  const result = await getHealth();
  const statusCode = result.status === 'down' ? 503 : result.status === 'degraded' ? 200 : 200;
  return reply.status(statusCode).send(result);
});

app.get("/health/live", async (_request, reply) => {
  return reply.send({ status: 'ok', uptime: process.uptime() });
});

app.get("/health/ready", async (_request, reply) => {
  const result = await getHealth();
  const ok = result.status !== 'down';
  return reply.status(ok ? 200 : 503).send({
    status: ok ? 'ok' : 'down',
    checks: result.checks,
  });
});

app.get("/health/database", async (_request, reply) => {
  const result = await healthDatabase();
  return reply.status(result.status === 'down' ? 503 : 200).send(result);
});

app.get("/health/redis", async (_request, reply) => {
  const result = await healthRedis();
  return reply.status(result.status === 'down' ? 503 : 200).send(result);
});

app.get("/health/storage", async (_request, reply) => {
  const result = await healthStorage();
  return reply.status(result.status === 'down' ? 503 : 200).send(result);
});

app.get("/health/socket", async (_request, reply) => {
  try {
    const { getIO } = await import("./realtime/index.js");
    const io = getIO();
    const sockets = await io.fetchSockets();
    const rooms = new Set<string>();
    for (const s of sockets) { for (const r of s.rooms) rooms.add(r); }
    return reply.send({
      status: 'ok',
      connected: sockets.length,
      rooms: rooms.size,
    });
  } catch { return reply.send({ status: 'down', message: 'Socket.IO not initialized' }); }
});

app.get("/health/version", async (_request, reply) => {
  const { readFileSync } = await import('node:fs');
  const read = (path: string, envKey: string) => {
    try { return readFileSync(path, 'utf-8').trim(); }
    catch { return process.env[envKey] || 'unknown'; }
  };
  return reply.send({
    buildTime: read('/app/build-time.txt', 'BUILD_TIME'),
    gitCommit: read('/app/git-commit.txt', 'GIT_COMMIT'),
    applicationVersion: read('/app/version.txt', 'APP_VERSION'),
    expectedMigration: read('/app/expected-migration.txt', 'EXPECTED_MIGRATION'),
    nodeVersion: process.version,
    user: process.getuid?.() ?? 'unknown',
    pid: process.pid,
    ppid: process.ppid,
    storageProvider: process.env.STORAGE_PROVIDER || 'local',
  });
});

registerMetrics(app);

app.register(authRoutes, { requireFeatureFlag });
app.register(organisationRoutes);
app.register(rbacRoutes);
app.register(bookingRoutes);
app.register(marketplaceRoutes, { requireFeatureFlag });
app.register(walletRoutes);
app.register(paymentRoutes);
app.register(settlementRoutes);
app.register(activitiesRoutes, { requireFeatureFlag });
app.register(communityRoutes, { requireFeatureFlag });
app.register(cmsRoutes);
app.register(translationsRoutes);
app.register(countriesRoutes);
app.register(adminCategoryRoutes);
app.register(provincesRoutes);
app.register(citiesRoutes);
app.register(currenciesRoutes);
app.register(languagesRoutes);
app.register(reportsRoutes);
app.register(transactionRoutes);
app.register(uploadRoutes);
app.register(auditLogRoutes);
app.register(amenitiesRoutes);
  app.register(adminBrandRoutes);
app.register(adminTagRoutes);
  app.register(securityRoutes);
  app.register(approvalRoutes);
  app.register(banksRoutes);
  app.register(publicFeatureFlagsRoutes);
  app.register(geoRoutes);
  app.register(matchRoutes);
  app.register(schedulingRoutes);
  app.register(sidebarLayoutRoutes);
  app.register(notificationRoutes);
  app.register(financialAdminRoutes);
  app.register(couponRoutes);
  app.register(designTokenRoutes);
  app.register(appSettingsRoutes);
  app.register(publicThemeRoutes);
  app.register(appearanceRoutes);

app.setErrorHandler((error: any, _request, reply) => {
  app.log.error(error);

  if (error instanceof AppError) {
    return reply.status(error.statusCode).send({
      error: error.errorCode,
      message: error.message,
      details: error.details,
    });
  }

  if (isZodError(error)) {
    return reply.status(400).send({
      error: 'VALIDATION_ERROR',
      message: 'Invalid request data',
      details: formatZodErrorDetails(error),
    });
  }

  const statusCode = Number(error.statusCode);
  if (statusCode === 429) {
    return reply.status(429).send({
      error: 'RATE_LIMIT_EXCEEDED',
      message: error.message || 'Too many requests',
    });
  }

  if (statusCode >= 400 && statusCode < 500) {
    return reply.status(statusCode).send({
      error: error.code || 'VALIDATION_ERROR',
      message: error.message || 'Bad request',
    });
  }

  reply.status(500).send({
    error: 'INTERNAL_ERROR',
    message: isDev ? (error.message || 'Internal Server Error') : 'Internal Server Error',
  });
});