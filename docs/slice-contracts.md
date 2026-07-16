# CourtZon Coach Platform — Slice Contracts

> **Date:** July 2026
> **Rule:** Fixed scope per slice. No scope expansion during implementation.
> **Process:** Sign contract → Implement → Verify → Release. No deviations.

---

## Slice 0: Foundation (Infrastructure Only)

> **Detailed spec:** `docs/slice-0-foundation-refined.md`

### Included
- **Authentication:** Login, Register, Password Reset, Email Verification
- **Authorization:** Role-based access, Permission framework, `<Can>` component
- **Session Management:** Access/Refresh tokens, Remember Me, Session expiration, Logout (current/all devices), Multi-device support
- **App Shell:** Layout container, Route structure, Error boundaries
- **Navigation:** BottomNav (Player, Coach), Sidebar (Org), Route guards
- **Design System:** Design Tokens (colors, typography, spacing, radius, elevation, motion, breakpoints, icons), Component primitives (Button, Input, Card, Modal, etc.)
- **Permission Framework:** Role definitions (7 roles), Permission matrix, API middleware
- **API Client:** HTTP client, Auth interceptor, Error handling, Retry logic, Concurrent request handling
- **State Management:** React Query setup, Cache configuration, Optimistic updates
- **Localization:** i18n setup, Translation structure, RTL support
- **Theme:** Light/Dark mode, CSS variables, Theme provider
- **Date/Time Standards:** Format constants (DD/MM/YYYY, HH:MM AM/PM), Locale configuration
- **Feature Flags:** Two-level system (per-slice + per-feature), Flag provider, Flag hooks
- **Role Switching:** Multi-role support, Workspace switching, Permission scoping

### Not Included
- Help Center (moved to Slice 2/5)
- Notification Center (moved to Slice 1)
- Profile Features (moved to Slice 2/3)
- Settings Features (moved to Slice 2/3)
- Onboarding Flows (moved to Slice 3/6)
- Shared business components (StatusBadge, EmptyState, etc. — moved to slices that use them)
- Marketplace (deferred to V2)
- Chat/Messaging (deferred to V2)
- Push notifications
- File upload
- Payment processing
- Real-time updates (WebSocket)
- Analytics events
- Accessibility audit

### Dependencies
- Scheduling Engine (existing, no changes)
- Backend API (existing auth endpoints)
- Database (existing schema)

### Acceptance Criteria
- [ ] User can register with email/password
- [ ] User can login with email/password
- [ ] User can reset password via email
- [ ] User can verify email
- [ ] Session persists with "Remember Me" (30 days)
- [ ] Session expires after 15 min without refresh
- [ ] User can logout (current device)
- [ ] User can logout all devices
- [ ] User can view active sessions
- [ ] User with multiple roles can switch roles
- [ ] Role switching changes workspace (navigation + screens)
- [ ] Permissions are scoped to active role
- [ ] Design tokens are defined and applied
- [ ] Light/dark mode works
- [ ] RTL layout works
- [ ] Feature flags can be toggled (2 levels)
- [ ] API client handles auth errors (401 → refresh → retry)
- [ ] Navigation guards block unauthorized access
- [ ] Error boundaries catch rendering errors

### Test Strategy
- Unit: All components render, token refresh logic, permission checks, feature flag evaluation
- Integration: Auth flow (register, login, refresh, logout), role switching, permission scoping
- E2E: Complete auth flow on mobile and desktop, role switching across workspaces

### Release Strategy
- Internal testing only
- Feature flag: `coaching.slice0_foundation_enabled` (default: true)

### Success Metrics
- Auth flow completion rate: > 95%
- Token refresh success rate: > 99%
- Role switching success rate: 100%
- Permission check accuracy: 100%
- Zero security vulnerabilities

---

## Slice 1: Player — Find & Book a Coach (Core Flow)

