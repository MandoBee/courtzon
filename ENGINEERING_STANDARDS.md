# CourtZon Engineering Quality Gates

> **Effective date:** 2026-07-04  
> **Scope:** All pull requests — frontend, backend, database, infrastructure  
> **Rule:** No merge until all MANDATORY checks pass. Recommended items must have a documented exception if skipped.

## Related Documents

| Document | Purpose |
|----------|---------|
| [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md) | Condensed checklist — what must pass before a feature is complete |
| [docs/adr/001-payment-architecture.md](docs/adr/001-payment-architecture.md) | Payment architecture — webhook, gateway, intents, idempotency |
| [docs/adr/002-api-response-standard.md](docs/adr/002-api-response-standard.md) | API response envelope — consistent `{ data, error }` shapes |
| [docs/adr/003-react-query-strategy.md](docs/adr/003-react-query-strategy.md) | React Query — staleTime, invalidation, polling, no optimistic updates |
| [docs/adr/004-logging-strategy.md](docs/adr/004-logging-strategy.md) | Structured logging — Pino, traceId, redaction, no console.log |
| [docs/adr/005-health-endpoint-strategy.md](docs/adr/005-health-endpoint-strategy.md) | Health endpoints — liveness, readiness, version, payment health |
| [docs/adr/006-deployment-strategy.md](docs/adr/006-deployment-strategy.md) | Deployment — migration-first, build metadata, backup, rollback |
| [docs/adr/007-security-model.md](docs/adr/007-security-model.md) | Security — auth, CORS, CSP, HMAC, upload hardening, secrets |

---

## Legend

| Symbol | Meaning |
|--------|---------|
| 🛑 **MANDATORY** | Must pass. Block merge. |
| ⚠️ **RECOMMENDED** | Should pass. Exception must be documented. |
| 💡 **OPTIONAL** | Nice to have. No blocker. |

---

## 1. Architecture (5 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| ARC-01 | 🛑 | New module follows existing folder convention (`src/modules/<name>/presentation/`, `application/`, `infrastructure/`, `domain/`) | Manual file review |
| ARC-02 | 🛑 | No circular imports between modules | `madge --circular src/` or manual review |
| ARC-03 | ⚠️ | New shared code placed in `shared/`, not duplicated | Search for duplicate function signatures |
| ARC-04 | ⚠️ | Gateway/factory pattern used for external services (payments, email, storage) | Check for hardcoded provider-specific code |
| ARC-05 | 💡 | No new dependency added without evaluating bundle size impact | Check `package.json` diff |

---

## 2. Security (8 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| SEC-01 | 🛑 | No hardcoded secrets (API keys, passwords, tokens) in source code | `grep -rE "(sk_live|pk_live|secret_key|password\s*=\s*['\"]\w)" src/ --exclude-dir=node_modules` |
| SEC-02 | 🛑 | SQL queries use parameterized placeholders (`?`), never string interpolation | `grep -rE "\\$\{.*\}" src/` in SQL contexts; review all `${}` in query strings |
| SEC-03 | 🛑 | All new API routes are protected by `authMiddleware` unless explicitly added to `PUBLIC_PREFIXES` in `auth.middleware.ts` | Check new routes file; verify middleware registration |
| SEC-04 | 🛑 | File uploads validate MIME type, extension blocklist, and magic bytes | Review upload handler for `validateFile()` or equivalent |
| SEC-05 | ⚠️ | Rate limiting exists on auth endpoints (`/auth/login`, `/auth/register`, `/auth/forgot-password`) | Check route registration for `rateLimit` config |
| SEC-06 | ⚠️ | HMAC/webhook signature validated for any new webhook endpoints | Check for `verifyWebhook()` or HMAC comparison |
| SEC-07 | 💡 | New permissions registered in `frontend/src/permissions/registry.ts` and synced via `node backend/scripts/sync-ui-registry.js` | Check registry diff; verify sync was run |
| SEC-08 | 💡 | Sensitive columns excluded from API responses (passwords, secrets, internal IDs) | Check DTO/response serialization |

---

