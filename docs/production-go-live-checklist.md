# CourtZon — Production Go-Live Checklist

**Date:** ________________ &nbsp;|&nbsp; **Deployer:** ________________ &nbsp;|&nbsp; **Reviewer:** ________________

**Target:** Hostinger KVM 2 (Ubuntu 24.04, 2 vCPU, 4 GB RAM, 80 GB NVMe)

---

## Instructions
1. Work top-to-bottom; do not skip steps.
2. Run every command — do not assume it works.
3. Mark `[✓ C]` only after successful verification.
4. If any step fails, pause, fix, re-verify, then proceed.
5. Append notes below each step.

---

## 1. VPS Provisioning

**Goal:** Hostinger KVM 2 provisioned, SSH accessible, base packages installed.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **1.1** Create VPS in Hostinger panel (Ubuntu 24.04, 80 GB NVMe) | Via Hostinger dashboard | `ssh root@<vps-ip>` |
| [ ] N / [ ] P / [ ] C | **1.2** SSH as root and update | `apt update && apt upgrade -y` | `echo $?` → 0 |
| [ ] N / [ ] P / [ ] C | **1.3** Install base deps | `apt install -y docker.io docker-compose-v2 nodejs npm git curl wget ufw` | `docker --version && git --version` |
| [ ] N / [ ] P / [ ] C | **1.4** Enable Docker | `systemctl enable docker && systemctl start docker` | `docker ps` → no error |
| [ ] N / [ ] P / [ ] C | **1.5** Create app directory | `mkdir -p /opt/courtzon` | `ls -d /opt/courtzon` |
| [ ] N / [ ] P / [ ] C | **1.6** Clone repository | `cd /opt/courtzon && git clone <repo-url> .` | `ls .env.production` |

**Notes:** ___________________________________________________________________

---

## 2. Ubuntu Hardening

**Goal:** Server secured per production-hardening guide.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **2.1** Configure UFW | `ufw default deny incoming && ufw default allow outgoing && ufw allow ssh && ufw allow 80/tcp && ufw allow 443/tcp && ufw --force enable` | `ufw status verbose` |
| [ ] N / [ ] P / [ ] C | **2.2** Create deploy user | `adduser deployer && usermod -aG docker,sudo deployer && mkdir -p ~deployer/.ssh && cp ~/.ssh/authorized_keys ~deployer/.ssh/ && chown -R deployer:deployer ~deployer/.ssh` | `su - deployer -c 'docker ps'` |
| [ ] N / [ ] P / [ ] C | **2.3** Disable root SSH | Edit `/etc/ssh/sshd_config`: `PermitRootLogin no`, `PasswordAuthentication no` | `sshd -t && systemctl reload sshd` |
| [ ] N / [ ] P / [ ] C | **2.4** Set up automatic security updates | `apt install -y unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades` | `systemctl status unattended-upgrades` |
| [ ] N / [ ] P / [ ] C | **2.5** Harden sysctl | Add to `/etc/sysctl.d/99-courtzon.conf`: `net.ipv4.tcp_syncookies=1 kernel.randomize_va_space=2 fs.suid_dumpable=0` | `sysctl -p /etc/sysctl.d/99-courtzon.conf` |

**Notes:** ___________________________________________________________________

---

## 3. MySQL Installation