### Included
- Player Home (P-01) — personalized recommendations, quick rebook
- Need Selection (P-02) — guided discovery flow
- Session Type Selection (P-03) — format options with recommendations
- Coach Search Results (P-04) — filtered/sorted list with `PlayerCoachCard`
- Coach Profile (P-05) — full profile with `CoachProfileHero`, reviews, availability preview
- Time Selection (P-06) — `DatePickerCalendar` + `TimeSlotPicker`, real-time availability
- Booking Confirmation (P-07) — summary, `PriceBreakdown`, payment method selection
- Payment Processing (P-08) — wallet, card integration
- Booking Success (P-09) — confirmation, calendar add, share
- `PlayerBookingCard` (Upcoming variant)
- `FilterPanel`, `SearchInput`
- Scheduling Engine integration (availability resolution)
- `ConfirmationPolicyService` — instant confirmation for V1
- `PricingPipelineService` — final price calculation
- Booking API endpoints
- Wallet API endpoints (top-up only)

### Not Included
- Cash payment (deferred to Slice 2)
- Promo codes (deferred to Slice 9)
- Request Approval booking model (deferred — instant only for V1)
- Chat with coach (deferred to V2)
- Marketplace browsing (deferred to V2)
- Push notifications
- Real-time slot updates (WebSocket)

### Dependencies
- Slice 0 (auth, navigation, permissions, shared components)
- Scheduling Engine (availability resolution)

### Acceptance Criteria
- [ ] Player can find coaches by need and session type
- [ ] Player can view coach profile with reviews and availability
- [ ] Player can select date and time slot
- [ ] Player can confirm booking with price breakdown
- [ ] Player can pay with wallet or card
- [ ] Booking appears in "My Bookings" immediately
- [ ] Coach sees booking in "Upcoming" immediately
- [ ] Scheduling Engine resolves availability correctly
- [ ] Price calculation follows pricing pipeline
- [ ] Instant confirmation works (no accept/decline)
- [ ] Slot locked at payment (no double-booking)

### Test Strategy
- Unit: `ConfirmationPolicyService`, `PricingPipelineService`, form validation
- Integration: Booking API, payment API, scheduling engine integration
- E2E: Complete booking flow (find → profile → time → confirm → pay → success)

### Release Strategy
- Beta users (internal team + 10 test players)
- Feature flag: `coaching.engine_booking_enabled`
- Old booking flow continues working

### Success Metrics
- Booking flow completion rate: > 70%
- Time to book: < 5 minutes
- Payment success rate: > 95%
- Slot conflict rate: 0%

---

## Slice 2: Player — Booking Management & History

### Included
- My Bookings (P-12) — `PlayerBookingCard` (Upcoming, Past, Cancelled variants)
- Booking Detail (P-10) — status, actions, `PriceBreakdown`, check-in
- Session Rating (P-11) — star rating, review text, skills worked on
- Session History (P-13) — timeline, spending summary
- Wallet & Payment Methods (P-14) — `WalletDisplay`, top-up, saved cards, transaction history
- Player Profile (P-15) — `ProfileEditor` (Player variant), preferences, settings
- Cash payment option
- Cancel booking flow (with policy penalties)
- Reschedule booking flow

### Not Included
- Chat with coach (deferred to V2)
- Push notifications for booking reminders
- Calendar integration (Google Calendar sync)
- Group booking (multiple players)
- Recurring bookings

### Dependencies
- Slice 1 (bookings must exist to manage)

### Acceptance Criteria
- [ ] Player can view all bookings (upcoming, past, cancelled)
- [ ] Player can view booking detail with status and actions
- [ ] Player can cancel booking (within policy window)
- [ ] Player can reschedule booking
- [ ] Player can check in on session day
- [ ] Player can rate session after completion
- [ ] Player can view session history with spending summary
- [ ] Player can view wallet balance and transaction history
- [ ] Player can top up wallet
- [ ] Player can edit profile and preferences
- [ ] Cancel/refund follows policy (instant confirmation model)