## 3. Validation — Zod (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| VAL-01 | 🛑 | Every new POST/PUT/PATCH endpoint has a Zod schema validating `request.body` | Search for `request.body as any` in new/changed controller files |
| VAL-02 | 🛑 | Zod schemas validate types, ranges, lengths, and required fields — not just existence | Review schema for `.min()`, `.max()`, `.email()`, `.int()`, etc. |
| VAL-03 | ⚠️ | Query parameters validated with Zod `.optional().default()` pattern | Check for `request.query as any` in new code |
| VAL-04 | ⚠️ | Environment variables validated via `env.ts` schema if new vars are added | Check `.env.example` and `env.ts` for corresponding entries |

---

## 4. Transactions (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| TXN-01 | 🛑 | Multi-table mutating operations use `beginTransaction()` + `commit()` / `rollback()` | Search for multiple `INSERT`/`UPDATE`/`DELETE` in a single handler without `beginTransaction` |
| TXN-02 | ⚠️ | Payment/booking/wallet mutations use `FOR UPDATE` pessimistic locking when reading balance/state before writing | Search for balance reads without `FOR UPDATE` in transaction context |
| TXN-03 | 💡 | Check `conn.rollback()` is reached on all error paths within a transaction | Review catch blocks inside transactions |

---

## 5. Idempotency (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| IDEM-01 | 🛑 | Webhook handlers use UNIQUE constraint on gateway reference to prevent duplicate processing | Verify `UNIQUE` key exists on `gateway_reference` column; check insert is wrapped in try/catch for duplicate key |
| IDEM-02 | 🛑 | Status-transition mutations check current state before updating (no double-confirm, no double-refund) | Look for `WHERE status = 'pending'` or `WHERE payment_status NOT IN ('paid','refunded')` |
| IDEM-03 | ⚠️ | Booking intent fulfillment checks `fulfilled_booking_id` before creating duplicate booking | Check `fulfillBookingIntent` for early-return pattern |
| IDEM-04 | ⚠️ | POST endpoints that create resources return 409 Conflict on duplicate, not 500 | Check for ConflictError usage or UNIQUE constraint handling |

---

## 6. Logging (5 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| LOG-01 | 🛑 | No `console.log()` in production code — use `createModuleLogger()` from `shared/utils/logger.js` | `grep -r "console.log" src/ --exclude-dir=node_modules` |
| LOG-02 | 🛑 | All payment operations log with `traceId` for end-to-end correlation | Search payment code for `log.info({ traceId, ... })` |
| LOG-03 | ⚠️ | State-changing operations log before-and-after state (audit trail) | Check for `log.info({ oldStatus, newStatus })` patterns |
| LOG-04 | ⚠️ | Errors include contextual fields (`userId`, `entityId`, `gatewayRef`) not just message strings | Check `log.error({ err, userId, ... })` not `log.error(err.message)` |
| LOG-05 | 💡 | Timer/latency metrics logged for external calls (gateway, email, storage) | Check for perf measurement patterns |

---

## 7. Audit (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| AUD-01 | 🛑 | All state-changing operations call `recordAudit()` with `actorId`, `action`, `entityType`, `entityId` | Check controllers for `recordAudit()` call after every POST/PUT/PATCH/DELETE |
| AUD-02 | ⚠️ | Audit entries include `traceId` if a payment operation | Check `afterState` for traceId inclusion |
| AUD-03 | 💡 | Sensitive operations log `beforeState` and `afterState` for diff tracking | Check for `beforeState:` parameter in audit call |

---

## 8. Metrics (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| MET-01 | ⚠️ | New API routes are picked up by Prometheus (`courtzon_http_request_duration_seconds`, `courtzon_http_requests_total`) | Verify route matches `metrics.ts` wildcard patterns |
| MET-02 | ⚠️ | Cron jobs log success/failure counts for dashboard visibility | Check cron handler for `log.info({ synced: X, total: Y })` |
| MET-03 | 💡 | Business metrics exposed (orders created, bookings confirmed, payments collected) | Check for custom Prometheus counter/gauge registration |

---

