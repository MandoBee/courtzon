# Release Documentation Index

| Field | Value |
|---|---|
| Purpose | Entry point for the CourtZon release-readiness and release-record documents |
| Governing plan | [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) (authority) |
| Live status | [`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md) (checklist, percentages, audit trail) |
| Current baseline | `HEAD 7b9ca362696269edc43a9ddfc64072cc54645904` (two **local, unpushed** commits: `75f3c16d` booking fix, `7b9ca362` baseline release docs); local backend `sha256:5ae6bc915713...94aa`; working tree **213 entries** (seven B2 release documents still untracked) |

If two documents disagree, the **plan** wins over this index, and the **progress file** wins over any release record for
status/percentages. Release records are factual snapshots and are not edited retroactively except to append dated
corrections.

---

## Current release documents

| Document | Purpose | Status |
|---|---|---|
| [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) | Canonical ten-phase plan, rules, status model, budget/denominator, Amendment A1 | **Active -- authority** |
| [`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md) | Live checklist, phase dashboard, evidence ledger, session handoff (section 20+) | **Active -- live** |
| [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md) | Release record for the booking `findById` reachability fix: root cause, change set, tests, deployment, warnings, rollback position | **Active -- record (2026-10-31)** |
| [`OUTSTANDING_ISSUES.md`](./OUTSTANDING_ISSUES.md) | Issue register (OI-01..OI-09) discovered during P8.7.14 | **Active -- register** |
| [`TECHNICAL_DEBT.md`](./TECHNICAL_DEBT.md) | Debt register (TD-01..TD-13) linked to issues and roadmap items | **Active -- register** |
| [`ROADMAP.md`](./ROADMAP.md) | Proposed workstreams (booking, notifications, payments, accounting, security, database, QA, DevOps, performance) | **Active -- proposal** |
| [`DEPLOYMENT_GOVERNANCE.md`](./DEPLOYMENT_GOVERNANCE.md) | Build/deploy/verify/rollback/source-release rules, immutable image retention, test-isolation constraint | **Active -- policy** |
| [`E2E_SCENARIO_MATRIX.md`](./E2E_SCENARIO_MATRIX.md) | P6-02 scenario inventory (execution NOT RUN) | Active -- inventory |
| [`INTEGRATION_SAFETY_ASSESSMENT.md`](./INTEGRATION_SAFETY_ASSESSMENT.md) | P2-05 / B9 static safety assessment of integration tests | Active -- assessment |
| [`DEPENDENCY_COMPATIBILITY_MATRIX.md`](./DEPENDENCY_COMPATIBILITY_MATRIX.md) | P2-03/P2-04/P2-06/P2-07 dependency decisions and audit | Active -- living document |
| [`release-manifest.md`](./release-manifest.md) | CourtZon V3.0.0 release manifest | **IMMUTABLE -- do not modify** |
| [`final-pre-deployment-check.md`](./final-pre-deployment-check.md) | V3.0.0-era pre-deployment verification (June 2026) | Historical |

---

## Relationship to other documentation

| Location | Relationship |
|---|---|
| `docs/HANDOVER_CURRENT/26_KNOWN_ISSUES.md`, `28_TECHNICAL_DEBT.md`, `36_PRODUCTION_ROADMAP.md`, `31_DEVOPS_DEPLOYMENT.md` | 2026-10-04 handover snapshot. Historical reference only; **not superseded** by the registers above. |
| `docs/GOVERNANCE.md` | Architecture governance (ADR freeze, payment invariants). Does not govern deployments. |
| `docs/database-tls-policy.md`, `docs/deployment/*`, `docs/operations/*` | Environment-specific runbooks and policies; consult before any production action. |
| `docs/implementation-roadmap.md`, `docs/ENTERPRISE_ROADMAP.md`, `docs/RELEASE_PACKAGE.md` | Pre-plan roadmaps retained as historical/subsidiary references per plan section 1. |

---

## Conventions used by the new release documents

- Evidence labels: `[CONFIRMED]`, `[HYPOTHESIS]`, `[RECOMMENDATION]`, `[UNVERIFIED]`.
- Issue IDs: `OI-nn`; debt IDs: `TD-nn`; roadmap IDs: `RM-<area>-nn`.
- Status vocabulary: `Open`, `Planned`, `Blocked`, `Completed` (a `Completed` entry requires executed evidence).
- No owners and no delivery dates are assigned in these documents; both require an explicit owner decision.
- No secrets, credentials, or personal data are recorded. Database findings cite counts and identifiers only.

---

## Maintenance

| Date | Change |
|---|---|
| 2026-10-31 | Index created; new registers and governance document added after P8.7.14.5 -- P8.7.14.13. |
