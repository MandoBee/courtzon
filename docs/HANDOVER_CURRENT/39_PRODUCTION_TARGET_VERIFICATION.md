# 39 — PRODUCTION TARGET VERIFICATION

**Verification timestamp:** 2026-10-04 (UTC ~19:34–19:35) · **Mode:** STRICTLY READ-ONLY (no deletes, no updates, no inserts, no migrations, no config/container/git changes)
**Verification method:** live connections + HTTP GETs + DNS + TCP probes. No secrets are reproduced in this document; the remote credentials supplied for this session were used only to establish the read-only connection and are NOT stored or displayed.

---

## 1. IDENTIFY THE ACTUAL PRODUCTION ENVIRONMENT

Verified facts (current session):

| Item | Value | Evidence |
|---|---|---|
| Production public API | `https://api.courtzon.cloud` | HTTP GET returned live backend JSON (below) |
| Production public frontend | `https://www.courtzon.cloud` | HTTP HEAD returned 200 + CourtZon CSP (Paymob sandbox, nominatim connect-src) |
| Public DNS (both) | Cloudflare `104.21.46.156`, `172.67.140.107` (type A) | `Resolve-DnsName` |
| Origin server / host | `187.127.72.93` (Hostinger) | user-provided + TCP open on 22/80/443/3307 |
| Production MySQL endpooint | `187.127.72.93:3307` | TCP connected + mysql client connected read-only |
| Production DB name | `courtzon_v3` | `SHOW DATABASES` on remote |
| Production DB version | MySQL 8.0.46 | remote `SELECT VERSION()` |
| Production DB instance fingerprint | container hostname `2515d404b031` (docker), inner port 3306, timezone `SYSTEM`, `NOW()` 2026-10-04 19:34 | remote metadata |
| Production backend runtime | applicationVersion 1.0.0 · node v22.23.3 · buildTime 2026-10-04T16:37:48Z · expectedMigration `194_membership_entitlements` · gitCommit `unknown` · storageProvider local | `GET https://api.courtzon.cloud/health/version` |
| Production backend health | `status ok · service courtzon-v2-backend · uptime 10528s · database latency 1ms · redis ok` | `GET https://api.courtzon.cloud/health` |
| Production DB migrations | 201 rows in `migration_history`, latest `194_membership_entitlements.sql` | remote query |
| Redis (production, co-located) | reported `ok` by production `/health` | same endpoint |
| Socket.IO (production) | web UI & `/health/socket` endpoint exist; ws proxy in CSP (`ws:/wss:`); live rooms count not exposed publicly | CSP + endpoint presence |

## 2. LOCAL vs STAGING vs PRODUCTION classification

| Env | Host | URLs | Database | Docker | Git commit | Purpose |
|---|---|---|---|---|---|---|
| **PRODUCTION** | 187.127.72.93 (Hostinger, behind Cloudflare) | https://api.courtzon.cloud · https://www.courtzon.cloud | remote MySQL 8.0.46 `courtzon_v3` (port 3307 in) | containers on origin (fingerprint host `2515d404b031` for DB container) | `gitCommit=unknown` (not provable without SSH) | real live system |
| **LOCAL** | this workstation | http://localhost:5173 · http://localhost:3000 | local Docker MySQL 8.0.46 `courtzon_v3` (:3307 host), container `6622d8c632c9` | 6 containers (backend/frontend/mysql/redis/prometheus/grafana) | `aa9e3d1895e849691f145d409c12b997435536b2` (master) | local development/test system (the previously audited DB lives here) |
| STAGING | not found | none | none observed | – | – | NOT FOUND on this host / not evidenced |

**Statement:** `http://localhost:5173` and `http://localhost:3000` are the LOCAL environment. They are NOT a tunnel/proxy to production — evidence: (a) they are served by the local docker containers (`docker ps` host ports 5173/3000); (b) local backend `/health/version` reports node v22.22.3 and buildTime 16:40:44Z, while production reports node v22.23.3 and buildTime 16:37:48Z — different builds, different machines; (c) the databases they read have completely different row counts (section 7).

## 3. VERIFY THE DATABASE TARGET

Previously audited "LIVE" database (as used in `38_LIVE_AUDIT_AND_CLEANUP_PROPOSAL.md`):

