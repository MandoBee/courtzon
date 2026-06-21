# SCALING ROADMAP

## Current Capacity
- Single Fastify process (tsx dev mode)
- Single MariaDB instance
- Single Redis instance
- Polling-based real-time (low concurrency ceiling)

## Level 1: Production-Ready (Current Phase)

### App Layer
- [x] Fastify with cluster mode (Node.js PM2 or Docker replicas)
- [x] Stateless API (session stored in DB/Redis, JWT auth)
- [x] Rate limiting per user/IP
- [x] Request logging (Pino structured JSON)
- [x] RBAC middleware wired across all route modules (role + permission guards)

### Data Layer
- [x] Connection pooling (mysql2 pool pattern)
- [x] MySQL 8 with utf8mb4 (Dockerized, accessible via MySQL Workbench)
- [x] Redis caching for hot data (orgs, roles, settings)
- [x] Database indexing (composite indexes for common queries)
- [x] Migration system working end-to-end (schema + seed files)

### Frontend
- [x] PWA with service worker (offline QR, cached assets)
- [x] Code splitting (lazy loaded routes)
- [x] Bundle optimization (Vite + tree shaking)
- [ ] CDN for static assets

### DevOps
- [x] Docker Compose stack (MySQL 8, Redis, backend, frontend)
- [x] WSL2 memory optimization for Docker Desktop

## Level 2: High Traffic (100K+ MAU)

### App Layer
- Horizontal scaling: N Fastify instances behind Nginx
- Socket.IO with Redis adapter (cross-node pub/sub)
- Message queue (Bull/BullMQ via Redis) for background jobs
- Separate worker processes for: notifications, settlements, reports

### Data Layer
- Database read replicas (scale reads independently)
- Database sharding by tenant (natural shard key)
- Redis cluster for cache + locks
- Query optimization: materialized views for dashboards

### Frontend
- SSR/SSG for SEO pages (CMS, blogs)
- Image optimization pipeline (WebP, responsive sizes)
- Edge caching (Cloudflare/CDN for static + API)

## Level 3: Enterprise (1M+ MAU)

### App Layer
- Microservices extraction (high-traffic domains: booking, payments)
- Event-driven async architecture (Kafka/RabbitMQ for cross-domain events)
- GraphQL federation (if frontend complexity justifies it)
- Dedicated Socket.IO cluster (separate from REST API)

### Data Layer
- Database sharding by tenant + time (for booking history)
- Time-series DB for analytics/impressions
- Full-text search (ElasticSearch/MeiliSearch for marketplace + tournaments)
- CQRS with event-sourcing for financial transactions

### Frontend
- Micro-frontends (if team size grows beyond 10 FE devs)
- Native mobile apps (React Native) for players + staff
- Real-time sync engine (offline-first with CRDTs)

## Performance Budgets
| Metric | Target |
|---|---|
| API response time (p95) | < 200ms |
| Booking confirmation time | < 1.5s |
| Page load (first paint) | < 1.5s |
| Time to interactive | < 3s |
| Socket.IO event delivery | < 100ms |
| Database query (p95) | < 50ms |
| Uptime | 99.9% |
