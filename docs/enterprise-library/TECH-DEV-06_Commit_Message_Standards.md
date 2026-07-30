---
document_id: "TECH-DEV-06"
document_name: "Commit Message Standards"
family: "TECH-DEV"
document_type: "STD"
status: "Draft"
version: "0.1"
audience: ["developer"]
difficulty: "beginner"
reading_time: 8
depends_on: ["TECH-DEV-05"]
related: ["TECH-DEV-05", "TECH-DEV-07"]
---

# CourtZon Commit Message Standards

## 1. Purpose

Define mandatory commit message format for all CourtZon repositories. All commits merged to `master` must follow the Conventional Commits specification.

## 2. Format

```
<type>(<scope>): <description>

[optional body]

[optional footer(s)]
```

Maximum line length: 72 characters for subject, 100 for body.

## 3. Allowed Types

| Type | Usage | Example |
|------|-------|---------|
| `feat` | New feature | `feat(booking): add cancel booking endpoint` |
| `fix` | Bug fix | `fix(booking): validate date is not in past` |
| `docs` | Documentation only | `docs: add migration standards` |
| `refactor` | Code change that fixes neither bug nor adds feature | `refactor(booking): extract validation logic` |
| `test` | Adding or correcting tests | `test(booking): add cancel mutation tests` |
| `chore` | Build, CI, dependencies | `chore: upgrade fastify to 5.x` |
| `perf` | Performance improvement | `perf(booking): add index on user_id` |
| `style` | Formatting only (no logic change) | `style: fix indent in booking service` |

## 4. Scope

Scope must reference the module or area being changed:

| Scope | Module |
|-------|--------|
| `booking` | `backend/src/modules/booking/` |
| `auth` | `backend/src/modules/auth/` |
| `admin` | `frontend/src/pages/admin/` |
| `frontend` | General frontend changes |
| `db` | Database migrations |
| `deps` | Dependency updates |
| `ci` | CI/CD configuration |

## 5. Description

- Imperative mood (`add`, `fix`, `remove` — NOT `added`, `fixed`, `removed`)
- Lowercase after type(scope):
- No period at end
- Max 72 characters

```bash
# GOOD
feat(booking): add cancel booking endpoint
fix(auth): handle expired tokens gracefully
docs: add folder structure standard

# BAD
Added cancel booking endpoint
fix(auth): Handled expired tokens gracefully.
feat(booking): this is a very long commit message that exceeds the seventy two character limit
```

## 6. Body

Use body to explain **why** the change was made, not **what** (the diff shows what):

```
feat(booking): add cancel booking endpoint

Booking cancellations were only possible via admin panel.
Players now can cancel their own bookings up to 24 hours before start time.
Implements the business rule from REQ-BOOK-042.
```

## 7. Footer

Footers reference issues, breaking changes, or co-authors:

```
feat(booking): add cancel booking endpoint

Implements player-side cancellation with refund check.

Closes CZ-123
Breaking change: cancel API now requires reason field
Co-authored-by: Jane <jane@example.com>
```

## 8. Squash Merge Commits

When squashing a PR, the commit message must summarize the full feature:

```
feat(booking): add cancel booking endpoint

- Add POST /bookings/:id/cancel endpoint
- Add CancelBookingDto with reason validation
- Add refund eligibility check in BookingService
- Add audit logging for cancellation events
- Add CancelBookingPage in frontend

Closes CZ-123
```

## 9. Evidence from Git History

```
$ git log --oneline -10
abc1234 feat(booking): add cancel booking endpoint
def5678 fix(auth): handle expired tokens gracefully
ghi9012 refactor(booking): extract validation logic
jkl3456 test(booking): add cancel mutation tests
mno7890 chore: upgrade fastify to 5.x
pqr1234 docs: add git workflow standards
stu5678 perf(booking): add index on user_id
vwx9012 style: fix indent in booking service
yza3456 feat(admin): add UI permissions management
bcd7890 chore(deps): update zod to 3.23
```

## 10. Commit Hooks

Enable commitlint to enforce format:

```bash
npm install --save-dev @commitlint/cli @commitlint/config-conventional
echo "module.exports = { extends: ['@commitlint/config-conventional'] };" > commitlint.config.js
```

**Evidence:** `.husky/commit-msg` in project root enforces commit message format.

## 11. Related Documents

| Document | Relationship |
|----------|-------------|
| TECH-DEV-05 | Git Workflow & Branch Strategy (context for commit flow) |
| TECH-DEV-07 | Pull Request Standards (PR commit requirements) |

## 12. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2026-07-28 | Architect | Initial draft |
