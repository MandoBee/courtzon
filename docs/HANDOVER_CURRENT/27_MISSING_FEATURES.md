# 27 — MISSING FEATURES

**Audit:** 2026-10-04 · Missing functionality ≠ bugs. Classified P0–P3.

---

## P0 — Must exist for real users
| Feature | Rationale |
|---|---|
| Real Paymob production integration incl. HMAC-authenticated webhooks & refunds | Revenue requires real gateway |
| End-to-end settlement execution + verification | Org earnings/commissions force settlement to work |
| Produce first live marketplace order (COD + online) & process it to settlement | Commerce chain is untested |
| Produce first live membership G11.22 subscription (cash+card+installment) | New billing model untested |
| Baseline regeneration (payment_allocations) | Fresh deployments break recurring payments |

## P1 — High
| Feature | Rationale |
|---|---|
| CSRF protection / SameSite audit | Session cookies + state-changing POSTs |
| Permission-based admin gating (remove role-list guard) | RBAC consistency |
| Phone OTP verification / real email verification | User identity quality |
| Inventory & slot row locking (FOR UPDATE) + race tests | Money/data integrity under concurrency |
| GL balance nightly job + reconciliation alerts | Detect silent posting drift |
| Notification template/event drift check | Orphan/dup event audit |
| Late-webhook vs booking-expiry ordering test | Money mismatch risk |
| DST & fixed-date renewal date-math test suite | Billing correctness |

## P2 — Medium
| Feature | Rationale |
|---|---|
| Org subscription trial/grace/downgrade UX | Standard SaaS billing |
| Rescheduling UX (event name exists; endpoint?—unverified) | Booking flexibility |
| No-show auto-detection worker | Operational completeness |
| Socket.IO room re-join on reconnect | Realtime resync |
| Multi-instance Socket.IO (Redis adapter) | Scaling |
| Offline-first queue for PWA | UX on mobile |
| Uniform empty-state/error components | UX consistency |
| Marketplace free-listing enforcement (max_free_listings) | Seller monetization mapping |
| Messages/chat gated by `community.chat_enabled` etc. verified in prod | FF coverage |
| Webhook delivery dashboard (admin) | Ops visibility |

## P3 — Low / Future
| Feature | Rationale |
|---|---|
| 2FA (event exists; no flow) | Security depth |
| Migrate migrations numbering (001–194 single sequence) | Chain readability |
| Legacy V2 images/DB cleanup + `courtzon_v3_baseline` removal | Ops hygiene |
| S3/R2 production storage | Curt: local-only now |
| BI/CRM/HR/ads live usage dashboards | Product breadth |
| Arabic i18n completeness across all screens | Localization |
| Push/SMS real integration | Multi-channel |
| Performance EXPLAIN pass + index tuning | Scale |

## Not bugs (deliberate per design docs)
- Legacy memberships vs G11.22 (additive migration).
- `financial_journal_entries` empty (design choice? — flagged as decision).
- Two queue infra (default + notifications).
- UTC cron (documented BE-6).