| Attribute | Value |
|---|---|
| DB HOST | localhost (this workstation) |
| DB PORT | 3307 (Docker published) → 3306 (in container) |
| DB NAME | `courtzon_v3` |
| SERVER VERSION | MySQL 8.0.46 |
| CONTAINER NAME | `courtzon-mysql` |
| SERVER INSTANCE | Docker container hostname `6622d8c632c9` |
| SERVER TIME | 2026-10-04 19:34:11 (UTC+0 wall, matches remote within same minute) |
| DB TIMEZONE | `SYSTEM` (server OS tz), `@@time_zone=SYSTEM` |

Safe non-sensitive fingerprint (do NOT expose credentials): **`courtzon_v3 · MySQL 8.0.46 · instance hostname 6622d8c632c9 · 202 migration rows · latest 194`**.

Actual production database (newly verified this session):

| Attribute | Value |
|---|---|
| DB HOST | 187.127.72.93 (Hostinger origin) |
| DB PORT | 3307 (public) → 3306 (in container) |
| DB NAME | `courtzon_v3` |
| SERVER VERSION | MySQL 8.0.46 |
| CONTAINER HOSTNAME | `2515d404b031` |
| SERVER TIME | 2026-10-04 19:34:11 |
| DB TIMEZONE | `SYSTEM` |

Safe fingerprint: **`courtzon_v3 · MySQL 8.0.46 · instance hostname 2515d404b031 · 201 migration rows · latest 194`**.

## 4. PROVE WHETHER THE PREVIOUSLY AUDITED DB IS PRODUCTION

**Answer: B) The previously audited `courtzon_v3` is the LOCAL Docker MySQL database on this workstation — NOT the remote production database.**

Proof (directly observed, no assumptions):
1. The remotely-connected database (187.127.72.93:3307) and the local one (localhost:3307) have the same name (`courtzon_v3`) and version, but **different instance fingerprints** (container hostnames `2515d404b031` vs `6622d8c632c9`) and **different migration histories** (201 vs 202 rows).
2. Their data volumes are completely different (section 7).
3. Production API (`api.courtzon.cloud`) reports a different runtime (node v22.23.3, build 16:37:48Z) than local backend (node v22.22.3, build 16:40:44Z).

## 5. VERIFY THE PUBLIC PRODUCTION ENDPOINTS

Verified chain (evidence-based):

```
PUBLIC API  https://api.courtzon.cloud/health/version
   ↓  (Cloudflare A records 104.21.46.156 / 172.67.140.107)
SERVER      origin host 187.127.72.93 (hostname not exposed to API)
   ↓
BACKEND     applicationVersion 1.0.0, expectedMigration 194_membership_entitlements, /health ok
   ↓
DATABASE    production MySQL 8.0.46 courtzon_v3 reachable at 187.127.72.93:3307 (co-located; /health DB latency ~1ms)
```

Supporting evidence:
- `api.courtzon.cloud/health` returned `{"status":"ok","service":"courtzon-v2-backend","uptime":10528,...,"checks":{"database":{"status":"ok","latencyMs":1},"redis":{"status":"ok",...}}}` → the public API is live and talking to a healthy co-located MySQL + Redis.
- `www.courtzon.cloud` returned 200 with a CourtZon CSP (connect-src Paymob sandbox + nominatim; ws:/wss: allowed) → production SPA deployed.
- The exact container-to-DB link (which container name, network) cannot be proven without SSH access; the 1ms co-located latency plus reachable DB on the same origin host makes the chain consistent. **Mark: STRONG, NOT FULLY PROVABLE (SSH not available).**

## 6. VERIFY GIT / DEPLOYMENT

| Item | Value |
|---|---|
| Local commit | `aa9e3d1895e849691f145d409c12b997435536b2` (master) |
| Production commit | `gitCommit=unknown` reported by production `/health/version`; exact SHA **cannot be verified without SSH/CI access** |
| SAME / DIFFERENT | **DIFFERENT build artifacts** (node v22.23.3 vs v22.22.3; buildTime 16:37:48Z vs 16:40:44Z) → production runs a distinct build, not byte-identical to the local HEAD build. Whether that build corresponds to the same logical commit is UNKNOWN. |
| Impact | Deployment traceability gap (same known issue as local: `GIT_COMMIT` not passed at build). Blocking? No - does not block testing, but must be recorded. |

