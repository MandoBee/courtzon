---
document_id: "TECH-ARCH-10"
document_name: "Technology Stack"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["architect", "developer", "cto"]
difficulty: "beginner"
reading_time: 15
business_owner: "CTO"
technical_owner: "Architect"
documentation_owner: "Technical Writing"
reviewer: "Lead Developer"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  governs: ["TECH-ARCH-10"]
  references: ["TECH-ARCH-01", "TECH-ARCH-02"]
  related: ["TECH-DEV-01", "TECH-DEV-02"]
---

# CourtZon Technology Stack

## 1. Runtime / Language

| Technology | Version | Purpose |
|-----------|---------|---------|
| Node.js | 22.x (Alpine) | JavaScript runtime (backend + build) |
| TypeScript | 6.0.x | Type safety across backend and frontend |
| Package Manager | npm (ci) | Dependency management |

**Evidence:** `backend/Dockerfile:1` uses `node:22-alpine`. `backend/package.json:60` has `typescript: ^6.0.3`. `frontend/package.json:58` has `typescript: ~6.0.2`.

## 2. Backend Framework

| Library | Version | Purpose |
|---------|---------|---------|
| Fastify | ^5.0.0 | HTTP server framework |
| @fastify/cors | ^11.2.0 | CORS handling |
| @fastify/cookie | ^11.0.2 | Cookie parsing/signing |
| @fastify/helmet | ^13.0.2 | Security headers |
| @fastify/rate-limit | ^10.3.0 | Rate limiting |
| @fastify/multipart | ^10.0.0 | File upload handling |
| @fastify/static | ^9.1.3 | Static file serving |
| @fastify/swagger | ^9.7.0 | OpenAPI documentation |
| @fastify/swagger-ui | ^5.2.6 | Swagger UI |

**Evidence:** `backend/package.json:28-36` lists all Fastify plugins. `app.ts:104-115` creates the Fastify instance. `app.ts:370-395` configures Swagger at `/docs`.

## 3. Database & Cache

| Library | Version | Purpose |
|---------|---------|---------|
| mysql2 | ^3.22.3 | MySQL driver (promise-based) |
| ioredis | ^5.8.2 | Redis client |
| BullMQ | ^5.76.10 | Job queues |

**Evidence:** `backend/package.json:39,42,44`. `backend/src/database/mysql.ts:10-18` uses `mysql2/promise` for connection pooling. `backend/src/infrastructure/redis/redis.client.ts:14-21` uses `ioredis`. `backend/src/infrastructure/queue/queue.service.ts:148-150` uses `BullMQ.Queue`.

## 4. Frontend Framework

| Library | Version | Purpose |
|---------|---------|---------|
| React | ^19.2.6 | UI framework |
| React DOM | ^19.2.6 | DOM rendering |
| React Router DOM | ^7.15.1 | Client-side routing |
| Vite | ^6.x | Build tool / dev server |
| @vitejs/plugin-react | ^6.0.1 | React integration |

**Evidence:** `frontend/package.json:31-34` lists React packages. `frontend/package.json:51` has `@vitejs/plugin-react`. Vite is the build tool used in development and production.

## 5. State Management & Data Fetching

| Library | Version | Purpose |
|---------|---------|---------|
| @tanstack/react-query | ^5.100.10 | Server state / data fetching |
| Zustand | ^5.0.13 | Client state management |
| Axios | ^1.16.1 | HTTP client |

**Evidence:** `frontend/package.json:22,38,28` lists these dependencies.

## 6. UI & Styling

| Library | Version | Purpose |
|---------|---------|---------|
| Tailwind CSS | ^3.4.17 | Utility-first CSS framework |
| PostCSS | ^8.5.14 | CSS processing |
| Autoprefixer | ^10.5.0 | CSS vendor prefixes |
| Recharts | ^3.8.1 | Charts and graphs |
| @dnd-kit/core | ^6.3.1 | Drag-and-drop |
| @dnd-kit/sortable | ^10.0.0 | Sortable lists |
| TipTap | ^3.23.5 | Rich text editor |
| react-hook-form | ^7.75.0 | Form management |
| @hookform/resolvers | ^5.2.2 | Form validation resolvers |
| QR Code | ^1.5.4 | QR code generation |
| Flag Icons | ^7.5.0 | Country flag icons |
| PWA Plugin | ^1.3.0 | Progressive Web App support |

**Evidence:** `frontend/package.json:17-39` lists all UI dependencies. Tailwind config is in `frontend/tailwind.config.js`.

## 7. Validation

| Library | Version | Purpose |
|---------|---------|---------|
| Zod | ^4.0.5 (backend) / ^4.4.3 (frontend) | Schema validation |

**Evidence:** `backend/package.json:51` has `zod: ^4.0.5`. `frontend/package.json:38` has `zod: ^4.4.3`. DTO files in every module use Zod schemas for request validation.