**Goal:** MySQL 8.0 on host (not Docker) with binlog, my.cnf, and least-privilege users.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **3.1** Install MySQL 8.0 | `apt install -y mysql-server-8.0` | `mysql --version` → must contain `mysql` NOT `mariadb` |
| [ ] N / [ ] P / [ ] C | **3.2** Run secure install | `mysql_secure_installation` | Root pw set, anonymous users removed, remote root login disabled |
| [ ] N / [ ] P / [ ] C | **3.3** Copy tuned my.cnf | `cp /opt/courtzon/database/my.cnf /etc/mysql/my.cnf` | Validate: `grep -c "binlog" /etc/mysql/my.cnf` → >0 |
| [ ] N / [ ] P / [ ] C | **3.4** Create database | `mysql -u root -p -e "CREATE DATABASE IF NOT EXISTS courtzon_v2 CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"` | `mysql -u root -p -e "USE courtzon_v2; SELECT 1;"` |
| [ ] N / [ ] P / [ ] C | **3.5** Verify binlog enabled | `mysql -u root -p -e "SHOW VARIABLES LIKE 'log_bin';"` | `Value: ON` |
| [ ] N / [ ] P / [ ] C | **3.6** Restart MySQL | `systemctl restart mysql` | `systemctl status mysql` → active |
| [ ] N / [ ] P / [ ] C | **3.7** Verify MySQL is listening | `ss -tlnp \| grep 3306` | Port 3306 is LISTEN |

**Notes:** ___________________________________________________________________

---

## 4. Redis Installation

**Goal:** Redis 7 with AOF, password, `noeviction` policy.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **4.1** Install Redis | `apt install -y redis-server` | `redis-server --version` |
| [ ] N / [ ] P / [ ] C | **4.2** Harden config | Edit `/etc/redis/redis.conf`: `requirepass <REDIS_PASSWORD>`, `appendonly yes`, `appendfsync everysec`, `maxmemory 512mb`, `maxmemory-policy noeviction`, `bind 127.0.0.1` | `grep -E "^(requirepass|appendonly|maxmemory|bind)" /etc/redis/redis.conf` |
| [ ] N / [ ] P / [ ] C | **4.3** Restart Redis | `systemctl restart redis-server` | `redis-cli -a <REDIS_PASSWORD> ping` → `PONG` |
| [ ] N / [ ] P / [ ] C | **4.4** Verify no external access | `ss -tlnp \| grep 6379` | Bound to `127.0.0.1:6379` only |

**Notes:** ___________________________________________________________________

---

## 5. Coolify Installation

**Goal:** Coolify instance ready with application template and Docker build configuration.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **5.1** Install Coolify | `curl -fsSL https://coolify.io/install.sh \| bash` | Access `http://<vps-ip>:8000` |
| [ ] N / [ ] P / [ ] C | **5.2** Configure Coolify proxy | Set Traefik as reverse proxy (Coolify UI → Settings → Reverse Proxy) | Traefik dashboard accessible |
| [ ] N / [ ] P / [ ] C | **5.3** Add server in Coolify | Coolify UI → Servers → Add (localhost) | Status: `Connected` |
| [ ] N / [ ] P / [ ] C | **5.4** Create application: backend | Resource → Application: Git repo, Dockerfile: `backend/Dockerfile`, Port: `3000`, Health: `/health` | Build succeeds |
| [ ] N / [ ] P / [ ] C | **5.5** Create application: frontend | Resource → Application: Git repo, Dockerfile: `frontend/Dockerfile`, Port: `80`, build arg `VITE_PAYMOB_PUBLIC_KEY` | Build succeeds |
| [ ] N / [ ] P / [ ] C | **5.6** Add Nixpacks configs | Verify `backend/nixpacks.toml` and `frontend/nixpacks.toml` exist | `ls /opt/courtzon/*/nixpacks.toml` |
| [ ] N / [ ] P / [ ] C | **5.7** Set environment variables in Coolify UI | All vars from `.env.production` (see §8 below for checklist) | — |

**Notes:** ___________________________________________________________________

---

## 6. Cloudflare DNS Configuration