### Test Strategy
- Unit: Booking state transitions, cancel policy calculation, rating submission
- Integration: Booking CRUD API, wallet API, refund API
- E2E: Complete booking lifecycle (create → manage → complete → rate)

### Release Strategy
- Same beta group as Slice 1
- Feature flag: `coaching.booking_management_enabled`

### Success Metrics
- Booking management task completion: > 90%
- Cancel flow success rate: 100%
- Rating submission rate: > 60%
- Wallet top-up success rate: > 95%

---

## Slice 3: Independent Coach — Onboarding & Profile

### Included
- Application Form (IC-01) — multi-step form, document upload
- Verification Upload (IC-02) — ID, certificates, video intro
- Application Status (IC-03) — status tracker, timeline
- Dashboard Home (IC-04) — `StatsCard` (Number), pending actions, upcoming sessions, recent reviews
- Profile Editor (IC-05) — `ProfileEditor` (Coach variant), specialties, certifications
- Pricing Settings (IC-06) — `PricingConfig` (Coach variant), market data comparison
- Service Areas (IC-07) — map selection, travel preferences
- Settings (IC-16) — account, notifications, privacy
- Confirmation policy setting (Instant vs Request Approval)
- File upload service

### Not Included
- Application approval workflow (org side — deferred to Slice 8)
- Background check integration
- Video intro hosting
- Portfolio/gallery
- Social media links

### Dependencies
- Slice 0 (auth, navigation, permissions)

### Acceptance Criteria
- [ ] Coach can submit application with required documents
- [ ] Coach can upload ID, certificates (JPG/PNG/PDF, max 10MB)
- [ ] Coach can view application status
- [ ] Coach can complete profile with specialties and certifications
- [ ] Coach can set pricing per session type
- [ ] Coach can see platform commission and projected earnings
- [ ] Coach can select service areas on map
- [ ] Coach can set confirmation policy preference
- [ ] Application appears in org pipeline (visible to org admin)

### Test Strategy
- Unit: Form validation, file upload validation, pricing calculation
- Integration: Application API, file upload API, profile API
- E2E: Complete application flow (form → upload → status → profile → pricing)

### Release Strategy
- Invite-only coaches (manual approval)
- Feature flag: `coaching.onboarding_v2_enabled`

### Success Metrics
- Application completion rate: > 80%
- File upload success rate: > 95%
- Profile completion rate: > 70%
- Pricing setup completion: > 90%

---

## Slice 4: Independent Coach — Availability & Bookings

### Included
- Availability Calendar (IC-08) — `AvailabilityEditor` (Week grid), recurring schedules, exceptions
- Bookings List (IC-09) — `CoachBookingCard` (Pending, Upcoming, Completed)
- Booking Detail (IC-10) — player info, prep notes, session notes, actions
- Instant Confirmation flow (coach sees "Upcoming" — no accept/decline)
- Calendar integration (Google Calendar — read-only sync)

### Not Included
- Request Approval flow (deferred — instant only for V1)
- Demand overlay (IC-08 advanced feature)
- Recurring availability exceptions
- Multi-branch availability
- Availability analytics

### Dependencies
- Slice 3 (coach must be onboarded)
- Slice 1 (player bookings must work)

### Acceptance Criteria
- [ ] Coach can set weekly availability (drag to add blocks)
- [ ] Coach can set recurring availability (e.g., "Every Monday 9am-12pm")
- [ ] Coach can add exceptions (e.g., "Not available July 20")
- [ ] Coach can see player bookings in calendar
- [ ] Coach can view booking detail with player info
- [ ] Coach can add prep notes to booking
- [ ] Coach can add session notes after completion
- [ ] Coach can mark booking as completed
- [ ] Availability changes reflect in player booking flow (within 5 min)
- [ ] Instant confirmation works (no accept/decline)

### Test Strategy
- Unit: Availability calculations, recurring schedule logic, booking state transitions
- Integration: Availability API, booking API, calendar sync
- E2E: Complete availability flow (set availability → player books → coach sees booking)

