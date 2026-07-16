# CourtZon Coach Platform — Implementation Roadmap

> **Phase:** Pre-Implementation (Phase 0: UX Validation Complete)
> **Version:** 1.0
> **Date:** July 2026
> **Prerequisite:** UX Blueprint v1.0 validated, Product Blueprint v3.0 frozen
>
> **This document is the single source of truth for implementation.** No code is written until this roadmap is approved.

---

## Part 1: UX Validation Summary

### Validation Scorecard

| Dimension | Score | Status |
|-----------|-------|--------|
| Screen Navigation | 65% | 6 Critical, 10 High, 8 Medium issues |
| Cross-Journey Integration | 70% | 2 Critical, 3 High, 5 Medium gaps |
| Permissions Completeness | 37% | 5 Critical, 12 High, 18 Medium gaps |
| Component Reuse | 75% | 3 Critical, 8 High, 7 Medium issues |
| Consistency | 80% | 0 Critical, 6 High, 10 Medium, 2 Low issues |
| **Overall** | **~65%** | **Not ready for implementation** |

### Blocking Issues (Must Resolve Before Implementation)

These issues prevent clean implementation. They must be resolved in the UX Blueprint before any code is written.

#### B-1: Booking Confirmation vs Pending Acceptance (CRITICAL)
**Problem:** P-09 tells player "Booking Confirmed!" but IC-09 shows coach can Accept/Decline. Player paid for a booking that may not exist.

**Resolution Required:** Choose one:
- **Option A:** Remove Accept/Decline from coach. Bookings are instantly confirmed when player pays. Coach sees "Upcoming" directly.
- **Option B:** Change P-09 to "Booking Requested — waiting for coach confirmation." Player is NOT charged until coach accepts.
- **Option C:** Hold payment in escrow. Coach has 24h to accept/decline. Auto-refund on decline.

**Decision needed from product owner before implementation.**

#### B-2: Missing Marketplace Screens (CRITICAL)
**Problem:** Player bottom nav includes "Marketplace" with Browse Clinics and Browse Events, but none exist in the 57-screen inventory.

**Resolution Required:** Either:
- Add screen IDs for Browse Clinics and Browse Events (expands to 59+ screens)
- Remove Marketplace from bottom nav, merge Browse Coaches into P-04

#### B-3: Missing Chat/Messaging Screen (CRITICAL)
**Problem:** P-10 references "Message coach → Chat screen" but no chat screen exists.

**Resolution Required:** Add SH-09 CHAT to shared screens, or document that messaging is out of scope for V1.

#### B-4: Orphan Screens — No Entry Points (HIGH)
**Problem:** 11 screens have no documented entry points:
- P-14 PLAYER_WALLET
- P-15 PLAYER_PROFILE
- IC-12 COACH_WITHDRAWAL
- IC-14 COACH_ANALYTICS
- IC-15 COACH_GROWTH
- RC-05 RESIDENT_EARNINGS
- RC-06 RESIDENT_PERFORMANCE
- RC-07 RESIDENT_SCHEDULE
- OG-03 through OG-11 (9 screens)

**Resolution Required:** Document navigation from "More" tab, sidebar, or cross-links for all orphan screens.

#### B-5: Dead-End Screens — No Exit Points (HIGH)
**Problem:** 6 screens have no documented exit points:
- P-13 PLAYER_HISTORY
- P-14 PLAYER_WALLET
- P-15 PLAYER_PROFILE
- IC-02 COACH_VERIFICATION (also orphan)
- IC-03 COACH_APP_STATUS
- RC-02 RESIDENT_ONBOARDING

**Resolution Required:** Add "Back" navigation and relevant cross-links for all dead-end screens.

#### B-6: IC-02 Verification Screen Orphaned (HIGH)
**Problem:** IC-01 Application exits directly to IC-03 Status, skipping IC-02 Verification entirely.

**Resolution Required:** IC-01 → IC-02 (upload docs) → IC-03 (status). The verification step is critical for coach onboarding.

#### B-7: Pricing Authority Conflict (HIGH)
**Problem:** IC-06 shows coach setting prices freely, but OG-07 shows org overriding coach prices. No precedence rule defined.