## 8. Real-Time

| Library | Version | Purpose |
|---------|---------|---------|
| Socket.IO | ^4.8.3 | WebSocket / real-time communication |
| socket.io-client | ^4.8.3 | Client WebSocket |

**Evidence:** `backend/package.json:50` has `socket.io: ^4.8.3`. `frontend/package.json:36` has `socket.io-client: ^4.8.3`. Nginx config at `frontend/nginx.conf:97-109` proxies `/socket.io/` with long timeouts.

## 9. Logging & Monitoring

| Library | Version | Purpose |
|---------|---------|---------|
| Pino | ^10.0.0 | Structured logging |
| pino-pretty | ^13.1.1 | Dev log formatting |
| prom-client | ^15.1.3 | Prometheus metrics |
| Prometheus | v3.2.1 (Docker) | Metrics collection |
| Grafana | 11.5.2 (Docker) | Dashboard visualization |

**Evidence:** `backend/package.json:46-48` for logging/metrics. `docker-compose.yml:120-160` for Prometheus/Grafana. `app.ts:104-114` configures Pino logger. `app.ts:149-160` adds structured request logging.

## 10. Security

| Library | Version | Purpose |
|---------|---------|---------|
| jsonwebtoken | ^9.0.3 | JWT for API auth |
| @types/jsonwebtoken | ^9.0.10 | Type definitions |
| sharp | ^0.34.5 | Image processing / upload security |

**Evidence:** `backend/package.json:37,43,49`. Sharp is used for image resizing and validation on upload.

## 11. Testing

| Library | Version | Purpose |
|---------|---------|---------|
| Vitest | (built-in) | Unit test runner (backend + frontend) |
| Testcontainers | ^11.4.0 | Integration test containers |
| tsx | ^4.20.3 | TypeScript executor for Node |
| @testing-library/react | ^16.3.2 | React component testing |
| @testing-library/jest-dom | ^6.9.1 | DOM matchers |
| jsdom | ^28.1.0 | DOM environment for tests |
| Playwright | (e2e/) | E2E browser testing |

**Evidence:** `backend/package.json:55-59` for dev dependencies. `frontend/package.json:42-60` for testing libraries. Test configuration files in both `backend/vitest.config.ts` and `frontend/vitest.config.ts`.

## 12. Email & Communication

| Library | Version | Purpose |
|---------|---------|---------|
| Nodemailer | ^8.0.7 | Email sending |
| Socket.IO (client) | ^4.8.3 | In-app notifications |

**Evidence:** `backend/package.json:45` lists `nodemailer: ^8.0.7`. SMS is handled via Twilio/Vonage through the notification module.

## 13. Infrastructure / DevOps

| Tool | Purpose |
|------|---------|
| Docker Compose | Container orchestration |
| Nginx | Reverse proxy (frontend container) |
| GitHub | Source control + CI/CD |
| Hostinger | Production hosting |

**Evidence:** `docker-compose.yml` defines the full stack. `frontend/nginx.conf` configures the nginx reverse proxy.

## 14. Technology Stack Summary

```
┌─────────────────────────────────────────────────────────────────────┐
│                    COURTZON TECHNOLOGY STACK                          │
│                                                                     │
│  FRONTEND                     BACKEND                               │
│  ────────                     ──────                                │
│  React 19                    Fastify 5                             │
│  TypeScript 6                TypeScript 6                          │
│  Vite 6                      Node.js 22                             │
│  Tailwind CSS 3              mysql2 3 (MySQL 8)                    │
│  TanStack Query 5            ioredis 5 (Redis 7)                   │
│  Zustand 5                   BullMQ 5                              │
│  React Router 7              Socket.IO 4                           │
│  Zod 4                       Zod 4                                  │
│  react-hook-form 7           Pino 10                                │
│  Recharts 3                  prom-client 15                         │
│  TipTap 3                    Nodemailer 8                           │
│  Socket.IO Client 4          Sharp 0.34                             │
│  dnd-kit 6/10                jsonwebtoken 9                        │
│  PWA (vite-plugin-pwa)                                              │
│                                                                     │
│  TESTING                    DEVOPS                                  │
│  ───────                    ──────                                  │
│  Vitest                     Docker Compose                          │
│  Testcontainers             Nginx                                   │
│  Testing Library            Prometheus + Grafana                    │
│  Playwright                 GitHub Actions                          │
│  jsdom                      Hostinger                               │
└─────────────────────────────────────────────────────────────────────┘
```

## 15. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-ARCH-01 | System Architecture (context) |
| TECH-ARCH-02 | Module Architecture |
| TECH-DEV-01 | Coding Standards TypeScript |
| TECH-DEV-02 | Coding Standards React |

## 16. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
