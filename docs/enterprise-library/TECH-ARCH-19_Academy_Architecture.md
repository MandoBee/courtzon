---
document_id: "TECH-ARCH-19"
document_name: "Academy Architecture"
family: "TECH-ARCH"
document_type: "ARCH"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "advanced"
reading_time: 25
business_owner: "Engineering Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-MOD-04", "TECH-DB-03", "TECH-MOD-19"]
  related: ["TECH-MOD-05", "TECH-MOD-06"]
---

# Academy Architecture (TECH-ARCH-19)

**Source:** `backend/src/modules/academy/` (14 files: domain/ (2), application/ (4), infrastructure/repositories/ (4), presentation/ (3), index.ts)

## 1. Purpose

Academy program management module — handles programs (courses), groups (class divisions within a program), enrollments (player registrations), group sessions (scheduled class meetings), and attendance tracking. 38 admin routes + player-facing public routes. All operations are permission-gated.

## 2. Domain Model

### Entity Relationships

```
AcademyProgram (1) ──── (N) AcademyGroup
       │                         │
       │                    (1)──┘
       │                         │
       └──── (N) AcademyEnrollment (N) ── (1) AcademyGroupSession
                            │                      │
                            └──── (N) AcademyAttendance
```

### Entity Definitions

**Source:** `domain/academy.types.ts:1-87`

#### AcademyProgram
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `code` | string | Unique program code |
| `name` | string | Display name |
| `description` | string? | Program description |
| `category` | string | Sport/category classification |
| `level` | string? | Skill level (beginner, intermediate, advanced) |
| `season` | string? | Season tag (e.g. "2025-Spring") |
| `capacity` | number | Max enrollments (0 = unlimited) |
| `price` | number | Enrollment fee |
| `currency` | string | ISO 4217 currency code |
| `price_type` | 'FREE' \| 'FIXED' \| 'MEMBERS_ONLY' | Pricing model |
| `status` | AcademyProgramStatus | Lifecycle state |
| `is_public` | boolean | Public visibility |
| `archived_at` | string? | Archived timestamp |
| `created_at / updated_at` | string | Audit timestamps |

#### AcademyGroup
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `program_id` | number | FK to `academy_programs` |
| `name` | string | Group name |
| `coach_id` | number? | FK to `users` (assigned coach) |
| `capacity` | number | Max enrollments in this group |
| `status` | 'active' \| 'inactive' \| 'archived' | Group status |
| `created_at / updated_at` | string | Audit timestamps |

#### AcademyEnrollment
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `player_id` | number | FK to `users` |
| `program_id` | number | FK to `academy_programs` |
| `group_id` | number? | FK to `academy_groups` |
| `membership_id` | number? | FK to membership plans |
| `status` | AcademyEnrollmentStatus | Lifecycle state |
| `waiting_order` | number? | Position in waiting list |
| `enrolled_at` | string? | When enrollment created |
| `cancelled_at` | string? | When cancelled |
| `completed_at` | string? | When completed |

#### AcademyGroupSession
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `group_id` | number | FK to `academy_groups` |
| `session_date` | string (YYYY-MM-DD) | Date of session |
| `start_time` | string? | Start time (HH:mm) |
| `end_time` | string? | End time (HH:mm) |
| `court_id` | number? | FK to `resources` |
| `coach_id` | number? | FK to `users` |
| `status` | 'scheduled' \| 'in_progress' \| 'completed' \| 'cancelled' | Session state |
| `created_at / updated_at` | string | Audit timestamps |

#### AcademyAttendance
| Field | Type | Description |
|-------|------|-------------|
| `id` | number | PK |
| `group_session_id` | number | FK to `academy_group_sessions` |
| `enrollment_id` | number | FK to `academy_enrollments` |
| `attendance_status` | 'present' \| 'absent' \| 'excused' \| 'late' | Attendance value |
| `notes` | string? | Free-text notes |
| `created_at` | string | Immutable creation timestamp |

#### AcademyDashboard
| Field | Type | Source |
|-------|------|--------|
| `total_programs` | number | `program.repository.ts` |
| `published_programs` | number | Published count |
| `running_programs` | number | Currently running |
| `total_groups` | number | All groups |
| `total_players` | number | Distinct enrolled players |
| `waiting_list_count` | number | Enrollments in waiting status |
| `capacity_utilization` | number | Percentage (enrolled/capacity * 100) |
| `attendance_summary` | object | present/absent/excused/late counts |

## 3. State Machines

### Academy Program Lifecycle

**Source:** `domain/lifecycle.ts:5-14`

