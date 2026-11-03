# Release Documentation Index

| Field | Value |
|---|---|
| Purpose | Entry point for the CourtZon release-readiness and release-record documents |
| Governing plan | [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) (**plan authority**) |
| Live status | [`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md) (**status authority** — checklist, percentages, blockers, audit trail) |
| Scenarios | [`E2E_SCENARIO_MATRIX.md`](./E2E_SCENARIO_MATRIX.md) (**scenario authority** for Phase 6) |
| Current baseline | `HEAD e0089b50a64f14d28f88d7e35bc5e918a60d2ca4` on `fix/courtzon-live-phase1`, tracking `origin/fix/courtzon-live-phase1` at `0/0`; working tree **clean**. Local frontend image rebuilt 2026-11-03; the backend image predates HEAD and `/health/version` reports `gitCommit: "unknown"` (progress §24, `OI-06` in `docs/release/OUTSTANDING_ISSUES.md`) |
| Authority model | Owner decision 2026-11-03 — plan = plan authority, progress = status authority, matrix = scenario authority (plan §1.1). Percentages and phase state are **never** recorded here |

If two documents disagree, the **plan** wins on phase scope, order and acceptance criteria; the **progress file** wins
on status, percentages, blockers and evidence; the **matrix** is the only source of test scenarios. Release records and
handovers are factual snapshots and are not edited retroactively except to append dated corrections.

Documents that described themselves as a "single source of truth" — `docs/operations/production-readiness.md`
(operational readiness) and `docs/implementation-roadmap.md` (implementation) — are **subsidiary** references, as is
the Go/No-Go checklist `docs/operations/launch-gate.md` (its sample release-summary values, e.g. `651/651`, are
illustrative and not current state).

---

## Current release documents

| Document | Purpose | Role |
|---|---|---|
| [`COURTZON_RELEASE_READINESS_PLAN.md`](./COURTZON_RELEASE_READINESS_PLAN.md) | Canonical ten-phase plan, rules, status model, budget/denominator, Amendment A1, deviation D-01 | **Authority — plan** |
| [`COURTZON_RELEASE_PROGRESS.md`](./COURTZON_RELEASE_PROGRESS.md) | Live checklist, phase dashboard, evidence ledger, blockers, session handoff, decision records | **Authority — status** |
| [`E2E_SCENARIO_MATRIX.md`](./E2E_SCENARIO_MATRIX.md) | P6-02 scenario inventory, safety classes, execution gating (execution NOT RUN) | **Authority — scenarios** |
| [`P8.7.14_RELEASE_RECORD.md`](./P8.7.14_RELEASE_RECORD.md) | Release record for the booking `findById` reachability fix: root cause, change set, tests, deployment, warnings, rollback position | Historical — record (2026-10-31) |
| [`P6_HANDOVER_2026-11-02.md`](./P6_HANDOVER_2026-11-02.md) | Phase 6 handover snapshot before the G1–G4 commit/push | Historical — snapshot |
| [`OUTSTANDING_ISSUES.md`](./OUTSTANDING_ISSUES.md) | Issue register (OI-01..OI-09) discovered during P8.7.14 | Subsidiary — register |
| [`TECHNICAL_DEBT.md`](./TECHNICAL_DEBT.md) | Debt register (TD-01..TD-13) linked to issues and roadmap items | Subsidiary — register |
| [`ROADMAP.md`](./ROADMAP.md) | Proposed workstreams (booking, notifications, payments, accounting, security, database, QA, DevOps, performance) | Subsidiary — proposal |
| [`DEPLOYMENT_GOVERNANCE.md`](./DEPLOYMENT_GOVERNANCE.md) | Build/deploy/verify/rollback/source-release rules, immutable image retention, test-isolation constraint | Subsidiary — policy |
| [`INTEGRATION_SAFETY_ASSESSMENT.md`](./INTEGRATION_SAFETY_ASSESSMENT.md) | P2-05 / B9 static safety assessment of integration tests | Subsidiary — assessment |
| [`DEPENDENCY_COMPATIBILITY_MATRIX.md`](./DEPENDENCY_COMPATIBILITY_MATRIX.md) | P2-03/P2-04/P2-06/P2-07 dependency decisions and audit | Subsidiary — living document |
| [`release-manifest.md`](./release-manifest.md) | CourtZon V3.0.0 release manifest | **IMMUTABLE -- do not modify** |
| [`final-pre-deployment-check.md`](./final-pre-deployment-check.md) | V3.0.0-era pre-deployment verification (June 2026) | Historical |

---

## Relationship to other documentation

| Location | Relationship |
|---|---|
| `docs/HANDOVER_CURRENT/26_KNOWN_ISSUES.md`, `28_TECHNICAL_DEBT.md`, `36_PRODUCTION_ROADMAP.md`, `31_DEVOPS_DEPLOYMENT.md` | 2026-10-04 handover snapshot. Historical reference only; **not superseded** by the registers above. |
| `docs/GOVERNANCE.md` | Architecture governance (ADR freeze, payment invariants). Does not govern deployments. |
| `docs/database-tls-policy.md`, `docs/deployment/*`, `docs/operations/*` | Environment-specific runbooks and policies; consult before any production action. **Subsidiary** to the three authorities — `production-readiness.md` and `launch-gate.md` do not define release status. |
| `docs/implementation-roadmap.md`, `docs/ENTERPRISE_ROADMAP.md`, `docs/RELEASE_PACKAGE.md` | Pre-plan roadmaps retained as historical/subsidiary references per plan §1 and §1.1. |

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
| 2026-11-03 | Authority model fixed by owner decision (plan/status/scenario); stale HEAD baseline replaced; competing "source of truth" documents demoted to subsidiary; P5-05/Phase 6 deviation D-01 referenced. Documentation only. |