### Release Strategy
- Same beta coaches as Slice 3
- Feature flag: `coaching.availability_editor_v2_enabled`

### Success Metrics
- Availability setup completion: > 80%
- Booking acceptance rate: 100% (instant — no rejection possible)
- Availability sync accuracy: 100%
- Coach calendar sync success: > 90%

---

## Slice 5: Independent Coach — Earnings & Analytics

### Included
- Earnings & Wallet (IC-11) — `WalletDisplay`, `EarningsSummary` (Coach), transaction history
- Withdrawal (IC-12) — bank account selection, amount input, processing status
- Reviews List (IC-13) — `ReviewCard` (With Response), rating breakdown, response input
- Analytics Dashboard (IC-14) — `StatsCard` (Chart, Comparison), trends, comparisons
- Growth & Achievements (IC-15) — tier system, badges, referral program

### Not Included
- Advanced analytics (cohort analysis, predictive)
- Financial reports export
- Tax document generation
- Multi-currency support
- Instant withdrawal

### Dependencies
- Slice 4 (bookings must exist to earn from)
- Slice 1 (wallet infrastructure)

### Acceptance Criteria
- [ ] Coach can view earnings breakdown (per session, per period)
- [ ] Coach can see platform commission deducted
- [ ] Coach can view transaction history
- [ ] Coach can withdraw earnings to bank account
- [ ] Coach can view withdrawal processing status
- [ ] Coach can view all reviews with ratings
- [ ] Coach can respond to reviews
- [ ] Coach can view analytics (earnings trend, booking trend, rating trend)
- [ ] Coach can view growth tier and achievements
- [ ] Earnings calculation follows pricing pipeline (commission deducted)

### Test Strategy
- Unit: Earnings calculation, commission calculation, withdrawal validation
- Integration: Earnings API, withdrawal API, reviews API
- E2E: Complete earnings flow (earn → view → withdraw)

### Release Strategy
- Same beta coaches as Slice 3-4
- Feature flag: `coaching.earnings_v2_enabled`

### Success Metrics
- Earnings display accuracy: 100%
- Withdrawal success rate: > 95%
- Review response rate: > 40%
- Analytics data accuracy: 100%

---

## Slice 6: Resident Coach — Onboarding & Daily Operations

### Included
- Invitation Acceptance (RC-01) — invitation details, accept/decline
- Onboarding Checklist (RC-02) — org-specific setup steps
- Dashboard Home (RC-03) — today's schedule, upcoming sessions, quick actions
- Unified Calendar (RC-04) — `UnifiedCalendar` (org + player sessions), color coding, swap requests
- Schedule Management (RC-07) — `AvailabilityEditor` (working hours — read-only for org-set hours), time-off requests
- Instant Confirmation (forced — no override)

### Not Included
- Resident coach application flow (org-initiated)
- Advanced swap request workflow
- Shift trading
- Performance reviews (deferred to Slice 7)

### Dependencies
- Slice 0 (auth, navigation, permissions)
- Slice 4 (booking infrastructure)

### Acceptance Criteria
- [ ] Coach can accept org invitation
- [ ] Coach can complete onboarding checklist
- [ ] Coach can view today's schedule on dashboard
- [ ] Coach can view unified calendar (org sessions + player bookings)
- [ ] Coach can see color coding (org = blue, player = green)
- [ ] Coach can request swap for org sessions
- [ ] Coach can view working hours (read-only — set by org)
- [ ] Coach can request time off
- [ ] Instant confirmation enforced (no request approval option)
- [ ] Availability set by org reflects in player booking flow

### Test Strategy
- Unit: Invitation validation, calendar rendering, swap request logic
- Integration: Invitation API, calendar API, schedule API
- E2E: Complete onboarding flow (accept → checklist → dashboard → calendar)

### Release Strategy
- Pilot organizations (1-2 orgs with resident coaches)
- Feature flag: `coaching.resident_flow_enabled`