**Goal:** DNS records created, proxy (orange cloud) enabled, TTL 60s before cutover.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **6.1** Add domains to Cloudflare | Cloudflare Dashboard → Add Site: `courtzon.com` | Nameservers assigned |
| [ ] N / [ ] P / [ ] C | **6.2** Update nameservers at registrar | Point `courtzon.com` nameservers to Cloudflare-assigned NS | Cloudflare → DNS → `Status: Active` |
| [ ] N / [ ] P / [ ] C | **6.3** Create A records (before cutover) | `A courtzon.com → <VPS-IP>` (grey cloud), `A api.courtzon.com → <VPS-IP>` (grey cloud) | `dig +short courtzon.com` |
| [ ] N / [ ] P / [ ] C | **6.4** Set low TTL | Cloudflare DNS → TTL → `60 seconds` | — |
| [ ] N / [ ] P / [ ] C | **6.5** Enable Cloudflare Tunnel | Create Tunnel in Cloudflare Zero Trust → Copy token | — |
| [ ] N / [ ] P / [ ] C | **6.6** Install cloudflared on VPS | `curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o /usr/local/bin/cloudflared && chmod +x /usr/local/bin/cloudflared` | `cloudflared version` |
| [ ] N / [ ] P / [ ] C | **6.7** Authenticate tunnel | `cloudflared tunnel login` → follow browser auth | Token saved |
| [ ] N / [ ] P / [ ] C | **6.8** Change DNS to orange cloud | After tunnel is running, change DNS proxy status to Proxied (orange cloud) | Tunnel shows `HEALTHY` in Cloudflare Zero Trust |

**Notes:** ___________________________________________________________________

---

## 7. SSL Setup

**Goal:** Let's Encrypt certificates for `courtzon.com`, `www.courtzon.com`, `api.courtzon.com` with auto-renewal.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **7.1** Run SSL setup script | `cd /opt/courtzon && chmod +x scripts/setup-ssl.sh && sudo ./scripts/setup-ssl.sh courtzon.com admin@courtzon.com` | Certs at `/etc/letsencrypt/live/courtzon.com/` |
| [ ] N / [ ] P / [ ] C | **7.2** Verify cert files exist | `ls /etc/letsencrypt/live/courtzon.com/` | `fullchain.pem privkey.pem` exist |
| [ ] N / [ ] P / [ ] C | **7.3** Enable auto-renewal systemd timer | Verify `systemctl list-timers \| grep certbot` | Timer is active |
| [ ] N / [ ] P / [ ] C | **7.4** Test dry-run renewal | `certbot renew --dry-run` | `Congratulations, all renewals succeeded` |

**Notes:** ___________________________________________________________________

---

## 8. Environment Variables

**Goal:** All secrets and configuration populated; `.env` validated by `deploy-check.js`.

