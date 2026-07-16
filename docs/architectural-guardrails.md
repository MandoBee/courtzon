# CourtZon Coach Platform — Architectural Guardrails

> **Status:** APPROVED — Mandatory during implementation
> **Purpose:** These rules are the project's constitution. No exceptions without written justification.
> **Violation:** Any violation requires architectural review and explicit approval before proceeding.

---

## 1. Scheduling Engine

**The Scheduling Engine is closed.**

- Do not redesign the Scheduling Engine.
- Do not add activity-specific logic to the Engine.
- Do not add resource-specific conditions to the Engine.
- Do not add direct repository access to the Engine.
- Do not duplicate domain business rules outside the Engine.
- New business capabilities extend via Providers, Policies, and Activity Definitions.
- The Engine becomes increasingly stable over time.

**Exception process:** Written architectural justification → Tech Lead approval → ADR required.

---

## 2. Permission Framework

**Backend authorization is mandatory.**

- Do not bypass the Permission Framework.
- Frontend permissions control UI visibility only — never trust for data access.
- Every API endpoint must validate permissions server-side.
- Every database query must be scoped to the authenticated user's permissions.
- Permission checks are not optional "if time permits" — they are required.

**Rule:** If the frontend hides a button but the API allows the action, the permission model is broken.

---

## 3. Business Logic

**Business logic belongs in services, not components.**

- Do not place business logic inside React components.
- Do not place business logic inside API routes (use service layer).
- Do not place business logic inside database queries (use domain services).
- React components handle presentation only.
- API routes handle request/response only.
- Services handle business rules, validation, and orchestration.

**Rule:** If you can't test it without rendering a component, it's in the wrong place.

---

## 4. Data Access

**UI code never touches the database.**

- Do not access the database directly from UI code.
- Do not make raw SQL queries from frontend code.
- Do not expose database schema to frontend code.
- All data access goes through API endpoints.
- API endpoints use repository pattern.
- Repositories abstract database implementation.

**Rule:** Frontend → API → Service → Repository → Database. Never bypass.

---

## 5. Pricing Pipeline

**All pricing goes through the Pricing Pipeline.**

- Do not calculate prices outside the Pricing Pipeline.
- Do not hardcode prices in UI code.
- Do not bypass the commission calculation for independent coaches.
- Do not bypass the org pricing hierarchy for resident coaches.
- Campaigns and discounts go through the Pipeline, not around it.

**Rule:** If the price doesn't come from `PricingPipelineService`, it's wrong.

---

## 6. Booking Service

**All bookings go through the Booking Service.**

- Do not create bookings directly in the database.
- Do not bypass the Scheduling Engine for availability checks.
- Do not bypass the Confirmation Policy for booking state.
- Do not bypass the Payment Service for payment processing.
- The Booking Service orchestrates: availability → lock → confirm → payment.

**Rule:** If the booking didn't go through `BookingService`, it doesn't exist.

---

## 7. Feature Scope

**No feature may expand beyond its approved Slice.**

- Do not add features to a slice after the contract is signed.
- Do not add screens, components, or API endpoints beyond the approved scope.
- If a feature is discovered during implementation, document it and schedule it for a future slice.
- Scope expansion requires: new slice contract → DoR → DoD.

**Rule:** The slice contract is final. Execute it as written.

---

## 8. UX Changes

**UX changes require updating the UX Blueprint first.**

- Do not change user flows without updating the UX Blueprint.
- Do not add screens without adding them to the screen inventory.
- Do not change navigation without updating the navigation architecture.
- Do not change permissions without updating the permission matrix.
- The UX Blueprint is the single source of truth for user experience.

**Rule:** If it's not in the UX Blueprint, it doesn't exist.

---

## 9. Component Reuse

**Use canonical components. Do not create duplicates.**

- Do not create new components when a canonical component exists.
- Do not redesign business components (CoachCard, BookingCard, etc.).
- Do not create role-specific variants when a prop-based variant works.
- The 24 canonical components are the single source of truth.
- New components require: component proposal → Tech Lead approval → added to registry.

**Rule:** If it's in the Canonical Component Registry, use it. If not, propose it first.

---

## 10. Testing

**No code without tests.**

- Do not merge code without unit tests.
- Do not merge code without integration tests (for API endpoints).
- Do not skip E2E tests for critical paths.
- Do not skip permission tests for new screens.
- Test coverage must meet slice targets (≥ 80% unit, ≥ 70% integration).

