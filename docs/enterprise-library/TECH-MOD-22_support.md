---
document_id: "TECH-MOD-22"
document_name: "Support Module"
family: "TECH-MOD"
document_type: "MOD"
status: "Draft"
version: "0.1"
audience: ["developer", "architect"]
difficulty: "intermediate"
reading_time: 10
business_owner: "Customer Support Lead"
technical_owner: "Lead Developer"
documentation_owner: "Technical Writing"
reviewer: "Architect"
approver: "Architect"
lifecycle_status: "Draft"
knowledge_objects:
  references: ["TECH-ARCH-02"]
  related: ["TECH-MOD-15", "TECH-MOD-14"]
---

# Support Module (TECH-MOD-22)

**Source:** `backend/src/modules/support/` (3 files: index.ts, presentation/support.controller.ts, presentation/support.routes.ts)

## 1. Purpose

Customer support ticket system: ticket lifecycle management, ticket messaging with internal notes, admin assignment, and user-facing ticket submission. 9 routes with dual admin and user-facing endpoints.

## 2. Architecture

```
presentation/
  support.routes.ts      — 9 endpoints (21 lines)
  support.controller.ts  — Request handlers
index.ts                 — Barrel export
```

**Evidence:** `support.routes.ts` (21 lines) defines all 9 routes.

## 3. Routes (9)

Defined in `support.routes.ts:9-21`:

**Admin (7):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 1 | GET | `/admin/support/tickets` | `support.tickets.view` | List all tickets |
| 2 | GET | `/admin/support/tickets/:id` | `support.tickets.view` | Get ticket details |
| 3 | PUT | `/admin/support/tickets/:id` | `support.tickets.manage` | Update ticket |
| 4 | POST | `/admin/support/tickets/:id/assign` | `support.tickets.manage` | Assign to admin |
| 5 | GET | `/admin/support/tickets/:id/messages` | `support.tickets.view` | Get ticket messages |
| 6 | POST | `/admin/support/tickets/:id/messages` | `support.tickets.manage` | Add internal note |
| 7 | GET | `/admin/support/stats` | `support.tickets.view` | Ticket stats |

**User-facing (2):**
| # | Method | Path | Permission | Purpose |
|---|--------|------|-----------|---------|
| 8 | POST | `/support/tickets` | `support.tickets.create` | Create ticket |
| 9 | GET | `/my/support/tickets` | `support.tickets.view` | My tickets |
| 10 | POST | `/my/support/tickets/:id/messages` | `support.tickets.create` | Add message to my ticket |

## 4. Permissions

- `support.tickets.view` — View tickets
- `support.tickets.manage` — Admin manage tickets
- `support.tickets.create` — User create & reply

## 5. Entities

| Entity | Table | Key Fields |
|--------|-------|------------|
| Ticket | `support_tickets` | `id, user_id, subject, description, category, priority, status, assigned_to, created_at` |
| Ticket Message | `support_ticket_messages` | `id, ticket_id, author_id, message, is_internal_note, created_at` |

## 6. Ticket Lifecycle

```
open → in_progress → waiting_on_customer → resolved → closed
```

- `open`: Newly created, unassigned
- `in_progress`: Admin is working on it
- `waiting_on_customer`: Awaiting user response
- `resolved`: Solution provided, awaiting confirmation
- `closed`: Final, no further action

**Evidence:** Status transitions implied by the update and assign endpoints in `support.routes.ts:11-13`.

## 7. Internal Notes

Admin messages can be marked as internal notes (visible only to admins, not to the ticket creator). The `POST /admin/support/tickets/:id/messages` endpoint supports `is_internal_note` flag.

## 8. Assignment

`POST /admin/support/tickets/:id/assign` assigns a ticket to an admin user. Status auto-transitions to `in_progress` on assignment.

## 9. Events

- `support:ticket_created` — User created a ticket
- `support:ticket_assigned` — Admin assigned
- `support:ticket_message_added` — New message
- `support:ticket_status_changed` — Status updated

## 10. Audit Events

All state-changing operations record audit logs via `recordAudit()` in the controller.