### Success Metrics
- Invitation acceptance rate: > 90%
- Onboarding completion rate: > 85%
- Calendar accuracy: 100%
- Swap request success rate: > 80%

---

## Slice 7: Resident Coach — Earnings & Performance

### Included
- Earnings & Revenue (RC-05) — `EarningsSummary` (Resident), revenue share breakdown
- Performance Reports (RC-06) — `StatsCard` (Number, Comparison), goals, feedback

### Not Included
- Performance review workflow (org-initiated)
- Goal setting (org-assigned goals)
- Bonus calculation
- Salary slip generation

### Dependencies
- Slice 6 (resident must be onboarded)
- Slice 5 (earnings infrastructure)

### Acceptance Criteria
- [ ] Coach can view earnings breakdown (per session, per month)
- [ ] Coach can see revenue share with organization
- [ ] Coach can view performance metrics (rating, attendance, utilization)
- [ ] Coach can compare performance to benchmarks
- [ ] Coach can view feedback from org admin
- [ ] Earnings calculation follows resident pricing pipeline (no commission)

### Test Strategy
- Unit: Earnings calculation, performance metrics
- Integration: Earnings API, performance API
- E2E: Complete earnings flow (earn → view → understand revenue share)

### Release Strategy
- Same pilot orgs as Slice 6
- Feature flag: `coaching.resident_earnings_enabled`

### Success Metrics
- Earnings display accuracy: 100%
- Performance metrics accuracy: 100%
- Revenue share transparency: 100%

---

## Slice 8: Organization — Dashboard & Coach Management

### Included
- Dashboard Home (OG-01) — `StatsCard` (Number), alerts, quick actions
- Coach List (OG-02) — `OrgCoachCard`, filters, bulk actions
- Coach Profile Detail (OG-03) — `OrgCoachProfile`, performance, schedule, earnings, actions
- Applications Pipeline (OG-04) — kanban board, status transitions
- Application Review (OG-05) — document viewer, approve/reject, interview scheduling
- Branch Assignment (OG-06) — drag-to-assign, branch-specific views
- Application approval workflow (completes Slice 3)

### Not Included
- Bulk coach import
- Advanced performance reviews
- Coach scheduling (org-initiated)
- Background check integration
- Contract management

### Dependencies
- Slice 0 (auth, navigation, permissions)
- Slice 3 (coaches must exist to manage)

### Acceptance Criteria
- [ ] Org admin can view dashboard with key metrics
- [ ] Org admin can view all coaches with filters
- [ ] Org admin can view coach detail with performance data
- [ ] Org admin can manage application pipeline (kanban)
- [ ] Org admin can review applications (view documents, approve/reject)
- [ ] Org admin can assign coaches to branches
- [ ] Application approval triggers coach verification status update
- [ ] Branch manager sees branch-scoped data only

### Test Strategy
- Unit: Pipeline logic, branch assignment, permission scoping
- Integration: Coach CRUD API, application API, branch API
- E2E: Complete coach management flow (view → review application → approve → assign)

### Release Strategy
- Pilot organizations (1-2 orgs)
- Feature flag: `coaching.org_management_v2_enabled`

### Success Metrics
- Dashboard load time: < 2 seconds
- Application review completion: > 90%
- Branch assignment accuracy: 100%
- Permission scoping: 100% (branch manager sees only branch data)

---

## Slice 9: Organization — Pricing, Revenue & Reports

### Included
- Pricing Rules (OG-07) — `PricingConfig` (Org variant), org/branch/coach pricing hierarchy
- Confirmation policy configuration (per coach type)
- Revenue Sharing (OG-08) — share models, overrides, audit trail
- Performance Dashboard (OG-09) — `StatsCard` (Comparison), rankings, benchmarks
- Utilization Reports (OG-10) — branch utilization, coach utilization, court utilization
- Business Reports (OG-11) — revenue reports, player reports, export
- Campaign management (basic discounts)

