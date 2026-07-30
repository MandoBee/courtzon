---
document_id: "TECH-MOD-20"
document_name: "Security Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect", "security"]
difficulty: "intermediate"
reading_time: 15
business_owner: "Security Lead"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Security Lead"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-07"]
  related: ["TECH-MOD-01", "TECH-MOD-02", "TECH-MOD-21"]
---

# Security Module (TECH-MOD-20)

**Source:** `backend/src/modules/security/` (7 entries: domain/, application/, commands/, infrastructure/, presentation/, index.ts, __tests__/)

## 1. Purpose

Security monitoring and administrative dashboard: session monitoring (active/suspicious), failed login tracking, upload security scanning, organisation security overview, system health, Redis info, role & permission audit. 13 routes, all super-admin guarded.

## 2. Architecture

```
presentation/
  security.routes.ts      — 13 endpoints (38 lines)
  security.controller.ts  — Request handlers
application/
  (security service layer)
domain/
  (security aggregates)
infrastructure/
  (repositories)
```

**Evidence:** `security.routes.ts` (38 lines) defines all 13 routes.

## 3. Routes (13)

Defined in `security.routes.ts:11-38` (all require `superAdminGuard`):

| # | Method | Path | Purpose |
|---|--------|------|---------|
| 1 | GET | `/admin/security/dashboard` | Security dashboard overview |
| 2 | GET | `/admin/security/sessions` | List active sessions |
| 3 | GET | `/admin/security/sessions/suspicious` | List suspicious sessions |
| 4 | POST | `/admin/security/sessions/:id/revoke` | Revoke a session |
| 5 | GET | `/admin/security/failed-logins` | Failed login stats |
| 6 | GET | `/admin/security/failed-logins/feed` | Failed login live feed |
| 7 | GET | `/admin/security/uploads` | Upload security stats |
| 8 | GET | `/admin/security/uploads/recent` | Recent uploads log |
| 9 | GET | `/admin/security/alerts` | Security alerts |
| 10 | GET | `/admin/security/organisations` | Organisation security overview |
| 11 | GET | `/admin/security/role-audit` | Role & permission audit |
| 12 | GET | `/admin/security/system-health` | System health check |
| 13 | GET | `/admin/security/redis` | Redis info |

## 4. Permissions

All routes require `requireRole(['super_admin', 'super-admin'])` via `superAdminGuard`. Access is system-level only.

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Session | `sessions` | `id, user_id, token_hash, ip, user_agent, device_info, is_active, is_suspicious, last_active_at` |
| Failed Login | `failed_login_attempts` | `id, identifier, ip, user_agent, attempted_at` |
| Upload Security | `upload_security_logs` | `id, file_name, file_size, mime_type, scan_result, uploaded_by` |
| Security Alert | `security_alerts` | `id, type, severity, message, resolved_at` |

## 6. Session Monitoring

Two endpoints for session monitoring:
- `GET /admin/security/sessions` — All active sessions
- `GET /admin/security/sessions/suspicious` — Sessions flagged as suspicious (unusual IP, geolocation mismatch, rapid requests)
- `POST /admin/security/sessions/:id/revoke` — Force logout a session

## 7. Failed Login Tracking

- `GET /admin/security/failed-logins` — Statistics: counts by IP, user, time period
- `GET /admin/security/failed-logins/feed` — Real-time feed of failed attempts

Brute-force protection is handled by the separate `brute-force` module (`backend/src/modules/brute-force/`).

## 8. Upload Security

- `GET /admin/security/uploads` — Stats: total uploads, flagged files, quarantined
- `GET /admin/security/uploads/recent` — List of recent uploads with scan results

Upload hardening is implemented in `backend/src/modules/upload/application/upload.service.ts`.

## 9. Role & Permission Audit

`GET /admin/security/role-audit` provides:
- Roles and their assigned permissions
- Users with elevated privileges
- Recently modified role-permission assignments
- Orphaned permissions

## 10. System Health

- `GET /admin/security/system-health` — Application health metrics (memory, uptime, request rate)
- `GET /admin/security/redis` — Redis server info (memory, connected clients, hit rate)

## 11. Audit Events

- `ADMIN.ACTION` — Any administrative security action

**Evidence:** `audit-log.types.ts:41` defines `ADMIN.ACTION`.
