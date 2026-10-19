# ADR 008: Health Contract Security Redaction

**Status:** Accepted — project owner decision (2026-10-19); no separate organizational approval recorded  
**Date:** 2026-10-19  
**Authors:** CourtZon Engineering

## Context

`GET /health/storage` and `GET /health/version` are public (unauthenticated)
operational endpoints. The v1 response contract
(`docs/contracts/health-endpoints-v1.md`) exposed internal infrastructure
details:

- `/health/storage`: `uploadDir` (internal container filesystem path, e.g.
  `/app/uploads`) and `freeDiskMb` (free disk capacity).
- `/health/version`: `user` (process uid), `pid`, and `ppid` (process
  identifiers).

These fields have no monitoring/verification value for external callers, but
they enable infrastructure reconnaissance and reduce defence in depth. MB-03
removed them from the implementation:

- `backend/src/infrastructure/health/health.service.ts` — `healthStorage()` now
  returns `{ status, writable, error? }`.
- `backend/src/shared/utils/build-info.ts` — `buildVersionPayload()` returns
  build/deployment metadata only.

Retained `/health/version` fields: `buildTime`, `gitCommit`, `gitCommitSource`,
`gitCommitConsistent`, `gitCommitMismatch`, `imageGitCommit`,
`platformGitCommit`, `applicationVersion`, `expectedMigration`, `nodeVersion`,
`storageProvider`. Retained `/health/storage` fields: `status`, `writable`, and
an optional generic `error`.

This is a breaking field removal under `docs/api-versioning-policy.md` (major
version required for field removal) and `docs/architectural-guardrails.md`
(never remove fields without a deprecation period; `X-Deprecated`/`Sunset`
headers). It also conflicts with the "retain as `null` for one version cycle"
removal rule in `docs/contracts/health-endpoints-v1.md`.

## Decision (approved — project owner, 2026-10-19)

### Decision record

- **Decision:** Option A — retain the MB-03 redaction and record a narrowly
  scoped security exception (see below).
- **Decided by:** the CourtZon project owner.
- **Date:** 2026-10-19.
- **Scope:** only the five fields listed in Context.
- **Approval boundary:** this is the project owner's decision. The repository
  defines no separate organizational approval authority or workflow; no external
  organizational approval is recorded or implied by this ADR.

A narrowly scoped security exception is recorded for the frozen v1 health
contract for this removal, instead of:

(a) retaining the sensitive values as `null` for one version cycle, or
(b) introducing a new API-contract version.

The exception applies explicitly to:

- the frozen v1 contract (`docs/contracts/health-endpoints-v1.md`),
- the null-retention removal rule,
- the deprecation-period and `X-Deprecated`/`Sunset` requirements.

No runtime behaviour beyond the MB-03 removal is introduced by this decision.

## Alternatives Considered

1. **Retain the fields as `null` for one version cycle.** Rejected: the fields
   would remain in the public schema, and null placeholders provide no security
   benefit while continuing to advertise the sensitive shape.
2. **Introduce a new contract version (v2).** A defensible alternative,
   considered disproportionate for two operational endpoints with no known
   internal consumer; it would consume a version prefix without a functional
   need. This alternative was not adopted.
3. **Narrowly scoped security exception (adopted).** Keeps the redaction,
   documents the deviation, and bounds its scope to these five fields.

## Compatibility Impact

- No internal consumer of the removed fields was found:
  `scripts/ci-arch-check.sh` checks `gitCommit` / `applicationVersion` /
  `expectedMigration` (all retained); `backend/scripts/e2e-validation.mjs`
  checks storage `status` and version `nodeVersion` (retained).
- External consumers of the removed fields are **unknown**. The endpoints are
  public, and the absence of repository configuration is not proof that no
  external scraper/monitor reads them.

## Consequences

- **Positive:** internal paths, disk capacity and process identifiers are no
  longer exposed on public endpoints.
- **Negative:** formal deviation from the frozen v1 contract and from the
  documented removal/versioning rules. The deviation is authorized by the
  project-owner decision recorded above (2026-10-19). No separate organizational
  approval is recorded or claimed; the repository defines no such approval
  workflow.
- **Follow-ups:**
  1. **Completed 2026-10-19.** The decision was taken and recorded by the
     CourtZon project owner (see Decision record above). No separate
     organizational approver exists or is claimed.
  2. **Completed 2026-10-19.** This ADR's status is `Accepted`.
  3. **Completed.** The contract-validation plan (`docs/GOVERNANCE.md`) preserves
     assertions for the retained fields and explicitly excludes `uploadDir`,
     `freeDiskMb`, `user`, `pid`, and `ppid`.
  4. **Decided.** The project owner's Option A explicitly waives the
     deprecation-period and `X-Deprecated`/`Sunset` requirements for these five
     fields only, as recorded in `docs/contracts/health-endpoints-v1.md`.
- **Remaining (compatibility monitoring, not a pending decision):** external
  consumers of the removed fields remain unknown. This does not alter the
  accepted decision.

## Status

**Accepted — project owner decision (2026-10-19).** No separate organizational
approval has been recorded and none is claimed; the repository defines no
organizational approval workflow for ADRs.
