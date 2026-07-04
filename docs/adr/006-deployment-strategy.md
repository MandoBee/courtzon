# ADR 006: Deployment Strategy

**Status:** Accepted  
**Date:** 2026-07-04  
**Authors:** CourtZon Engineering

## Context

The CourtZon platform runs on Docker Compose locally and via Coolify for production. Deployments must be safe, verifiable, and rollback-able. The deployment process must ensure code, database schema, and configuration are synchronized.

## Decision

1. **Docker Compose for orchestration.** Three services (mysql, redis, backend, frontend) plus optional monitoring (prometheus, grafana). Backend and frontend are rebuilt on every deployment.

2. **Migration-first deployment.** Database migrations (additive-only ALTER TABLE operations) are applied before new application code is deployed. This ensures the old application version works with the new schema (backward compatibility). Migration ordering is enforced by sequential prefixes (005, 006, 007, 008).

3. **Build metadata injection.** Docker builds accept `--build-arg GIT_COMMIT=$(git rev-parse HEAD)`. The backend Dockerfile writes `build-time.txt`, `version.txt`, `git-commit.txt`, and `expected-migration.txt` to `/app/`. Health endpoints expose these for CI/CD verification.

4. **Health-based deployment gating.** After deployment, CI/CD must verify: `GET /health/ready` returns 200, `GET /payments/health` returns `migrationSynced: true` and `gatewayConfigured: true`. Deployment is blocked if any check fails.

5. **Backup-before-deploy.** A database backup using `mysqldump --single-transaction` is automatically created before every production deployment. Backup retention is 30 days with automatic pruning.

6. **Rollback by image tag.** Previous Docker images are tagged with commit SHA. Rollback means stopping the new container and starting the previous tagged image. Database rollback is NOT performed (migrations are additive-only, old application code works with new schema).

## Alternatives Considered

- **Kubernetes (future).** Docker Compose is sufficient for current scale (single-server deployment). K8s adds complexity without immediate benefit. Can be adopted later if horizontal scaling is needed.
- **Blue-green deployment (future).** Requires two identical environments (2x infrastructure). Not justified for current traffic.
- **Rolling database rollback (rejected).** Migrations that are truly destructive should never be written. Additive-only migrations make rollback unnecessary for the database.

## Consequences

- **Positive:** Consistent, verifiable deployments. CI/CD can automatically verify health after deploy. Backup-before-deploy prevents data loss.
- **Negative:** Migration-first ordering adds a manual step (apply migrations, then deploy code). Can be automated. Rollback requires previous Docker image to be available.
- **Enforcement:** DEP-01 through DEP-04, ROL-01 through ROL-03 in engineering standards.
