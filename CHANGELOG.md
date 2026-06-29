# Changelog

## v1.0.0 — Production Release (2026-06-29)

### New Features

- **Shared pagination helper** (`buildPagination`, `paginationClause`, `limitClause`) — standardised pagination across all repositories
- **CountryFlag component** — 271 locally-hosted SVG flags, zero external CDN dependencies
- **Global auth middleware** — all routes protected by default, public routes explicitly listed
- **Prometheus metrics** — `/metrics` endpoint with `courtzon_http_request_duration_seconds` and `courtzon_http_requests_total`
- **Grafana monitoring stack** — `docker compose --profile monitoring up -d` for Prometheus + Grafana

### Security Improvements

- **Global authentication** (`app.ts`) — every route requires auth unless listed in `PUBLIC_PREFIXES`
- **Zero `console.log` in production** — all logging now uses pino structured logger
- **Forgot-password token** — no longer returned in response body; requires `DEBUG_RESET_TOKEN=true`
- **CSP hardened** — `img-src` narrowed from `https:` to `*.tile.openstreetmap.org`; `unpkg.com` and `nominatim.openstreetmap.org` explicitly allowed
- **FlagCDN removed** — all flags served locally from `/public/flags/`, eliminating 3rd-party dependency

### Performance Improvements

- **N+1 queries eliminated** in `marketplace.service.ts` checkout (6N→7 fixed queries)
- **Batch product/variant lookups** — single-query `findProductsByIds`, `findVariantsForProducts`
- **Batch seller stats** — `adminGetSellerStatsBatch`, `findActiveSubscriptionsBatch`
- **Payment history index** — `idx_user_created(user_id, created_at)` avoids filesort

### Database Migrations

| Migration | Description |
|---|---|
| `002_add_financial_unique_constraints.sql` | `UNIQUE` on `payment_transactions.gateway_reference` + `wallet_transactions(reference_type, reference_id)` |
| `003_booking_concurrency.sql` | `UNIQUE` on `bookings(resource_id, booking_date, start_time)` |
| `004_performance_indexes.sql` | `INDEX` on `payment_transactions(user_id, created_at)` |

### Critical Bug Fixes

- **Transaction isolation** — wallet deposit/withdraw now fully atomic. Repositories accept optional `conn` parameter for transaction participation.
- **FOR UPDATE** — `lockAndGetBalance` now correctly holds row lock when called with transaction connection
- **Booking concurrency** — RedisLock integrated; availability check moved inside transaction; DB UNIQUE prevents double-booking
- **Webhook idempotency** — `lockByGatewayRef` with FOR UPDATE prevents duplicate webhook processing
- **Settlement `markPaid`** — status update + journal entries now wrapped in `withTransaction`
- **Cancellation atomicity** — `cancelBooking` wraps INSERT+UPDATE in transaction with rollback

### Infrastructure Changes

- **Docker resource limits** — all 4 core services have CPU/memory limits and reservations
- **Prometheus + Grafana** — optional monitoring stack behind `--profile monitoring`
- **Coverage thresholds** — vitest configured with v8 provider, baseline 3% threshold

### Breaking Changes

- None — all API contracts preserved.

### Known Limitations

- Playwright E2E tests configured but no test files exist yet (`e2e/` directory empty)
- Integration tests require Docker + WSL (Testcontainers) — live-DB tests available as alternative
- Coverage thresholds set low (3%) as baseline — should be raised gradually as more tests are added
- No server-side coupon redemption logic (coupons are created but not applicable to checkout)