```
     ┌──────────┐
     │  Draft   │
     └────┬─────┘
          │
          ▼
     ┌───────────┐
     │ Published │◄────┐
     └─────┬─────┘     │
           │           │
     ┌─────┴─────┐     │
     ▼           ▼     │
  ┌──────┐  ┌────────┐ │
  │ Open │──►  Full  │ │
  └──┬───┘  └───┬────┘ │
     │          │      │
     └────┬─────┘      │
          │            │
          ▼            │
     ┌─────────┐       │
     │ Running │       │
     └────┬────┘       │
          │            │
     ┌────┴────┐       │
     ▼         ▼       │
  ┌─────────┐ ┌────────┐│
  │Completed│ │Cancelled││
  └────┬────┘ └───┬────┘│
       │          │     │
       └────┬─────┘     │
            │           │
            ▼           │
       ┌─────────┐      │
       │Archived │──────┘
       └─────────┘
```

**Transitions (from `lifecycle.ts:5-14`):**
```typescript
draft: ['published']
published: ['open', 'cancelled', 'archived']
open: ['full', 'running', 'cancelled', 'archived']
full: ['open', 'running', 'cancelled', 'archived']
running: ['completed', 'cancelled', 'archived']
completed: ['archived']
cancelled: ['archived']
archived: []
```

**Validation:** `validateProgramTransition()` at `lifecycle.ts:24-33` — throws `ConflictError` with `ACADEMY_INVALID_TRANSITION` error code on illegal transitions.

**Transition methods in `program.service.ts`:** `publish()`, `archive()`, `transitionStatus()` — all call `validateProgramTransition()` before updating.

### Academy Enrollment Lifecycle

**Source:** `domain/lifecycle.ts:16-22`

```
     ┌──────────┐
     │ Pending  │
     └────┬─────┘
          │
     ┌────┴────┐
     ▼         ▼
  ┌───────┐ ┌────────┐
  │Confirmed│ │Waiting │
  └───┬───┘ └───┬────┘
      │         │
      ├─────────┘
      ▼
  ┌───────────┐
  │ Completed │
  └───────────┘

  ┌───────────┐
  │ Cancelled │
  └───────────┘
```

**Transitions (from `lifecycle.ts:16-22`):**
```typescript
pending: ['confirmed', 'waiting', 'cancelled']
confirmed: ['cancelled', 'completed']
waiting: ['confirmed', 'cancelled']
cancelled: []
completed: []
```

### Group Session Lifecycle

Managed via `CreateGroupSessionSchema` and `UpdateGroupSessionSchema` in `academy.dto.ts:100-117`:

```
scheduled → in_progress → completed
  └────────→ cancelled
```

### Attendance Records (Immutable)

Attendance records are created once via `attendance.service.ts:17-35` (`record()`) and are **immutable by design** — duplicate enrollment+session combinations are rejected. Updates are allowed only for status/notes via `attendance.service.ts:37-46` (`update()`), but the `created_at` timestamp never changes.

## 4. Application Layer

### Program Service (`application/program.service.ts:1-94`)

| Method | Description | Key Logic |
|--------|-------------|-----------|
| `list(filters)` | Paginated listing with search/category/status | Delegates to `programRepository.list()` |
| `getById(id)` | Single program lookup | Throws `NotFoundError` if missing |
| `create(data)` | Create with code uniqueness check | Checks `getByCode()`, throws `ConflictError` on duplicate |
| `update(id, data)` | Partial update with code uniqueness | Allows code change only if unique |
| `publish(id)` | Draft → Published | Calls `validateProgramTransition(existing.status, 'published')` |
| `archive(id)` | Any → Archived | Terminal transition via `validateProgramTransition()` |
| `transitionStatus(id, status)` | Generic status transition | Validates then updates via `updateStatus()` |
| `getCategories()` | Distinct category list | For filter dropdowns |
| `getDashboard()` | Aggregate KPIs | Computes capacity utilization from dashboard query |

### Enrollment Service (`application/enrollment.service.ts:1-109`)

| Method | Description | Key Logic |
|--------|-------------|-----------|
| `list(filters)` | Paginated with program/group/player/status filters | Joins users, programs, groups |
| `getById(id)` | Single enrollment | Throws `NotFoundError` |
| `enroll(data)` | Create enrollment with capacity check | Checks program capacity → waiting list if full; validates group capacity if group specified |
| `cancel(id)` | Pending/Confirmed/Waiting → Cancelled | Validates transition, sets `cancelled_at` |
| `complete(id)` | Confirmed → Completed | Validates transition, sets `completed_at` |
| `confirm(id)` | Pending/Waiting → Confirmed | Promotes from waiting list |
| `moveToGroup(id, groupId)` | Change group assignment | Validates group exists and has capacity |
| `getHistory(enrollmentId)` | Audit log for enrollment | Queries `audit_log` table |

