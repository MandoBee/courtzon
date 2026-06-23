# CourtZon Disaster Recovery Audit Report

**Date:** 2026-06-23  
**Auditor:** AI-assisted audit  
**Environment:** Hostinger KVM 2 (Ubuntu 24.04, 2 vCPU, 4GB RAM, 80GB NVMe)  
**Status:** ⚠️ Requires remediation before production  

---

| Sc | No. | Scenario | RPO (Target) | RTO (Target) | RPO (Current) | RTO (Current) | Risk | Remediation |
|---|------|----------|-------------|-------------|--------------|--------------|------|-------------|
| ✅ | 1 | **Database corruption / data loss** | 1 hour (binlog) | 1 hour | ~1 hour (daily backup) | ~2 hours | 🔴 High | Binlog already enabled in `database/my.cnf`. Need to: (a) test restore script; (b) enable off-site automated backup upload; (c) validate binlog-based PITR procedure |
| ✅ | 2 | **Server hardware failure** | 1 hour | 4 hours | 24 hours | 48+ hours | 🔴 High | No secondary server. Mitigation: off-site backups (S3/R2) + documented rebuild from scratch + Coolify app template for redeploy |
| ⚠️ | 3 | **Accidental data deletion** | Instant | 1 hour | N/A | ~2 hours (restore from backup) | 🟡 Medium | Add soft-delete policy for key entities + audit log must be immutable + restore script exists but untested in production |
| ❌ | 4 | **Ransomware / security breach** | Instant | 6 hours | N/A | 72+ hours | 🔴 High | Need: (a) read-only DB user for app (DONE: `courtzon_readonly`); (b) encrypted backups with air-gapped off-site copy; (c) documented incident response plan; (d) WAF rules |
| ❌ | 5 | **Region / DNS / provider outage** | N/A | 4 hours | N/A | 48+ hours | 🟡 Medium | Single-provider. Mitigation: documented Coolify rebuild steps + DNS TTL pre-lowered to 60s + backup available for restore on alternative VPS |
| ✅ | 6 | **Bad deployment / code regression** | Instant | 30 min | Instant | ~30 min | 🟢 Low | Docker images tagged by commit hash; `docker compose down && docker compose up -d` rolls back to prior image; Coolify supports rollback |
| ✅ | 7 | **SSL certificate expiry** | 30 days | 1 hour | 30 days | ~1 hour | 🟢 Low | Certbot auto-renewal timer + renewal hook to reload nginx (`scripts/setup-ssl.sh`) |

## Overall Risk Rating: **MODERATE-HIGH**

### Immediate actions (before production cutover)

| Priority | Action | Owner | Status |
|----------|--------|-------|--------|
| P0 | Test restore script with existing backup | DevOps | ⬜ |
| P0 | Deploy staging stack (Coolify) and run end-to-end tests | DevOps | ⬜ |
| P0 | Add `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_ENDPOINT` to production `.env` | DevOps | ⬜ |
| P0 | Set `REDIS_PASSWORD` and `METRICS_TOKEN` in production `.env` | DevOps | ⬜ |
| P1 | Configure WAF (Cloudflare) to block SQLi, XSS, path traversal | DevOps | ⬜ |
| P1 | Run `setup-db-users.sql` on production MySQL | DevOps | ⬜ |
| P1 | Set `maxmemory-policy noeviction` in production `docker-compose.yml` (DONE in code) | DevOps | ✅ |
| P2 | Add uptime monitoring (UptimeRobot / Checkmk / Coolify built-in) | DevOps | ⬜ |
| P2 | Document full rebuild-from-scratch procedure | DevOps | ⬜ |
| P2 | Set DB backup retention to 30 days (DONE in code — 30 days) | DevOps | ✅ |
| P3 | Create runbook for each disaster scenario | DevOps | ⬜ |

### RTO/RPO Targets (Post-Remediation)

- **RPO**: ≤ 1 hour (MySQL binlog + off-site backups every hour)  
- **RTO**: ≤ 2 hours for database/server failure; ≤ 30 min for bad deployment; ≤ 1 hour for SSL/cert issues  

### Backup Chain (Post-Remediation)

```
┌──────────────┐     ┌──────────┐     ┌──────────┐     ┌────────────┐
│  MySQL live   │────→│  Binlog  │────→│  PITR    │     │  Restore   │
│  (Hostinger)  │     │  (local) │     │  (local) │     │  script    │
└──────────────┘     └──────────┘     └──────────┘     └────────────┘
       │                                                    ↑
       │  (daily 00:00)                                    │
       ▼                                                    │
┌──────────────┐     ┌──────────┐     ┌──────────────┐     │
│  mysqldump   │────→│  gzip    │────→│  AES-256-CBC │────→│
│  (backup     │     │          │     │  encrypt     │     │
│   service)   │     └──────────┘     └──────────────┘     │
└──────────────┘                                            │
       │                                                    │
       │  (async upload on success)                         │
       ▼                                                    │
┌──────────────┐                                            │
│  S3 / R2     │─────────────────────────────────────────────┘
│  (off-site)  │
└──────────────┘
```

### Key Files

| File | Purpose |
|------|---------|
| `backend/scripts/restore.js` | Restore from encrypted or plain .sql.gz backup |
| `backend/src/infrastructure/backup/backup.service.ts` | Daily encrypted mysqldump + S3 upload + pruning |
| `backend/scripts/setup-db-users.sql` | DB user provisioning (app/readonly/migration/backup) |
| `database/my.cnf` | MySQL 8 production config (1G buffer pool, binlog, slow query) |
| `scripts/setup-ssl.sh` | Let's Encrypt cert issuance + auto-renewal timer |
| `monitoring/alerts.yml` | Prometheus alert rules (down, errors, latency, disk, CPU) |
| `docker-compose.yml` | Updated: Redis `noeviction` + AOF everysec |
| `backend/nixpacks.toml` | Coolify build config for backend |
| `frontend/nixpacks.toml` | Coolify build config for frontend |
| `.env.production` | Production env template with all secrets placeholders |