| Status | Step | Variable | Source / Notes |
|--------|------|----------|----------------|
| [ ] N / [ ] P / [ ] C | **8.1** | `NODE_ENV=production` | Hardcoded in docker-compose |
| [ ] N / [ ] P / [ ] C | **8.2** | `DB_HOST=127.0.0.1` | Host MySQL, not Docker MySQL |
| [ ] N / [ ] P / [ ] C | **8.3** | `DB_PORT=3306` | Default MySQL port |
| [ ] N / [ ] P / [ ] C | **8.4** | `DB_USER=courtzon_app` | From setup-db-users.sql |
| [ ] N / [ ] P / [ ] C | **8.5** | `DB_PASSWORD` | Generated — store in vault |
| [ ] N / [ ] P / [ ] C | **8.6** | `DB_NAME=courtzon_v2` | Created in §3.4 |
| [ ] N / [ ] P / [ ] C | **8.7** | `SESSION_SECRET` | Generate: `openssl rand -hex 64` |
| [ ] N / [ ] P / [ ] C | **8.8** | `APP_URL=https://courtzon.com` | Production frontend URL |
| [ ] N / [ ] P / [ ] C | **8.9** | `CORS_ORIGINS=https://courtzon.com,https://www.courtzon.com,https://api.courtzon.com` | Production origins |
| [ ] N / [ ] P / [ ] C | **8.10** | `WEBHOOK_BASE_URL=https://api.courtzon.com` | Paymob webhooks |
| [ ] N / [ ] P / [ ] C | **8.11** | `REDIS_HOST=127.0.0.1` | Host Redis, not Docker |
| [ ] N / [ ] P / [ ] C | **8.12** | `REDIS_PASSWORD` | From §4.2 |
| [ ] N / [ ] P / [ ] C | **8.13** | `PAYMOB_HMAC_SECRET` | From Paymob dashboard |
| [ ] N / [ ] P / [ ] C | **8.14** | `PAYMOB_SECRET` | From Paymob dashboard |
| [ ] N / [ ] P / [ ] C | **8.15** | `PAYMOB_SANDBOX=false` | Disable sandbox for live |
| [ ] N / [ ] P / [ ] C | **8.16** | `VITE_PAYMOB_PUBLIC_KEY` | Live public key from Paymob |
| [ ] N / [ ] P / [ ] C | **8.17** | `METRICS_TOKEN` | Generate: `openssl rand -hex 32` |
| [ ] N / [ ] P / [ ] C | **8.18** | `S3_BUCKET` | R2 bucket name |
| [ ] N / [ ] P / [ ] C | **8.19** | `S3_ACCESS_KEY` | R2 access key |
| [ ] N / [ ] P / [ ] C | **8.20** | `S3_SECRET_KEY` | R2 secret key |
| [ ] N / [ ] P / [ ] C | **8.21** | `S3_ENDPOINT` | R2 endpoint URL |
| [ ] N / [ ] P / [ ] C | **8.22** | `LOG_LEVEL=info` | Production log level |
| [ ] N / [ ] P / [ ] C | **8.23** | Verify NO `RELAX_RATE_LIMIT` | `grep RELAX_RATE_LIMIT .env` → no output |
| [ ] N / [ ] P / [ ] C | **8.24** | Run check script | `node /opt/courtzon/scripts/deploy-check.js --production` → `All checks passed` |

**Notes:** ___________________________________________________________________

---

## 9. Database User Creation

**Goal:** Least-privilege MySQL users: `courtzon_app`, `courtzon_readonly`, `courtzon_migration`, `courtzon_backup`.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **9.1** Edit passwords in SQL file | Edit `/opt/courtzon/backend/scripts/setup-db-users.sql` — replace all 4 `CHANGE_ME_*` with generated passwords | Passwords in vault |
| [ ] N / [ ] P / [ ] C | **9.2** Run as MySQL root | `mysql -u root -p < /opt/courtzon/backend/scripts/setup-db-users.sql` | No errors |
| [ ] N / [ ] P / [ ] C | **9.3** Verify users created | `mysql -u root -p -e "SELECT user, host FROM mysql.user WHERE user LIKE 'courtzon_%';"` | 4 rows returned |
| [ ] N / [ ] P / [ ] C | **9.4** Verify app user privileges | `mysql -u root -p -e "SHOW GRANTS FOR 'courtzon_app'@'%';"` | `CRUD on courtzon_v2.*` |
| [ ] N / [ ] P / [ ] C | **9.5** Verify migration user privileges | `mysql -u root -p -e "SHOW GRANTS FOR 'courtzon_migration'@'%';"` | `DDL + DML on courtzon_v2.*` |
| [ ] N / [ ] P / [ ] C | **9.6** Test app user login | `mysql -u courtzon_app -p -e "SELECT 1;"` | `1` returned |

**Notes:** ___________________________________________________________________

---

## 10. Migration Execution

