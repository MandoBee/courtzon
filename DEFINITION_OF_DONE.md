# Definition of Done

> A feature is not complete until ALL mandatory gates pass.  
> Reference: [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md)  
> Reference: [Architecture Decision Records](./adr/)

---

## Mandatory Gates

Every feature, bug fix, or change must satisfy these before merge:

### Validation

- [ ] **VAL-01** — All new POST/PUT/PATCH endpoints use Zod schema validation. No `request.body as any`.
- [ ] **VAL-02** — Zod schemas validate types, ranges, lengths, and required fields.

### Security

- [ ] **SEC-01** — No hardcoded secrets in source code.
- [ ] **SEC-02** — SQL queries use parameterized placeholders (`?`), never string interpolation.
- [ ] **SEC-03** — New API routes are protected by `authMiddleware` or added to `PUBLIC_PREFIXES`.

### Transactions

- [ ] **TXN-01** — Multi-table mutations use `beginTransaction()` + `commit()` / `rollback()`.

### Idempotency

- [ ] **IDEM-01** — Webhook handlers protected by UNIQUE constraint on gateway reference.

### Logging

- [ ] **LOG-01** — No `console.log()` in production code. Uses `createModuleLogger()`.
- [ ] **LOG-02** — Payment operations include `traceId` in log context.

### Audit

- [ ] **AUD-01** — State-changing operations call `recordAudit()` with actor, action, entity, and state.

### React Query Cache

- [ ] **RQ-01** — Every mutation invalidates the affected query on success (no stale UI).
- [ ] **RQ-02** — Invalidation targets the exact query key from mutation variables, never component state.

### API Consistency

- [ ] **API-01** — List endpoints return `{ data: [...], total, page, limit }`.
- [ ] **API-02** — Single-entity endpoints return `{ data: { ... } }`.
- [ ] **API-03** — Error responses use `{ error: "ERROR_CODE", message: "..." }` format.

### Database

- [ ] **DB-01** — Migration is additive-only (ALTER TABLE ADD, CREATE INDEX). No DROP, TRUNCATE, DELETE.
- [ ] **DB-02** — Migration has unique sequential prefix (`009_`, `010_`, etc.).

### Tests

- [ ] **TST-05** — `npm run build` passes for both backend and frontend.

### Documentation

- [ ] **DOC-01** — New environment variables documented in `.env.example`.

### Docker

- [ ] **DKR-01** — `docker compose build` succeeds for changed services.
- [ ] **DKR-02** — Dockerfile includes HEALTHCHECK instruction.

---

## Deployment Gates

Before deploying to production:

- [ ] **DEP-01** — All pending migrations applied in order.
- [ ] **DEP-02** — Database backup created.
- [ ] **DEP-03** — Health endpoints return OK (`/health/ready`, `/payments/health`).
- [ ] **ROL-01** — Migration scripts are backward-compatible (additive-only confirmed).

---

## Recommended Gates

Should pass; must document exceptions if skipped:

- [ ] **SEC-05** — Rate limiting on auth endpoints.
- [ ] **MET-01** — New routes visible in Prometheus metrics.
- [ ] **HLT-02** — Payment health endpoint returns accurate status.
- [ ] **DB-03/04** — Indexes exist for new query patterns.
- [ ] **TST-01** — Payment/booking/wallet mutations have integration tests.

---

## Verification Checklist

Use this checklist at PR review time:

```
[ ] Build passes (backend + frontend)
[ ] No console.log in production code
[ ] No hardcoded secrets
[ ] No unvalidated request.body
[ ] All mutations invalidate cache
[ ] Audit records created for state changes
[ ] Migrations are additive-only
[ ] Health endpoints return OK
[ ] Docker image builds successfully
[ ] Environment variables documented
```

---

## Related Documents

- [ENGINEERING_STANDARDS.md](../ENGINEERING_STANDARDS.md) — Full 72-check matrix
- [docs/adr/001-payment-architecture.md](./adr/001-payment-architecture.md) — Payment architecture decisions
- [docs/adr/002-api-response-standard.md](./adr/002-api-response-standard.md) — API response envelope standard
- [docs/adr/003-react-query-strategy.md](./adr/003-react-query-strategy.md) — React Query caching decisions
- [docs/adr/004-logging-strategy.md](./adr/004-logging-strategy.md) — Structured logging strategy
- [docs/adr/005-health-endpoint-strategy.md](./adr/005-health-endpoint-strategy.md) — Health endpoint tiering
- [docs/adr/006-deployment-strategy.md](./adr/006-deployment-strategy.md) — Deployment and rollback process
- [docs/adr/007-security-model.md](./adr/007-security-model.md) — Security architecture decisions
