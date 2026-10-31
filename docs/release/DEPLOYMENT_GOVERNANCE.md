# CourtZon -- Deployment & Release Governance

| Field | Value |
|---|---|
| Purpose | Operational rules for building, deploying, verifying, rolling back, and releasing CourtZon |
| Status | **Adopted for the P8.7.14 line**; subordinate to [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) |
| Baseline | Backend `sha256:5ae6bc915713...94aa` (built from a dirty working tree), container `aeb9e434fb61...`, `HEAD 7b9ca362` (two local, unpushed commits: `75f3c16d`, `7b9ca362`), 213 working-tree entries |
| Scope | Local Docker today; the same rules apply to Hostinger/Coolify with the production-specific notes below |
| Related | [Release record](./P8.7.14_RELEASE_RECORD.md) - [Issues](./OUTSTANDING_ISSUES.md) - [Debt](./TECHNICAL_DEBT.md) - [Roadmap](./ROADMAP.md) |

These rules are decisions of record for this repository. They do not authorize any action by themselves: every build,
deployment, migration, seed, push, and production change still requires explicit user approval.

---

## 1. Image identity and versioning

1. Every release records **three identities**: image tag, immutable image ID (`sha256:...`), and the container ID that
   runs it. A tag alone is never evidence.
2. `latest` is treated as **mutable** and therefore unusable as a rollback reference.
3. Builds must be reproducible: the exact commit must be supplied (`SOURCE_COMMIT`), and `version.txt`,
   `build-time.txt`, `git-commit.txt`, and `expected-migration.txt` must be present in the image and verified.
4. `gitCommit = unknown` is a release **warning**, not a blocker, but it must be recorded in the release record.
5. No retagging, deleting, or pruning of any image is permitted during a build/deploy/rollback operation.

---

## 2. Preserve the last known-good image before moving `latest`

`[CONFIRMED]` In P8.7.14.7 the superseded image became unaddressable once `latest` moved (0 dangling images,
`No such image` by ID and digest). The following is now mandatory before any `docker compose build` that will move a tag:

```bash
# 1. Record the running identity
docker inspect -f '{{.Image}}' courtzon-backend
docker images courtzon-backend --no-trunc

# 2. Snapshot the current image under an immutable, dated tag
docker tag <current-image-id> courtzon-backend:predeploy-<YYYYMMDD-HHMM>-<shorthash>

# 3. Prove the snapshot resolves to the same immutable ID
docker image inspect courtzon-backend:predeploy-<YYYYMMDD-HHMM>-<shorthash> --format '{{.Id}}'
```

Only after step 3 may the tag move. `[RECOMMENDATION]` Retain the last two pre-deploy snapshots and a verified
`rollback-*` image whose runtime policy matches production.

---

## 3. Rollback image must match the security/runtime policy

1. A rollback image is only a valid target if it satisfies the **same** policy the environment requires: TLS mode
   support (`DB_TLS_MODE`), migration runner present, permission-sync confirmation gate, and health endpoint contract.
2. `[CONFIRMED]` `courtzon-backend:rollback-p876` fails those checks (no `db-tls.sh`/`db-tls.js`, no
   `scripts/migrate.sh`, older permission sync). It is usable **only** for local plaintext-DB recovery with the
   conditions recorded in P8.7.14.8; it is **not** acceptable for production.
3. Rollback mechanics (never retag `latest`):

```yaml
# docker-compose.rollback.yml  (new file; no existing file is edited)
services:
  backend:
    image: courtzon-backend:<rollback-tag>
    pull_policy: never
```

```bash
docker compose -f docker-compose.yml -f docker-compose.rollback.yml \
  up -d --no-deps --force-recreate --no-build backend
```

4. A rollback must never run migrations or seeds, and must not touch frontend, MySQL, Redis, Grafana, or Prometheus.
5. Rollback is proposed, never automatic: on a failed deployment, stop, preserve logs, report, and request approval.

---

## 4. Supply `SOURCE_COMMIT` during builds

```bash
SOURCE_COMMIT=$(git rev-parse HEAD) docker compose build backend
```

- The compose file already forwards `SOURCE_COMMIT`; an unset value silently becomes `unknown`.
- CI (Coolify) must provide its platform commit value; local builds must provide the local HEAD.
- `/health/version` is the verification point: `gitCommit` must equal the intended commit for the build to be
  considered traceable.

---

## 5. Separate approvals: build, deploy, verify, source release

| Stage | Allowed actions | Explicit approval required |
|---|---|---|
| **Build** | `docker compose build <service>`, artifact verification from image layers | For rebuilding any service; scope limited to the named service |
| **Deploy (local)** | `docker compose up -d --no-deps --force-recreate <service>` | Yes; state the exact image ID and container ID expected |
| **Verify** | health endpoints, logs, read-only DB checks, read-only artifact inspection | No additional approval, but strictly read-only |
| **Migrations / seeds** | `migrate.js`, `seed.js`, SQL writes | **Always** separate, explicit approval with the exact target and affected tables |
| **Production deploy** | Hostinger/Coolify actions | **Always** separate, explicit approval; never implied by a local success |
| **Git release** | `git add` (only authorized paths), commit, push | **Always** separate, explicit approval; no staging of unrelated entries |

A successful build is not authorization to deploy. A successful deployment is not authorization to push. A local
pass is not authorization to deploy to production.

