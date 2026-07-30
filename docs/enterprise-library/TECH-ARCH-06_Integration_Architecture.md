---
document_id: "TECH-ARCH-06"
document_name: "Integration Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer"]
difficulty: "advanced"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-06"]
  references: ["TECH-ARCH-01", "TECH-ARCH-07"]
  related: ["VOLUME-18"]
---

# CourtZon Integration Architecture

## 1. API Gateway Pattern

The integration module (`backend/src/modules/integration/`) implements the **API Gateway pattern** for external-facing RESTful APIs:

```
External Client
     │
     ├─→ X-API-Key header authentication
     │
     ▼
┌────────────────────────────────────────────┐
│         API Gateway (Fastify plugin)        │
│                                            │
│  /api/v1/api-keys        ──→ Admin manage  │
│  /api/v1/bookings        ──→ Read public   │
│  /api/v1/organisations   ──→ Read public   │
│  /api/v1/tournaments     ──→ Read public   │
│  /api/v1/leagues         ──→ Read public   │
│  /api/v1/academy/programs ─→ Read public   │
│  /api/v1/marketplace/products ─→ Read      │
└────────────────────────────────────────────┘
```

**Evidence:** `backend/src/modules/integration/index.ts:1` exports `apiGatewayRoutes`. `app.ts:540` registers the gateway: `app.register(apiGatewayRoutes)`.

## 2. Module Structure

```
backend/src/modules/integration/
├── index.ts                                    # Barrel export
├── presentation/
│   ├── integration.routes.ts                   # Route definitions (/api/v1/*)
│   └── integration.controller.ts               # Request handlers
├── middleware/
│   └── api-key-auth.ts                         # API key authentication
└── infrastructure/
    └── repositories/
        └── api-key.repository.ts               # API key CRUD + key hash lookup
```

**Evidence:** All 5 files exist in `backend/src/modules/integration/`.

## 3. API Key Authentication

```typescript
// backend/src/modules/integration/middleware/api-key-auth.ts:5-31
export async function apiKeyAuth(request: FastifyRequest, reply: FastifyReply): Promise<void> {
  const apiKey = request.headers['x-api-key'] as string | undefined;

  if (apiKey) {
    const hash = createHash('sha256').update(apiKey).digest('hex');
    const key = await apiKeyRepository.findByKeyHash(hash);
    if (!key) {
      reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Invalid or expired API key' });
      return;
    }
    (request as any).userId = key.user_id;
    (request as any).apiKeyId = key.id;
    (request as any).apiKeyScopes = key.scopes;
    (request as any).authType = 'api_key';
    apiKeyRepository.updateLastUsed(key.id).catch(() => {});
    return;
  }

  // Fallback to session auth
  const authHeader = request.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    (request as any).authType = 'session';
    return;
  }

  reply.status(401).send({ error: 'UNAUTHORIZED', message: 'Missing API key or authentication' });
}
```

**Evidence:** API keys are stored as SHA-256 hashes. The middleware supports both API key and session-based auth as fallback.

## 4. Versioned Endpoints

All external API endpoints are versioned under `/api/v1/`:

```typescript
// backend/src/modules/integration/presentation/integration.routes.ts:6-26
export async function apiGatewayRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', authMiddleware);

  // API Key Management
  app.post('/api/v1/api-keys', { preHandler: [requirePermission(['integration.api-keys.manage'])] }, ctrl.createApiKeyHandler);
  app.get('/api/v1/api-keys', { preHandler: [requirePermission(['integration.api-keys.view'])] }, ctrl.listApiKeysHandler);
  app.delete('/api/v1/api-keys/:id', { preHandler: [requirePermission(['integration.api-keys.manage'])] }, ctrl.revokeApiKeyHandler);

  // Public API Gateway (api-key auth or session auth)
  app.get('/api/v1/bookings', { preHandler: [apiKeyAuth] }, ctrl.gatewayListBookingsHandler);
  app.get('/api/v1/bookings/:id', { preHandler: [apiKeyAuth] }, ctrl.gatewayGetBookingHandler);
  app.get('/api/v1/organisations', { preHandler: [apiKeyAuth] }, ctrl.gatewayListOrganisationsHandler);
  app.get('/api/v1/tournaments', { preHandler: [apiKeyAuth] }, ctrl.gatewayListTournamentsHandler);
  app.get('/api/v1/tournaments/:id', { preHandler: [apiKeyAuth] }, ctrl.gatewayGetTournamentHandler);
  app.get('/api/v1/academy/programs', { preHandler: [apiKeyAuth] }, ctrl.gatewayListAcademyProgramsHandler);
  app.get('/api/v1/marketplace/products', { preHandler: [apiKeyAuth] }, ctrl.gatewayListProductsHandler);
  app.get('/api/v1/leagues', { preHandler: [apiKeyAuth] }, ctrl.gatewayListLeaguesHandler);
}
```