**Goal:** All 127+ migrations applied; database schema matches code.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **10.1** Run migrations (migration user) | `cd /opt/courtzon/backend && DB_USER=courtzon_migration DB_PASSWORD=... node scripts/migrate.js` | ⚠️ MUST show `0 FAIL` |
| [ ] N / [ ] P / [ ] C | **10.2** Verify no failures | From output: count `FAIL` lines | `grep FAIL` → empty |
| [ ] N / [ ] P / [ ] C | **10.3** Verify key tables exist | `mysql -u courtzon_app -p -e "USE courtzon_v2; SHOW TABLES;" | wc -l` | Expected: ~162 |
| [ ] N / [ ] P / [ ] C | **10.4** Verify critical tables | `mysql -u courtzon_app -p -e "USE courtzon_v2; SELECT COUNT(*) as payment_tables FROM information_schema.tables WHERE table_schema='courtzon_v2' AND table_name LIKE '%payment%';"` | >0 |
| [ ] N / [ ] P / [ ] C | **10.5** Verify settlement tables | `mysql -u courtzon_app -p -e "USE courtzon_v2; SELECT COUNT(*) as settlement_tables FROM information_schema.tables WHERE table_schema='courtzon_v2' AND table_name LIKE '%settlement%';"` | >0 |
| [ ] N / [ ] P / [ ] C | **10.6** Sync UI registry | `cd /opt/courtzon/backend && DB_USER=courtzon_migration DB_PASSWORD=... node scripts/sync-ui-registry.js` | Shows `0 inserted / N updated` |
| [ ] N / [ ] P / [ ] C | **10.7** Apply role permissions | `cd /opt/courtzon/backend && node scripts/sync-role-permissions.mjs` | Completed without error |
| [ ] N / [ ] P / [ ] C | **10.8** Verify roles exist | `mysql -u courtzon_app -p -e "USE courtzon_v2; SELECT slug FROM roles WHERE is_active=1;"` | 8 canonical roles |

**Notes:** ___________________________________________________________________

---

## 11. Backup Verification

**Goal:** Backup pipeline works end-to-end: dump → encrypt → upload → restore.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **11.1** Trigger manual backup | `cd /opt/courtzon/backend && node -e "require('./src/infrastructure/backup/backup.service').backupService.createBackup()"` | File created in `backups/` |
| [ ] N / [ ] P / [ ] C | **11.2** Verify backup file exists | `ls -lh /opt/courtzon/backend/backups/` | `.sql.gz.enc` file > 100 KB |
| [ ] N / [ ] P / [ ] C | **11.3** Test restore in dry-run mode | `cd /opt/courtzon/backend && node scripts/restore.js --dry-run backups/<latest>.sql.gz.enc` | Shows what would be restored |
| [ ] N / [ ] P / [ ] C | **11.4** Restore to test database | `cd /opt/courtzon/backend && DB_NAME=courtzon_v2_restore_test node scripts/restore.js backups/<latest>.sql.gz.enc` | `Restore complete` |
| [ ] N / [ ] P / [ ] C | **11.5** Verify restored DB has data | `mysql -u courtzon_app -p -e "USE courtzon_v2_restore_test; SELECT COUNT(*)+0 as total_tables FROM information_schema.tables WHERE table_schema='courtzon_v2_restore_test';"` | Same count as production |
| [ ] N / [ ] P / [ ] C | **11.6** Clean up test DB | `mysql -u root -p -e "DROP DATABASE IF EXISTS courtzon_v2_restore_test;"` | Done |
| [ ] N / [ ] P / [ ] C | **11.7** Verify S3 upload | Check R2/S3 bucket | Backup file present |
| [ ] N / [ ] P / [ ] C | **11.8** Check cron schedule | `crontab -l \| grep backup` OR check Coolify scheduler | Runs daily at 00:00 |

**Notes:** ___________________________________________________________________

---

## 12. Monitoring Verification

