---
document_id: "GOV-ADR-020"
document_name: "Academy Attendance Immutability"
family: "GOV-ADR"
document_type: "ADR"
status: "Accepted"
version: "1.0"
audience: ["architect", "developer"]
difficulty: "intermediate"
reading_time: 4
business_owner: "Product Manager"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "CTO"
lifecycle_status: "Accepted"
knowledge_objects:
  references: ["TECH-ARCH-19", "TECH-MOD-04"]
  related: ["GOV-ADR-008"]
---

# ADR-020: Academy Attendance Immutability

## Status

Accepted

## Context

Academy attendance records capture whether a student attended a group session. These records may affect billing, certification, progress tracking, and reporting. If attendance could be freely edited, the audit trail would be compromised — it would be unclear whether a student genuinely attended or was retroactively marked present. Common approaches include:

1. **Mutable attendance** — records can be updated freely; simple but no audit trail
2. **Immutable attendance with soft-delete** — records cannot be changed; corrections require a new record and deprecation of the old one
3. **Immutable attendance with correction audit log** — records are immutable after creation; corrections tracked as audit events alongside the original record

## Decision

**Academy attendance is immutable after recording.** Corrections are tracked via audit log entries, not data overwrite. The `academy_attendance` record, once created, is never updated in place for corrections. The `update()` method exists only for status changes within the same session (e.g., marking a present student as late during the session window).

### Key Implementation Details

| Aspect | Implementation | Source |
|--------|---------------|--------|
| Immutable creation | `record()` — inserts new record; rejects duplicates via `ConflictError` | `attendance.service.ts:17-35` |
| Duplicate prevention | `getBySessionAndEnrollment()` — checks existence before insert | `attendance.service.ts:24-25` |
| Limited update | `update()` — only `attendance_status` and `notes`; no overwrite of core facts | `attendance.service.ts:37-46` |
| Bulk recording | `recordBulk()` — skips existing records gracefully | `attendance.service.ts:52-63` |
| Attendance table | `academy_attendance` — no `updated_at` for correction tracking | `academy.types.ts` |

### What "Immutable" Means

| Operation | Allowed? | Notes |
|-----------|----------|-------|
| Create attendance record | Yes | Once per enrollment per session |
| Update status (present ↔ absent ↔ late) | Yes | During same session; limited window |
| Update to fix wrong student | No | Create correct record; audit log the error |
| Delete attendance record | **No** | Data is immutable |
| Overwrite attendance_status for billing correction | **No** | Audit log notes the discrepancy; original record preserved |

### Correction Workflow

```
Wrong attendance recorded for enrollment 42
  → Auditor discovers error
  → Adds audit log entry: { action: 'ATTENDANCE.CORRECTION', enrollmentId: 42,
       originalStatus: 'absent', correctedStatus: 'present', reason: 'system error' }
  → attendance record remains as 'absent'
  → Reports show both the attendance record AND the correction audit trail
  → Billing/credentialing uses the audit log to determine the truth
```

**Evidence:** The `update()` method at `attendance.service.ts:37-46` only modifies `attendance_status` and `notes` — it does not change the enrollment or session association.

## Consequences

### Positive

- **Audit integrity**: Original attendance records are preserved forever
- **No data loss**: Corrections do not destroy the original record
- **Regulatory compliance**: Immutable attendance logs meet certification and accreditation requirements
- **Duplicate avoidance**: Clear error on duplicate recording prevents accidental double-entry
- **Simple model**: No soft-delete or versioning complexity; single canonical record

### Negative

- **Correction complexity**: Correcting a wrong record requires audit log awareness at reporting/query time
- **No "undo"**: Simple UI undo action is not possible — correction must go through audit process
- **Storage growth**: Audit corrections accumulate over time (mitigated by audit log archival)

## Evidence

- `attendance.service.ts:17-63` — `record()` with duplicate check, `update()` with limited fields, `recordBulk()`
- `attendance.repository.ts` — `getBySessionAndEnrollment()`, `create()`, `update()`
- `attendance.types.ts` — `AcademyAttendanceAttributes` interface

## Related Decisions

- GOV-ADR-008 (Academy State Machine): Academy enrollment lifecycle including attendance tracking