**Resolution Required:** Define pricing hierarchy:
- Org sets base price per session type per branch
- Coach can set price within org-defined bounds (floor/ceiling)
- Org override takes precedence
- Add visible indicator in IC-06 showing org constraints

#### B-8: No Date/Time Format Standard (HIGH)
**Problem:** No date format defined. Times use "4pm" vs "4:00 PM". Durations mix "60 min", "1 hour", "24h".

**Resolution Required:** Add format standards section:
- Dates: DD/MM/YYYY (Egypt locale)
- Times: HH:MM AM/PM (e.g., "4:00 PM")
- Durations: "60 min" for cards, "1 hour" for notifications, "24 hours" for policies

---

## Part 2: Canonical Component Inventory

The following components are the single source of truth. Each business concept has ONE canonical component with defined variants.

### Component Registry

| # | Canonical Name | Purpose | Variants | Used In |
|---|----------------|---------|----------|---------|
| 1 | `PlayerCoachCard` | Coach display for players | List, Grid, Compact, Highlighted | P-01, P-04 |
| 2 | `OrgCoachCard` | Coach display for orgs | Default, Status-based | OG-02, OG-03 |
| 3 | `PlayerBookingCard` | Player's booking list card | Upcoming, Past, Cancelled | P-12 |
| 4 | `CoachBookingCard` | Coach's booking request card | Pending, Upcoming, Completed | IC-09 |
| 5 | `DatePickerCalendar` | Read-only date picker | Month, Week | P-06 |
| 6 | `AvailabilityEditor` | Interactive availability grid | Week grid, Recurring | IC-08, RC-07 |
| 7 | `UnifiedCalendar` | Combined org + player calendar | Week, with color coding | RC-04 |
| 8 | `TimeSlotPicker` | Available slot selection | Chips, Grid, List | P-06 |
| 9 | `PriceBreakdown` | Line-item cost display | Pre-booking, Post-booking | P-07, P-10 |
| 10 | `WalletDisplay` | Balance + transactions | Default, Low balance | P-14, IC-11 |
| 11 | `EarningsSummary` | Earnings analytics | Coach, Resident | IC-11, RC-05 |
| 12 | `PricingConfig` | Pricing rules editor | Coach, Org | IC-06, OG-07 |
| 13 | `CoachProfileHero` | Read-only coach profile | Default, Verified | P-05 |
| 14 | `ProfileEditor` | Editable profile form | Coach, Player, Org | IC-05, P-15, SH-07 |
| 15 | `OrgCoachProfile` | Org management view | Default, Management actions | OG-03 |
| 16 | `ReviewCard` | Review display | Default, With Response, Compact | P-05, IC-04, IC-13 |
| 17 | `NotificationCard` | Notification display | Default, Unread | SH-04 |
| 18 | `StatsCard` | Metrics display | Number, Chart, Comparison | IC-04, OG-01, P-05, IC-14, OG-09, RC-06 |
| 19 | `SearchInput` | Search field | Default, With Filter | P-04, OG-02 |
| 20 | `FilterPanel` | Advanced filtering | Default, Applying | P-04, OG-02 |
| 21 | `StatusBadge` | Status indicator | Active, Inactive, Pending, Suspended | All screens |
| 22 | `EmptyState` | Empty content state | With CTA, Without CTA | All screens |
| 23 | `ErrorState` | Error display | Network, Server, Specific | All screens |
| 24 | `SkeletonLoader` | Loading placeholder | Card, List, Grid | All screens |

### Naming Rules
- Component names use PascalCase
- Player-facing components prefixed with `Player`
- Coach-facing components prefixed with `Coach` or `Resident`
- Org-facing components prefixed with `Org`
- Shared components have no prefix
- Each component has ONE file with variant props

---

## Part 3: Consistency Standards

### Terminology

| Concept | Canonical Term | Do NOT Use |
|---------|---------------|------------|
| Activity type | Session | Training, Lesson, Class |
| Provider | Coach | Trainer, Instructor |
| Consumer | Player | Student, Client, User |
| Transaction | Booking | Reservation, Appointment |
| Physical location | Branch | Location, Venue (use "location" only for generic context) |
| Playing area | Court | Field, Pitch (within branch) |

