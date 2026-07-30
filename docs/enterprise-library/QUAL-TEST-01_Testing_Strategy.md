---
document_id: "QUAL-TEST-01"
document_name: "Testing Strategy"
family: "QUAL-TEST"
document_type: "TEST"
status: "Draft"
version: "0.1"
audience: ["qa", "developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "QA Manager"
technical_owner: "Lead Developer"
documentation_owner: "QA"
reviewer: "Architect"
approver: "QA Director"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-DEV-09", "QUAL-TEST-02", "QUAL-TEST-03", "QUAL-TEST-04"]
  related: ["TECH-ARCH-11"]
---

# Testing Strategy (QUAL-TEST-01)

## Testing Pyramid

```
        ╱╲
       ╱ E2E ╲          ← Playwright (critical journeys)
      ╱────────╲
     ╱ Integration ╲    ← Testcontainers (MySQL + Redis)
    ╱────────────────╲
   ╱   Unit / Domain   ╲  ← Vitest / Jest (isolated)
  ╱──────────────────────╲
```

| Layer | Scope | Tools | CI Frequency |
|-------|-------|-------|-------------|
| **Unit** | Services, domain logic, aggregates, utilities | Vitest, Jest | Every push |
| **Integration** | DB queries, API endpoints, service+DB | Testcontainers, supertest | Every push |
| **E2E** | Full user journeys (UI) | Playwright | Pre-release |
| **Performance** | Load testing, bottlenecks | k6, autocannon | Weekly |
| **Security** | OWASP top 10, auth bypass | OWASP ZAP, npm audit | Pre-release |

## Coverage Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Line coverage (unit) | ≥ 80% | Service + domain only |
| Branch coverage | ≥ 75% | Condition coverage |
| Integration coverage | ≥ 70% routes | Each route ≥ 1 positive test |
| Mutation score | ≥ 70% | Stryker for critical modules |
| E2E journey coverage | 15 critical paths | Auth, booking, payment, admin |

## Test Environment Strategy

| Environment | Database | Redis | Purpose |
|-------------|----------|-------|---------|
| **Local** | MySQL local (XAMPP) | Local Redis | Dev iteration |
| **Docker** | MySQL (Docker 3307) | Redis (Docker 6379) | Integration tests |
| **CI (GitHub Actions)** | Testcontainers MySQL | Testcontainers Redis | Automated |
| **Staging** | Staging RDS | ElastiCache | Pre-release validation |
| **Production** | Production RDS | Production ElastiCache | — |

## CI Integration

Pre-commit hooks run `npm run lint && npm test` locally. CI pipeline:

```
push/PR → lint → typecheck → unit tests → integration tests → build → (release) → e2e tests
```

Each stage gates the next. Integration tests use Testcontainers for MySQL + Redis isolation. Test databases are discarded after each suite.

## Test Data Management

- **Seed data:** Reference data from `database/seeds/001_baseline.sql`
- **Test factories:** Factory functions in `backend/src/tests/factories/`
- **Setup helpers:** `setupIntegrationTest()` / `teardownIntegrationTest()` from `backend/src/tests/helpers/integration-setup.ts`
- **Cleanup:** Each integration test uses transactions that roll back after the test

## Tools & Frameworks

| Layer | Tool | Configuration |
|-------|------|---------------|
| Unit tests | Vitest (frontend), Jest (backend) | `vitest.config.ts`, `jest.config.ts` |
| Integration | Testcontainers | `docker-compose.test.yml` |
| E2E | Playwright | `playwright.config.ts` |
| Performance | k6 | `tests/performance/*.js` |
| Mutation | Stryker | `stryker.config.json` |
| Linting | ESLint | `.eslintrc.js` |
| Type checking | TypeScript | `tsconfig.json` |
