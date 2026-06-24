# Phase 9: Coolify Deployment Review

**Date:** 2026-06-24
**Status:** PASSED (3 minor recommendations)
**Target:** Coolify deployment platform

## Summary

The project is well-prepared for Coolify deployment. Comprehensive deployment documentation exists at `docs/deployment/coolify.md` (352 lines). All 4 services have proper healthchecks, persistent volumes, non-root users, and correct network configuration. Three minor improvements recommended for production Coolify deployment.

## Coolify Compatibility Matrix

| Criterion | Status | Details |
|-----------|--------|---------|
| Healthchecks (all services) | PASS | MySQL: mysqladmin ping, Redis: redis-cli ping, Backend: /health/live, Frontend: curl / |
| Persistent volumes | PASS | mysql_data, redis_data, backend_backups (named volumes) |
| Non-root containers | PASS | Backend: USER appuser, Frontend: USER appuser |
| Init process | PASS | Backend uses tini |
| Multi-stage builds | PASS | Both backend and frontend use builder→runner pattern |
| Restart policy | PASS | `unless-stopped` on all 4 services |
| Network isolation | PASS | Named `courtzon` network |
| Startup ordering | PASS | depends_on with condition: service_healthy |
| Entrypoint readiness check | PASS | Waits for MySQL + Redis before starting |
| Build args for env vars | PASS | VITE_PAYMOB_PUBLIC_KEY as build arg |
| Security headers (frontend) | PASS | Fixed in Phase 8 (nginx include file) |

## Service Review

### MySQL (8.0)

| Aspect | Value | Status |
|--------|-------|--------|
| Image | mysql:8.0 | Good (pinned major) |
| Healthcheck | mysqladmin ping | PASS |
| Persistent data | Named volume at /var/lib/mysql | PASS |
| Charset/Collation | utf8mb4/utf8mb4_unicode_ci | PASS |
| Auth plugin | mysql_native_password | Compatible with Node.js mysql2 |

### Redis (7-alpine)

| Aspect | Value | Status |
|--------|-------|--------|
| Image | redis:7-alpine | Good |
| Persistence | AOF (appendonly yes, everysec fsync) | PASS |
| Memory limit | 512MB with noeviction | PASS |
| Healthcheck | redis-cli ping | PASS |

### Backend (Node.js 22-alpine)

| Aspect | Value | Status |
|--------|-------|--------|
| Base image | node:22-alpine | Good |
| Init | tini | PASS |
| User | appuser (non-root) | PASS |
| Healthcheck | HTTP GET /health/live | PASS |
| Entrypoint | Wait for MySQL + Redis | PASS |
| Build context | Repository root | Required for database/ copy |
| Volume: uploads | `./backend/uploads:/app/uploads` | **See R1** |
| Volume: backups | Named volume at /app/backups | PASS |

### Frontend (Nginx 1.27-alpine)

| Aspect | Value | Status |
|--------|-------|--------|
| Base image | nginx:1.27-alpine | Good |
| User | appuser (non-root) | PASS |
| Healthcheck | curl -f / | PASS |
| Security headers | Inline + include file | Fixed in Phase 8 |
| Proxy pass | /api/, /auth/, /admin/, /uploads/ → backend:3000 | PASS |
| CSP | connect-src includes localhost:3000 | PASS |

## Coolify Documentation Review (`docs/deployment/coolify.md`)

The 352-line deployment guide covers:

| Section | Status |
|---------|--------|
| Service architecture diagram | PASS |
| Per-service Coolify setup (MySQL, Redis, Backend, Frontend) | PASS |
| Environment variables for each service | PASS |
| Domain configuration (5 domains) | PASS |
| SSL via Coolify Proxy (Let's Encrypt) | PASS |
| Deployment order (MySQL→Redis→Backend→Frontend) | PASS |
| Database users setup | PASS |
| Persistent volumes configuration | PASS |
| Backup configuration (Coolify + app-level) | PASS |
| Post-deployment verification | PASS |
| Updating services | PASS |
| Troubleshooting guide (9 common issues) | PASS |

## Recommendations

### R1: Replace bind-mount with named volume for uploads (LOW)

The backend service uses a bind-mount:
```yaml
- ./backend/uploads:/app/uploads
```

This requires the `backend/uploads` directory to exist on the Coolify server's filesystem. For Coolify deployments, this should be a named volume for consistency:
```yaml
- backend_uploads:/app/uploads
```

Now: `./backend/uploads` is in git (empty dir with .gitkeep). Coolify clones the repo, so this works, but named volumes are more predictable.

### R2: Remove `env_file` for Coolify deployments (LOW)

```yaml
env_file:
  - .env
```

Coolify manages environment variables through its own UI. The `env_file` directive can conflict or override Coolify-managed variables. For Coolify deployments, all environment variables should be configured in the Coolify UI, not loaded from a file.

**Note:** This is fine for local Docker Compose development. For Coolify, either remove the line or document that Coolify overrides it.

### R3: Document `docker-entrypoint.sh` bind-mount requirement (LOW)

```yaml
- ./backend/docker-entrypoint.sh:/usr/local/bin/docker-entrypoint.sh:ro
```

This mount is read-only, so it's safe. But it requires the file to exist in the cloned repo. The Dockerfile could COPY it instead, which is more portable for Coolify. Consider moving to Dockerfile COPY rather than a runtime bind-mount.

## What Works Well

1. **Healthchecks are correctly configured** for all 4 services with appropriate intervals, timeouts, and retries
2. **Service dependencies** use `condition: service_healthy` ensuring proper startup order
3. **Non-root users** in both application containers (security best practice)
4. **Multi-stage builds** minimize image sizes and attack surface
5. **Persistent data** for MySQL, Redis, and backups via named volumes
6. **Coolify documentation** is thorough with command examples, troubleshooting, and deployment verification
7. **Entrypoint script** handles dependency waiting gracefully (MySQL + Redis readiness)
8. **Build args** for VITE_ env vars (frontend build-time configuration)
9. **Port mapping** uses environment variable substitution (`${PORT:-3000}`)

## Conclusion

The project is ready for Coolify deployment. All 4 services have proper healthchecks, persistent volumes, non-root users, and clean network configuration. The deployment documentation is comprehensive and production-ready. Three minor recommendations (bind-mount→named volume, remove env_file, move entrypoint to Dockerfile) would improve portability but are not blocking.