### Status Names

| Status | Where Used | Canonical |
|--------|-----------|-----------|
| Booking: Player view | P-12 tabs | Upcoming, Completed, Cancelled |
| Booking: Coach view | IC-09 tabs | Pending, Upcoming, Completed |
| Booking: Active | P-10 | In Progress (green badge) |
| Payment | Global | Pending, Processing, Completed, Failed, Refunded |
| Application | OG-04 | New, Reviewing, Interview, Approved, Rejected |
| Coach verification | IC-05 | Pending, Verified, Expired |

### Button Labels

| Action | Canonical Label | Do NOT Use |
|--------|----------------|------------|
| Start booking flow | "Find a Coach" | "Book a Coach", "Search Coaches" |
| Book from profile | "Book Session" | "Book Now" |
| Rebooking | "Book Again" | "Book Another Session", "Rebook" |
| Final confirmation | "Confirm & Pay" | "Pay Now", "Complete Booking" |
| Defer completion | "Save for Later" | "Save Draft" |
| Cancel own booking | "Cancel" | "Decline" (Decline is for rejecting others' requests) |
| Reject request | "Decline" | "Cancel" (Cancel is for own actions) |
| Formal rejection | "Reject" | "Decline" (Reject is for applications) |

### Date/Time Formats

| Context | Format | Example |
|---------|--------|---------|
| Date | DD/MM/YYYY | 15/07/2026 |
| Time | HH:MM AM/PM | 4:00 PM |
| Date + Time | DD/MM/YYYY, HH:MM AM/PM | 15/07/2026, 4:00 PM |
| Duration (cards) | XX min | 60 min |
| Duration (notifications) | X hour(s) | 2 hours |
| Duration (policies) | XX hours | 24 hours |
| Relative time | X ago / in X | 5 min ago, in 2 hours |

### Price Formats

| Context | Format | Example |
|---------|--------|---------|
| Single price | XXX EGP | 350 EGP |
| Price range | XXX–XXX EGP | 300–500 EGP |
| Per player | XXX EGP/player | 150 EGP/player |
| Per hour | XXX EGP/hour | 300 EGP/hour |
| Currency symbol | Always EGP suffix | Never EGP prefix |

### Error Messages

All errors follow: **[What happened]. [What to do next].**

| Type | Template | Example |
|------|----------|---------|
| Network | "Connection lost. Check your internet and try again." | + Retry button |
| Server | "Something went wrong. Please try again." | + Retry button |
| Specific | "[What failed]. [How to fix it]." | "Payment declined. Try a different card." |

### Empty States

Every empty state must either:
1. Explain what will appear + provide a CTA, OR
2. Be hidden entirely (if section can be hidden when empty)

Never show a dead-end empty state with no action.

---

## Part 4: Implementation Slices

Implementation is organized by **vertical slices** — each slice delivers a complete, independently usable and testable feature. Slices are ordered by dependency and business value.

### Slice 0: Foundation & Shared Components

**Value:** Enables all subsequent slices
**Complexity:** Medium
**Risk:** Low

**Includes:**
- Design system: Colors, typography, spacing, form controls
- Shared components: `StatusBadge`, `EmptyState`, `ErrorState`, `SkeletonLoader`
- Navigation shell: AppLayout, BottomNav (Player, Coach, Org), Sidebar (Org)
- Auth flow: Login (SH-01), Register (SH-02), Role Selection (SH-03)
- Notifications Center (SH-04)
- Settings (SH-05)
- Help & Support (SH-06)
- Profile (SH-07)
- Onboarding Welcome (SH-08)
- Permission system: `<Can>` component, permission hooks, API middleware
- API layer: HTTP client, auth interceptor, error handling
- State management: React Query setup, cache configuration

**Dependencies:** None
**Testing:** Unit tests for shared components, integration tests for auth flow

---

### Slice 1: Player — Find & Book a Coach (Core Flow)

**Value:** Player can discover coaches and complete a booking end-to-end
**Complexity:** High
**Risk:** High (payment integration, scheduling engine integration)

**Includes:**
- Player Home (P-01) — personalized recommendations, quick rebook
- Need Selection (P-02) — guided discovery flow
- Session Type Selection (P-03) — format options with recommendations
- Coach Search Results (P-04) — filtered/sorted list with `PlayerCoachCard`
- Coach Profile (P-05) — full profile with `CoachProfileHero`, reviews, availability preview
- Time Selection (P-06) — `DatePickerCalendar` + `TimeSlotPicker`, real-time availability
- Booking Confirmation (P-07) — summary, `PriceBreakdown`, payment method selection
- Payment Processing (P-08) — wallet, card, cash integration
- Booking Success (P-09) — confirmation, calendar add, share
- `PlayerBookingCard` (Upcoming variant)
- `FilterPanel`, `SearchInput`
- Scheduling Engine integration (availability resolution)
- Booking API endpoints
- Wallet API endpoints

**Dependencies:** Slice 0 (auth, navigation, permissions)
**Testing:** E2E booking flow test, payment integration test, scheduling engine integration test
**Risk Mitigation:** Feature flag `coaching.engine_booking_enabled` gates new flow. Old flow continues working.

---

### Slice 2: Player — Booking Management & History

**Value:** Player can view, manage, and rate past bookings
**Complexity:** Medium
**Risk:** Low

**Includes:**
- My Bookings (P-12) — `PlayerBookingCard` (Upcoming, Past, Cancelled variants)
- Booking Detail (P-10) — status, actions, `PriceBreakdown`, check-in
- Session Rating (P-11) — star rating, review text, skills worked on
- Session History (P-13) — timeline, spending summary
- Wallet & Payment Methods (P-14) — `WalletDisplay`, top-up, saved cards
- Player Profile (P-15) — `ProfileEditor` (Player variant), preferences, settings

**Dependencies:** Slice 1 (bookings must exist to manage)
**Testing:** Unit tests for booking states, integration tests for rating flow

---

### Slice 3: Independent Coach — Onboarding & Profile

**Value:** Coach can apply, get verified, and set up their profile
**Complexity:** Medium
**Risk:** Medium (file upload, verification workflow)

**Includes:**
- Application Form (IC-01) — multi-step form, document upload
- Verification Upload (IC-02) — ID, certificates, video intro
- Application Status (IC-03) — status tracker, timeline
- Dashboard Home (IC-04) — `StatsCard` (Number), pending actions, upcoming sessions, recent reviews
- Profile Editor (IC-05) — `ProfileEditor` (Coach variant), specialties, certifications
- Pricing Settings (IC-06) — `PricingConfig` (Coach variant), market data comparison
- Service Areas (IC-07) — map selection, travel preferences
- Settings (IC-16) — account, notifications, privacy

**Dependencies:** Slice 0 (auth, navigation, permissions)
**Testing:** Unit tests for application flow, integration tests for file upload

---

### Slice 4: Independent Coach — Availability & Bookings

**Value:** Coach manages availability and handles incoming bookings
**Complexity:** High
**Risk:** High (availability editor complexity, booking acceptance flow)

**Includes:**
- Availability Calendar (IC-08) — `AvailabilityEditor` (Week grid), recurring schedules, exceptions, demand overlay
- Bookings List (IC-09) — `CoachBookingCard` (Pending, Upcoming, Completed)
- Booking Detail (IC-10) — player info, prep notes, session notes, actions
- Calendar integration (Google Calendar, Apple Calendar sync)

**Dependencies:** Slice 3 (coach must be onboarded), Slice 1 (player bookings must work)
**Testing:** E2E availability editor test, booking acceptance flow test

---

### Slice 5: Independent Coach — Earnings & Analytics

**Value:** Coach tracks earnings, withdrawals, and performance
**Complexity:** Medium
**Risk:** Medium (payment processing, withdrawal flow)

**Includes:**
- Earnings & Wallet (IC-11) — `WalletDisplay`, `EarningsSummary` (Coach), transaction history
- Withdrawal (IC-12) — bank account selection, amount input, processing status
- Reviews List (IC-13) — `ReviewCard` (With Response), rating breakdown, response input
- Analytics Dashboard (IC-14) — `StatsCard` (Chart, Comparison), trends, comparisons
- Growth & Achievements (IC-15) — tier system, badges, referral program

**Dependencies:** Slice 4 (bookings must exist to earn from), Slice 1 (wallet infrastructure)
**Testing:** Unit tests for earnings calculation, integration tests for withdrawal

---

### Slice 6: Resident Coach — Onboarding & Daily Operations

**Value:** Resident coach accepts invitation, onboards, and manages daily schedule
**Complexity:** Medium
**Risk:** Low

**Includes:**
- Invitation Acceptance (RC-01) — invitation details, accept/decline
- Onboarding Checklist (RC-02) — org-specific setup steps
- Dashboard Home (RC-03) — today's schedule, upcoming sessions, quick actions
- Unified Calendar (RC-04) — `UnifiedCalendar` (org + player sessions), color coding, swap requests
- Schedule Management (RC-07) — `AvailabilityEditor` (working hours), time-off requests

**Dependencies:** Slice 0 (auth, navigation), Slice 4 (booking infrastructure)
**Testing:** Unit tests for invitation flow, integration tests for schedule sync

---

### Slice 7: Resident Coach — Earnings & Performance

**Value:** Resident coach tracks earnings and performance metrics
**Complexity:** Low
**Risk:** Low

**Includes:**
- Earnings & Revenue (RC-05) — `EarningsSummary` (Resident), revenue share breakdown
- Performance Reports (RC-06) — `StatsCard` (Number, Comparison), goals, feedback

**Dependencies:** Slice 6 (resident must be onboarded), Slice 5 (earnings infrastructure)
**Testing:** Unit tests for earnings calculation, performance metrics

---

### Slice 8: Organization — Dashboard & Coach Management

**Value:** Organization manages coaches, applications, and branches
**Complexity:** High
**Risk:** Medium (multi-branch logic, application pipeline)

**Includes:**
- Dashboard Home (OG-01) — `StatsCard` (Number), alerts, quick actions
- Coach List (OG-02) — `OrgCoachCard`, filters, bulk actions
- Coach Profile Detail (OG-03) — `OrgCoachProfile`, performance, schedule, earnings, actions
- Applications Pipeline (OG-04) — kanban board, status transitions
- Application Review (OG-05) — document viewer, approve/reject, interview scheduling
- Branch Assignment (OG-06) — drag-to-assign, branch-specific views

**Dependencies:** Slice 0 (auth, navigation, permissions), Slice 3 (coaches must exist)
**Testing:** Unit tests for application pipeline, integration tests for branch assignment

---

### Slice 9: Organization — Pricing, Revenue & Reports

**Value:** Organization manages pricing, revenue sharing, and business analytics
**Complexity:** High
**Risk:** High (pricing conflicts, revenue calculation accuracy)

**Includes:**
- Pricing Rules (OG-07) — `PricingConfig` (Org variant), org/branch/coach pricing hierarchy
- Revenue Sharing (OG-08) — share models, overrides, audit trail
- Performance Dashboard (OG-09) — `StatsCard` (Comparison), rankings, benchmarks
- Utilization Reports (OG-10) — branch utilization, coach utilization, court utilization
- Business Reports (OG-11) — revenue reports, player reports, export

**Dependencies:** Slice 8 (org must be set up), Slice 1 (pricing affects player flow), Slice 5 (earnings affect revenue sharing)
**Testing:** Unit tests for pricing hierarchy, integration tests for revenue calculation, E2E report generation

---

### Slice 10: Polish, Testing & Launch

**Value:** Production-ready platform with full test coverage
**Complexity:** Medium
**Risk:** Low

**Includes:**
- Cross-browser testing
- Mobile responsiveness audit
- Accessibility audit (WCAG 2.1 AA)
- Performance optimization (lazy loading, code splitting)
- Error boundary refinement
- Analytics event verification
- Notification delivery testing
- Load testing (concurrent bookings, payment processing)
- Security audit (permission checks, input validation, rate limiting)
- Documentation update (API docs, component stories)
- Feature flag rollout plan

**Dependencies:** All previous slices complete
**Testing:** Full E2E test suite, load tests, security scan

---

## Part 5: Dependency Graph

```
Slice 0: Foundation
    │
    ├── Slice 1: Player Booking Flow
    │       │
    │       ├── Slice 2: Player Booking Management
    │       │
    │       └── Slice 4: Coach Availability & Bookings
    │               │
    │               ├── Slice 5: Coach Earnings & Analytics
    │               │       │
    │               │       └── Slice 7: Resident Earnings & Performance
    │               │
    │               └── Slice 6: Resident Onboarding & Daily Ops
    │
    ├── Slice 3: Coach Onboarding & Profile
    │       │
    │       └── (feeds into Slice 4)
    │
    └── Slice 8: Organization Coach Management
            │
            └── Slice 9: Organization Pricing & Reports
                    │
                    └── Slice 10: Polish & Launch
```

### Parallel Execution Opportunities
- Slice 2 and Slice 3 can run in parallel (Player management + Coach onboarding)
- Slice 6 and Slice 7 can run in parallel (Resident onboarding + Resident earnings)
- Slice 8 and Slice 9 can run in parallel if pricing decisions are made early

---

## Part 6: Risk Register

| # | Risk | Probability | Impact | Mitigation |
|---|------|-------------|--------|------------|
| R-1 | Payment gateway integration delays | Medium | High | Start payment spike in Slice 1. Have mock gateway for development. |
| R-2 | Scheduling Engine integration breaks existing booking flow | Low | Critical | Feature flag `coaching.engine_booking_enabled`. Old flow untouched. |
| R-3 | Availability editor complexity (drag/resize/recurring) | High | Medium | Prototype in Slice 3. Simplify to click-to-add if needed. |
| R-4 | Pricing hierarchy conflicts (org vs coach) | Medium | High | Resolve B-7 blocking issue before Slice 9. Simple rule: org wins. |
| R-5 | Multi-role permission bugs | Medium | Medium | Permission tests in every slice. Automated permission matrix validation. |
| R-6 | Real-time availability conflicts (concurrent bookings) | Medium | High | Redis lock (already implemented in Scheduling Engine). Load test in Slice 10. |
| R-7 | File upload for coach verification (IC-02) | Low | Medium | Use existing upload service. Max 10MB, JPG/PNG/PDF. |
| R-8 | Notification delivery reliability | Medium | Medium | Dead letter queue (already in DB). Retry logic. Delivery tracking. |
| R-9 | Mobile responsiveness across 57 screens | High | Medium | Design mobile-first. Test on real devices in Slice 10. |
| R-10 | Scope creep from unresolved UX issues | High | High | Blocking issues (B-1 to B-8) must be resolved before Slice 1 starts. |

---

## Part 7: Testing Strategy

### Per-Slice Testing

| Slice | Unit Tests | Integration Tests | E2E Tests |
|-------|-----------|-------------------|-----------|
| 0: Foundation | Component renders, auth flows | Login/register API, permission checks | Complete auth flow |
| 1: Player Booking | Form validation, state machines | Scheduling engine, payment API | Full booking flow |
| 2: Player Management | Booking state transitions | Rating submission, wallet operations | View + rate booking |
| 3: Coach Onboarding | Form validation, file upload | Application API, verification | Complete application |
| 4: Coach Availability | Availability calculations | Booking acceptance, calendar sync | Set availability + accept booking |
| 5: Coach Earnings | Earnings calculation | Withdrawal API, review API | View earnings + withdraw |
| 6: Resident Onboarding | Invitation validation | Schedule sync, org assignment | Accept invitation + view schedule |
| 7: Resident Earnings | Earnings calculation | Performance metrics | View earnings + performance |
| 8: Org Coach Mgmt | Pipeline logic, assignment | Coach CRUD, application review | Manage coach lifecycle |
| 9: Org Pricing | Pricing hierarchy | Revenue calculation, report generation | Set pricing + view reports |
| 10: Polish | All unit tests pass | All integration tests pass | Full E2E suite |

### Test Conventions
- **Unit tests:** `*.spec.ts` — fast, isolated, no network
- **Integration tests:** `*.integration.spec.ts` — Testcontainers (MySQL + Redis), full schema
- **E2E tests:** `*.e2e.spec.ts` — Playwright, against live Docker stack
- **Permission tests:** Every screen has at least one permission test per role
- **Accessibility tests:** Automated axe checks on every screen

### Coverage Targets
- Unit test coverage: ≥ 80%
- Integration test coverage: ≥ 70%
- E2E critical path coverage: 100% (every booking flow, every payment, every permission gate)

---

## Part 8: Release Strategy

### Release 1: Foundation + Player Booking (Slices 0-2)
**Goal:** Players can find coaches and book sessions
**Scope:** Auth, Player discovery, Player booking, Player booking management
**Rollout:** Internal testing → Beta users → Full launch
**Feature Flags:**
- `coaching.engine_booking_enabled` — gates new booking flow
- `coaching.player_discovery_enabled` — gates new discovery UI

### Release 2: Coach Experience (Slices 3-5)
**Goal:** Coaches can onboard, manage availability, and earn money
**Scope:** Coach application, availability, bookings, earnings
**Rollout:** Invite-only coaches → Open coach registration
**Feature Flags:**
- `coaching.coach_onboarding_v2` — gates new onboarding flow
- `coaching.availability_editor_v2` — gates new availability editor

### Release 3: Resident + Organization (Slices 6-9)
**Goal:** Full platform with organizations managing coaches
**Scope:** Resident coach flow, Organization management, Pricing, Reports
**Rollout:** Pilot organizations → Full org rollout
**Feature Flags:**
- `coaching.resident_flow_enabled` — gates resident coach experience
- `coaching.org_management_v2` — gates new org management

### Release 4: Polish & Scale (Slice 10)
**Goal:** Production-ready, performant, accessible
**Scope:** Testing, optimization, accessibility, security audit
**Rollout:** Performance testing → Security audit → Production deploy

---

## Part 9: Success Criteria

### Per-Slice Definition of Done
- [ ] Business workflow approved
- [ ] User experience reviewed against UX Blueprint
- [ ] All 20 screen attributes documented (per UX Blueprint DoD)
- [ ] Component permissions complete (7 roles × all components)
- [ ] Disabled, hidden, read-only behaviors documented
- [ ] Unit tests passing (≥ 80% coverage)
- [ ] Integration tests passing
- [ ] E2E tests passing (for critical paths)
- [ ] Permission tests passing (for every screen)
- [ ] Accessibility checks passing (axe)
- [ ] Mobile responsive (tested on 320px, 768px, 1024px, 1440px)
- [ ] Documentation updated
- [ ] Docker images rebuilt
- [ ] Feature flag configured

### Platform Launch Criteria
- [ ] All 10 slices complete
- [ ] All blocking UX issues (B-1 to B-8) resolved
- [ ] All 57 screens implemented
- [ ] All 24 canonical components implemented
- [ ] All 7 roles tested
- [ ] Payment processing verified (wallet, card, cash)
- [ ] Scheduling Engine integration verified
- [ ] Notification delivery verified
- [ ] Load test passed (100 concurrent bookings)
- [ ] Security audit passed
- [ ] Accessibility audit passed (WCAG 2.1 AA)
- [ ] Documentation complete (API docs, component stories, runbook)

---

## Part 10: Approval

### Before Implementation Begins

This roadmap requires approval on:

1. **Blocking Issue Resolutions** (B-1 through B-8) — product owner must decide on booking confirmation model, marketplace scope, chat scope, and pricing hierarchy
2. **Slice Order** — confirm dependency graph and parallel execution opportunities
3. **Release Strategy** — confirm 4-release plan and feature flag strategy
4. **Component Registry** — confirm 24 canonical components and naming conventions
5. **Consistency Standards** — confirm terminology, formats, and patterns

### Approval Sign-Off

| Role | Name | Approved | Date |
|------|------|----------|------|
| Product Owner | | | |
| Tech Lead | | | |
| UX Designer | | | |
| QA Lead | | | |

---

*This roadmap is the single source of truth for implementation. No code is written until all blocking issues are resolved and this document is approved.*
