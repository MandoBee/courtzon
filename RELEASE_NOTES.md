# CourtZon V2 — Version 1.0.0 Release Notes

## Highlights

CourtZon V2 is a complete sports management platform for court facilities built with Domain-Driven Design, event-driven architecture, and realtime communications. This release covers the full operational lifecycle: booking, payments, marketplace, academies, coaching, tournaments, memberships, loyalty, dynamic pricing, and enterprise finance.

Version 1.0.0 represents the first stable, production-ready release of the rewritten architecture.

## Major Features

### Core Operations
- **Court Booking** — Browse branches, select resources, book with wallet/gateway/cash payment, confirm, cancel, refund
- **Real-time Availability** — Live court availability with automatic conflict detection
- **Scheduling Engine** — Coach session scheduling with availability management

### Commerce
- **Marketplace** — Products, cart, checkout, orders, shipping, reviews, seller dashboard
- **Dynamic Pricing** — Configurable pricing rules (7 types), season rules, day-of-week/time matching, demand multipliers, price preview simulator

### Sports Management
- **Tournaments** — 7 formats (knockout, round-robin, Swiss, etc.), automatic bracket generation, ELO ratings, live standings
- **Academies** — Programs, enrollment, sessions, attendance tracking
- **Coaching** — Session booking, requests, availability management, scheduling engine
- **Public Matches** — Player matching, join requests, invitations

### Finance
- **Double-Entry Ledger** — Immutable financial records with balanced debit/credit entries
- **Wallet** — Deposit, withdraw, balance, transaction history
- **Settlements** — Marketplace settlement batches with approval workflow
- **Revenue Reporting** — Revenue by account type, date range filtering

### Membership & Loyalty
- **Membership Plans** — 10 plan types (monthly through student), subscribe flow
- **Loyalty Program** — 5 tiers (Bronze→Diamond), points calculation with campaign multipliers, rewards catalog

### Notifications & Realtime
- **Notification Engine** — 80+ event subscriptions, 6 delivery channels (in-app, email, push, SMS, WhatsApp, webhook)
- **Real-time Updates** — All dashboards update instantly via Socket.IO
- **Global Search** — Command Palette (Ctrl+K), keyboard navigation, entity preview drawer

### Enterprise Administration
- **Admin Dashboard** — KPIs, charts, recent activity, system health, action center
- **Finance Dashboard** — Revenue KPIs with drill-down, ledger viewer, report center
- **Reception Desk** — Walk-in booking, check-in, quick search
- **Platform Health** — Health checks, Redis info, Prometheus metrics
- **Audit Center** — Filterable logs with before/after diff viewer
- **Webhook Management** — CRUD for notification webhooks
- **Settings Framework** — Searchable settings with import/export

## Architecture

- **Pattern:** Modular Monolith with Domain-Driven Design
- **Backend:** Fastify + TypeScript
- **Frontend:** React 18 + Vite 8 + TypeScript
- **Database:** MySQL 8 (163 tables, parameterized queries)
- **Cache/Queue:** Redis 7 + BullMQ
- **Realtime:** Socket.IO 4 via EventBus V2 → SocketPublisher pipeline
- **Testing:** Vitest (601 tests, 69 files)
- **Monitoring:** Prometheus (35 metrics) + Grafana

## Technology Stack

| Layer | Technology |
|-------|-----------|
| Backend Framework | Fastify 4.x |
| Frontend Framework | React 18 + Vite 8 |
| Language | TypeScript 5.x |
| Database | MySQL 8 |
| Cache / Queue | Redis 7 + BullMQ |
| Realtime | Socket.IO 4.x |
| Validation | Zod |
| Testing | Vitest |
| Monitoring | Prometheus + Grafana |
| Containerization | Docker + Docker Compose |
| CI | Pre-build validation script |

## Security

- **Authentication:** JWT-based sessions with refresh tokens
- **Authorization:** Granular RBAC with UI permission management
- **Rate Limiting:** Global (100 req/min) + brute-force (Redis, 5 attempts/15min)
- **Headers:** CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy
- **SQL Injection:** Parameterized queries throughout
- **Audit Logging:** All state-changing operations logged with before/after state

## Realtime

- **Pipeline:** Domain Event → EventBus V2 → SocketPublisher → Socket.IO → Frontend
- **Zero direct socket.emit()** from business code
- **49 subscribed events** across booking, payment, wallet, marketplace, notification, match, academy, coaching, settlement, attendance, membership, and presence domains
- **7 room types:** user, organisation, branch, booking, academy, coach, superadmin, finance, marketplace

## Performance

- Health endpoint response: ~3ms
- Database latency: ~2ms
- Redis latency: ~1ms
- Prometheus scrape: ~9ms
- Frontend code-split across 130+ chunks

## Testing

- **601 tests** across 69 test files
- Domain aggregate tests for state machines
- Command handler unit tests with mocked repositories
- Event contract tests for schema stability
- Version contract tests for aggregate versioning
- Integration tests with real database (Testcontainers)

## Monitoring

- **35 Prometheus metrics** across command pipeline, event bus, workflow engine, socket gateway, outbox poller, and dead letter queue
- **8 health endpoints:** composite, liveness, readiness, database, Redis, storage, Socket.IO, version
- **Grafana dashboards** via provisioned datasource
- **6 alert rules:** backend down, high error rate, elevated errors, high latency, notification delivery failure, Redis unavailable

## Docker Services

| Service | Port | Profile |
|---------|------|---------|
| MySQL | 3307 | default |
| Redis | 6379 | default |
| Backend | 3000 | default |
| Frontend | 5173 | default |
| Prometheus | 9090 | monitoring |
| Grafana | 3001 | monitoring |

## Known Future Roadmap

The following features were intentionally deferred from Version 1.0:

| Feature | Target | Description |
|---------|--------|-------------|
| API Key Management | V1.1 | Third-party integration support |
| Stripe Auto-Billing | V1.1 | Recurring subscription/membership payments |
| Gift Cards | V1.2 | Revenue feature |
| Staff Scheduling | V1.2 | Employee shift management |
| Inventory Management | V1.2 | Low-stock alerts |
| Drag-drop Tournament Bracket | V1.2 | UX improvement |
| Native Mobile Apps | V2.0 | iOS/Android |