## 9. Health Checks (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| HLT-01 | 🛑 | New external dependency (DB table, Redis key, filesystem path) verified in `getHealth()` if it would break a core feature on failure | Check `health.service.ts` for corresponding check |
| HLT-02 | ⚠️ | `GET /payments/health` returns accurate status after changes to payment module | `curl http://localhost:3000/payments/health` — verify `gatewayConfigured` and `migrationSynced` |
| HLT-03 | 💡 | Dockerfile writes `build-time.txt`, `version.txt`, `git-commit.txt` for deployment verification | Check Dockerfile for `RUN ... > /app/` commands |

---

## 10. Performance (5 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| PRF-01 | 🛑 | New database queries have covering indexes for WHERE/JOIN/ORDER BY clauses | `EXPLAIN` the query on a production-sized dataset |
| PRF-02 | ⚠️ | No N+1 queries in list endpoints — use JOINs or batch queries | Review repository code for loop-based queries |
| PRF-03 | ⚠️ | Pagination uses `LIMIT`/`OFFSET` with bounded limits (max 100-500) | Check `limitClause()` usage |
| PRF-04 | 💡 | Heavily queried static data uses Redis caching (sports, countries, amenities) | Check for Redis `GET`/`SET` in repository layer |
| PRF-05 | 💡 | Connection pool configured for expected load (`connectionLimit` ≥ 20 for production) | Check `mysql.ts` config |

---

## 11. Database Indexes (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| DB-01 | 🛑 | New migration is additive only (ALTER TABLE ADD, CREATE INDEX) — no DROP, TRUNCATE, DELETE | Review migration SQL |
| DB-02 | 🛑 | New migration has a unique, sequential prefix (`009_`, `010_`, etc.) | Check filename against existing migrations |
| DB-03 | ⚠️ | Foreign keys have corresponding indexes | Check `CREATE TABLE` for FK columns without KEY |
| DB-04 | ⚠️ | Common query patterns have composite indexes (e.g., `(user_id, created_at)`, `(organisation_id, status)`) | Review query patterns in new repository code |

---

## 12. API Response Consistency (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| API-01 | 🛑 | List endpoints return `{ data: [...], total, page, limit }` (pagination metadata consistent) | Check all new GET list handlers |
| API-02 | 🛑 | Single-entity endpoints return `{ data: { ... } }` with consistent wrapping | Check non-paginated GET handlers |
| API-03 | 🛑 | Error responses use `{ error: "ERROR_CODE", message: "Human-readable" }` format — not raw strings | Check `reply.status(4xx/5xx).send()` pattern |
| API-04 | ⚠️ | Mutation responses return the created/updated entity for immediate UI update | Check POST/PUT handlers return entity in `{ data: entity }` |

---

## 13. React Query Cache Strategy (5 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| RQ-01 | 🛑 | Every mutation invalidates the affected query after success — no stale UI | Check `useMutation.onSuccess` for `queryClient.invalidateQueries()` |
| RQ-02 | 🛑 | Invalidation targets the exact query key, never a broader key by accident | Verify `{ queryKey: ['resources', branchId] }` matches the query exactly |
| RQ-03 | ⚠️ | `staleTime` is set explicitly when different from global default (30s) | Check for `staleTime:` in new `useQuery` calls with justification |
| RQ-04 | ⚠️ | Polling (`refetchInterval`) is bounded with a timeout and cleanup | Check `useEffect` return for `clearInterval` or `stop` flag |
| RQ-05 | 💡 | Shared query keys are consistent across components (same structure, same types) | Search for duplicate query key patterns |

---

## 14. Tests (5 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| TST-01 | 🛑 | Payment/booking/wallet mutations have at least one integration test | Check `__tests__/` directory for relevant spec file |
| TST-02 | ⚠️ | Idempotency is tested — duplicate webhook/request returns correct response | Check for test case with two identical requests |
| TST-03 | ⚠️ | Error paths are tested — invalid input returns 400, missing entity returns 404 | Check test assertions for error status codes |
| TST-04 | 💡 | Frontend components have basic render tests | Check `.test.tsx` or `.spec.tsx` files |
| TST-05 | 💡 | All `tsc` and `npm run build` pass before merge | CI pipeline must include build step |

---

