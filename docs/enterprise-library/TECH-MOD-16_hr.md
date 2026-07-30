---
document_id: "TECH-MOD-16"
document_name: "HR Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 20
business_owner: "HR Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-12", "TECH-MOD-13"]
---

# HR Module (TECH-MOD-16)

**Source:** `backend/src/modules/hr/` (3 files: index.ts, presentation/hr.controller.ts, presentation/hr.routes.ts)

## 1. Purpose

Human Resources management: department/position CRUD, employee lifecycle, employment contracts, leave management (types/requests/balances), staff attendance, payroll components and runs. 52 routes with 6-state state machines for employees, leaves, and payroll.

## 2. Architecture

```
presentation/
  hr.routes.ts       — 52 endpoints (81 lines)
  hr.controller.ts   — 1544 lines, request handlers
index.ts             — Barrel export
```

**Evidence:** `hr.routes.ts` (81 lines) defines all 52 routes. `hr.controller.ts` (1544 lines) implements all handlers.

## 3. Routes (52)

Defined in `hr.routes.ts:9-81`:

**Departments (5):** List, get, create, update, delete
**Positions (5):** List, get, create, update, delete
**Employees (5):** List, get, create, update, change status
**Contracts (5):** List, get, create, update, change status
**Leave Types (5):** List, get, create, update, delete
**Leave Requests (9):** List, get, create, update, submit, approve, reject, cancel
**Leave Balances (2):** Get balance, adjust balance
**Attendance (4):** Clock in, clock out, log, list
**Payroll Components (4):** List, create, update, delete
**Payroll Runs (8):** List, get, create, calculate, approve, post, mark paid, close
**Dashboard (1):** HR dashboard

## 4. Permissions

`hr.departments.view`, `hr.departments.manage`, `hr.positions.view`, `hr.positions.manage`
`hr.employees.view`, `hr.employees.manage`
`hr.contracts.view`, `hr.contracts.manage`
`hr.leaves.types.view`, `hr.leaves.types.manage`
`hr.leaves.requests.view`, `hr.leaves.requests.manage`, `hr.leaves.requests.approve`
`hr.leaves.balances.view`, `hr.leaves.balances.manage`
`hr.attendance.manage`, `hr.attendance.view`
`hr.payroll.components.view`, `hr.payroll.components.manage`
`hr.payroll.runs.view`, `hr.payroll.runs.manage`, `hr.payroll.runs.calculate`, `hr.payroll.runs.approve`, `hr.payroll.runs.post`
`hr.dashboard.view`

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Department | `departments` | `id, organisation_id, name, parent_id, head_employee_id, is_active` |
| Position | `positions` | `id, department_id, title, description, requirements, is_active` |
| Employee | `employees` | `id, user_id, employee_code, department_id, position_id, status, hire_date` |
| Contract | `employment_contracts` | `id, employee_id, type, start_date, end_date, salary, status` |
| Leave Type | `leave_types` | `id, name, days_per_year, is_paid, is_active` |
| Leave Request | `leave_requests` | `id, employee_id, leave_type_id, start_date, end_date, status, reason` |
| Leave Balance | `leave_balances` | `id, employee_id, leave_type_id, total_days, used_days, remaining_days` |
| Attendance | `staff_attendance` | `id, employee_id, date, clock_in, clock_out, status` |
| Payroll Component | `payroll_components` | `id, name, type (earning/deduction), calculation_type, value` |
| Payroll Run | `payroll_runs` | `id, period_start, period_end, status, total_gross, total_net, paid_at` |

## 6. State Machines

**Employee lifecycle** (defined in `hr.controller.ts:10`):
```
draft → onboarding → active → on_leave → suspended → terminated → archived
```

**Leave request lifecycle** (defined in `hr.controller.ts:11`):
```
draft → submitted → approved → completed
                    → rejected → cancelled
```
`draft`: Being filled, not yet submitted
`submitted`: Pending approval
`approved`: Manager approved, leave scheduled
`rejected`: Manager denied
`cancelled`: Withdrawn by employee
`completed`: Leave period passed

**Payroll run lifecycle** (defined in `hr.controller.ts:12`):
```
draft → calculated → approved → posted → paid → closed
```
`draft`: Initial creation
`calculated`: Earnings/deductions computed
`approved`: Manager sign-off
`posted`: Journal entries recorded
`paid`: Funds disbursed
`closed`: Period finalized

**Contract status:** Similar lifecycle via `PATCH /hr/contracts/:id/status`

**Evidence:** `hr.controller.ts:10-12` defines the valid status arrays as `VALID_EMPLOYMENT_STATUSES`, `VALID_LEAVE_STATUSES`, `VALID_PAYROLL_STATUSES`.

## 7. Events

- `hr:employee_created` / `hr:employee_status_changed`
- `hr:leave_request_submitted` / `hr:leave_request_approved` / `hr:leave_request_rejected`
- `hr:payroll_run_calculated` / `hr:payroll_run_approved` / `hr:payroll_run_paid`
- `hr:attendance_recorded`

## 8. Audit Events

All state-changing operations in `hr.controller.ts` record audit logs via `recordAudit()`.

## 9. Dashboard

`GET /hr/dashboard` provides aggregated HR metrics:
- Employee count by department
- Active/on-leave/terminated counts
- Pending leave requests
- Upcoming payroll runs
- Attendance summary