### Not Included
- Advanced campaign engine (targeted, automated)
- Financial reconciliation
- Tax reporting
- Multi-currency
- Predictive analytics

### Dependencies
- Slice 8 (org must be set up)
- Slice 1 (pricing affects player flow)
- Slice 5 (earnings affect revenue sharing)

### Acceptance Criteria
- [ ] Org admin can set pricing per session type per branch
- [ ] Org admin can set coach-specific price overrides
- [ ] Org admin can configure confirmation policy per coach type
- [ ] Org admin can view revenue sharing breakdown
- [ ] Org admin can view performance dashboard with rankings
- [ ] Org admin can view utilization reports (branch, coach, court)
- [ ] Org admin can generate and export business reports
- [ ] Org admin can create basic discount campaigns
- [ ] Pricing pipeline works correctly for both resident and independent coaches
- [ ] All financial data follows pricing pipeline

### Test Strategy
- Unit: Pricing hierarchy calculation, revenue sharing, campaign discount logic
- Integration: Pricing API, revenue API, reports API, campaign API
- E2E: Complete pricing flow (set pricing → player books → revenue calculated → report generated)

### Release Strategy
- Same pilot orgs as Slice 8
- Feature flag: `coaching.pricing_v2_enabled`

### Success Metrics
- Pricing accuracy: 100%
- Revenue calculation accuracy: 100%
- Report generation time: < 5 seconds
- Campaign discount application: 100%

---

## Slice 10: Polish, Testing & Launch

### Included
- Cross-browser testing (Chrome, Safari, Firefox, Edge)
- Mobile responsiveness audit (320px, 768px, 1024px, 1440px)
- Accessibility audit (WCAG 2.1 AA)
- Performance optimization (lazy loading, code splitting, image optimization)
- Error boundary refinement
- Analytics event verification (all events fire correctly)
- Notification delivery testing (push, in-app, email)
- Load testing (100 concurrent bookings, payment processing)
- Security audit (permission checks, input validation, rate limiting, CSRF, XSS)
- Documentation update (API docs, component stories, runbook)
- Feature flag rollout plan (gradual rollout)
- Production deployment

### Not Included
- New features
- New screens
- New components
- UI redesign

### Dependencies
- All previous slices (0-9) complete

### Acceptance Criteria
- [ ] All screens render correctly on all target browsers
- [ ] All screens responsive on all target breakpoints
- [ ] Accessibility score > 90 (axe-core)
- [ ] Lighthouse performance score > 80
- [ ] All analytics events fire correctly
- [ ] All notifications delivered correctly
- [ ] Load test passed (100 concurrent users, 0 errors)
- [ ] Security audit passed (0 critical, 0 high vulnerabilities)
- [ ] API documentation complete
- [ ] Component stories complete
- [ ] Runbook complete
- [ ] Feature flags configured for gradual rollout

### Test Strategy
- All unit tests pass (≥ 80% coverage)
- All integration tests pass
- All E2E tests pass
- Load test: 100 concurrent users, < 2s response time, 0 errors
- Security scan: 0 critical, 0 high vulnerabilities

### Release Strategy
- Staging environment → Production (gradual rollout)
- Rollout: 10% → 25% → 50% → 100%
- Monitor: error rate, response time, booking success rate
- Rollback plan: Feature flags can disable any slice instantly

### Success Metrics
- Zero critical bugs at launch
- Zero security vulnerabilities at launch
- Page load time: < 3 seconds
- Booking flow completion: > 70%
- User satisfaction: > 4.0/5.0

---

## Definition of Ready (DoR)

Implementation of a slice may begin **only** when ALL of the following are true:

