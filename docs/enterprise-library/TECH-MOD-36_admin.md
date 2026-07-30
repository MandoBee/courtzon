---
document_id: "TECH-MOD-36"
document_name: "Admin Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-02"]
  related: ["TECH-MOD-20"]
---

# Admin Module (TECH-MOD-36)

**Source:** `backend/src/modules/admin/` (6 entries: presentation/, application/)

## 1. Purpose

System administration functions: system settings CRUD, feature flag management, system health endpoint, Redis cache management, Bull queue management, and public settings endpoint.

## 2. Routes (17)

Defined in `admin.routes.ts:9-41`:

### System Settings (4) — `requirePermission`
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 1 | GET | `/admin/settings` | `system_settings.view` | List all settings |
| 2 | GET | `/admin/settings/categories` | `system_settings.view` | List setting categories |
| 3 | GET | `/admin/settings/:key` | `system_settings.view` | Get setting by key |
| 4 | PUT | `/admin/settings/:key` | `system_settings.update` | Update setting |

### Feature Flags (5)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 5 | GET | `/admin/feature-flags` | `feature_flags.view` | List feature flags |
| 6 | POST | `/admin/feature-flags` | `feature_flags.update` | Create feature flag |
| 7 | PUT | `/admin/feature-flags/:id` | `feature_flags.update` | Update feature flag |
| 8 | POST | `/admin/feature-flags/:id/toggle` | `feature_flags.update` | Toggle feature flag |
| 9 | DELETE | `/admin/feature-flags/:id` | `feature_flags.update` | Delete feature flag |

### Health (1)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 10 | GET | `/admin/health` | `system_health.view` | Get system health |

### Cache (2)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 11 | GET | `/admin/cache` | `cache.manage` | Get cache stats |
| 12 | POST | `/admin/cache/clear` | `cache.manage` | Clear cache key |

### Queues (6)
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 13 | GET | `/admin/queues` | `queue.view` | Queue status |
| 14 | GET | `/admin/queues/:queueName/jobs` | `queue.view` | List queue jobs |
| 15 | POST | `/admin/queues/:queueName/jobs/:jobId/retry` | `queue.manage` | Retry job |
| 16 | POST | `/admin/queues/:queueName/drain` | `queue.manage` | Drain queue |
| 17 | POST | `/admin/queues/:queueName/pause` | `queue.manage` | Pause queue |
| 18 | POST | `/admin/queues/:queueName/resume` | `queue.manage` | Resume queue |

### Public (1) — unauthenticated
| # | Method | Path | Guard | Purpose |
|---|--------|------|-------|---------|
| 19 | GET | `/public/settings` | — | Get public settings |

## 3. Services

**`system-settings.service.ts`** — CRUD for `system_settings` table. Values are stored as strings with `value_type` (number, boolean, json, string). History tracked in `application_settings_history`. Supports category filtering, search, pagination.

**`feature-flag.service.ts`** — CRUD + toggle for `feature_flags`. Each flag has `flag_key`, `label`, `module`, `is_enabled`. Toggle records audit events via `recordAudit`. System flags are protected.

**`health.service.ts`** — Aggregates health from MySQL, Redis, storage, Socket.IO, and Bull queues into a composite health status object with memory usage and process uptime.

**`cache.service.ts`** — Redis cache introspection: hit/miss rates, memory usage, keyspace, uptime, connected clients. Supports clearing specific keys or flushing all (`flushdb`).

**`queue.service.ts`** — Bull queue management: status counts (waiting/active/completed/failed/delayed/paused), job listing with pagination, retry, drain, pause, resume. Monitors `default` and `notifications` queues.

## 4. Key Concepts

- **System Settings:** Stored in `system_settings` table with per-key validation rules, categories, and public flag
- **Feature Flags:** Gated by `requireFeatureFlag` middleware on routes; toggled via admin panel
- **Audit Trail:** All state-changing operations (settings update, flag toggle, cache flush) logged via `recordAudit`
