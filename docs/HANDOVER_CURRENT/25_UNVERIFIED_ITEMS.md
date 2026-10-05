# 25 — UNVERIFIED ITEMS

**Audit:** 2026-10-04 · Strict list of everything this handover could NOT prove. These are NOT defects by default — they are unproven claims until verified.

Priority: P0 (block production readiness), P1 (high), P2 (medium), P3 (low).

---

| # | Item | Why unverified | Missing evidence | How to verify | Prio |
|---|---|---|---|---|---|
| U1 | Webhook HMAC verification correctness | Only signature param observed; crypto path not line-read | HMAC code, key mgmt | Code review of `payment.service.ts handleWebhook` + real gateway callback | P0 |
| U2 | Real Paymob behavior (charge, redirect, callback, 3DS, declines) | Sandbox only; account not exercised | Live transaction | Sandbox merchant UAT + production pilot | P0 |
| U3 | Settlement pipeline correctness | `settlements`=0, `settlement_entitlements`=0, `gateway_settlements`=0 | Execution trace | Execute booking→settlement→transfer end-to-end | P0 |
| U4 | Marketplace checkout→order→settlement | `orders`=0 | Order+settlement rows | Buy flow UAT | P0 |
| U5 | Membership G11.22 purchase path | `membership_subscriptions`=0 / versions=0 | Purchase row | Purchaser UAT across cash/card/installments | P0 |
| U6 | FOR UPDATE / locking on slot & stock | No `SELECT ... FOR UPDATE` found in audited paths | SQL review per create/checkout | Grep + code review; race test | P0 |
| U7 | Outbox event-emit ordering vs DB commit | No afterCommit helper found | Event-vs-commit trace | Grep `emit(` sites + recovery test | P1 |
| U8 | CSRF protection / SameSite cookies | No CSRF token mechanism found; cookie attributes not fully read | Middleware code | Code review of cookie setter | P1 |
| U9 | Frontend role-gate coverage | `App.tsx` hardcoded list known; other hardcoded role checks exist | Grep for `roles.includes/` across FE/BE | Repo grep + permission diff | P1 |
| U10 | No-show auto-detection | No worker found for `no_show` | Worker/console | Code search `no_show` | P2 |
| U11 | Org-subscription trial/grace | Schema lacks trial columns | — | Confirm schema columns | P2 |
| U12 | SMS/Push real delivery | Providers mock (documented); no real keys | Provider HTTP integration | Integrate + test | P2 |
| U13 | DST boundary behavior | No DST suite | Test | Add Cairo DST unit tests | P1 |
| U14 | Fixed-date renewal edge (leap/29/30/31) | Rule exists but untested | Test | Unit test date math | P1 |
| U15 | `financial_journal_entries` writers | 0 rows; writer unknown | Writer grep | Grep table name + code review | P2 |
| U16 | Late-webhook vs booking-expiry ordering | No combined test | Spec | Integration spec timing | P1 |
| U17 | Reconnect room re-join on client | `socket-client.ts` shows reconnect listeners; re-join not seen | Client code | Code review + E2E | P2 |
| U18 | `ledger_entries` membership 1,715 rows source | No membership_subscriptions exist | Trace | SQL lineage query | P1 |
| U19 | Reports (trial balance etc.) use correct ledger | Report queries not read | SQL | Code review of reports module | P1 |
| U20 | Full test suite green TODAY | Tests not executed in this audit (tooling) | Test run | Run `npm test` + `test:int` | P2 |
| U21 | E2E suite breadth (e2e/ dir near-empty) | `.last-run.json` passed but test count unknown | Playwright trace | Inspect e2e/ specs | P2 |
| U22 | `permissions` (965) vs registry (942) drift | Not re-synced/diffed | Diff output | Run sync; diff | P2 |
| U23 | Orphaned global-role copies per org sync | 92 roles; org copies not spot-checked | DB check | Query org-scoped roles | P2 |
| U24 | Notification quiet-hours/settings default values | Not read in seeds | Seed content | Read seeds 001 | P3 |
| U25 | S3/R2 upload path | STORAGE_PROVIDER not active; unverified branch | — | Switch provider test | P3 |
| U26 | Production deployment (Hostinger/Coolify) actual config | Not accessible in this audit | Live env | Deploy dry-run | P2 |
| U27 | `users.id` INT vs BIGINT FK typing mismatch impact | Observed; not exercised | — | No-op schema note | P3 |
| U28 | `orders.cash_holder` default & COD policy | Default derived in code; owner decision | — | Product sign-off | P2 |

**Handling rule:** items above must be resolved (verified or purposefully accepted with owner sign-off) before the relevant launch gate — see `35_PRODUCTION_READINESS.md`.