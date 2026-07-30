---
document_id: "TECH-MOD-28"
document_name: "Mobile Module"
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
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-14"]
---

# Mobile Module (TECH-MOD-28)

**Source:** `backend/src/modules/mobile/` (3 files: index.ts, presentation/mobile.routes.ts, presentation/mobile.controller.ts)

## 1. Purpose

Mobile app infrastructure: push notification token management, app version control with forced upgrade capability, remote configuration per platform, and push delivery logging. 13 routes, admin dashboard for mobile metrics.

## 2. Routes (13)

Defined in `mobile.routes.ts:9-29`:

**Push Tokens (3):**
| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | POST | `/mobile/push/register` | Register push token |
| 2 | DELETE | `/mobile/push/unregister` | Unregister push token |
| 3 | GET | `/mobile/push/tokens` | List user's push tokens |

**App Versions (5):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 4 | GET | `/mobile/versions` | — | Get latest version |
| 5 | GET | `/admin/mobile/versions` | `mobile.versions.view` | List all versions |
| 6 | POST | `/admin/mobile/versions` | `mobile.versions.manage` | Create version |
| 7 | PUT | `/admin/mobile/versions/:id` | `mobile.versions.manage` | Update version |

**Remote Config (4):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 8 | GET | `/mobile/config` | — | Get app config |
| 9 | GET | `/admin/mobile/config` | `mobile.config.view` | List all config |
| 10 | PUT | `/admin/mobile/config/:id` | `mobile.config.manage` | Update config |
| 11 | POST | `/admin/mobile/config` | `mobile.config.manage` | Create config |

**Admin (2):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 12 | GET | `/admin/mobile/push-log` | `mobile.push.view` | Push delivery log |
| 13 | GET | `/admin/mobile/dashboard` | `mobile.dashboard.view` | Mobile dashboard |

## 3. Push Token Management

- Register: `INSERT ... ON DUPLICATE KEY UPDATE` — upserts by user+token
- Unregister: sets `is_active = 0` (soft)
- Tokens stored with `platform`, `device_name`, `device_id`
- Audit events: `MOBILE.PUSH.REGISTER`, `MOBILE.PUSH.UNREGISTER`

**Evidence:** `mobile.controller.ts:10-76`.

## 4. App Version Control

- Versions have: `version`, `build_number`, `platform`, `min_version`, `is_forced`, `release_notes`, `download_url`
- `is_forced` enables forced upgrade
- Client queries `/mobile/versions?platform=ios` to get latest version
- Admin can create/update per-platform versions

**Evidence:** `mobile.controller.ts:78-163`.

## 5. Remote Config

- Key-value pairs stored in `app_config` table
- Supports per-platform config (`platform` column, nullable)
- Client queries `/mobile/config?platform=ios` to get merged config
- Admin CRUD available

**Evidence:** `mobile.controller.ts:165-249`.

## 6. Push Delivery Log

- Tracks push notification delivery via `push_log` table
- Filterable by `status`, `platform`, date range
- Paginated admin view

**Evidence:** `mobile.controller.ts:251-290`.

## 7. Mobile Dashboard

Returns aggregate metrics:
- Total active push tokens
- Platform breakdown
- Today's push stats (sent/delivered/failed)
- Total app versions

**Evidence:** `mobile.controller.ts:292-327`.

## 8. Permissions

- `mobile.versions.view` / `mobile.versions.manage`
- `mobile.config.view` / `mobile.config.manage`
- `mobile.push.view`
- `mobile.dashboard.view`