## 7. VERIFY DATABASE DATA IDENTITY

Read-only comparison (row counts, authoritative at verification time):

| Fingerprint table | AUDITED DB = LOCAL (localhost:3307) | PRODUCTION (187.127.72.93:3307) | SAME? |
|---|---|---|---|
| migration_history | 202 | 201 | NO |
| bookings | 25 | 5 | NO |
| payment_transactions | 1,086 | 10 | NO |
| ledger_entries | 34,816 | 40 | NO |
| general_ledger | 45,890 | 40 | NO |
| notifications | 2,571 | 60 | NO |
| tournaments | 3 | 3 | YES (coincidence) |
| tournament_matches | 1 | 0 | NO |
| tournament_registrations | 1 | 2 | NO |
| users | 74 | 28 | NO |
| organisations | 66 | 17 | NO |
| products | 58 | 93 | NO |
| orders | 0 | 0 | YES (both empty) |
| settlements | 0 | 0 | YES (both empty) |
| financial_entitlements | 33 | 0 | NO |
| wallet_transactions | 409 | 0 | NO |

**Conclusion:** the records previously reported (bookings 25, payment_transactions 1,086, ledger_entries 34,816, general_ledger 45,890, notifications 2,571, tournaments 3, tournament_matches 1, tournament_registrations 1) belong to the **LOCAL** database, NOT production. Production is a much smaller dataset (28 users, 5 bookings, 10 payments, 40 ledger rows) — a young or pilot-volume live database.

## 8. XAMPP / PORT 3306 / courtzon_v2

Verified this session:
- Host port 3306 is open on `127.0.0.1` (TCP probe `True`).
- A dedicated read-only connectivity test from inside the Docker network (container → host gateway `172.17.0.1:3306`) was **refused (ERROR 2003, connection refused)** → the 3306 service binds to localhost only and is not reachable from the application stack.
- Relationship: per project policy docs the legacy/production DB historically was `courtzon_v2` on XAMPP(3306). The CURRENT application stack (local and production) uses `courtzon_v3`. **Conclusion:** the XAMPP/3306 service is a separate local-only MySQL instance, unrelated to both current local `courtzon_v3` (Docker :3307) and production `courtzon_v3` (187.127.72.93:3307). Its contents were NOT inspected (no host mysql client; out of scope; read-only rule). It poses no relationship to the cleanup target and must simply remain untouched.

## 9. FINAL VERDICT

### PRODUCTION DATABASE NOT VERIFIED

**Why:** the database previously audited and recorded in `38_LIVE_AUDIT_AND_CLEANUP_PROPOSAL.md` is **the LOCAL Docker MySQL database** (`localhost:3307`, instance `6622d8c632c9`, 202 migrations) and is **provably NOT** the actual production database. The actual production environment was, in the same session, newly identified and read-only-verified as a distinct system: host `187.127.72.93`, database `courtzon_v3` (instance `2515d404b031`, 201 migrations, MySQL 8.0.46, far smaller dataset), frontend/backend live at `www.courtzon.cloud` / `api.courtzon.cloud` (behind Cloudflare).

Implication for the cleanup proposal:
- The KEEP/CLEAR/REVIEW classification and row counts in file `38` describe the **local** database. They must NOT be executed against production.
- Production cleanup, if ever approved, must be re-classified against production row counts (section 7) and be separately approved.
- **Recommendation: keep the cleanup plan frozen** until you decide explicitly which environment to clean (LOCAL testable first; PRODUCTION requires a separate, fresh proposal + approval + backup).

## 10. IMPORTANT — COMPLIANCE

Nothing was deleted, truncated, updated, inserted, or migrated. No Docker, Git, code, configuration, or environment was changed. The only actions were read-only (SELECT/SHOW) connections and public HTTP GET/HEAD requests. Credentials used were session-only and are not reproduced in this file nor stored by this report.

---

**LIVE AUDIT STATUS (this verification):** PASS — production environment identified & read-only-verified (api/www.courtzon.cloud, Hostinger origin 187.127.72.93, MySQL 8.0.46 `courtzon_v3`, migration 194).
**There exists a previous audit that was executed against the LOCAL database — the cleanup proposal therein refers to the LOCAL database and remains UNAPPROVED for production.**
**DATABASE CLEANUP STATUS:** NOT EXECUTED.