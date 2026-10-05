# 28 — TECHNICAL DEBT

**Audit:** 2026-10-04 · Ranked by risk (HIGH→LOW).

---

## HIGH risk

| # | Debt | Where | Why risky | Mitigation |
|---|---|---|---|---|
| TD1 | Two/three ledger systems (`ledger_entries`, `general_ledger`, `financial_journal_entries`, `marketplace_ledger_entries`, `transactions/transaction_entries`) | financial/accounting modules | Report/SQL could read the wrong source; data integrity confusion; multiple code paths | Single-write-path consolidation (owner decision) |
| TD2 | Service monoliths (>3k lines booking, >1.8k payment, >2.2k marketplace) | booking/payment/marketplace application | Hard to reason, test at integration, or safely change | Incremental split by bounded flow |
| TD3 | `organisation.routes.ts` (86) & `tournament.routes.ts` (80) & `academy.routes.ts` (77) large surfaces | presentation | Permission spread & drift risk | Route-group refactor + permission overview tests |
| TD4 | Dormant legacy: legacy memberships tables, `courtzon_v2` images, XAMPP v2 DB, `courtzon_v3_baseline` (317 tables) | infrastructure/DB | Operator confusion; duplicated concepts | Deprecation plan + cleanup list |
| TD5 | Optimistic locking without verified row locks in money paths | booking/marketplace | Race double-book/oversell | FOR UPDATE + DB uniques (Phase 2) |

## MEDIUM risk

| # | Debt | Where | Why | Mitigation |
|---|---|---|---|---|
| TD6 | Non-uniform migration numbering (`002_*`×3, gaps, orphan `103b`) | migrations | Chain reasoning hard; guard scripts file-sorted | Future renumber single sequence |
| TD7 | Hardcoded role slugs in frontend guards and some BE spots | App.tsx, apps | Permission policy violation | Permission-based gates |
| TD8 | Regenerated `translation-keys.registry.ts` committed (boot-sync overwrites) | i18n | Manual edits lost | Generation pipeline documentation |
| TD9 | `metadata`/`snapshot` JSON unchecked in many tables | DB | Shape drift | JSON schema validation + tests |
| TD10 | Cron density (2-min sweeps × multiple) on one process | server.ts | Queue contention; tail latency | Batch cadence tuning |
| TD11 | Outbox/event ordering reliance on service discipline | event-bus | Missing afterCommit helper → emit-before-commit risk | Introduce afterCommit abstraction |

## LOW risk / cleanup

| # | Debt |
|---|---|
| TD12 | Duplicate routes/aliases (redirects) |
| TD13 | Dead notification events (club:*, auth:2fa-setup...) subscribed no-op |
| TD14 | `users.id` INT vs BIGINT FKs |
| TD15 | Inconsistent soft-delete across tables |
| TD16 | Some screens rely on manual refresh (matches/queues) |
| TD17 | Global i18n completeness (ar) |
| TD18 | Legacy `*.routes.ts` index.ts patterns in coherence modules vs new layered pattern |
| TD19 | `repo` root clutter: audit_*.md, cookies.txt, CourtZon.zip, old reports |

## TODO/FIXME (static evidence)

- Backend: 10 matches for TODO/FIXME/HACK/XXX (e.g. `auth.routes.ts` "Replace with email verification when email service is enabled"; `version-contract` TODO notes).
- Frontend: 4 matches (e.g. legacy org-role-switching deprecation TODO in App.tsx).

## Unused dependencies / dead code candidates (❓)

- `financial_journal_entries` (dead table).
- `platform_accounts` (seeded, postings unverified).
- `year_closings`/`year_close_cycles` (no flow found → verify).
- Legacy `membership_benefits`/`memberships` (legacy).
- `ad_*`, `loyalty_*`, `reward_*`, `crm` modules — wired, zero/little live data; candidate for de-scope or feature-gate.