**Evidence:** All 8 public endpoints are registered under `/api/v1/`. Admin endpoints for API key management require `integration.api-keys.manage` permission.

## 5. Webhook Delivery System

The notification module handles webhook delivery to external systems:

```sql
notification_webhooks (
  id BIGINT PRIMARY KEY AUTO_INCREMENT,
  url VARCHAR(2048) NOT NULL,
  secret VARCHAR(255) NOT NULL,        -- HMAC signing key
  events JSON NOT NULL,                 -- Which events trigger this webhook
  is_active BOOLEAN DEFAULT TRUE,
  retry_count INT DEFAULT 0,
  last_sent_at DATETIME(3),
  last_status VARCHAR(50),
  created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP
);
```

**Flow:**
```
Event emitted
  → Matched webhook subscription
    → HMAC-SHA256 signature generated (signing with secret)
      → HTTP POST to webhook URL
        → Payload includes: event_name, event_id, occurred_at, data, signature
          → On failure: retry with exponential backoff (max 6 attempts)
            → Dead letter queue after max retries
```

**Evidence:** `backend/src/infrastructure/queue/queue.service.ts:7-14` includes job types for notification processing. Dead letter processing is handled by `process_dead_letter` and `retry_failed_deliveries` job types.

## 6. Third-Party Integrations

### Payment Gateway (Paymob)
```
POST /payments/webhook ← Paymob callback
  → Signature verification
    → Payment status update
      → Wallet credit/debit
        → Event emission (payment:received / payment:failed)
```

**Evidence:** CSP in `app.ts:125` allows `connectSrc` to `https://*.checkout.paymob.com`. `app.ts:145` sets Permissions-Policy for Paymob. `app.ts:94` adds `/payments/webhook` to the public route prefixes in `auth.middleware.ts:94`.

### SMS (Twilio/Vonage)
```
eventBusV2.on('notification:send-sms')
  → SMS provider selection (Twilio or Vonage)
    → Rate-limited dispatch
      → Delivery status tracking
```

**Evidence:** `queue.service.ts:7-14` lists `process_notification` and `send_notification_batch` job types for SMS delivery.

### Email (Nodemailer)
```
eventBusV2.on('notification:send-email')
  → Nodemailer transport
    → HTML template rendering
      → SMTP delivery
        → Bounce/status tracking
```

**Evidence:** `backend/package.json:45` lists `nodemailer: ^8.0.7`. `queue.service.ts:22-28` defines `SendEmailJob` interface with `to`, `subject`, `body`, `html`, `attachments`.

## 7. Feature Flag Integration

Routes can be gated by feature flags:

```typescript
// app.ts:344
const requireFeatureFlag = createFeatureFlagMiddleware((key) => rbacRepository.isFeatureEnabled(key));

// Route registration with feature flag
app.register(marketplaceRoutes, { requireFeatureFlag });
app.register(activitiesRoutes, { requireFeatureFlag });
app.register(communityRoutes, { requireFeatureFlag });
```

**Evidence:** `app.ts:344` initializes the feature flag middleware. `app.ts:484-489` passes feature flags to route registrations.

## 8. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-ARCH-07 | Security Architecture (API key auth) |
| VOLUME-18 | Integrations (pending volume) |

## 9. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
