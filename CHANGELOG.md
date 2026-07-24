# Changelog

## v1.0.0 (2026-07-24)

### Added
- Complete DDD architecture across 22 modules (domain/application/infrastructure/presentation)
- EventBus V2 with outbox pattern, idempotent delivery, cursor-based subscribers, dead letter queue
- Command Pipeline with validate/authorize/execute/events lifecycle
- Workflow Engine with registry, dispatcher, and 5 registered workflow definitions
- Real-time Socket.IO layer via EventBus V2 → SocketPublisher pipeline
- Dynamic Pricing Engine with 7 rule types, season/day-of-week/time matching, demand multipliers
- Double-Entry Ledger with immutable financial history and settlement batches
- Membership Platform with 10 plan types, subscribe flow, rewards catalog
- Loyalty Platform with 5 tiers (Bronze→Diamond), points with campaign multipliers
- Tournament Management with 7 formats, bracket generation, ELO ratings, standings
- Reception Desk with walk-in search, check-in, today's schedule
- Global Search with Command Palette (Ctrl+K), keyboard navigation, entity preview
- Notification preferences UI with category/channel matrix and quiet hours
- Webhook management CRUD page
- Platform Health dashboard with health checks, Redis info, Prometheus metrics
- Audit Center with advanced filters, before/after diff viewer
- Settings framework with search, import/export, unsaved changes detection
- Finance Dashboard with drill-down KPI navigation, ledger viewer, report center
- Action Center component on all 5 dashboards (player, coach, org, admin, reception)
- ExportButton component (CSV, JSON, Print) on finance pages
- 35 Prometheus metrics across all infrastructure components
- 8 health endpoints (composite, liveness, readiness, database, Redis, storage, socket, version)

### Changed
- Migrated 15 modules from legacy flat architecture to DDD (Booking, Payment, Wallet, Marketplace, Settlement, Notifications, RBAC, Security, Audit, Financial, Auth, Activities, Upload, Scheduling, Match)
- Replaced legacy BookingSaga/PaymentSaga with Command Pipeline handlers
- Replaced legacy platform compatibility layer with direct domain module imports
- All 59 eventBus.emit() calls migrated to EventBus V2
- All 12 eventBus.on() listeners migrated to EventBus V2 subscribers
- Legacy EventEmitter completely removed
- Legacy QuickActions workspace imports replaced with shared ActionCenter component

### Improved
- Admin sidebar organized with grouped sections and nested items
- Notification page with infinite scroll, search, day grouping, bulk selection, pin/unpin
- Tournament detail with bracket viewer, score entry modal, standings table, ELO panel
- System health page with health cards, Redis info, metrics summary
- Audit log page with entity/action filters, pagination, diff viewer
- All dashboards extended with Action Center and Quick Actions

### Security
- Content-Security-Policy with WebSocket origins (ws:, wss:)
- Strict-Transport-Security header (max-age=31536000)
- Redis-based brute force protection (5 attempts / 15min / 30min lockout)
- Global rate limiting via @fastify/rate-limit (100 req/min, 2000 in dev)
- JWT session authentication with expiry and revocation
- Granular RBAC with UI permission management
- Audit logging for all state-changing operations

### Infrastructure
- Docker Compose with 6 services (MySQL, Redis, Backend, Frontend, Prometheus, Grafana)
- Pre-build CI validation script (architecture rules, SQL discipline, import compliance)
- Prometheus monitoring across command pipeline, event bus, workflow engine, socket layer
- 6 alert rules (backend down, high error rate, high latency, elevated errors, notification failure, Redis unavailable)

### Testing
- 601 tests across 69 test files
- Domain aggregate tests for state machines (Booking, Payment, Wallet, Settlement, Tournament, Membership, Pricing)
- Command handler unit tests with mocked repositories
- Event contract tests for schema stability
- Version contract tests for aggregate versioning
- Integration tests with real database (Testcontainers)

### Removed
- Legacy BookingSaga (217 lines)
- Legacy PaymentSaga (108 lines)
- Legacy platform compatibility layer
- Legacy EventEmitter (replaced by EventBus V2)
- settlement-cron.worker (no-op)
- 19 platform contracts and shared utility files (no callers)
- 2 unused frontend pages (AdminFinancePage, PermissionsPage)
- 1 unreachable backend route (realtime.routes.ts)
- Total: 23 files removed (~1,500 lines)

## Known Future Roadmap

The following are planned for subsequent releases:

- **v1.1:** API Key management, Stripe auto-billing, webhook event log UI, CSV export on all list pages
- **v1.2:** Gift cards, staff scheduling, inventory management, drag-drop tournament bracket, advanced reporting
- **v2.0:** Native mobile apps (iOS/Android), multi-region deployment, AI court recommendations, 10+ language translations