**Goal:** Health endpoint, Prometheus metrics, alerts, and uptime monitoring active.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **12.1** Health endpoint | `curl -f http://localhost:3000/health` | `status: "ok"`, DB + Redis check |
| [ ] N / [ ] P / [ ] C | **12.2** Metrics endpoint | `curl -f http://localhost:3000/metrics` | Prometheus text format returned |
| [ ] N / [ ] P / [ ] C | **12.3** Metrics token auth (if set) | `curl -H "Authorization: Bearer <METRICS_TOKEN>" http://localhost:3000/metrics` | `401` if no header, `200` with header |
| [ ] N / [ ] P / [ ] C | **12.4** Prometheus scrape config | Verify `monitoring/prometheus.yml` targets `localhost:3000` | Config valid |
| [ ] N / [ ] P / [ ] C | **12.5** Alert rules loaded | `docker compose -f docker-compose.monitoring.yml up -d` (or Coolify stack) | `curl localhost:9090/api/v1/rules` → 7 alert rules |
| [ ] N / [ ] P / [ ] C | **12.6** Set up uptime monitoring | Coolify built-in OR UptimeRobot → `https://courtzon.com` + `https://api.courtzon.com/health` | Both report UP |
| [ ] N / [ ] P / [ ] C | **12.7** Docker health checks | `docker ps --format "table {{.Names}}\t{{.Status}}"` | All containers `healthy` |

**Notes:** ___________________________________________________________________

---

## 13. E2E Smoke Test

**Goal:** Core API flows verified against production.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **13.1** Set target URLs | `export E2E_BASE_URL=https://courtzon.com E2E_API_URL=https://api.courtzon.com` | Echo both |
| [ ] N / [ ] P / [ ] C | **13.2** Run E2E smoke tests | `cd /opt/courtzon && node scripts/e2e-smoke.js` | `7/7 PASS` (expected on clean DB) |
| [ ] N / [ ] P / [ ] C | **13.3** If any fail, capture details | Check output for `❌` | Log output to file |
| [ ] N / [ ] P / [ ] C | **13.4** Manual: register user | Visit `https://courtzon.com/register` → register → verify email | User created |
| [ ] N / [ ] P / [ ] C | **13.5** Manual: login → dashboard | Visit `https://courtzon.com/login` | Dashboard loads |
| [ ] N / [ ] P / [ ] C | **13.6** Manual: 404 page does not leak stack traces | Visit `https://courtzon.com/nonexistent-page` | Custom 404, no Node stack |
| [ ] N / [ ] P / [ ] C | **13.7** Manual: API 404 does not leak stack traces | `curl https://api.courtzon.com/nonexistent-route` | `{"error":"Route not found"}`, no stack |

**Notes:** ___________________________________________________________________

---

## 14. Paymob Sandbox Test

**Goal:** Payment flow works end-to-end in sandbox mode before going live.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **14.1** Set `.env` `PAYMOB_SANDBOX=true` | `sed -i 's/^PAYMOB_SANDBOX=.*/PAYMOB_SANDBOX=true/' .env` | `grep PAYMOB_SANDBOX .env` |
| [ ] N / [ ] P / [ ] C | **14.2** Restart backend | `docker compose restart backend` (or Coolify → Redeploy) | `docker ps \| grep backend` → healthy |
| [ ] N / [ ] P / [ ] C | **14.3** Place a test order with card | Frontend → add product → checkout → Pay with card → Use sandbox test card (`4000 0000 0000 0000`, any expiry, any CVV) | Payment successful |
| [ ] N / [ ] P / [ ] C | **14.4** Verify transaction in DB | `mysql -u courtzon_app -p -e "USE courtzon_v2; SELECT id, amount, payment_status, gateway_provider FROM payment_transactions ORDER BY id DESC LIMIT 5;"` | Status: `paid` |
| [ ] N / [ ] P / [ ] C | **14.5** Test webhook callback | `curl -X POST https://api.courtzon.com/api/webhooks/paymob -H "Content-Type: application/json" -H "HMAC: <computed>" -d '{"type":"transaction","obj":{"id":99999,"amount_cents":15000,"success":true}}'` | HTTP 200 |
| [ ] N / [ ] P / [ ] C | **14.6** Test failed transaction | Same steps, use `4000 0000 0000 0002` (declined card) | Payment fails gracefully |
| [ ] N / [ ] P / [ ] C | **14.7** Test wallet/Kiosk | Paymob wallet/kiosk option | Payment initiated |

