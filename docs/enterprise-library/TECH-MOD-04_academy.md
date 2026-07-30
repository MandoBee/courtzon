---
document_id: "TECH-MOD-04"
document_name: "Academy Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-MOD-19"]
  related: ["TECH-MOD-05", "TECH-MOD-06"]
---

# Academy Module (TECH-MOD-04)

**Source:** `backend/src/modules/academy/` (6 entries: domain/, application/, infrastructure/, presentation/, index.ts, __tests__/)

## 1. Purpose

Academy program management: programs (courses), groups (class divisions), enrollments (player registrations), group sessions (class meetings), and attendance tracking. Dual admin and player-facing endpoints. 38 routes, 100% permission-gated.

## 2. Architecture

```
domain/
  academy.types.ts    — All type definitions (87 lines)
  lifecycle.ts        — Two state machines (program + enrollment)
application/
  (service layer)
infrastructure/
  (repositories)
presentation/
  academy.routes.ts       — 38 endpoints
  academy.controller.ts   — Request handlers
  academy.dto.ts          — Zod schemas
```

**Evidence:** `academy.routes.ts` (59 lines) defines all routes. `domain/academy.types.ts` defines all attribute interfaces. `domain/lifecycle.ts` defines transitions.

## 3. Routes (38)

Defined in `academy.routes.ts:9-59`:

**Dashboard (1):** `GET /admin/academy/dashboard` (`academy.dashboard.view`)

**Programs (8):** `GET /admin/academy/programs`, `GET /admin/academy/programs/options`, `GET /admin/academy/programs/:id`, `POST /admin/academy/programs`, `PUT /admin/academy/programs/:id`, `POST /admin/academy/programs/:id/publish`, `POST /admin/academy/programs/:id/archive`, `POST /admin/academy/programs/:id/transition`

**Groups (7):** `GET /admin/academy/groups`, `GET /admin/academy/programs/:programId/groups`, `GET /admin/academy/groups/:id`, `POST /admin/academy/groups`, `PUT /admin/academy/groups/:id`, `POST /admin/academy/groups/:id/assign-coach`, `POST /admin/academy/groups/:id/archive`

**Enrollments (9):** `GET /admin/academy/enrollments`, `GET /admin/academy/programs/:programId/enrollments`, `GET /admin/academy/enrollments/:id`, `POST /admin/academy/enrollments`, `POST /admin/academy/enrollments/:id/cancel`, `POST /admin/academy/enrollments/:id/complete`, `POST /admin/academy/enrollments/:id/confirm`, `POST /admin/academy/enrollments/:id/move`, `GET /admin/academy/enrollments/:id/history`

**Sessions (4):** `GET /admin/academy/sessions`, `GET /admin/academy/groups/:groupId/sessions`, `POST /admin/academy/sessions`, `PUT /admin/academy/sessions/:id`

**Attendance (5):** `GET /admin/academy/sessions/:sessionId/attendance`, `GET /admin/academy/attendance`, `POST /admin/academy/attendance`, `POST /admin/academy/sessions/:sessionId/attendance/bulk`, `PUT /admin/academy/attendance/:id`

**Player-facing (4):** `GET /academy/programs`, `GET /academy/programs/:id`, `GET /my/academy/enrollments`, `POST /academy/programs/:id/enroll`

## 4. Permissions

Permission keys used:
- `academy.dashboard.view`, `academy.view`, `academy.create`, `academy.update`, `academy.delete`, `academy.publish`, `academy.enroll`, `academy.manage`
- `attendance.manage`

## 5. Entities

Program lifecycle: `draft | published | open | full | running | completed | cancelled | archived` (8 states)

Enrollment lifecycle: `pending | confirmed | waiting | cancelled | completed` (5 states)

Group: `active | inactive | archived` (3 states)

Session: `scheduled | in_progress | completed | cancelled` (4 states)

Attendance: `present | absent | excused | late` (4 values)

**Evidence:** `academy.types.ts:13` defines program status, `:37` defines enrollment status.

## 6. State Machine

**Program transitions** (`lifecycle.ts:5-14`):
```
draft → published
published → open | cancelled | archived
open → full | running | cancelled | archived
full → open | running | cancelled | archived
running → completed | cancelled | archived
completed → archived
cancelled → archived
archived → (terminal)
```

**Enrollment transitions** (`lifecycle.ts:16-22`):
```
pending → confirmed | waiting | cancelled
confirmed → cancelled | completed
waiting → confirmed | cancelled
cancelled → (terminal)
completed → (terminal)
```

**Evidence:** Full source at `lifecycle.ts` lines 5-14 and 16-22.

## 7. Events

- `academy:program_created`
- `academy:program_published`
- `academy:program_status_changed`
- `academy:enrollment_created`
- `academy:enrollment_confirmed`
- `academy:enrollment_cancelled`
- `academy:attendance_recorded`

## 8. Audit Events

All state-changing operations in controller record audit logs via `recordAudit()`.

## 9. Dashboard

`AcademyDashboard` type (`academy.types.ts:73-87`):
- `total_programs, published_programs, running_programs`
- `total_groups, total_players, waiting_list_count, capacity_utilization`
- `attendance_summary: { present, absent, excused, late }`