## 16. Docker (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| DKR-01 | 🛑 | `docker compose build` succeeds for changed services | Run build in CI |
| DKR-02 | 🛑 | Dockerfile includes HEALTHCHECK instruction | Check `HEALTHCHECK --interval=30s ...` in Dockerfile |
| DKR-03 | ⚠️ | Build args passed for `GIT_COMMIT` in `docker-compose.yml` for backend service | Check `build.args` section |
| DKR-04 | ⚠️ | Resource limits set in `docker-compose.yml` for new services | Check `deploy.resources.limits` and `reservations` |

---

## 17. Coolify Deployment (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| CLF-01 | ⚠️ | Environment variables set in Coolify dashboard match `.env.example` | Manual verification |
| CLF-02 | ⚠️ | Health check URL configured in Coolify (`/health/live`) | Check Coolify service settings |
| CLF-03 | 💡 | Auto-deploy trigger enabled for `master` branch | Check Coolify source configuration |

---

## 18. Deployment (4 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| DEP-01 | 🛑 | All pending migrations applied before deploy | `ls database/migrations/` and check `migration_history` table |
| DEP-02 | 🛑 | Database backed up before deploy | Verify backup script ran; check `backups/` directory |
| DEP-03 | ⚠️ | Health endpoints return OK after deploy | `curl /health/live` and `curl /payments/health` |
| DEP-04 | 💡 | Smoke tests pass (auth, booking, payment, marketplace) | Run smoke test script |

---

## 19. Rollback (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| ROL-01 | 🛑 | Migration scripts are backward-compatible (additive only) | Verify no DROP/TRUNCATE/DELETE in migrations |
| ROL-02 | ⚠️ | Previous Docker image is tagged and available for rollback | `docker images | grep courtzon-backend` |
| ROL-03 | 💡 | Rollback procedure is documented and tested | Check for rollback doc or script |

---

## 20. Documentation + Production Verification (3 checks)

| ID | Priority | Check | How to Verify |
|----|----------|-------|---------------|
| DOC-01 | 🛑 | New environment variables documented in `.env.example` | Check diff for new entries |
| DOC-02 | ⚠️ | New API endpoints documented (Swagger/OpenAPI or README) | Check route registration is discoverable |
| DOC-03 | 💡 | Architecture decision records for significant design choices | Check for ADR or equivalent doc |

---

# PR Review Template

**Copy this template into every PR description.**  
**For deployment readiness, also review [DEFINITION_OF_DONE.md](../DEFINITION_OF_DONE.md).**

```markdown
## Quality Gates

### Mandatory (must pass)
- [ ] **VAL-01**: All new endpoints have Zod validation (no `request.body as any`)
- [ ] **SEC-01**: No hardcoded secrets
- [ ] **SEC-02**: SQL queries use parameterized placeholders
- [ ] **TXN-01**: Multi-table mutations use transactions
- [ ] **LOG-01**: No `console.log` in production code
- [ ] **AUD-01**: State-changing ops call `recordAudit()`
- [ ] **RQ-01**: Mutations invalidate affected queries on success
- [ ] **API-01/02**: Responses use consistent envelope
- [ ] **DB-01**: Migration is additive only
- [ ] **DB-02**: Migration has unique sequential prefix
- [ ] **DEP-01**: Migrations applied before deploy
- [ ] **DEP-02**: Database backed up before deploy
- [ ] **TST-05**: `npm run build` passes for both backend and frontend

### Recommended (must pass or have documented exception)
- [ ] **SEC-05**: Rate limiting on auth endpoints
- [ ] **RQ-02**: Invalidation targets exact query key
- [ ] **MET-01**: New routes visible in Prometheus metrics
- [ ] **HLT-02**: Payment health endpoint returns OK
- [ ] **DB-03/04**: Indexes exist for new query patterns
- [ ] **DKR-02**: Dockerfile has HEALTHCHECK
- [ ] **DEP-03**: Health endpoints OK after deploy

### Notes
- Exceptions: 
- Risks:
```

---

## Standard Patterns (Reference)

### Backend: Correct patterns

**Zod validation (VAL-01):**
```typescript
// ✅ CORRECT
const body = CreateResourceSchema.parse(request.body);

// ❌ WRONG
const body = request.body as any;
```

