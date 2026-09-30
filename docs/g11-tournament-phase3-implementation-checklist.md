# G11-TOURNAMENT Phase 3 — Implementation Checklist

**Rule (locked):** the CourtZon **PLATFORM** must never create, own, fund, or
financially recognise a tournament. Only an **ORGANISATION** may create and own a
tournament. CourtZon is platform / custodian only.

## Resolved decisions

| # | Decision | Choice |
|---|----------|--------|
| 1 | Super-admin tournament creation | **A** — super-admin creates **on behalf of a selected organisation**; the picker reuses the organisation-scoped creation semantics (`POST /org/:orgId/tournaments`), never the unsafe global `/admin` semantics |
| 2 | Production data | **R-C** — cancel the org-less tournament + manual refund of the paid cash; migration guard scopes its abort to **ACTIVE** org-less rows only |
| 3 | Legacy `activities` tournament routes | **A** — remove outright (POST / PUT / DELETE) |

## Production §A9 findings (Hostinger `courtzon_v3` @ 187.127.72.93:3307, MySQL 8.0.46)

| Check | Count |
|---|---|
| `tournaments WHERE organisation_id IS NULL` | **1** (id 1 "Padel Test Tournment", `registration_open`, `is_public=1`, 2 registrations, 1 paid **600.00 AED cash** payment #55 by player 122) |
| `tournaments WHERE tournament_type='platform'` | **2** (id 1 org-less; id 2 org 6 **mislabelled** — legacy `activities` INSERT omitted `tournament_type`) |
| `tournaments org-less AND type<>'platform'` | 0 |
| `tournament_prize_awards WHERE funding_source='platform'` | 0 |
| registrations on org-less tournaments | **2** |
| `ledger_entries` for the 3 removed platform event types (`source_type` / `event_type`) | 0 / 0 |

No accounting damage exists — the fail-closed guards already prevented any
posting. The exposure is the **un-refunded 600.00 AED cash** held by CourtZon.

## Outstanding operational steps (R-C — require explicit user action, NOT run by the assistant)

1. **✅ Done (2026-09-30) — production tournament 1 cancelled.** Via SSH:
   `UPDATE tournaments SET status='cancelled', archived_at=NOW() WHERE id=1 AND organisation_id IS NULL`.
   Pre: `registration_open`, org NULL, `platform`; Post: `cancelled`, archived `2026-09-30 10:41:31`.
   The row stays inert; migration 183 (PRODUCTION_SAFE) can now be applied on
   Hostinger (pending — applied locally only; deploy/pull runs `migrate.js` and
   will normalise the historical `platform` labels to `community`).
2. **⏳ OUTSTANDING — manually refund 600.00 AED CASH to player 122**
   (`payment_transactions` id 55, paid-cash into the org-less tournament).
   The assistant does NOT move money; this must be performed by an operator.

## Order of work

- [x] 1. Verify `ACCOUNTING_REPLAY_EVENTS` replay dependencies
      → `tournament:prize-awarded` / `tournament:prize-refunded` are **EventBus**
        events that dispatch to the runtime handler; they do **not** reference the
        platform concept keys. Removing the concepts does **not** require touching
        the replay list — replay stays green for the organisation paths.
- [x] 2. Migration `183_tournament_organisation_only.sql` (PRODUCTION_SAFE)
- [x] 3. DTO — remove `tournament_type` + `organisation_id` from create/update
- [x] 4. Service — organisation-only type + reject org-less create (`TOURNAMENT_ORGANISATION_REQUIRED`, 422)
- [x] 5. Repository — `create()` requires org + `community` only; `update()` allowlist drops both keys
- [x] 6. Routes — remove `POST /admin/tournaments`; remove 3 legacy `activities` routes
- [x] 7. Accounting — remove 3 platform concepts, 3 account maps, 3 listener branches (fail-closed guard retained for legacy rows)
- [x] 8. Prize award service — `PrizeFundingSource` is organization-only; org-less (legacy) tournaments fail closed
- [x] 9. Role permission templates — new `tournament.create.organisation` key (granted + synced)
- [x] 10. Frontend — org picker in admin mode, remove platform UI + keys; submit gated on `org.tournaments.create` + disabled without org
- [x] 11. Tests T1–T10 + regression on G11.1–G11.7 (unit + integration + frontend)
- [x] 12. Gates — `npm test` (green; 5 pre-existing date-dependent org-subscription failures unchanged), `npm run test:int`, frontend tests + build, backend build, `ci-validate.js` (220 pre-existing errors at HEAD — zero new from Phase 3), migration 183 applied locally + baseline regenerated, Docker rebuilt

## Out of scope (explicitly NOT touched)

`tournament-finances.service.ts` · `tournament-prize-award.repository.ts` ·
`gateway-settlement.reconciliation.ts` · sponsor code · description composer ·
`org-tournament.routes.ts` · `org-tournament.controller.ts` ·
`database/seeds/00{4,5,6}_*.sql` · any `tournament_org_*` accounting concept ·
4300 / 4140 account definitions · historical accounting data · P&L redesign ·
Phase 4.

## Preserved fail-closed guards (kept on purpose)

These guard **legacy** org-less rows and are *not* platform features:

- `accounting-event.listener.ts` — org-less CASH registration fails closed
- `entitlement-tournament.listener.ts` — no counterparty ⇒ no entitlement
- `tournament-refund.service.ts` — no organisation ⇒ no refund request
- `tournament.service.ts:resolveEffectiveRegistrationPaymentMethods` — no org ⇒ global policy

## Required tests

| ID | Requirement |
|----|-------------|
| T1 | Admin unsafe create route unavailable (`POST /admin/tournaments` → removed, source-contract asserted) |
| T2 | Legacy create + PUT unavailable (`POST/PUT /tournaments/:id` legacy `activities` routes removed — D3) |
| T3 | Service rejects create without organisation (`TOURNAMENT_ORGANISATION_REQUIRED`, 422) |
| T4 | `tournament_type='platform'` unsuppliable (DTO strips, service forces `community`) |
| T5 | Every new tournament is organization-owned / `community` |
| T6 | Platform accounting concepts (`tournament_platform_card_payment`, `tournament_prize_award`, `tournament_prize_refund`) no longer exist |
| T7 | DB rejects `tournament_type='platform'` after migration (enum narrowed) |
| T8 | DB rejects `funding_source='platform'` after migration (enum narrowed) |
| T9/T10 | Frontend admin mode cannot render or submit a create form without an owning organisation |
