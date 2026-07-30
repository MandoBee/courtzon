---
document_id: "TECH-MOD-21"
document_name: "Audit Log Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect", "security"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Security Lead"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Security Lead"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02", "TECH-ARCH-04"]
  related: ["TECH-MOD-20", "TECH-MOD-02"]
---

# Audit Log Module (TECH-MOD-21)

**Source:** `backend/src/modules/audit-log/` (7 entries: domain/, application/, commands/, infrastructure/, presentation/, index.ts, __tests__/)

## 1. Purpose

Fire-and-forget audit event recording system. Provides a single query endpoint with multi-filter capabilities (entityType, action, actorId, date range, IP). Records JSON before/after state for every mutation across all modules. 50+ audit action types defined.

## 2. Architecture

```
domain/
  audit-log-aggregate.ts  — Audit log record interface (20 lines)
  audit-log.types.ts      — AuditAction union type (63 lines)
application/
  audit-log.service.ts    — Singleton service with fire-and-forget + multi-filter query (46 lines)
infrastructure/
  repositories/
    audit-log.repository.ts
commands/
  (audit command handlers)
presentation/
  audit-log.routes.ts     — 1 endpoint (30 lines)
index.ts                  — Barrel exports
```

**Evidence:** `audit-log.routes.ts` (30 lines), `domain/audit-log.types.ts` (63 lines, 54 action types), `application/audit-log.service.ts` (46 lines), `domain/audit-log-aggregate.ts` (20 lines).

## 3. Routes (1)

Defined in `audit-log.routes.ts:6-29`:

| # | Method | Path | Auth | Purpose |
|---|--------|------|------|---------|
| 1 | GET | `/admin/audit-logs` | Yes+`audit.view` | Query audit logs |

**Query parameters:** `entityType`, `action`, `actorId`, `dateFrom`, `dateTo`, `ipAddress`, `limit` (default 30), `offset`, `page`

## 4. Permissions

- `audit.view` — Required to access audit logs

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Audit Log | `audit_logs` | `id, actor_id, action, entity_type, entity_id, before_state (JSON), after_state (JSON), reason, ip_address, user_agent, created_at` |

**Evidence:** `audit-log-aggregate.ts:3-14` defines `AuditLogRecord` interface with all fields.

## 6. Audit Action Types (54)

Defined in `audit-log.types.ts:1-53`:

| Category | Actions |
|----------|---------|
| User | `USER.LOGIN`, `USER.LOGOUT`, `USER.REGISTER`, `USER.LOGIN_FAILED`, `USER.PASSWORD_RESET`, `USER.PASSWORD_CHANGE`, `USER.DELETE` |
| Role/Permission | `ROLE.CREATE`, `ROLE.UPDATE`, `ROLE.DELETE`, `PERMISSION.ASSIGN`, `PERMISSION.REVOKE`, `PERMISSION.SYNC` |
| Organisation | `ORGANISATION.CREATE`, `ORGANISATION.UPDATE`, `ORGANISATION.DELETE`, `ORGANISATION.VERIFY` |
| Wallet | `WALLET.CREATE`, `WALLET.CREDIT`, `WALLET.DEBIT`, `WALLET.ADJUST` |
| Settlement | `SETTLEMENT.CREATE`, `SETTLEMENT.PROCESS`, `SETTLEMENT.APPROVE`, `SETTLEMENT.REJECT` |
| Booking | `BOOKING.CREATE`, `BOOKING.CANCEL`, `BOOKING.REFUND`, `BOOKING.STATUS_CHANGE` |
| Marketplace | `MARKETPLACE.PRODUCT_CREATE`, `MARKETPLACE.PRODUCT_UPDATE`, `MARKETPLACE.PRODUCT_DELETE`, `MARKETPLACE.ORDER_STATUS` |
| Financial | `FINANCIAL.TRANSACTION` |
| Upload | `UPLOAD.CREATE`, `UPLOAD.DELETE` |
| System | `SETTINGS.UPDATE`, `FEATURE_FLAG.TOGGLE`, `CMS.UPDATE`, `ADMIN.ACTION` |
| Subscription | `SUBSCRIPTION.CREATED` through `SUBSCRIPTION.TOGGLE_STATUS` (14 actions) |

## 7. Fire-and-Forget Pattern

`audit-log.service.ts:8-14`:
```typescript
async record(entry: AuditLogCreate): Promise<void> {
  try {
    await auditLogRepository.create(entry);
  } catch (err) {
    log.error({ err, action: entry.action, entityType: entry.entityType }, 'Failed to write audit log');
  }
}
```

The `record()` method wraps DB write in try/catch — failures are logged but never propagated. Consuming modules call `recordAudit()` via the convenience export without awaiting.

**Evidence:** `audit-log.service.ts:8-14` for error handling, `:44-46` for `recordAudit()` convenience function.

## 8. Multi-Filter Querying

`audit-log.service.ts:28-38` implements `findByFilters()` with these optional filters:
- `entityType` — Filter by entity type string
- `action` — Filter by audit action
- `actorId` — Filter by actor user ID
- `dateFrom` / `dateTo` — Date range filter
- `ipAddress` — Filter by IP address
- Pagination via `limit` + `offset`

## 9. JSON State Capture

Each audit entry captures `beforeState` and `afterState` as JSON objects:
- `beforeState`: Snapshot of entity state before the mutation
- `afterState`: Snapshot of entity state after the mutation

**Evidence:** `audit-log-aggregate.ts:9-10` defines `beforeState` and `afterState` as `Record<string, unknown> | null`.

## 10. Events

- `audit:recorded` — When an audit entry is successfully written (not currently emitted, but available for future use)