---

## 6. Test execution must not corrupt the development database

`[CONFIRMED]` `backend/vitest.integration.config.ts` runs a global setup that connects to `127.0.0.1:3307/courtzon_v3`
and writes an accounting period, and most integration specs target that persistent database.

**Conflict of record:** the release plan's **Amendment A1** currently mandates exactly that behaviour (existing
`courtzon_v3` only, no extra databases). This governance document therefore states the recommendation and the
constraint, not a unilateral change:

1. Do **not** run integration/E2E suites against a database that holds data you intend to keep.
2. Until Amendment A1 is formally amended by the owner, integration execution remains a **risk-accepted, explicitly
   authorized** operation with the guarded cleanup path -- and must be reported as such (`ACCEPTED_RISK`, never
   `PASS` on isolation grounds).
3. Unit suites (`backend/vitest.config.ts`, `frontend/vitest.config.ts`) are safe: they exclude
   `*.integration.spec.ts`, use mocks, and never open a database or Docker connection.
4. `[RECOMMENDATION]` Amend the plan to prefer a disposable database per integration run, or make Testcontainers the
   default for all integration specs.

---

## 7. Read-only preflight and post-deployment verification

Every deployment requires a recorded preflight, and a stop condition if any check differs.

### 7.1 Preflight (read-only)

```bash
docker inspect -f '{{.Id}} {{.Image}} {{.State.Status}} {{.State.Health.Status}} {{.RestartCount}}' courtzon-backend
docker images courtzon-backend --no-trunc
git rev-parse HEAD && git status --porcelain=v1 | wc -l
# plus: confirm the target image ID, rollback tag/ID, and that no unexpected source drift exists
```

Stop and report if: the container is not healthy, the image ID differs from the recorded one, the rollback tag moved,
HEAD changed unexpectedly, or the working-tree entry count changed without explanation.

### 7.2 Post-deployment

1. Container ID and image ID match the intended target exactly.
2. `running` + `healthy`, restart count `0` after stabilization.
3. All eight endpoints return 200: `/health`, `/health/live`, `/health/ready`, `/health/database`, `/health/redis`,
   `/health/storage`, `/health/socket`, `/health/version`.
4. Startup log review: TLS policy, database reachability, migration outcome, permission sync, translation artifact,
   worker start, error lines.
5. Only the targeted container was recreated; all other container IDs are unchanged.
6. Read-only DB comparison before/after (migration count and max filename, permissions, role grants, ledger rows).
7. Record everything in the release record and progress file; keep warnings (`W1`, `W2`, ...) explicit.

---

## 8. Migrations, seeds, and production data

1. No `migrate.sh --fresh`, database drop/recreate, or destructive cleanup without explicit written approval naming
   the affected tables.
2. `docker compose down mysql` is prohibited without approval: it destroys the local database.
3. Startup migrations run automatically inside the container; a deployment therefore implies schema movement. Verify
   `No new migrations to apply` **or** obtain approval before deploying when pending migrations exist.
4. Seeds are never part of a deployment verification step; they are a separate, approved data operation.
5. Production (`Hostinger/Coolify`) requires `COURTZON_MIGRATION_ENV=production` and an explicit `DB_TLS_MODE`
   (`require` minimum; `verify-ca` only when the server certificate carries the correct SAN).

---

## 9. Preserve pre-existing working-tree changes

1. The working tree may contain unrelated, user-owned modifications. They must be preserved -- never reset, stashed,
   cleaned, or checked out during a release task.
2. Stage only files explicitly authorized for the release; use path-scoped `git add <path>` rather than `git add -A`
   when the tree contains unrelated entries.
3. Before any commit, record the entry count and the diff summary, and confirm that the intended paths are the only
   ones staged.
4. Documentation-only tasks must not touch source, tests, SQL, Docker files, or environment files.

---

## 10. Release record requirements

Every release must leave a permanent record containing:

- Progression of sub-items with their verdicts (including items that were not executed).
- Root cause and the exact change set (paths + hashes).
- Test evidence: suite, command, counts, duration, and any failures with a pre-existing assessment.
- Deployment identity (image ID, container ID, build time, commit stamp, expected migration).
- Health endpoint results and startup log findings.
- Database effects (migrations applied, rows written) and confirmation of what was **not** written.
- Warnings with severity and a link to the issue register.
- Rollback position and its limitations.
- Explicit non-actions (no Git writes, no seeds, no retags, etc.).

Template: [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md). Live status remains in
[`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md).

---

## 11. Quick checklist (copy into the release task)

```
[ ] Preflight recorded: container/image IDs, rollback tag/ID, HEAD, working-tree count
[ ] Immutable pre-deploy snapshot created and verified by ID
[ ] SOURCE_COMMIT supplied at build time
[ ] Build scope limited to the named service; no retag/prune/rmi
[ ] Deployment approved separately and limited to the named service
[ ] Post-deployment: image/container IDs, healthy, 0 restarts
[ ] Eight health endpoints 200; startup log reviewed
[ ] Only the target container recreated; other container IDs unchanged
[ ] Read-only DB before/after comparison recorded
[ ] Warnings classified and linked to the issue register
[ ] Rollback position documented (with limitations)
[ ] Explicit non-actions listed; nothing pushed or migrated without approval
```
