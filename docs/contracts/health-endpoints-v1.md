# Health Endpoint Contracts (v1 — Frozen)

> **Status:** Frozen as of 2026-07-04  
> **Breaking changes require:** New version prefix + migration + CI contract test update

---

## GET /health/live

**Response:** `200 OK`
```json
{
  "status": "ok",
  "uptime": 76.3
}
```
- `status`: `"ok"` | `"degraded"`
- `uptime`: process uptime in seconds

---

## GET /health/version

**Response:** `200 OK`
```json
{
  "buildTime": "2026-07-04T16:21:00Z",
  "gitCommit": "6c23f740589d4b21f052e449d173310e7097c4f4",
  "gitCommitSource": "platform",
  "gitCommitConsistent": true,
  "gitCommitMismatch": false,
  "imageGitCommit": "unknown",
  "platformGitCommit": "6c23f740589d4b21f052e449d173310e7097c4f4",
  "applicationVersion": "1.0.0",
  "expectedMigration": "10_deduplicate_gateway_ref_index",
  "nodeVersion": "v22.22.3",
  "user": 100,
  "pid": 7,
  "ppid": 1,
  "storageProvider": "local"
}
```
- All string fields fall back to `"unknown"` when unavailable
- `expectedMigration`: highest migration filename (e.g. `"10_deduplicate_gateway_ref_index"`)
- `gitCommit`: actual commit of the running container. Resolution precedence is
  platform runtime commit (`SOURCE_COMMIT` → `GITHUB_SHA` → `COMMIT_SHA`) →
  commit baked into the image → legacy `GIT_COMMIT` → `"unknown"`.
- `gitCommitSource`: where `gitCommit` came from —
  `"platform"` | `"image"` | `"legacy-env"` | `"unknown"`.
- `gitCommitConsistent`: `true` when `gitCommit` is known **and** no available
  lower-priority source disagrees with it. Always `false` when unknown. This is
  a consistency check only — it does **not** verify that the running artifact was
  built from that revision and is not proof of build provenance.
- `gitCommitMismatch`: `true` when a lower-priority source reports a different
  commit (e.g. a stale image bake). `imageGitCommit` / `platformGitCommit`
  expose both raw values for diagnosis.

---

## GET /payments/health

**Auth:** `Authorization: Bearer <token>` (admin, `financial.reconcile`)

**Response:** `200 OK`
```json
{
  "status": "ok",
  "applicationVersion": "1.0.0",
  "gitCommit": "c84795d...",
  "provider": "paymob",
  "gatewayConfigured": true,
  "pending": { "created": 0, "pending": 0, "processing": 0 },
  "staleOver15min": 0,
  "failedLastHour": 0,
  "intentFailedByCategory": { "gateway_unavailable": 0, "gateway_rejected": 0 },
  "lastWebhookAt": "2026-07-04T16:45:12.000Z",
  "databaseMigrationVersion": "010_deduplicate_gateway_ref_index",
  "expectedMigrationVersion": "10_deduplicate_gateway_ref_index",
  "migrationSynced": true,
  "timestamp": "2026-07-04T22:00:00.000Z"
}
```

**Contract invariants:**
- `gatewayConfigured === false` → provider is `"paymob"` but credentials missing
- `migrationSynced === false` → schema drift
- `staleOver15min > 0` → webhook/sync issue
- `intentFailedByCategory.gateway_unavailable > 0` → Paymob API unreachable
- `lastWebhookAt === null` → no webhooks ever received

**Upgrade path:** If new fields are added, they must have safe defaults. Existing consumers must not break.
If fields are removed, they must remain in the response as `null` for one version cycle before removal.