| # | Requirement | Verified By | Evidence |
|---|-------------|-------------|----------|
| 1 | Product approved | Product Owner | Signed slice contract |
| 2 | UX approved | UX Designer | Screens documented in UX Blueprint |
| 3 | Permission Matrix approved | Tech Lead + QA | Component-level permissions defined |
| 4 | APIs available | Backend Lead | API contracts documented or endpoints ready |
| 5 | Feature Flags defined | Tech Lead | Flags added to feature flag system |
| 6 | Acceptance Criteria approved | QA Lead | All criteria in slice contract |
| 7 | Test scenarios prepared | QA Engineer | Test cases written before implementation |
| 8 | Dependencies resolved | Tech Lead | Previous slice(s) complete |
| 9 | Design Tokens applied | UI Designer | Visual design matches token system |
| 10 | No open blocking issues | Tech Lead | All P0/P1 issues resolved |

**Rule:** No implementation begins without DoR sign-off.

---

## Definition of Done (DoD)

A slice is complete only when:

| # | Requirement | Verified By |
|---|-------------|-------------|
| 1 | All acceptance criteria met | QA Lead |
| 2 | All unit tests passing (≥ 80% coverage) | CI/CD |
| 3 | All integration tests passing | CI/CD |
| 4 | All E2E tests passing | QA Engineer |
| 5 | Permission matrix verified | QA Engineer |
| 6 | Design tokens applied correctly | UI Designer |
| 7 | Mobile responsive (320px, 768px, 1024px, 1440px) | QA Engineer |
| 8 | Accessibility checks passing (axe-core) | CI/CD |
| 9 | No critical or high bugs | QA Lead |
| 10 | Documentation updated | Developer |
| 11 | Feature flags configured | Tech Lead |
| 12 | Docker images rebuilt | DevOps |
| 13 | Code reviewed and approved | Tech Lead |

**Rule:** No release without DoD sign-off.

---

## Execution Lifecycle

Every slice follows this lifecycle:

```
Definition of Ready
    ↓
Implementation
    ↓
Unit Tests
    ↓
Integration Tests
    ↓
Code Review
    ↓
Docker Update
    ↓
GitHub Update
    ↓
Coolify Update
    ↓
Production Synchronization
    ↓
Review & Sign-off
```

---

## Git Workflow

### Branch Naming

Each slice is developed in its own dedicated feature branch:

```
feature/coaching-slice-0-foundation
feature/coaching-slice-1-player-booking
feature/coaching-slice-2-player-management
feature/coaching-slice-3-coach-onboarding
feature/coaching-slice-4-coach-availability
feature/coaching-slice-5-coach-earnings
feature/coaching-slice-6-resident-onboarding
feature/coaching-slice-7-resident-earnings
feature/coaching-slice-8-org-management
feature/coaching-slice-9-org-pricing
feature/coaching-slice-10-polish-launch
```

### Merge Criteria

Merge into main branch only after:

- [ ] Definition of Done fully satisfied
- [ ] All automated tests pass
- [ ] Code review approved
- [ ] Docker images rebuilt
- [ ] GitHub synchronized
- [ ] Coolify deployment updated (when applicable)
- [ ] Production synchronization checklist completed

### Branch Isolation

Every slice is:
- **Isolated** — no cross-slice dependencies in code
- **Reviewable** — complete slice in one PR
- **Reversible** — can be reverted without affecting other slices
- **Production-ready** — passes all DoD checks before merge

---

## Contract Sign-Off

| Slice | Scope Approved | Start Date | Target Completion |
|-------|---------------|------------|-------------------|
| 0: Foundation | ☐ | | |
| 1: Player Booking | ☐ | | |
| 2: Player Management | ☐ | | |
| 3: Coach Onboarding | ☐ | | |
| 4: Coach Availability | ☐ | | |
| 5: Coach Earnings | ☐ | | |
| 6: Resident Onboarding | ☐ | | |
| 7: Resident Earnings | ☐ | | |
| 8: Org Coach Mgmt | ☐ | | |
| 9: Org Pricing | ☐ | | |
| 10: Polish & Launch | ☐ | | |

**Rule:** Once signed, scope is fixed. No additions. No expansions. Execute.

---

*Implementation begins when all contracts are signed.*