**Notes:** ___________________________________________________________________

---

## 15. Paymob Live Test

**Goal:** Live payment flow validated with a small real transaction.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **15.1** Set `.env` `PAYMOB_SANDBOX=false` | `sed -i 's/^PAYMOB_SANDBOX=.*/PAYMOB_SANDBOX=false/' .env` | `grep PAYMOB_SANDBOX .env` → `false` |
| [ ] N / [ ] P / [ ] C | **15.2** Update `VITE_PAYMOB_PUBLIC_KEY` | Set to live public key from Paymob | Rebuild frontend: `docker compose build frontend && docker compose up -d frontend` |
| [ ] N / [ ] P / [ ] C | **15.3** Restart backend | `docker compose restart backend` (or Coolify → Redeploy) | Backend healthy |
| [ ] N / [ ] P / [ ] C | **15.4** Place a small real order (e.g., 10 EGP) | Frontend → checkout → Pay with card → Enter real card | ⚠️ **This spends real money** |
| [ ] N / [ ] P / [ ] C | **15.5** Verify transaction in DB | `mysql -u courtzon_app -p -e "USE courtzon_v2; SELECT id, amount, payment_status, gateway_provider, gateway_reference FROM payment_transactions ORDER BY id DESC LIMIT 3;"` | Status: `paid` |
| [ ] N / [ ] P / [ ] C | **15.6** Verify Paymob dashboard | Log in to Paymob → Transactions → Live | Transaction appears |
| [ ] N / [ ] P / [ ] C | **15.7** Issue refund (optional) | Paymob dashboard → Transaction → Refund | Refund processed |
| [ ] N / [ ] P / [ ] C | **15.8** Verify webhook security | Check HMAC validation in backend logs | `HMAC matched` or `HMAC mismatch` logged |

**Notes:** ___________________________________________________________________

---

## 16. Rollback Procedure

**Goal:** Documented steps to revert to previous version if cutover fails.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **16.1** **Database rollback: restore from backup** | `cd /opt/courtzon/backend && node scripts/restore.js backups/<PREVIOUS_DAY>.sql.gz.enc` | Enter `yes` to confirm |
| [ ] N / [ ] P / [ ] C | **16.2** **Revert Docker images to previous tag** | `docker compose down && docker compose -f docker-compose.yml -f docker-compose.rollback.yml up -d` OR `git checkout <previous-tag> && docker compose build && docker compose up -d` | `docker ps` shows healthy |
| [ ] N / [ ] P / [ ] C | **16.3** **Restore previous .env** | `cp /opt/courtzon/backups/env.pre-cutover.<TIMESTAMP> /opt/courtzon/.env` | `diff .ev` confirms |
| [ ] N / [ ] P / [ ] C | **16.4** **Change DNS back (if applicable)** | Cloudflare DNS → grey cloud (DNS only) → Set A record to old IP | `dig +short courtzon.com` |
| [ ] N / [ ] P / [ ] C | **16.5** **Verify rolled-back system** | `curl -f http://localhost:3000/health && node scripts/e2e-smoke.js` | All tests pass |
| [ ] N / [ ] P / [ ] C | **16.6** **Document rollback reason** | Log in incident log: what failed, why, when restored | — |

### Rollback triggers (any of these):
- [ ] E2E smoke tests fail on production (excluding known pre-existing auth quirks)
- [ ] Health endpoint returns `status: down`
- [ ] Payment flow fails in sandbox or live test
- [ ] 5xx error rate > 1% after cutover
- [ ] Data integrity issue detected
- [ ] SSL certificate setup fails

**Notes:** ___________________________________________________________________

---

## 17. DNS Cutover Procedure

**Goal:** Switch from staging/beta to production traffic.

