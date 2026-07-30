---
document_id: "TECH-DEV-04"
document_name: "Naming Conventions"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "beginner"
reading_time: 10
depends_on: ["TECH-DEV-01"]
related: ["TECH-DEV-01", "TECH-DEV-03", "TECH-DEV-11"]
---

# CourtZon Naming Conventions

## 1. Purpose

Define naming conventions for all code, files, database objects, API routes, permissions, and events in CourtZon. Consistent naming improves searchability and reduces cognitive load.

## 2. File Naming

| Context | Convention | Example |
|---------|-----------|---------|
| TypeScript/TSX files | kebab-case | `booking.service.ts`, `user-list-page.tsx` |
| Page components | PascalCase match | `BookingListPage.tsx` (content) |
| SQL migration files | `NNN_descriptive_name.sql` | `042_add_booking_notes.sql` |
| Docker files | PascalCase | `Dockerfile`, `docker-compose.yml` |
| Config files | kebab-case | `vite.config.ts`, `tailwind.config.js` |
| Test files | `{source}.spec.ts` | `booking.service.spec.ts` |
| Integration test files | `{source}.integration.spec.ts` | `auth.integration.spec.ts` |

**Evidence:** `backend/src/modules/booking/` — files are `booking.service.ts`, `booking.controller.ts`, `booking.routes.ts`, `booking.dto.ts`.

## 3. TypeScript Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Classes | PascalCase | `class BookingService` |
| Interfaces | PascalCase | `interface BookingAttributes` |
| Type aliases | PascalCase | `type BookingStatus = 'confirmed' \| 'cancelled'` |
| Functions | camelCase | `async function createBooking()` |
| Variables | camelCase | `const bookingId: number` |
| Constants (module-level) | UPPER_SNAKE_CASE | `const MAX_RETRIES = 3` |
| Enum types | PascalCase | `enum BookingStatus` |
| Enum members | PascalCase | `BookingStatus.Confirmed` |
| Private properties | camelCase with `#` or `private` | `private pool` or `#pool` |
| Generic type params | single uppercase letter | `<T>`, `<K, V>` |

## 4. Database Naming

| Element | Convention | Example |
|---------|-----------|---------|
| Table names | snake_case, plural | `bookings`, `user_roles`, `notification_templates` |
| Column names | snake_case | `user_id`, `booking_date`, `created_at` |
| Primary keys | `id` | `id` |
| Foreign keys | `{singular_table}_id` | `user_id`, `booking_id` |
| Index names | `idx_{table}_{column}` | `idx_bookings_user_id` |
| Unique constraints | `uq_{table}_{columns}` | `uq_users_email` |
| Foreign key constraints | `fk_{child}_{parent}` | `fk_bookings_user` |
| Junction tables | `{table1}_{table2}` | `user_roles`, `booking_amenities` |

**Evidence:** `database/baseline/001_courtzon_v3.sql` — all tables follow snake_case naming (e.g., `booking_status_history`, `payment_transactions`).

```sql
CREATE TABLE bookings (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  resource_id INT UNSIGNED NOT NULL,
  booking_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  status ENUM('pending', 'confirmed', 'cancelled') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id),
  INDEX idx_bookings_user_id (user_id),
  INDEX idx_bookings_date (booking_date)
);
```

## 5. API Route Naming

| Pattern | Convention | Example |
|---------|-----------|---------|
| Resource routes | `/{resource}` | `/bookings`, `/users` |
| Resource by ID | `/{resource}/:id` | `/bookings/:id` |
| Admin routes | `/admin/{resource}` | `/admin/users`, `/admin/settings` |
| Org-scoped routes | `/org/{resource}` | `/org/members`, `/org/settings` |
| Nested resources | `/{parent}/:parentId/{child}` | `/bookings/:bookingId/notes` |
| Actions on resources | `/{resource}/:id/{action}` | `/bookings/:id/cancel` |
| Query params | camelCase | `?pageSize=20&sortBy=createdAt` |

**Evidence:** `backend/src/modules/booking/presentation/booking.routes.ts` uses `/bookings`, `/bookings/:id`, `/admin/bookings`, etc.

## 6. Permission Key Naming

Permission keys follow the pattern `{module}.{entity}.{action}` or `{module}.{action}`:

```typescript
// frontend/src/permissions/registry.ts
{
  permissionKey: 'bookings.create',
  moduleSlug: 'bookings',
  elementType: 'button',
  elementLabel: 'Create Booking',
},
{
  permissionKey: 'users.edit.first-name',
  moduleSlug: 'users',
  elementType: 'field',
  elementLabel: 'Edit First Name',
},
{
  permissionKey: 'organisations.edit.name',
  moduleSlug: 'organisations',
  elementType: 'field',
  elementLabel: 'Edit Organisation Name',
},
```

**Evidence:** `frontend/src/permissions/registry.ts` — all permission keys follow the `{module}.{entity}.{field}` pattern.

## 7. Event Naming

Events use UPPER_SNAKE_CASE with entity and action:

```
{ENTITY}.{ACTION}
```

```typescript
// Audit log action constants
'BOOKING.CREATE'
'BOOKING.CANCEL'
'USER.LOGIN'
'USER.UPDATE.EMAIL'
'PAYMENT.COMPLETED'
'NOTIFICATION.SENT'
```

**Evidence:** `backend/src/modules/audit-log/` — actions like `BOOKING.CREATE`, `USER.LOGIN` are used in `recordAudit()` calls.

## 8. Translation Key Naming

Translation keys follow `{module}.{page}.{element}`:

```json
{
  "booking": {
    "list": {
      "title": "My Bookings",
      "empty": "No bookings yet",
      "create": "New Booking"
    },
    "detail": {
      "title": "Booking Details",
      "status": "Status",
      "cancel": "Cancel Booking"
    }
  }
}
```

**Evidence:** `frontend/src/i18n/en/booking.json` follows this pattern.

## 9. CSS Class Names

Use Tailwind utility classes exclusively. No custom CSS class names in `.css` files unless absolutely necessary. If custom classes are required, use kebab-case BEM-lite:

```css
.booking-card { }
.booking-card--highlighted { }
.booking-card__header { }
```

## 10. Branch Naming

```
feature/{ticket-number}-{short-description}
fix/{ticket-number}-{short-description}
sprint/{sprint-number}
```

See TECH-DEV-05 for full branch strategy.

## 11. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-01 | Coding Standards — TypeScript (extends naming to code) |
| TECH-DEV-03 | Folder Structure Standard (file naming context) |
| TECH-DEV-05 | Git Workflow & Branch Strategy (branch naming) |
| TECH-DEV-11 | API Design Standards (route naming) |

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