**Capacity Auto-Enforcement (`enroll()` at lines 23-63):**
1. Loads program and checks capacity
2. If `confirmedCount >= program.capacity`, enrollment gets `status: 'waiting'` with auto-incremented `waiting_order`
3. If `group_id` specified, also validates group capacity
4. Duplicate enrollment (same player + program) throws `ConflictError`

### Group Service (`application/group.service.ts:1-58`)

| Method | Description |
|--------|-------------|
| `listByProgram(programId, filters)` | Groups for a specific program |
| `listAll(filters)` | All groups with status/program filters |
| `getById(id)` | Single group lookup |
| `create(data)` | Create under program |
| `update(id, data)` | Partial update |
| `assignCoach(id, coachId/null)` | Assign or unassign coach; validates coach exists |
| `archive(id)` | Soft-archive (status → 'archived') |

### Attendance Service (`application/attendance.service.ts:1-66`)

| Method | Description | Key Logic |
|--------|-------------|-----------|
| `list(filters)` | Paginated by session/enrollment | Delegates to repository |
| `getBySession(sessionId)` | All attendance for a session | For attendance sheet view |
| `record(data)` | Single attendance record | Checks enrollment exists; prevents duplicate (same session+enrollment) |
| `update(id, data)` | Update status/notes | Validates record exists first |
| `getSummary(groupSessionId)` | Aggregated counts | present/absent/excused/late |
| `recordBulk(sessionId, records)` | Batch create | Skips duplicates silently |

**Immutability Rule:** Once created, an attendance record's `created_at` is frozen. Updates modify only `attendance_status` and `notes`.

## 5. Route Architecture

**Source:** `presentation/academy.routes.ts:9-59` (38 routes), `academy.controller.ts`

### Admin Routes (29)

| Group | Routes | Permissions |
|-------|--------|-------------|
| Dashboard | `GET /admin/academy/dashboard` | `academy.dashboard.view` |
| Programs (8) | CRUD + publish, archive, transition | `academy.programs.*` |
| Groups (7) | CRUD + assign-coach, archive | `academy.groups.*` |
| Enrollments (9) | CRUD + cancel, complete, confirm, move, history | `academy.enrollments.*` |
| Sessions (4) | CRUD | `academy.sessions.*` |
| Attendance (3) | Record, bulk, summary | `academy.attendance.*` |

### Player Routes (9)

| Route | Purpose | Permission |
|-------|---------|------------|
| `GET /player/academy/programs` | Public program listing | None required |
| `GET /player/academy/programs/:id` | Program detail | None required |
| `POST /player/academy/enrollments` | Self-enroll | `academy.enroll` |
| `GET /player/academy/enrollments` | My enrollments | Own data only |
| `GET /player/academy/enrollments/:id` | Enrollment detail | Own data only |
| `GET /player/academy/sessions` | My sessions | `academy.sessions.view` |
| `GET /player/academy/attendance` | My attendance | `academy.attendance.view` |
| `GET /player/academy/categories` | Category list | None required |

## 6. Dashboard

**Source:** `program.service.ts:78-91`, `program.repository.ts` dashboard query

The dashboard aggregates:
- Total/published/running program counts
- Total groups and distinct enrolled players
- Waiting list size
- Capacity utilization percentage (enrolled / capacity * 100)
- Attendance summary (present, absent, excused, late counts across all sessions)

## 7. Key Design Decisions

1. **Capacity gating at enrollment time** — Program capacity is enforced during `enroll()`, not via triggers. Waiting list is positional (auto-incremented `waiting_order`).
2. **Group capacity independent of program capacity** — A program may have capacity 50 with groups each capped at 15. Both are checked independently.
3. **No cascade deletes** — Programs and groups are soft-archived (status change), not deleted. Enrollments remain for historical audit.
4. **Attendance is append-only** — Each enrollment can have one attendance record per session. Updates modify status/notes but the record itself is never deleted.
5. **Permission-gated at every endpoint** — All 38 admin routes check permission keys. Player routes enforce ownership.
6. **Audit trail via audit_log** — Enrollment status transitions are logged via `audit_log` against `entity_type = 'academy_enrollment'`.

**Evidence:** All source files at `backend/src/modules/academy/`. Type definitions at `domain/academy.types.ts:1-87`. Lifecycle at `domain/lifecycle.ts:1-52`. Services at `application/*.service.ts` (327 total lines). Repositories at `infrastructure/repositories/*.repository.ts` (4 files). DTOs at `presentation/academy.dto.ts:1-153` (all Zod schemas).