| Status | Step | Command / Action | Verification |
|--------|------|------------------|--------------|
| [ ] N / [ ] P / [ ] C | **17.1** Dry-run cutover script | `cd /opt/courtzon && chmod +x scripts/dns-cutover.sh && sudo ./scripts/dns-cutover.sh --domain courtzon.com --api-domain api.courtzon.com --www-domain www.courtzon.com --email admin@courtzon.com --dry-run` | All checks pass, no mutations |
| [ ] N / [ ] P / [ ] C | **17.2** Run live cutover | Same command without `--dry-run` | All 8 steps complete |
| [ ] N / [ ] P / [ ] C | **17.3** Verify SSL (all 3 domains) | `curl -vI https://courtzon.com 2>&1 \| grep "SSL certificate"` | Valid cert, not expired |
| [ ] N / [ ] P / [ ] C | **17.4** Enable Cloudflare proxy (orange cloud) | Cloudflare DNS dashboard → toggle proxy ON for `courtzon.com`, `www.courtzon.com`, `api.courtzon.com` | Tunnel shows HEALTHY |
| [ ] N / [ ] P / [ ] C | **17.5** Run E2E smoke tests **after cutover** | `cd /opt/courtzon && node scripts/e2e-smoke.js` | 7/7 PASS |
| [ ] N / [ ] P / [ ] C | **17.6** Verify public accessibility from outside | From a DIFFERENT network (e.g., phone hotspot): visit `https://courtzon.com` | Page loads, no cert warning |
| [ ] N / [ ] P / [ ] C | **17.7** Verify API from outside | `curl -s https://api.courtzon.com/health \| head` | `status: ok` |
| [ ] N / [ ] P / [ ] C | **17.8** Raise DNS TTL after cutover stable | Cloudflare DNS → TTL → `Auto` (or 300s) | TTL updated |
| [ ] N / [ ] P / [ ] C | **17.9** Announce go-live | Update status page, notify stakeholders | Done |

**Notes:** ___________________________________________________________________

---

## Summary

| Section | Status | Notes |
|---------|--------|-------|
| 1. VPS Provisioning | [ ] N / [ ] P / [ ] C | |
| 2. Ubuntu Hardening | [ ] N / [ ] P / [ ] C | |
| 3. MySQL Installation | [ ] N / [ ] P / [ ] C | |
| 4. Redis Installation | [ ] N / [ ] P / [ ] C | |
| 5. Coolify Installation | [ ] N / [ ] P / [ ] C | |
| 6. Cloudflare DNS Configuration | [ ] N / [ ] P / [ ] C | |
| 7. SSL Setup | [ ] N / [ ] P / [ ] C | |
| 8. Environment Variables | [ ] N / [ ] P / [ ] C | |
| 9. Database User Creation | [ ] N / [ ] P / [ ] C | |
| 10. Migration Execution | [ ] N / [ ] P / [ ] C | |
| 11. Backup Verification | [ ] N / [ ] P / [ ] C | |
| 12. Monitoring Verification | [ ] N / [ ] P / [ ] C | |
| 13. E2E Smoke Test | [ ] N / [ ] P / [ ] C | |
| 14. Paymob Sandbox Test | [ ] N / [ ] P / [ ] C | |
| 15. Paymob Live Test | [ ] N / [ ] P / [ ] C | |
| 16. Rollback Procedure | [ ] N / [ ] P / [ ] C | |
| 17. DNS Cutover Procedure | [ ] N / [ ] P / [ ] C | |

---

## Sign-Off

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Deployer | ________________ | ________________ | ________ |
| Reviewer | ________________ | ________________ | ________ |
| PM / Stakeholder | ________________ | ________________ | ________ |

**Go-Live Decision:** [ ] Approved &nbsp; [ ] Rolled Back &nbsp; [ ] Deferred

**Incident Log (if any):** ___________________________________________________________________
___________________________________________________________________
___________________________________________________________________