**Rule:** If it's not tested, it's not done.

---

## 11. Security

**Security is not optional.**

- Do not log secrets, keys, or passwords.
- Do not commit secrets to version control.
- Do not expose internal error messages to users.
- Do not skip input validation on API endpoints.
- Do not skip rate limiting on public endpoints.
- Do not skip CSRF protection on state-changing endpoints.
- Do not skip CORS configuration.

**Rule:** Security amendments are mandatory for every change.

---

## 12. Performance

**Performance is a feature, not an afterthought.**

- Do not ship pages that load > 3 seconds.
- Do not ship API endpoints that respond > 500ms.
- Do not ship lists without pagination.
- Do not ship images without optimization.
- Do not skip lazy loading for below-fold content.

**Rule:** If it's slow, it's not done.

---

## 13. Accessibility

**Accessibility is mandatory, not nice-to-have.**

- Do not ship interactive elements without keyboard navigation.
- Do not ship images without alt text.
- Do not ship forms without labels.
- Do not ship color-only indicators (use icons + text).
- Do not skip ARIA attributes where required.

**Rule:** WCAG 2.1 AA compliance is required for every screen.

---

## 14. Documentation

**Code without documentation is incomplete.**

- Do not skip API documentation for new endpoints.
- Do not skip component documentation (props, states, variants).
- Do not skip ADR for architectural decisions.
- Do not skip runbook for production operations.

**Rule:** If it's not documented, it doesn't exist.

---

## 15. Git & Deployment

**No direct commits to master.**

- Do not commit directly to master.
- Do not skip code review.
- Do not merge without CI passing.
- Do not skip Docker rebuild after code changes.
- Do not skip feature flag configuration before release.

**Rule:** Every change goes through: branch → review → merge → build → deploy.

---

## 16. API Versioning

**Every API endpoint uses versioned URLs.**

- All endpoints use `/api/v1/...` format.
- Never use unversioned `/api/...` endpoints.
- Bump major version for breaking changes (field removal, type change, auth change).
- Never remove fields without deprecation period.
- Add `X-Deprecated` and `Sunset` headers for deprecated fields.

**Rule:** Every new endpoint starts at `/api/v1/`. No exceptions.

---

## 17. Database Migrations

**Every schema change goes through migrations.**

- Never run `ALTER TABLE` directly on production.
- Every schema change requires a migration file.
- Prefer additive changes over destructive changes.
- Deprecate before removing columns.
- Every migration should have a rollback strategy.
- API and DB breaking changes should never be released together without rollback plan.

**Rule:** No direct production schema edits. Migrations only.

---

## 18. Evolution Before Revolution

**Prefer evolution over replacement.**

- Do not rewrite stable, production-proven code simply because a cleaner implementation exists.
- Refactoring is encouraged only when it provides measurable value:
  - Business value
  - Performance improvement
  - Security improvement
  - Maintainability improvement
  - Reliability improvement
- Avoid "rewrite for elegance".
- Preserve proven behavior whenever possible.
- Every architectural improvement should minimize risk and maximize continuity.

**Rule:** If existing code is stable, tested, and satisfies business requirements, extend it, integrate with it, or gradually improve it. Do not replace it without a compelling architectural justification.

---

## Summary

| # | Guardrail | Consequence of Violation |
|---|-----------|-------------------------|
| 1 | Scheduling Engine is closed | Architectural review + ADR |
| 2 | Backend authorization mandatory | Security audit |
| 3 | Business logic in services | Code review + refactor |
| 4 | No direct DB access from UI | Code review + refactor |
| 5 | Pricing Pipeline mandatory | Financial audit |
| 6 | Booking Service mandatory | Data integrity audit |
| 7 | No scope expansion | New slice contract required |
| 8 | UX changes require Blueprint update | UX review required |
| 9 | Use canonical components | Component registry review |
| 10 | No code without tests | Merge blocked |
| 11 | Security mandatory | Security audit |
| 12 | Performance mandatory | Performance audit |
| 13 | Accessibility mandatory | Accessibility audit |
| 14 | Documentation mandatory | Documentation review |
| 15 | No direct commits to master | Merge blocked |
| 16 | API versioning mandatory | Code review + refactor |
| 17 | Database migrations mandatory | Schema audit |
| 18 | Evolution over revolution | Architectural review + justification |

---

*These guardrails are the project's constitution. They apply to every commit, every review, and every release.*