**Transaction (TXN-01):**
```typescript
// ✅ CORRECT
const conn = await pool.getConnection();
try {
  await conn.beginTransaction();
  // ... multiple writes ...
  await conn.commit();
} catch (err) {
  await conn.rollback();
  throw err;
} finally {
  conn.release();
}
```

**Audit (AUD-01):**
```typescript
// ✅ CORRECT
recordAudit({
  actorId: request.userId,
  action: 'RESOURCE.CREATE',
  entityType: 'resource',
  entityId: result.id,
  afterState: { name: body.name, branchId: body.branchId },
  ipAddress: request.ip,
  userAgent: request.headers['user-agent'],
});
```

**Logging (LOG-01, LOG-02):**
```typescript
// ✅ CORRECT
import { createModuleLogger } from '../../../shared/utils/logger.js';
const log = createModuleLogger('my-module');
log.info({ traceId, userId, paymentId }, 'Payment processed');

// ❌ WRONG
console.log('Payment processed:', paymentId);
```

### Frontend: Correct patterns

**Cache invalidation (RQ-01):**
```tsx
// ✅ CORRECT
const createMutation = useMutation({
  mutationFn: (data) => api.post('/resources', data),
  onSuccess: (_data, variables) => {
    queryClient.invalidateQueries({ queryKey: ['resources', variables.branchId] });
  },
});

// ❌ WRONG — no invalidation
const createMutation = useMutation({
  mutationFn: (data) => api.post('/resources', data),
  onSuccess: () => {
    showToast('Created!');
    // Nothing invalidated — UI stays stale
  },
});
```

**Polling cleanup (RQ-04):**
```tsx
// ✅ CORRECT
useEffect(() => {
  let stopped = false;
  const timeout = setTimeout(() => { stopped = true; onTimeout(); }, 90000);
  const poll = async () => {
    if (stopped) return;
    // ... check status ...
    if (!stopped) setTimeout(poll, interval);
  };
  poll();
  return () => { stopped = true; clearTimeout(timeout); };
}, []);
```

**API response handling (API-01):**
```tsx
// ✅ CORRECT — consistent extraction
const { data: items } = useQuery({
  queryKey: ['items'],
  queryFn: () => api.get('/items').then(r => r.data.data),
});

// ❌ WRONG — inconsistent; r.data.data sometimes, r.data other times
```

---

## Build Verification Script

Save as `scripts/quality-gates.sh`:

```bash
#!/bin/bash
# CourtZon Pre-Merge Quality Gates
set -e

echo "=== Quality Gates ==="

# VAL-01: No unvalidated request bodies
echo -n "VAL-01: Checking for unvalidated request bodies... "
UNVALIDATED=$(grep -r "request.body as any" backend/src/modules/ --include="*.ts" | wc -l)
if [ "$UNVALIDATED" -gt 0 ]; then
  echo "FAIL ($UNVALIDATED found)"
  grep -rn "request.body as any" backend/src/modules/ --include="*.ts"
  exit 1
fi
echo "PASS"

# LOG-01: No console.log in production code
echo -n "LOG-01: Checking for console.log... "
CONSOLE=$(grep -r "console\\.log" backend/src/ --include="*.ts" --exclude-dir=__tests__ | wc -l)
if [ "$CONSOLE" -gt 0 ]; then
  echo "FAIL ($CONSOLE found)"
  grep -rn "console\\.log" backend/src/ --include="*.ts" --exclude-dir=__tests__
  exit 1
fi
echo "PASS"

# SEC-01: No hardcoded secrets
echo -n "SEC-01: Checking for hardcoded secrets... "
SECRETS=$(grep -rE "(sk_live|pk_live|secret\s*=\s*['\"]\w{8,})" backend/src/ --include="*.ts" --exclude-dir=node_modules | grep -v ".env.example" | wc -l)
if [ "$SECRETS" -gt 0 ]; then
  echo "FAIL ($SECRETS found)"
  exit 1
fi
echo "PASS"

# TST-05: Build passes
echo -n "TST-05: Building backend... "
cd backend && npm run build > /dev/null 2>&1
echo "PASS"

echo -n "TST-05: Building frontend... "
cd ../frontend && npm run build > /dev/null 2>&1
echo "PASS"

echo "=== All mandatory checks passed ==="
```
